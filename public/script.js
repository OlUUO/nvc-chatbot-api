'use strict';

/* ══════════════════════════ 상수 ══════════════════════════ */

const EMOTION_ICONS = {
  '기쁨': '😊', '슬픔': '😢', '화남': '😠', '불안': '😰', '두려움': '😨',
  '서운함': '🥺', '답답함': '😮‍💨', '실망': '😞', '외로움': '🥲', '당황': '😳',
  '감사': '🙏', '기대': '✨',
};
const NEED_ICONS = {
  '존중': '🤝', '이해': '👂', '신뢰': '🔗', '관심': '👀', '인정': '🌟',
  '소속감': '🏠', '배려': '💛', '안전': '🛡️', '자유': '🕊️', '공정성': '⚖️', '협력': '🧩',
};
const STEP_ORDER = ['observation', 'feeling', 'need', 'request'];

const HOTLINES = [
  ['109', '자살예방 상담 (24시간)'],
  ['1388', '청소년전화'],
  ['1577-0199', '정신건강 위기상담'],
  ['1366', '여성긴급전화'],
  ['112', '폭력·범죄 신고'],
  ['119', '응급 구료'],
];

const SCENARIOS = [
  { id: 'late-friend', icon: '⏰', title: '친구가 약속 시간에 30분 늦었을 때', role: '역할: 친구', opener: '미안, 나 좀 늦었어. 하필 버스가 안 와서 ㅠㅠ' },
  { id: 'parents-phone', icon: '📱', title: '게임 때문에 부모님께 잔소리를 들었을 때', role: '역할: 부모님', opener: '또 게임이야? 숙제는 다 했어?' },
  { id: 'teacher', icon: '🏫', title: '수업 중에 지적받았을 때', role: '역할: 선생님', opener: '지금은 수업 시간이야. 집중하도록.' },
  { id: 'colleague', icon: '💡', title: '동료가 내 아이디어를 무시했을 때', role: '역할: 동료', opener: '그 아이디어는 좀 아닌 것 같은데?' },
  { id: 'custom', icon: '✏️', title: '직접 상황 입력하기', role: '상황을 설명하면 시작해요', opener: null },
];

const MODE_META = {
  general: {
    placeholder: '메시지를 입력하세요...',
    note: '💬 **일반 대화 모드**\n편하게 이야기해요. 힘든 일이 생기면 다정이가 함께 정리해줄게요.',
  },
  emotion: {
    placeholder: '오늘 마음이 어땠는지 이야기해보세요...',
    note: '😊 **감정 이야기 모드**\n오늘 마음이 어떤지 편하게 이야기해보세요. 다정이가 감정과 그 뒤의 욕구를 함께 찾아줄게요.',
  },
  convert: {
    placeholder: '바꾸고 싶은 문장을 입력해보세요. (예: 너는 진짜 이기적이야)',
    note: '🔄 **문장 바꾸기 모드**\n바꾸고 싶은 문장을 입력해보세요. 다정이가 NVC 문장(관찰 → 감정 → 욕구 → 부탁)으로 다듬어줄게요.',
  },
  practice: {
    placeholder: '상대방에게 하고 싶은 말을 입력해보세요...',
    note: '',
  },
};

const LS_RECORDS = 'nvc_buddy_records_v1';
const LS_FONT = 'nvc_font_scale';
const FONT_SCALES = [1, 1.1, 1.25];

/* ══════════════════════════ DOM · 상태 ══════════════════════════ */

const $ = (id) => document.getElementById(id);
const chat = $('chat');
const inputEl = $('input');
const sendBtn = $('btn-send');

const state = {
  mode: 'general',
  demo: false,
  busy: false,
  messages: [],       // {role:'user'|'assistant', content:string} — assistant는 JSON 문자열
  lastSentence: null, // {sentence, emotions, needs}
  practice: null,     // {id, scenarioTitle, custom, lineIndex, userMsgs, startIndex}
  demoFlow: null,     // {step, collected:{observation, feeling, need, request}}
};

/* ══════════════════════════ 유틸 ══════════════════════════ */

function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatReply(text) {
  return escapeHtml(text)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// 즉시 1회 + 레이아웃 확정 후 2회 더 내려, 폰트/이모지 로딩으로 높이가 늦게 늘어나도 최하단을 유지한다.
function scrollChat() {
  chat.scrollTop = chat.scrollHeight;
  requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; });
  requestAnimationFrame(() => requestAnimationFrame(() => { chat.scrollTop = chat.scrollHeight; }));
}

// 짧은 햅틱 — 지원 기기(Android Chrome 등)에서만 동작, 미지원 시 무시
function haptic(ms) {
  if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { /* 무시 */ } }
}

function autoSizeInput() {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
}

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => toast('복사했어요! 📋')).catch(() => fallbackCopy(text));
    return;
  }
  fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); toast('복사했어요! 📋'); } catch { toast('복사에 실패했어요'); }
  document.body.removeChild(ta);
}

function nowDateKorean() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/* ══════════════════════════ 렌더링 ══════════════════════════ */

function addNote(text) {
  const n = el('div', 'note-card');
  n.innerHTML = formatReply(text);
  chat.appendChild(n);
  scrollChat();
}

function addUserMsg(text) {
  const wrap = el('div', 'msg user');
  wrap.appendChild(el('div', 'who', '나'));
  const b = el('div', 'bubble');
  b.innerHTML = formatReply(text);
  wrap.appendChild(b);
  chat.appendChild(wrap);
  scrollChat();
}

function chipBlock(label, items, cls) {
  const block = el('div', 'chip-block');
  block.appendChild(el('div', 'chip-label', label));
  const chips = el('div', 'chips');
  for (const item of items) {
    const icon = cls === 'emotion' ? (EMOTION_ICONS[item] || '🙂') : (NEED_ICONS[item] || '🌱');
    chips.appendChild(el('span', `chip ${cls}`, `${icon} ${escapeHtml(item)}`));
  }
  block.appendChild(chips);
  return block;
}

