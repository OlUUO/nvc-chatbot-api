'use strict';

// NVC Buddy 서버 — 프론트엔드에 정적 파일을 제공하고,
// API 키(.env)는 이 서버에서만 관리해 브라우저로 절대 노출하지 않는다.

const path = require('path');
const fs = require('fs');
const express = require('express');
const { buildSystemPrompt } = require('./nvc-prompt');

// ── .env 로더 (의존성 없이 최소 구현) ──────────────────────
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].replace(/^["']|["']$/g, '').trim();
    if (!val) continue;
    if (process.env[key] === undefined || process.env[key] === '') process.env[key] = val;
  }
}
loadEnvFile();

const PORT = Number(process.env.PORT) || 3000;
const API_KEY = process.env.OPENAI_API_KEY || '';
const BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const MAX_MESSAGES = 40;   // LLM에 전송할 최대 대화 수
const MAX_CHARS = 4000;    // 메시지당 최대 글자 수
const LLM_TIMEOUT_MS = 50000;  // EXAONE 응답 지연 대비 (시도당)

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));

// 로컬 테스트(file:// 로 열어 확인할 때)를 위한 개방적 CORS.
// 실제 서비스 배포 시에는 허용 도메인을 제한할 것.
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── 정적 파일 (프론트엔드는 public/ 안에만 둔다 — .env가 노출되지 않도록) ──
app.use(express.static(path.join(__dirname, 'public')));

// ── 상태 확인 ──
app.get('/api/health', (req, res) => {
  res.json({ ok: true, hasKey: Boolean(API_KEY), model: MODEL, demo: !API_KEY });
});

// ── 유틸 ──
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function clamp(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function capString(v, max) {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function capList(v, max, labelMax) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x.trim()).slice(0, max).map((x) => x.slice(0, labelMax));
}

// 모델 응답(JSON) 검증·보정
function sanitize(data, raw) {
  const STEPS = ['observation', 'feeling', 'need', 'request', 'done'];
  const out = {
    risk_level: clamp(data.risk_level, 0, 4),
    reply: capString(data.reply, 4000).trim() || '지금은 답변을 정리하지 못했어요. 한 번 더 말해줄 수 있을까요?',
    emotion_guess: capList(data.emotion_guess, 2, 10),
    need_guess: capList(data.need_guess, 2, 10),
    nvc_step: STEPS.includes(data.nvc_step) ? data.nvc_step : null,
    nvc_sentence: data.nvc_sentence ? capString(data.nvc_sentence, 500) : null,
    options: capList(data.options, 4, 60),
    practice_feedback: null,
    analysis: null,
  };
  if (data.practice_feedback && typeof data.practice_feedback === 'object') {
    const fb = data.practice_feedback;
    const s = fb.stars || {};
    out.practice_feedback = {
      stars: {
        observation: clamp(s.observation, 0, 5),
        feeling: clamp(s.feeling, 0, 5),
        need: clamp(s.need, 0, 5),
        request: clamp(s.request, 0, 5),
        blame_reduction: clamp(s.blame_reduction, 0, 5),
      },
      comment: capString(fb.comment, 1000),
    };
  }
  if (data.analysis && typeof data.analysis === 'object') {
    const a = data.analysis;
    const sc = a.scores || {};
    out.analysis = {
      scores: {
        observation: clamp(sc.observation, 0, 100),
        feeling: clamp(sc.feeling, 0, 100),
        need: clamp(sc.need, 0, 100),
        request: clamp(sc.request, 0, 100),
        blame_reduction: clamp(sc.blame_reduction, 0, 100),
      },
      summary: capString(a.summary, 1000),
      improvements: capList(a.improvements, 4, 200),
    };
  }
  return out;
}

// 코드펜스나 앞뒤 텍스트가 섞여도 JSON만 추출
function parseModelJson(raw) {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch (e) {
      // 아래로 폴백
    }
  }
  return { reply: raw.slice(0, 4000) };
}

