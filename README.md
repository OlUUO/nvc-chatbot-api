# 🕊️ NVC Buddy (다정이)

**비폭력대화(NVC, Nonviolent Communication) AI 챗봇** — 사용자의 공격적·갈등적 표현을 차단하는 것이 아니라,

> **관찰 → 감정 → 욕구 → 부탁**

의 4단계를 통해 사용자가 자신의 감정과 욕구를 이해하고, 상대방에게 건설적으로 표현하도록 돕는 AI 대화 코치입니다.

---

## 주요 기능

| 기능 | 설명 |
|---|---|
| 💬 일반 대화 | 위험 표현이 없으면 친근한 AI 대화 |
| 😊 감정 이야기 | 감정을 추정 형태로 반영하고 그 뒤의 욕구를 탐색 |
| 🔄 문장 바꾸기 | 공격적 문장을 관찰/감정/욕구/부탁 4요소로 변환 |
| 🎭 대화 연습 | 상대방 역할극(친구·부모·선생님·동료) + 별점 피드백 |
| ⚠️ 위험도 분류 | Level 0~4 (일반 → 부정 → 공격 → 심각 폭력 → 위협/자해) — 맥락과 의도까지 LLM이 판단 |
| 🚨 안전 대응 | Level 3~4에서 NVC 교육보다 안전 우선, 상담전화(109, 1388 등) 배너 표시 |
| 📊 대화 분석 | 관찰·감정·욕구·부탁·비난 감소 5항목 점수 + 개선 제안 |
| 🗂️ 대화 기록 | 최소 정보만, 사용자가 직접 저장 — 브라우저(localStorage)에만 보관 |
| 🔠 접근성 | 글자 크기 3단계, 아이콘+텍스트 병기, 모바일 반응형 |

---

## 프로젝트 구조

```
nvc-chatbot/
├── public/              # 프론트엔드 (브라우저에 노출되는 유일한 폴더)
│   ├── index.html       # 챗봇 메인 화면
│   ├── style.css        # UI · 반응형 디자인
│   └── script.js        # 채팅 · 모드 · 기록 · 데모 엔진
├── server.js            # Express 백엔드 — AI API 프록시 (키는 여기서만 사용)
├── nvc-prompt.js        # 다정이의 NVC 행동 규칙(시스템 프롬프트)
├── package.json
├── .env                 # API 키 저장 (Git에 업로드되지 않음)
├── .env.example         # .env 복사용 템플릿
├── .gitignore           # .env, node_modules 제외
└── TEST-SCENARIOS.md    # 일반/공격/위험 대화 테스트 시나리오
```

> 프론트엔드는 `public/` 안에만 두어, 정적 파일 서빙으로 `.env`가 브라우저에 노출되지 않도록 설계되어 있습니다.

---

## 빠른 시작

**요구 사항:** Node.js 18 이상

```bash
# 1. 의존성 설치
npm install

# 2. API 키 설정 — .env 파일을 열어 키를 넣으세요
#    OPENAI_API_KEY=<EXAONE API 키>

# 3. 서버 실행
npm start

# 4. 브라우저에서 열기
#    http://localhost:3000
```

- 기본 AI 공급자는 **EXAONE API**(LG AI Research, OpenAI 호환)입니다. 모델: `lgai-exaone/exaone-4.5-33b`.
- EXAONE 사양(server.js에 반영됨): `max_completion_tokens` 사용, reasoning 비활성화(`enable_thinking: false`), JSON 강제, 타임아웃 50초 + 일시적 오류 1회 재시도.
- **API 키 만료일(2026-11-13)** 이후에는 새 키를 발급받아 `.env`의 `OPENAI_API_KEY`만 갱신하면 됩니다.
- ⚠️ `EXAONE-api-key.txt`(API 참고서)에는 실제 키가 들어 있으므로 `.gitignore`에 등록되어 있습니다. 절대 GitHub에 올리지 마세요.
- `.env`의 `OPENAI_BASE_URL`, `OPENAI_MODEL`을 바꾸면 OpenAI 호환 API(다른 공급자·로컬 LLM 등)도 사용할 수 있습니다.
- **API 키가 없어도 동작합니다** — 서버 없이 `public/index.html`을 브라우저로 열거나, 키 없이 서버를 실행하면 **데모 모드**로 작동합니다(아래 참고).

---