function sentenceCard(data) {
  const card = el('div', 'sentence-card');
  card.appendChild(el('div', 'sentence-head', '🕊️ NVC 문장 완성!'));
  const p = el('p', 'sentence-text');
  p.textContent = data.nvc_sentence;
  card.appendChild(p);
  const acts = el('div', 'sentence-actions');
  const cp = el('button', 'mini-btn');
  cp.type = 'button'; cp.textContent = '📋 복사';
  cp.addEventListener('click', () => copyText(data.nvc_sentence));
  const sv = el('button', 'mini-btn');
  sv.type = 'button'; sv.textContent = '🗂️ 기록 저장';
  sv.addEventListener('click', () => saveCurrentRecord());
  acts.append(cp, sv);
  card.appendChild(acts);
  return card;
}

function safetyBanner() {
  const b = el('div', 'safety-banner');
  b.setAttribute('role', 'alert');
  b.innerHTML = `<strong>⚠️ 지금은 안전이 가장 중요해요</strong>
    <p>NVC Buddy는 전문 상담을 대신하지 않아요. 아래 번호로 연락하면 도움을 받을 수 있어요.</p>
    <div class="hotlines">${HOTLINES.map(([n, d]) => `<span class="hotline"><b>${n}</b> ${d}</span>`).join('')}</div>`;
  return b;
}

function analysisCard(a) {
  const card = el('div', 'analysis-card');
  card.appendChild(el('h3', null, '📊 NVC 대화 분석'));
  const rows = [['observation', '관찰'], ['feeling', '감정'], ['need', '욕구'], ['request', '부탁'], ['blame_reduction', '비난 감소']];
  for (const [k, label] of rows) {
    const v = (a.scores && Number.isFinite(a.scores[k])) ? a.scores[k] : 0;
    const row = el('div', 'score-row');
    row.innerHTML = `<span class="score-label">${label}</span>
      <span class="score-track"><span class="score-fill" data-w="${v}"></span></span>
      <span class="score-num">${v}%</span>`;
    card.appendChild(row);
  }
  if (a.summary) {
    const p = el('p', 'analysis-summary');
    p.textContent = a.summary;
    card.appendChild(p);
  }
  if (a.improvements && a.improvements.length) {
    const ul = el('ul', 'analysis-improvements');
    for (const t of a.improvements) {
      const li = el('li');
      li.textContent = t;
      ul.appendChild(li);
    }
    card.appendChild(ul);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => {
    card.querySelectorAll('.score-fill').forEach((f) => { f.style.width = f.dataset.w + '%'; });
  }));
  return card;
}

function starsCard(fb) {
  const card = el('div', 'stars-card');
  card.appendChild(el('h3', null, '⭐ 연습 피드백'));
  const rows = [['observation', '관찰'], ['feeling', '감정 표현'], ['need', '욕구 표현'], ['request', '부탁'], ['blame_reduction', '비난 감소']];
  for (const [k, label] of rows) {
    const n = Math.max(0, Math.min(5, Number(fb.stars && fb.stars[k]) || 0));
    const row = el('div', 'star-row');
    row.innerHTML = `<span class="star-label">${label}</span><span class="stars">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span>`;
    card.appendChild(row);
  }
  if (fb.comment) {
    const p = el('p', 'stars-comment');
    p.innerHTML = formatReply(fb.comment);
    card.appendChild(p);
  }
  return card;
}

function addAiMsg(data) {
  const wrap = el('div', 'msg ai');
  wrap.appendChild(el('div', 'who', '🕊️ 다정이'));
  const b = el('div', 'bubble');
  b.innerHTML = formatReply(data.reply || '');
  wrap.appendChild(b);

  if (state.mode !== 'practice') {
    if (data.emotion_guess && data.emotion_guess.length) {
      wrap.appendChild(chipBlock('다정이가 느끼기에 · 추정', data.emotion_guess, 'emotion'));
    }
    if (data.need_guess && data.need_guess.length) {
      wrap.appendChild(chipBlock('필요했을지도 모르는 마음 · 추정', data.need_guess, 'need'));
    }
  }
  if (data.options && data.options.length) {
    const box = el('div', 'options');
    for (const opt of data.options) {
      const btn = el('button', 'option-btn');
      btn.type = 'button';
      btn.textContent = opt;
      btn.addEventListener('click', () => { box.remove(); handleOption(opt); });
      box.appendChild(btn);
    }
    wrap.appendChild(box);
  }
  if (data.nvc_sentence) wrap.appendChild(sentenceCard(data));
  if (data.risk_level >= 3) wrap.appendChild(safetyBanner());
  if (data.practice_feedback) {
    const bub = el('div', 'bubble');
    bub.appendChild(starsCard(data.practice_feedback));
    wrap.appendChild(bub);
  }
  if (data.analysis) {
    const bub = el('div', 'bubble');
    bub.appendChild(analysisCard(data.analysis));
    wrap.appendChild(bub);
  }

  chat.appendChild(wrap);
  if (state.mode !== 'practice') updateTracker(data.nvc_step);
  if (data.nvc_sentence) {
    state.lastSentence = { sentence: data.nvc_sentence, emotions: data.emotion_guess || [], needs: data.need_guess || [] };
    updateSaveButton();
  }
  scrollChat();
}

let typingEl = null;
function showTyping() {
  typingEl = el('div', 'msg ai');
  typingEl.appendChild(el('div', 'who', '🕊️ 다정이'));
  const b = el('div', 'bubble');
  b.innerHTML = '<span class="typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>';
  typingEl.appendChild(b);
  chat.appendChild(typingEl);
  scrollChat();
}
function hideTyping() {
  if (typingEl) { typingEl.remove(); typingEl = null; }
}

