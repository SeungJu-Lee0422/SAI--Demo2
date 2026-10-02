# 사이 · SAI 기능을 Demo2 화면으로

SAI--Demo2의 흰 배경, 검은 글씨, 카드 구성과 **친구 / 그룹 / 마이** 화면에 SAI의 실제 계정 기능을 연결했습니다. 기본 진입 화면은 로그인·회원가입이며, 기존 로컬 Demo는 **예시 데이터로 체험하기**에서 사용할 수 있습니다. SAI 원본 프로젝트와 데이터베이스는 변경하지 않습니다.

## 실행

Node.js 24 이상과 Python 3.9 이상이 필요합니다.

```bash
npm ci
npm run solver:setup
npm run build
npm run server
```

브라우저에서 **http://localhost:8788**을 엽니다. `solver:setup`은 기존 OR-Tools 의존성을 프로젝트의 `.data/solver-env`에 설치합니다. 서비스와 예시 Demo가 이 환경을 함께 사용하며 시스템 Python 패키지를 바꾸지 않습니다. 모델 실행은 웹 브라우저와 로컬 서버의 자원을 사용합니다.

환경변수는 [.env.example](.env.example)을 참고해 로컬 `.env`에 설정합니다. 기본 서버는 `127.0.0.1:8788`입니다. 다른 포트는 `SAI_PORT` 또는 `PORT`, LAN 접근은 `HOST=0.0.0.0`으로 설정합니다. 휴대폰에서는 `EXPO_PUBLIC_API_URL=http://컴퓨터의LAN주소:8788`과 `npm start`를 사용합니다. [모바일 실행 안내](mobile/README.md)를 참고하세요.

## 연결한 기능

- **계정:** 아이디·비밀번호·확인으로 가입, 로그인·로그아웃, 세션 복원. 첫 프로필 설정 후 세 탭으로 이동합니다.
- **프로필:** 이름·사진·소개, 관심사 직접 입력, 좋아함·피함·탐색, 항목별 공유 설정, Instagram·LinkedIn 링크와 친구 공개 설정, 프로필 링크/QR, 프로필 삭제.
- **친구:** 프로필 코드/링크로 요청, 받은 요청 수락·거절, 연결 해제, 수락한 친구의 공개 SNS 링크, 이름 검색, 나를 포함하거나 제외한 다중 비교, 공통 관심사 Top-3와 사용자별 근거.
- **마이:** 실제 YouTube 데이터 가져오기, LinkedIn 프로필 텍스트 가져오기, 명시적인 기술·관심사 목록 미리보기, 문장 AI 추출 후보 선택, 개인 Qwen3 관심사 분석과 원문 근거.
- **그룹:** 모임 생성, 코드/링크/QR 초대·참여, 참가자 목록과 공통 관심사, 3~30명 선택·테이블당 3/4/5명, 실제 CP-SAT 최대 3개 추천안, 테이블별 품질·근거, 모임장 편성 확정, 새로고침 후 복원, 모임 나가기.

추천 결과는 실제 `OPTIMAL/FEASIBLE` 상태와 전체/제한 후보 범위를 표시합니다. 제한 후보나 시간 제한의 결과를 전역 최적이라고 표현하지 않습니다. 확정 편성의 배정은 저장하며, 다시 열 때의 점수와 근거는 **현재 공유 관심사로 다시 계산한 값**이라고 표시합니다. 점수는 관심사 연결의 참고 지표이며 관계 성공 확률이 아닙니다.

## 공개 범위와 데이터

직접 추가하거나 가져온 관심사는 기본 비공개입니다. 공유한 관심사와 해당 출처 근거는 공개 프로필·친구 비교·모임 참가자 화면에서 보일 수 있습니다. Instagram·LinkedIn 링크는 친구 공개를 켜고 서로 요청을 수락한 경우에만 상대에게 표시합니다. 개인 AI 분석은 자신의 비공개 관심사도 사용하며 공유 설정을 바꾸지 않습니다. 공유한 회피 항목은 공통 관심사 추천에서 제외합니다.