## 🔐 API 키 보안 (중요)

- API 키는 **서버(server.js)에서만** 읽고, 브라우저 코드로는 절대 노출되지 않습니다.
  ```
  사용자 → 웹 브라우저 → Express 서버 → 환경변수(.env) → AI API
  ```
- `.gitignore`에 `.env`가 등록되어 있어 GitHub에 올라가지 않습니다.
- HTML/JS에 `const API_KEY = "sk-..."` 형태로 직접 넣지 마세요.
- 배포 시( Render, Railway 등 )에는 플랫폼 환경변수 기능에 키를 등록하고, `.env` 파일은 업로드하지 않습니다.

---

## 🧪 데모 모드

AI 서버 연결 실패·API 키 미설정 시 자동으로 켜지는 **키워드 기반 근사 응답 모드**입니다.

- 화면 상단에 "데모 모드" 배지가 표시됩니다.
- 공격 표현 감지 → NVC 4단계 유도 → 문장 완성 → 연습 피드백 → 분석까지 전체 흐름을 체험할 수 있습니다.
- 한계: 실제 맥락·의도 판단은 불가하며, 예시 문장 중심의 단순 응답입니다. 실제 서비스에는 반드시 AI API를 연결하세요.

---

## 🚀 배포

| 플랫폼 | 방법 |
|---|---|
| **Render** | Web Service → GitHub 저장소 연결 → Build: `npm install`, Start: `npm start` → 환경변수에 `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` 등록 |
| **Railway / Fly.io** | GitHub 저장소로 배포, 환경변수 동일 |
| **Vercel** | serverless 특성상 `server.js`를 API 라우트 형태로 바꿔야 합니다 |

### GitHub → Render 배포 순서 (권장, 실제 AI 동작)

1. GitHub에서 새 저장소 생성 (예: `nvc-chatbot`) — 공개/비공개 모두 가능
2. 로컬에서 푸시:
   ```bash
   git init
   git add .
   git status   # .env, EXAONE 참고서, node_modules가 목록에 없는지 반드시 확인!
   git commit -m "NVC Buddy 첫 배포"
   git branch -M main
   git remote add origin https://github.com/<사용자명>/nvc-chatbot.git
   git push -u origin main
   ```
3. [render.com](https://render.com) → New → Web Service → GitHub 저장소 연결
   - Build Command: `npm install` / Start Command: `npm start`
   - Environment → 3개 환경변수 등록: `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
   - Create → 배포 후 `https://<서비스명>.onrender.com` 주소로 접속 (https라 폰에서도 음성 입력 동작)

### GitHub Pages (데모 모드용)

`public/` 폴더만 정적 배포하면 **데모 모드로 동작하는 웹앱**이 됩니다(API 키 없음 → 자동 데모 전환). 전체 AI 기능은 위의 Render 배포를 사용하세요.

- **GitHub → Render(또는 Railway) 연결 배포가 권장됩니다.** GitHub에는 코드만 올리고(푸시 전 `.gitignore` 확인 — `.env`와 EXAONE 참고서 제외 확인), 실제 서비스(백엔드)는 Render 등에서 실행합니다.
- GitHub Pages / Vercel에 정적만 배포하면 AI 기능 없이 데모 모드만 동작합니다(백엔드 주소가 필요).

---

## ✏️ 커스터마이징

| 하고 싶은 일 | 수정 위치 |
|---|---|
| 다정이의 성격·원칙·위험도 규칙 수정 | `nvc-prompt.js` |
| 연습 시나리오 추가/수정 | `public/script.js`의 `SCENARIOS` |
| 감정·욕구 아이콘·어휘 | `public/script.js`의 `EMOTION_ICONS`, `NEED_ICONS`와 `nvc-prompt.js`의 어휘 목록(함께 변경) |
| 긴급 상담전화 목록 | `public/script.js`의 `HOTLINES` |
| 모델/공급자 변경 | `.env`의 `OPENAI_MODEL`, `OPENAI_BASE_URL` |

---

## ⚠️ 면책

NVC Buddy는 학습·연습용 도구이며 **전문 상담이나 의료적 판단을 대신하지 않습니다.**
위급한 상황(자해·자살 위험, 폭력)에서는 즉시 **109(자살예방 상담, 24시간)**, **1388(청소년전화)**, **112**, **119**로 연락하세요.