function updateTracker(step) {
  const tracker = $('nvc-tracker');
  if (!step) { tracker.classList.add('hidden'); return; }
  tracker.classList.remove('hidden');
  const curIdx = STEP_ORDER.indexOf(step);
  tracker.querySelectorAll('.tracker-step').forEach((s) => {
    const idx = STEP_ORDER.indexOf(s.dataset.step);
    s.classList.toggle('current', step === s.dataset.step);
    s.classList.toggle('done', step === 'done' || (curIdx !== -1 && idx < curIdx));
  });
}

function updateModeStrip() {
  document.querySelectorAll('.mode-card').forEach((c) => {
    c.classList.toggle('active', c.dataset.mode === state.mode);
  });
}

function updateSaveButton() {
  $('btn-save-current').classList.toggle('hidden', !state.lastSentence);
}

function addWelcome() {
  addAiMsg({
    reply: '안녕하세요! 저는 **다정이**예요. 🕊️\n오늘 어떤 이야기를 나누고 싶으신가요?\n\n일상 이야기도, 힘든 마음도, 바꾸고 싶은 문장도 편하게 들려주세요. 위 카드에서 모드를 고를 수 있어요.',
  });
}

/* ══════════════════════════ API ══════════════════════════ */

async function checkHealth() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
    if (!res.ok) throw new Error('bad status');
    const j = await res.json();
    return { reachable: true, demo: !!j.demo };
  } catch {
    return { reachable: false, demo: true };
  }
}

async function callApi(payload) {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(120000),  // 서버가 일시적 오류를 1회 재시도하므로 넉넉하게
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.ok) {
    const err = new Error((j && j.error) || '현재 AI 연결에 문제가 있습니다. 잠시 후 다시 시도해주세요.');
    err.code = j && j.code;
    throw err;
  }
  return j.data;
}

function enableDemo(reason) {
  state.demo = true;
  $('demo-badge').classList.remove('hidden');
  let note = '⚠️ 현재 AI 연결에 문제가 있어 **데모 모드**로 대답하고 있어요.';
  note += '\nAI 서버(백엔드)에 연결되면 실제 EXAONE AI가 응답해요. 데모 모드는 미리 준비된 예시 답변으로 흐름을 보여줘요.';
  if (reason) note = reason + '\n' + note;
  addNote(note);
}

/* ══════════════════════════ 메시지 전송 ══════════════════════════ */

function sendFromInput() {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  inputEl.style.height = 'auto';
  sendMessage(text);
}

async function sendMessage(text) {
  if (state.busy) { toast('다정이가 대답하는 중이에요. 잠시만요!'); return; }
  state.busy = true;
  sendBtn.disabled = true;
  haptic(10);

  addUserMsg(text);
  state.messages.push({ role: 'user', content: text });
  showTyping();

  let data = null;
  if (!state.demo) {
    try {
      const payload = { mode: state.mode, action: 'chat', messages: state.messages };
      if (state.mode === 'practice' && state.practice) {
        payload.scenario = state.practice.custom || state.practice.scenarioTitle || null;
      }
      data = await callApi(payload);
    } catch (err) {
      enableDemo(err.code === 'NO_API_KEY' ? '🔑 API 키가 설정되지 않았어요.' : null);
    }
  }
  if (!data) data = demoReply(text);

  hideTyping();
  state.messages.push({ role: 'assistant', content: JSON.stringify(data) });
  addAiMsg(data);

  state.busy = false;
  sendBtn.disabled = false;
  inputEl.focus();
}

function handleOption(text) {
  if (/대화 연습/.test(text)) { switchMode('practice'); return; }
  if (/기록에 저장/.test(text)) { saveCurrentRecord(); return; }
  sendMessage(text);
}

/* ══════════════════════════ 모드 전환 ══════════════════════════ */

function switchMode(mode) {
  if (state.busy) { toast('다정이가 대답하는 중이에요. 잠시만요!'); return; }
  const leavingPractice = state.mode === 'practice' && mode !== 'practice';
  state.mode = mode;
  updateModeStrip();
  if (leavingPractice) {
    state.practice = null;
    $('practice-bar').classList.add('hidden');
  }
  updateTracker(null);
  if (mode === 'practice') { openScenarioModal(); return; }
  inputEl.placeholder = MODE_META[mode].placeholder;
  let note = MODE_META[mode].note;
  if (leavingPractice) note += '\n(🎭 연습이 종료되었어요.)';
  addNote(note);
}

/* ══════════════════════════ 대화 연습 ══════════════════════════ */

function renderScenarios() {
  const list = $('scenario-list');
  for (const s of SCENARIOS) {
    const btn = el('button', 'scenario-card');
    btn.type = 'button';
    btn.innerHTML = `<span class="scenario-icon" aria-hidden="true">${s.icon}</span>
      <span><span class="scenario-title"></span><span class="scenario-role"></span></span>`;
    btn.querySelector('.scenario-title').textContent = s.title;
    btn.querySelector('.scenario-role').textContent = s.role;
    btn.addEventListener('click', () => startScenario(s));
    list.appendChild(btn);
  }
}

function openScenarioModal() {
  $('scenario-modal').classList.remove('hidden');
}
function closeScenarioModal() {
  $('scenario-modal').classList.add('hidden');
  if (state.mode === 'practice' && !state.practice) {
    state.mode = 'general';
    updateModeStrip();
  }
}

function startScenario(s) {
  closeScenarioModal();
  state.mode = 'practice';
  state.practice = {
    id: s.id,
    scenarioTitle: s.id === 'custom' ? null : s.title,
    custom: null,
    lineIndex: 0,
    userMsgs: [],
    startIndex: state.messages.length,
  };
  updateModeStrip();
  inputEl.placeholder = MODE_META.practice.placeholder;
  $('practice-info').textContent = '🎭 ' + (s.id === 'custom' ? '직접 입력 연습' : s.title);
  $('practice-bar').classList.remove('hidden');

  addNote(s.id === 'custom'
    ? '🎭 **대화 연습 시작!**\n연습하고 싶은 상황을 먼저 입력해주세요.'
    : `🎭 **대화 연습 시작!** 상대방(${s.role.replace('역할: ', '')})이 먼저 말을 걸 거예요.\nNVC 방식(관찰 → 감정 → 욕구 → 부탁)으로 대화를 이끌어보세요!`);

  if (s.opener) {
    const data = demoJson({ reply: s.opener });
    state.messages.push({ role: 'assistant', content: JSON.stringify(data) });
    addAiMsg(data);
  }
}