// ── LLM 호출 (EXAONE · OpenAI 호환) ──
// EXAONE 사양: max_tokens가 아닌 max_completion_tokens 사용,
// reasoning 모드는 enable_thinking:false 로 비활성화해야 content가 null이 되지 않는다.
async function callLLMOnce(messages) {
  let res;
  try {
    res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_completion_tokens: 2048,
        response_format: { type: 'json_object' },
        chat_template_kwargs: { enable_thinking: false },
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      const e = httpError(504, 'AI 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
      e.retryable = true;
      throw e;
    }
    const e = httpError(502, '현재 AI 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.');
    e.retryable = true;
    throw e;
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw httpError(502, 'API 키가 올바르지 않거나 만료되었습니다. .env의 키를 확인해주세요.');
    if (res.status === 429) throw httpError(502, 'API 사용량 한도에 도달했습니다. 잠시 후 다시 시도해주세요.');
    if (res.status === 404) throw httpError(502, '모델 또는 API 주소를 찾을 수 없습니다. OPENAI_BASE_URL과 OPENAI_MODEL을 확인해주세요.');
    const e = httpError(502, `AI API 오류가 발생했습니다 (${res.status}). 잠시 후 다시 시도해주세요.`);
    if (res.status >= 500) e.retryable = true;  // 504 등 일시적 장애는 재시도
    throw e;
  }
  const json = await res.json();
  const choice = json && json.choices && json.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (typeof content !== 'string' || !content.trim()) {
    // content가 null이면 에러가 아니라 토큰 예산 문제일 수 있다 (finish_reason 확인)
    if (choice && choice.finish_reason === 'length') {
      const e = httpError(502, 'AI 응답이 토큰 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
      e.retryable = true;
      throw e;
    }
    throw httpError(502, 'AI 응답 형식이 올바르지 않습니다. 잠시 후 다시 시도해주세요.');
  }
  return content.trim();  // 응답 앞뒤 개행 제거 필수
}

// 일시적 오류(타임아웃·5xx)는 1회 재시도
async function callLLM(messages) {
  let lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await callLLMOnce(messages);
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === 2) throw err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr;
}

// ── 채팅 API ──
app.post('/api/chat', async (req, res) => {
  try {
    if (!API_KEY) {
      return res.status(503).json({ ok: false, code: 'NO_API_KEY', error: 'OPENAI_API_KEY가 설정되지 않았습니다. .env 파일에 키를 넣고 서버를 재시작하세요.' });
    }
    const body = req.body || {};
    const mode = ['general', 'emotion', 'convert', 'practice'].includes(body.mode) ? body.mode : 'general';
    const action = ['chat', 'analyze', 'practice_feedback'].includes(body.action) ? body.action : 'chat';
    const scenario = body.scenario ? capString(body.scenario, 500) : null;

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (!rawMessages.length) return res.status(400).json({ ok: false, error: '대화 내용(messages)이 필요합니다.' });

    const history = rawMessages
      .slice(-MAX_MESSAGES)
      .map((m) => ({
        role: m && m.role === 'assistant' ? 'assistant' : 'user',
        content: capString(m && m.content, MAX_CHARS).trim(),
      }))
      .filter((m) => m.content);

    const systemPrompt = buildSystemPrompt({ mode, action, scenario });
    const raw = await callLLM([{ role: 'system', content: systemPrompt }, ...history]);
    const data = sanitize(parseModelJson(raw), raw);
    res.json({ ok: true, data });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api/chat]', err.message);
    res.status(status).json({ ok: false, error: err.message || '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
});

// ── 시작 ──
app.listen(PORT, () => {
  console.log('──────────────────────────────────────────');
  console.log('  🕊️  NVC Buddy (다정이) 서버가 실행되었습니다.');
  console.log(`     http://localhost:${PORT}`);
  if (API_KEY) {
    console.log(`     AI 모델: ${MODEL} @ ${BASE_URL}`);
  } else {
    console.log('  ⚠️  OPENAI_API_KEY가 없습니다. 브라우저는 데모 모드로 동작합니다.');
    console.log('     .env 파일에 키를 넣고 서버를 다시 시작하세요.');
  }
  console.log('──────────────────────────────────────────');
});