서비스는 `/api/app`과 Bearer 세션을 사용합니다. 계정·관심사·친구·모임은 `.data/sai.sqlite`에 저장하며, 웹 세션은 `sai-session` localStorage, 네이티브는 SecureStore에 보관합니다. 비밀번호는 개별 salt를 둔 scrypt로 저장하고 로그인 제한과 30일 세션 만료를 적용합니다. 프로필 삭제는 연결과 참여 기록을 삭제하지만 계정은 남깁니다.

사진은 256px JPEG로 줄여 저장하고 서버에서 크기·형식을 검증합니다. 예시 프로필과 실제 계정 참가자를 섞지 않습니다.

## 외부 데이터와 AI

**서비스 YouTube:** Google Cloud의 YouTube Data API v3, 웹 OAuth 클라이언트와 `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`를 설정합니다. 기본 콜백은 `http://localhost:8788/api/app?action=youtubeCallback`입니다. PKCE와 읽기 전용 권한으로 재생목록·영상·구독 채널을 가져옵니다. 연결 창에서 인증한 뒤 화면으로 돌아와 새로고침합니다. 수집 한도와 일부 실패 상태를 표시하며, 액세스 토큰은 저장하지 않습니다.

**서비스 LinkedIn:** 사용자가 직접 내보내 붙여넣은 프로필 텍스트를 실제 입력으로 처리합니다. 기술·경력·교육·프로젝트 제목을 지원합니다. 별도의 명시 목록 미리보기는 프로필 수정에서 사용하며, 선택해 저장한 항목에 검증된 LinkedIn 출처를 부여하지 않습니다. LinkedIn 계정 인증이나 자동 경력 수집은 서비스에서 제공하지 않습니다.

**브라우저 AI:** Qwen3-Embedding-0.6B로 개인 관심사와 선택한 사람의 의미 비교를 실행합니다. 문장 정리는 별도 Qwen3-0.6B 생성 모델을 사용합니다. 각 모델은 첫 실행에 약 614MB 다운로드가 필요하며 PC 사용을 권장합니다. 모델 준비·오류·중단 상태를 표시하고 사용자가 선택한 후보만 프로필 저장 때 반영합니다. 네이티브 문장 추출은 기존 Ollama/OpenAI 서버 설정을 사용합니다. 개인 AI와 친구 AI 의미 비교는 웹에서 실행합니다.

**그룹 AI:** 선택하면 서버의 실제 Qwen3 의미 비교를 사용한 뒤 CP-SAT을 실행합니다. 기본 편성은 공유 관심사 정규화와 분야 규칙을 사용합니다. 모델 실행 실패를 성공 결과로 대체하지 않습니다.

## 예시 Demo

로그인 화면 또는 마이의 **예시 데이터로 체험하기**에서 기존 Demo2 화면을 엽니다. 24명의 예시 참가자, 전체 구성원의 공통 관심사, 최대 24명 CP-SAT 편성, 확정한 예시 그룹을 사용할 수 있습니다. **내 계정으로 돌아가기**로 실제 계정 화면에 복귀합니다.

Demo의 개인 입력·OAuth·편성은 `/api/demo`와 독립적인 `sai_demo` 쿠키를 사용하며 localhost에서만 동작합니다. `.data/demo.sqlite`에 저장합니다. 기존 재생목록 선택, LinkedIn OIDC 기본 정보와 PDF/TXT/텍스트 가져오기는 이 화면에 보존했습니다. [Demo OAuth 안내](OAUTH_SETUP.md)와 [.env.demo.example](.env.demo.example)을 참고하세요. 서비스와 Demo를 함께 사용할 때 Google OAuth 클라이언트에는 필요한 두 콜백을 각각 등록해야 합니다.

## 검증

```bash
npm run typecheck
npm test
npm run test:live
npm run build
```

스모크는 가입·세션·공유 권한·출처 보존·OAuth 상태 재사용 차단·개인 분석·12/24/30명 실제 CP-SAT·기존 Demo API를 검증합니다. `test:live`는 임시 서비스 DB와 Demo 저장소에서 실제 HTTP와 SQLite를 검증합니다.