async function endPractice() {
  if (!state.practice || state.busy) return;
  const since = state.messages.slice(state.practice.startIndex);
  const userCount = since.filter((m) => m.role === 'user').length;
  if (userCount < 1) { toast('연습에서 한 번이라도 말해봐야 피드백을 줄 수 있어요!'); return; }

  state.busy = true;
  sendBtn.disabled = true;
  showTyping();

  let data = null;
  if (!state.demo) {
    try {
      data = await callApi({
        mode: 'practice',
        action: 'practice_feedback',
        scenario: state.practice.custom || state.practice.scenarioTitle || null,
        messages: state.messages,
      });
    } catch (err) {
      enableDemo(err.code === 'NO_API_KEY' ? '🔑 API 키가 설정되지 않았어요.' : null);
    }
  }
  if (!data) data = demoPracticeFeedback();

  hideTyping();
  state.messages.push({ role: 'assistant', content: JSON.stringify(data) });
  addAiMsg(data);

  state.practice = null;
  $('practice-bar').classList.add('hidden');
  state.mode = 'general';
  updateModeStrip();
  inputEl.placeholder = MODE_META.general.placeholder;
  addNote('🎭 연습이 끝났어요! 수고 많았어요. **일반 대화 모드**로 돌아왔어요.');

  state.busy = false;
  sendBtn.disabled = false;
}

/* ══════════════════════════ 대화 분석 ══════════════════════════ */

async function runAnalysis() {
  if (state.busy) { toast('다정이가 대답하는 중이에요. 잠시만요!'); return; }
  if (state.mode === 'practice') { toast('연습 종료 후 분석할 수 있어요.'); return; }
  const userCount = state.messages.filter((m) => m.role === 'user').length;
  if (userCount < 2) { toast('분석하려면 대화를 조금 더 나눠주세요.'); return; }

  state.busy = true;
  sendBtn.disabled = true;
  showTyping();

  let data = null;
  if (!state.demo) {
    try {
      data = await callApi({ mode: state.mode, action: 'analyze', messages: state.messages });
    } catch (err) {
      enableDemo(err.code === 'NO_API_KEY' ? '🔑 API 키가 설정되지 않았어요.' : null);
    }
  }
  if (!data) data = demoAnalysis();

  hideTyping();
  state.messages.push({ role: 'assistant', content: JSON.stringify(data) });
  addAiMsg(data);

  state.busy = false;
  sendBtn.disabled = false;
}

/* ══════════════════════════ 대화 기록 ══════════════════════════ */

function loadRecords() {
  try { return JSON.parse(localStorage.getItem(LS_RECORDS)) || []; } catch { return []; }
}
function persistRecords(list) {
  localStorage.setItem(LS_RECORDS, JSON.stringify(list));
}

function saveCurrentRecord() {
  if (!state.lastSentence) {
    toast('아직 저장할 NVC 문장이 없어요. 대화를 이어가보세요!');
    return false;
  }
  const firstUser = state.messages.find((m) => m.role === 'user');
  const rec = {
    date: nowDateKorean(),
    title: firstUser ? firstUser.content.slice(0, 24) : '대화',
    emotions: state.lastSentence.emotions,
    needs: state.lastSentence.needs,
    sentence: state.lastSentence.sentence,
  };
  const list = loadRecords();
  list.unshift(rec);
  persistRecords(list);
  renderHistory();
  toast('기록에 저장했어요! 🗂️');
  return true;
}

function deleteRecord(idx) {
  const list = loadRecords();
  list.splice(idx, 1);
  persistRecords(list);
  renderHistory();
  toast('기록을 삭제했어요.');
}

function renderHistory() {
  const list = loadRecords();
  const container = $('history-list');
  container.innerHTML = '';
  if (!list.length) {
    container.innerHTML = '<div class="history-empty">아직 저장된 기록이 없어요.<br>대화에서 NVC 문장이 완성되면 💾 버튼으로 저장할 수 있어요.</div>';
    return;
  }
  list.forEach((r, i) => {
    const div = el('div', 'record');
    const tags = [
      ...(r.emotions || []).map((e) => `<span class="record-tag emotion">${escapeHtml(e)}</span>`),
      ...(r.needs || []).map((n) => `<span class="record-tag">${escapeHtml(n)}</span>`),
    ].join('');
    div.innerHTML = `
      <div class="record-top"><span class="record-date"></span><button class="record-del" data-idx="${i}" type="button">삭제</button></div>
      <div class="record-title"></div>
      <div class="record-tags">${tags}</div>
      <div class="record-sentence"></div>`;
    div.querySelector('.record-date').textContent = r.date;
    div.querySelector('.record-title').textContent = r.title;
    div.querySelector('.record-sentence').textContent = '“' + r.sentence + '”';
    container.appendChild(div);
  });
}

function openHistory() {
  renderHistory();
  $('history-panel').classList.remove('hidden');
  $('history-panel').setAttribute('aria-hidden', 'false');
  $('history-backdrop').classList.remove('hidden');
}
function closeHistory() {
  $('history-panel').classList.add('hidden');
  $('history-panel').setAttribute('aria-hidden', 'true');
  $('history-backdrop').classList.add('hidden');
}

/* ══════════════════════════ 글자 크기 ══════════════════════════ */

let fontIdx = 0;
function applyFont() {
  const saved = Number(localStorage.getItem(LS_FONT));
  fontIdx = saved >= 0 && saved < FONT_SCALES.length ? saved : 0;
  document.documentElement.style.setProperty('--font-scale', FONT_SCALES[fontIdx]);
  $('btn-font').textContent = ['가', '가+', '가++'][fontIdx];
}
function cycleFont() {
  fontIdx = (fontIdx + 1) % FONT_SCALES.length;
  localStorage.setItem(LS_FONT, String(fontIdx));
  applyFont();
}

/* ══════════════════════════ 새 대화 ══════════════════════════ */

function newChat() {
  if (state.busy) { toast('다정이가 대답하는 중이에요. 잠시만요!'); return; }
  state.messages = [];
  state.lastSentence = null;
  state.practice = null;
  state.demoFlow = null;
  state.mode = 'general';
  updateModeStrip();
  updateTracker(null);
  updateSaveButton();
  $('practice-bar').classList.add('hidden');
  inputEl.placeholder = MODE_META.general.placeholder;
  chat.innerHTML = '';
  addWelcome();
  toast('새 대화를 시작했어요! ✏️');
}

/* ══════════════════════════ 데모 엔진 ══════════════════════════
   AI 서버 없이 동작하는 키워드 기반 근사 응답. 실제 맥락·의도 판단은
   서버 연결 시 LLM이 담당하며, 데모는 간이 분류만 수행한다. */

const DEMO_PATTERNS = {
  4: [/(자살|자해|목을\s*매|투신|죽고\s*싶|죽어버리|죽어야\s*겠)/, /(죽여버리|죽여\s*주|죽일\s*거야|찌르|베어\s*죽)/],
  3: [/(때리|한\s*대|두들겨|패줄|팰\s*거|꺼져|나가서\s*죽|나타나지\s*마|연락하지\s*마|보고\s*싶지\s*않)/],
  2: [/(바보|멍청|등신|병신|시발|씨발|존나|개새끼|미쳤|미친|이기적|못났|한심|닥쳐)/, /(너|네가|당신).{0,12}(때문|탓)/],
  1: [/(짜증|화나|화가|열받|빡치|속상|서운|답답|싫어|미워|피곤|지쳤|힘들|불안|외로|슬퍼|우울|실망)/],
};

const DEMO_EMOTION_MAP = [
  [/화나|화가|열받|빡치|짜증/, '화남'],
  [/속상|서운/, '서운함'],
  [/답답/, '답답함'],
  [/슬퍼|슬프|우울|눈물/, '슬픔'],
  [/불안|걱정/, '불안'],
  [/무서|두려/, '두려움'],
  [/외로/, '외로움'],
  [/실망/, '실망'],
  [/당황|놀라/, '당황'],
  [/기뻐|행복|좋았/, '기쁨'],
  [/고마/, '감사'],
  [/기대|설레/, '기대'],
];

const DEMO_SMALL_TALK = [
  '오호, 그 이야기 궁금해요! 제일 기억에 남는 순간이 언제였어요?',
  '말해줘서 고마워요. 😊 그 다음엔 어떻게 됐어요?',
  '그렇구나! 오늘 하루는 어땠어요? 좋은 일이 있었나요?',
  '잘 들었어요. 그 마음이 든 이유가 뭐였을까요?',
];

const DEMO_PRACTICE_LINES = {
  'late-friend': [
    '그렇게까지 화낼 일이야? 나도 버스를 기다린 거거든?',
    '좋아, 알겠어. 다음엔 미리 연락할게. 오늘은 그만 풀자?',
    '이제 풀렸다니 다행이야. 약속은 다음에 또 지키면 되지!',
  ],
  'parents-phone': [
    '게임이 공부보다 더 중요하냐?',
    '…규칙을 같이 정하자고? 흠, 일단 들어보자.',
    '그래. 그렇게 말하면, 앞으로 정한 규칙은 꼭 지키도록 해.',
  ],
  'teacher': [
    '지금 변명을 하는 거니?',
    '음, 그렇게 말하니 조금 생각이 정리되는군.',
    '앞으로 수업 태도를 좀 더 신경 쓰도록 하자. 노력하겠다는 마음이 보인다.',
  ],
  'colleague': [
    '지금 당장은 현실성이 없어서 말이야.',
    '생각보다 준비를 잘해왔구나. 계속 들어보자.',
    '다음 회의에서 같이 논의해보자. 기대해볼게.',
  ],
  custom: [
    '음… 그런 일이 있었구나. 나는 솔직히 좀 억울해.',
    '네가 그렇게 느꼈다니 몰랐네. 계속 말해봐.',
    '좋아, 이해했어. 앞으로 서로 조심하자.',
  ],
};

const DEMO_EXAMPLES = {
  'late-friend': '약속 시간보다 30분 늦게 왔을 때, 나는 기다리면서 속상했어. 나에게 약속을 지키는 게 중요해. 다음부터 늦을 것 같으면 미리 알려줄 수 있을까?',
  'parents-phone': '게임 시간 이야기를 나눌 때, 나는 간섭받는 것 같아서 답답했어. 나에게는 내 일을 스스로 조절한다는 신뢰가 중요해. 규칙을 같이 정해보면 어떨까요?',
  'teacher': '수업 중에 지적받았을 때, 나는 당황하고 속상했어. 저도 수업에 집중하고 싶어요. 어떤 부분을 고치면 좋을지 알려주실 수 있을까요?',
  'colleague': '아이디어를 바로 반대받았을 때, 나는 서운했어. 제 아이디어를 끝까지 들어주시면 좋겠어요. 어려운 점이 있다면 어떤 점인지 들려주실 수 있을까요?',
  custom: '그 상황에서 있었던 일(관찰), 그때의 마음(감정), 나에게 중요한 것(욕구), 그리고 "~해줄 수 있을까?"(부탁) 순서로 문장을 만들어보세요.',
};

function demoJson(partial) {
  return Object.assign({
    risk_level: 0, reply: '', emotion_guess: [], need_guess: [],
    nvc_step: null, nvc_sentence: null, options: [],
    practice_feedback: null, analysis: null,
  }, partial);
}