Playwright가 이미 설치된 환경에서는 다음 명령으로 새 UI 흐름과 모바일/PC 스크린샷을 검증할 수 있습니다. 프로젝트에 새 테스트 의존성을 추가하지 않았습니다.

```bash
SAI_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node backend/service-browser-smoke.mjs
```

검증 화면은 `.data/qa`에 저장합니다. 실제 Google 계정 인증은 별도 OAuth 자격증명과 사용자 인증이 필요하며, OAuth 자동 테스트는 네트워크 응답을 대체해 프로토콜·파싱을 확인합니다. 실제 기기 iOS/Android, 계정 복구와 스토어 제출은 검증하지 않았습니다.

## Vercel 배포

공개 주소: **https://sai-demo2.vercel.app**

`vercel.json`은 Expo 웹(`dist/client`), Node.js 24 계정 API(`api/app.ts`), Python 3.12 CP-SAT 함수(`api/solver.py`)를 함께 배포합니다. 계정·관심사·친구·모임은 외부 **Turso SQLite**에 영구 저장하고, 함수의 로컬 파일에 저장하지 않습니다. 기존 SQL과 OR-Tools 구현을 재사용하며 JavaScript DB SDK를 추가하지 않았습니다.

1. `vercel login` 후 `vercel link`로 프로젝트를 연결합니다.
2. Vercel Marketplace의 `tursocloud/database` Starter 플랜을 프로젝트에 연결합니다. `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`이 런타임에 필요합니다.
3. 배포 전에 `vercel env pull .env.local --environment=production`과 `npm run db:migrate:turso`로 빈 원격 DB의 스키마를 준비합니다. 기존 로컬 계정 데이터나 SAI 원본 DB는 가져오지 않습니다. 마이그레이션은 기록하고 재실행할 수 있습니다.
4. 32자 이상의 임의 `GROUP_SOLVER_TOKEN`을 Production/Preview에 비밀값으로 설정합니다. Node API가 CP-SAT 함수에 인증할 때만 사용합니다. 함수 주소는 `VERCEL_PROJECT_PRODUCTION_URL`의 `/api/solver`를 기본 사용하고, 별도 서비스는 `GROUP_SOLVER_URL`로 지정합니다.
5. `vercel deploy --prod`로 배포합니다. `/api/app`의 실제 가입·로그인·프로필·모임·편성 저장을 확인합니다.

로컬 전용 예시 `/api/demo`는 Vercel에서 제공하지 않으며 배포 빌드에는 예시 체험 버튼을 표시하지 않습니다. 실제 계정 서비스는 동일한 화면과 `/api/app`을 사용합니다. 브라우저 개인 AI·친구 의미 비교는 웹 모델을 사용합니다. 서버 그룹 AI 옵션은 별도의 `semanticPairs` 실행 환경이 있어야 하며, 미설정 상태에서는 명확한 오류를 반환합니다. 기본 CP-SAT 편성은 서버 AI 없이 사용할 수 있습니다.

YouTube 실계정 연결에는 별도의 Google OAuth 자격증명과 배포 주소를 사용하는 `YOUTUBE_REDIRECT_URI` 등록이 필요합니다. 비밀값은 Vercel 환경변수로만 설정하고 `EXPO_PUBLIC_*`에 넣지 않습니다. SQLite HTTP 트랜잭션은 `BEGIN → 결과 확인 → COMMIT/ROLLBACK`을 같은 연결로 실행합니다.

[Expo 웹 배포 안내](https://docs.expo.dev/guides/publishing-websites/) · [Vercel 함수](https://vercel.com/docs/functions/runtimes) · [Turso HTTP API](https://docs.turso.tech/sdk/http/reference)

기존 Hosted Worker 빌드도 보존합니다. Worker에서 Python을 직접 실행할 수 없어 별도 `npm run solver:serve` 서비스와 `GROUP_SOLVER_URL`, `GROUP_SOLVER_TOKEN` 설정이 필요합니다.

[디자인 기준](DESIGN.md) · [알고리즘](ALGORITHM.md) · [연구와 라이선스](THIRD_PARTY.md)