let demoSmallIdx = 0;

function demoClassify(text) {
  for (const level of [4, 3, 2, 1]) {
    if (DEMO_PATTERNS[level].some((re) => re.test(text))) return level;
  }
  return 0;
}

function demoDetectEmotions(text) {
  const found = [];
  for (const [re, emo] of DEMO_EMOTION_MAP) {
    if (re.test(text) && !found.includes(emo)) found.push(emo);
    if (found.length >= 2) break;
  }
  return found;
}

function demoReply(text) {
  if (state.mode === 'practice') return demoPracticeTurn(text);
  if (state.mode === 'convert') return demoConvert(text);
  const level = demoClassify(text);
  if (level >= 3) return demoSafety(text, level);
  if (state.demoFlow) return demoFlowTurn(text);
  if (level === 2) return demoFlowStart(text);
  if (level === 1) return demoLevel1(text);
  return demoSmallTalk(text);
}

function demoSmallTalk() {
  const reply = DEMO_SMALL_TALK[demoSmallIdx % DEMO_SMALL_TALK.length];
  demoSmallIdx += 1;
  return demoJson({ reply });
}

function demoLevel1(text) {
  const emos = demoDetectEmotions(text);
  return demoJson({
    risk_level: 1,
    emotion_guess: emos,
    reply: `**${emos[0] || '속상한'}** 마음이 느껴져요. 그런 하루가 있을 수 있죠.\n\n혹시 어떤 일 때문에 그런 마음이 든 거예요? 편하게 이야기해줄래요?`,
  });
}

function demoSafety(text, level) {
  if (level === 4) {
    return demoJson({
      risk_level: 4,
      reply: `지금 마음이 정말 힘든 것 같아요. 다정이는 그 마음을 아주 소중하게 여겨요.\n\n하지만 지금은 **안전이 가장 중요해요**. 혼자 견디지 말고 꼭 도움을 받아주세요:\n\n· **109** 자살예방 상담 (24시간, 누구나)\n· **1388** 청소년전화\n· **1577-0199** 정신건강 위기상담\n· 위급하면 **112** 또는 **119**\n\n신뢰하는 어른이나 친구에게 지금 마음을 들려주는 것도 큰 힘이 돼요. 다정이는 언제나 여기 있을게요.`,
    });
  }
  return demoJson({
    risk_level: 3,
    emotion_guess: demoDetectEmotions(text),
    reply: `많이 화가 난 것 같아요. 그 말이 나올 만큼 힘들었겠어요.\n\n하지만 지금은 **안전부터** 생각해볼게요. 서로 안전할 때, 마음도 안전하게 전달할 수 있어요.\n\n마음이 조금 가라앉으면, 그 화를 NVC 방식으로 정리하는 걸 다정이가 도와줄게요. 지금 어떤 일이 있었는지 천천히 말해줄래요?`,
  });
}

function demoFlowStart(text) {
  state.demoFlow = { step: 'observation', collected: {} };
  const emos = demoDetectEmotions(text);
  return demoJson({
    risk_level: 2,
    emotion_guess: emos,
    nvc_step: 'observation',
    reply: `많이 **${emos[0] || '속상하고 답답한'}** 마음이 느껴져요. 그 마음은 정말 자연스러운 거예요.\n\n상대방을 비난하기보다는, **실제로 어떤 일이 있었는지**부터 정리해볼까요?\n예를 들어 "친구가 오늘 약속 시간보다 1시간 늦었어"처럼 사실만 말해주면 좋아요.`,
  });
}

function demoFlowTurn(text) {
  const flow = state.demoFlow;

  if (flow.step === 'observation') {
    flow.collected.observation = text;
    flow.step = 'feeling';
    const emos = demoDetectEmotions(text);
    return demoJson({
      nvc_step: 'feeling',
      emotion_guess: emos,
      options: ['화가 났어요', '서운했어요', '속상했어요', '답답했어요'],
      reply: `말해줘서 고마워요.\n\n그때 **어떤 감정**이 들었나요?\n다정이가 추측해보면 **${emos.join(' · ') || '속상함'}** 마음이 느껴졌을 것 같아요. 맞을까요?`,
    });
  }
  if (flow.step === 'feeling') {
    flow.collected.feeling = text;
    flow.step = 'need';
    return demoJson({
      nvc_step: 'need',
      need_guess: ['존중', '이해'],
      options: ['존중받고 싶었어요', '약속을 지켜줬으면 했어요', '미리 알려주길 바랐어요', '이해받고 싶었어요'],
      reply: `**${text}** 마음이었군요. 충분히 그럴 수 있어요.\n\n그 상황에서 **무엇이 중요했을까요?**\n혹시 아래 중에 있는 마음일까요?`,
    });
  }
  if (flow.step === 'need') {
    flow.collected.need = text;
    flow.step = 'request';
    return demoJson({
      nvc_step: 'request',
      options: ['다음엔 미리 알려줄 수 있을까 해보고 싶어요', '내가 이야기할 때 잠시 들어줄 수 있을까 해보고 싶어요'],
      reply: `**${text}** 이 중요했던 거네요.\n\n마지막 단계예요! **상대방에게 어떤 행동을 부탁**하고 싶나요?\n"~하지 마"보다 "**~해줄 수 있을까?**"로 말하면 더 잘 전달돼요.`,
    });
  }
  // request → 문장 완성
  flow.collected.request = text;
  const c = flow.collected;
  state.demoFlow = null;

  const sentence = `${c.observation.replace(/[.!?]+$/, '')}, 그래서 나는 ${c.feeling.replace(/[.!?]+$/, '')} 마음이 들었어요. 저에게는 ${c.need.replace(/[.!?]+$/, '')} 이 정말 중요해요. 앞으로는 ${c.request.replace(/[.!?]+$/, '')}.`;
  return demoJson({
    risk_level: 2,
    nvc_step: 'done',
    nvc_sentence: sentence,
    emotion_guess: demoDetectEmotions(c.feeling),
    options: ['🎭 이 문장으로 대화 연습하기', '🗂️ 이 문장을 기록에 저장하고 싶어요', '새로운 이야기 나누기'],
    reply: `모두 준비됐어요! 완성된 NVC 문장이에요. 🕊️\n\n상대방에게 말하기 전에 소리 내어 연습해봐도 좋아요. 아래에서 다음 단계를 골라볼 수 있어요.`,
  });
}

function demoConvert(text) {
  let obs = '내 말을 들어줬으면 하는 순간이 있었어';
  if (/늦/.test(text)) obs = '약속 시간보다 늦게 온 순간이 있었어';
  else if (/폰|휴대폰|게임|장난/.test(text)) obs = '내가 이야기할 때 네가 다른 일을 하고 있었어';
  else if (/무시|못 들|나 몰라/.test(text)) obs = '내 이야기를 흘려들은 순간이 있었어';

  const emos = demoDetectEmotions(text);
  const emo = emos[0] || '서운함';
  const feelingPhrase = { '화남': '속상하고 화가 났어', '서운함': '서운했어', '답답함': '답답했어', '슬픔': '슬펐어', '실망': '실망했어', '불안': '불안했어' }[emo] || '속상했어';
  const sentence = `${obs}. 나는 ${feelingPhrase}. 내 이야기를 중요하게 들어주는 게 나에게 중요해. 내가 이야기할 때 잠시 들어줄 수 있을까?`;

  return demoJson({
    risk_level: 2,
    emotion_guess: emos.length ? emos : ['서운함'],
    nvc_step: 'done',
    nvc_sentence: sentence,
    reply: `그 문장 속에 **${emo}** 마음이 담겨 있네요. 마음은 전달하되, 비난은 덜어내면 훨씬 잘 닿아요.\n\n**바꾼 문장**\n관찰: ${obs}\n감정: 나는 ${feelingPhrase}\n욕구: 내 이야기를 중요하게 들어주는 게 나에게 중요해\n부탁: 내가 이야기할 때 잠시 들어줄 수 있을까?\n\n(데모 모드라 예시 문장이에요 — 실제 AI가 연결되면 입력에 맞춰 바꿔줘요.)`,
  });
}

function demoPracticeTurn(text) {
  const p = state.practice;
  if (p.id === 'custom' && !p.custom) {
    p.custom = text;
    return demoJson({
      reply: `알았어요, 그런 상황이군요. 그럼 저는 그 상대방이 되어볼게요. 시작해볼까요?\n\n(데모 모드: 상대방 대사는 예시로 진행돼요.)`,
    });
  }
  const lines = DEMO_PRACTICE_LINES[p.id] || DEMO_PRACTICE_LINES.custom;
  const line = lines[Math.min(p.lineIndex, lines.length - 1)];
  p.lineIndex += 1;
  p.userMsgs.push(text);
  let reply = line;
  if (p.lineIndex >= lines.length) {
    reply += '\n\n(연습이 잘 되었어요! 위의 **연습 종료하고 피드백 받기** 버튼을 누르면 피드백을 드릴게요.)';
  }
  return demoJson({ reply });
}

function demoPracticeFeedback() {
  const p = state.practice;
  const text = (p.userMsgs || []).join(' ');
  const labels = { observation: '관찰', feeling: '감정 표현', need: '욕구 표현', request: '부탁', blame_reduction: '비난 줄이기' };
  const clamp5 = (v) => Math.max(1, Math.min(5, v));
  const stars = {
    observation: clamp5(/늦|무시|\d+\s*(분|시간)|보고 있었|지각|게임|수업/.test(text) ? 4 : 2),
    feeling: clamp5(/속상|서운|화나|화가|답답|실망|불안|외로|슬프|당황/.test(text) ? 4 : 2),
    need: clamp5(/중요|필요|존중|이해|신뢰|약속|배려|소중/.test(text) ? 4 : 2),
    request: clamp5(/할\s*수\s*있|해줄\s*수|부탁|미리\s*알려|들어줄|내려놓|규칙/.test(text) ? 4 : 2),
    blame_reduction: clamp5(5 - (text.match(/이기적|바보|미쳤|꺼져|못났|맨날|항상/g) || []).length * 2),
  };
  const entries = Object.entries(stars);
  const best = entries.slice().sort((a, b) => b[1] - a[1])[0][0];
  const worst = entries.slice().sort((a, b) => a[1] - b[1])[0][0];

  return demoJson({
    risk_level: 0,
    nvc_step: 'done',
    nvc_sentence: DEMO_EXAMPLES[p.id] || DEMO_EXAMPLES.custom,
    practice_feedback: {
      stars,
      comment: `**${labels[best]}**에서 좋은 모습을 보였어요! 다음에는 **${labels[worst]}**를 의식적으로 연습해보세요.\n상대가 방어적으로 들을 때일수록 관찰(사실) → 감정 → 욕구 → 부탁 순서를 지키는 게 효과가 커요.\n(데모 모드: 키워드 기반 간이 채점이에요.)`,
    },
  });
}

function demoAnalysis() {
  const text = state.messages.filter((m) => m.role === 'user').map((m) => m.content).join(' ');
  const found = (re) => re.test(text);
  const scores = {
    observation: found(/늦|무시|만났|갔었|늦었|전화|메시지|수업|게임|\d+\s*(분|시간)/) ? 80 : 45,
    feeling: found(/속상|서운|화나|화가|짜증|답답|기뻐|좋아|슬퍼|불안|외로/) ? 80 : 45,
    need: found(/중요|필요|존중|이해|신뢰|약속|배려|원해|바라/) ? 75 : 40,
    request: found(/할\s*수\s*있|해줄\s*수|부탁|미리\s*알려|들어줄/) ? 75 : 40,
    blame_reduction: Math.max(30, 85 - (text.match(/이기적|바보|미쳤|꺼져|못났|맨날|항상/g) || []).length * 15),
  };
  const IMPROVE = {
    observation: '평가("맨날", "항상") 대신 그날의 사실만 말해보세요. 예: "오늘 약속 시간보다 30분 늦었어."',
    feeling: '"나는 ~했어" 형태로 내 감정을 직접 표현해보세요.',
    need: '감정 뒤의 욕구를 한 문장으로 표현해보세요. 예: "약속을 지키는 게 나에게 중요해."',
    request: '"~하지 마" 대신 "~해줄 수 있을까?" 형태의 구체적 부탁을 시도해보세요.',
    blame_reduction: '비난 표현("이기적", "맨날")을 덜어내면 상대가 방어 없이 들어요.',
  };
  const improvements = Object.entries(scores)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 2)
    .map(([k]) => IMPROVE[k]);

  return demoJson({
    risk_level: 0,
    analysis: {
      scores,
      summary: 'NVC 4요소 중 잘 담은 것과 비운 것이 섞여 있어요. 아래 개선 제안을 참고해 다음 대화에서 연습해보세요. (데모 모드: 키워드 기반 간이 분석 — 실제 AI 분석은 서버 연결 후 이용할 수 있어요.)',
      improvements,
    },
    reply: '전체 대화를 분석했어요! 📊',
  });
}

/* ── 음성 입력 (Web Speech API — Chrome·Edge·Safari 등 지원 브라우저) ── */
let recog = null;
let recogActive = false;

function setupMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;  // 미지원 브라우저(http LAN 등)에서는 마이크 버튼이 숨겨진 채 유지된다
  const btnMic = $('btn-mic');
  btnMic.classList.remove('hidden');

  recog = new SR();
  recog.lang = 'ko-KR';
  recog.interimResults = true;  // 말하는 동안에도 입력창에 실시간 표시
  recog.continuous = false;
  recog.maxAlternatives = 1;

  recog.onstart = () => {
    recogActive = true;
    btnMic.classList.add('recording');
    btnMic.textContent = '⏺️';
    toast('듣고 있어요… 다 말한 뒤 잠시 기다리면 글자로 바뀌어요.');
    haptic(20);
  };
  recog.onresult = (e) => {
    let finalText = '';
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    if (finalText || interim) {
      // 이미 적어둔 텍스트 뒤에 받아쓴 내용을 붙인다
      inputEl.value = (inputEl.dataset.voiceBase || '') + (finalText || interim);
      autoSizeInput();
    }
  };
  recog.onerror = (e) => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      toast('마이크 권한이 필요해요. 브라우저 설정에서 마이크를 허용해주세요.');
    } else if (e.error === 'no-speech') {
      toast('목소리가 들리지 않았어요. 다시 시도해볼까요?');
    } else if (e.error !== 'aborted') {
      toast('음성 인식에 문제가 생겼어요. 잠시 후 다시 시도해주세요.');
    }
  };
  recog.onend = () => {
    recogActive = false;
    btnMic.classList.remove('recording');
    btnMic.textContent = '🎤';
    inputEl.dataset.voiceBase = '';
  };
}

function toggleMic() {
  if (!recog) return;
  if (recogActive) { recog.stop(); haptic(15); return; }
  inputEl.dataset.voiceBase = inputEl.value;
  try { recog.start(); } catch (e) { /* 이미 실행 중이면 무시 */ }
}

/* ── 모바일 제스처: 채팅 화면을 좌우로 스와이프해 모드 전환 ── */
function setupSwipe() {
  let sx = 0, sy = 0, swiping = false;
  chat.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { swiping = false; return; }
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    swiping = true;
  }, { passive: true });
  chat.addEventListener('touchend', (e) => {
    if (!swiping) return;
    swiping = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    // 세로 스크롤로 판단되는 제스처는 무시하고, 가로로 길게 쓸어넘긴 경우만 전환
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (state.busy) return;
    const modes = ['general', 'emotion', 'convert', 'practice'];
    const idx = modes.indexOf(state.mode);
    const next = dx < 0 ? Math.min(modes.length - 1, idx + 1) : Math.max(0, idx - 1);
    if (next === idx) return;
    switchMode(modes[next]);
    haptic(15);
  }, { passive: true });
}

/* ══════════════════════════ 이벤트 바인딩 · 초기화 ══════════════════════════ */

function bindEvents() {
  sendBtn.addEventListener('click', sendFromInput);

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendFromInput();
    }
  });
  inputEl.addEventListener('input', () => { autoSizeInput(); });

  $('btn-mic').addEventListener('click', toggleMic);

  document.querySelectorAll('.mode-card').forEach((c) => {
    c.addEventListener('click', () => switchMode(c.dataset.mode));
  });
  setupSwipe();

  $('btn-analyze').addEventListener('click', runAnalysis);
  $('btn-history').addEventListener('click', openHistory);
  $('btn-history-close').addEventListener('click', closeHistory);
  $('history-backdrop').addEventListener('click', closeHistory);
  $('btn-save-current').addEventListener('click', saveCurrentRecord);
  $('history-list').addEventListener('click', (e) => {
    const btn = e.target.closest('.record-del');
    if (btn) deleteRecord(Number(btn.dataset.idx));
  });

  $('btn-new').addEventListener('click', newChat);
  $('btn-font').addEventListener('click', cycleFont);
  $('btn-practice-end').addEventListener('click', endPractice);

  $('btn-scenario-close').addEventListener('click', closeScenarioModal);
  $('scenario-modal').addEventListener('click', (e) => {
    if (e.target === $('scenario-modal')) closeScenarioModal();
  });
}

function init() {
  bindEvents();
  setupMic();
  renderScenarios();
  applyFont();
  addWelcome();
  updateSaveButton();

  checkHealth().then((h) => {
    if (h.demo) {
      enableDemo(h.reachable ? '🔑 API 키가 설정되지 않았어요.' : '📡 AI 서버에 연결할 수 없어요.');
    }
  });
}

init();