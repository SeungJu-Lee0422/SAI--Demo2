# 사이 로컬 Demo 데이터 연결

이 설정은 내 컴퓨터의 `http://localhost:8788` Demo에서 실제 YouTube 데이터와 LinkedIn 기본 프로필을 불러오기 위한 것입니다. GitHub에 푸시하거나 사이트를 배포할 필요가 없습니다. LinkedIn PDF·텍스트 입력은 OAuth 설정 없이 사용할 수 있습니다.

## 1. 환경 파일

SAI 폴더에서 `.env.demo.example`을 `.env`로 복사하고 Client ID·Client Secret을 입력합니다. `.env`와 `.data`는 Git에서 제외됩니다. 환경 파일을 변경한 뒤 로컬 서버를 다시 시작해 주세요.

```powershell
Copy-Item -LiteralPath .env.demo.example -Destination .env
npm install
npm run build
npm run server
```

브라우저에서 `http://localhost:8788`에 접속한 뒤 Demo의 **마이** 화면에서 연결합니다. OAuth를 시작할 때와 돌아올 때 같은 브라우저·같은 로컬 Demo 세션을 사용합니다. `127.0.0.1`, LAN 주소 또는 다른 포트 대신 `localhost:8788`을 사용합니다.

## 2. YouTube

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 선택하거나 만듭니다.
2. API 및 서비스에서 **YouTube Data API v3**를 사용 설정합니다.
3. Google Auth Platform에서 앱 이름·지원 이메일·대상 사용자를 설정합니다. 앱이 테스트 모드라면 시연에 사용할 Google 계정을 테스트 사용자로 등록합니다.
4. 데이터 액세스에 읽기 범위 `https://www.googleapis.com/auth/youtube.readonly`를 추가합니다.
5. OAuth 클라이언트를 **웹 애플리케이션** 유형으로 만들고, 승인된 리디렉션 URI에 아래 주소를 정확히 등록합니다.

```text
http://localhost:8788/api/demo/oauth/youtube/callback
```

6. Client ID와 Client Secret을 `.env`의 `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`에 입력합니다.
7. 서버를 다시 시작하고 **마이 → YouTube 연결**에서 실제 계정의 읽기 권한을 승인합니다.
8. 재생목록을 조회한 뒤 원하는 목록을 선택하거나 전체 목록을 가져옵니다. 구독 채널은 선택적으로 함께 가져올 수 있습니다.

프로그램은 연결한 계정의 재생목록을 `playlists.list(mine=true)`로 조회합니다. 목록과 각 목록의 영상, 구독 채널은 다음 페이지가 있으면 계속 조회합니다. 영상 제목·설명·채널·태그·주제 metadata를 분석 입력으로 사용하며, YouTube 계정의 데이터는 수정하지 않습니다.

기본 안전 한도는 재생목록 100개, 재생목록 항목 2,000개, 구독 채널 500개입니다. 같은 영상이 여러 목록에 있으면 분석 영상은 한 번만 집계하고, 모든 출처 목록 이름을 보존합니다. 그래서 분석 영상 수는 재생목록 항목 수보다 작을 수 있습니다. 삭제·비공개 전환 등으로 metadata를 받을 수 없는 영상은 `unavailableVideos`에 별도로 집계합니다. 한도에 도달한 가져오기는 `truncated: true`와 적용한 한도를 반환합니다. 한도는 `.env`에서 조절할 수 있으며, 절대 최대는 각각 500개·10,000개·2,000개입니다. 한도에 걸리지 않았다면 전체 다음 페이지를 조회한 결과입니다.

관심사 분석은 한 번에 최대 3,000개 원문 항목을 처리합니다. 기본 가져오기 한도는 이 범위에 들어갑니다. 가져오기 한도를 크게 올려 3,000개를 넘기면 재생목록을 나누어 다시 가져오도록 안내합니다. `SAI_MODEL_CACHE`로 모델 캐시 위치, `SAI_PYTHON`으로 CP-SAT 실행 Python 경로를 지정할 수 있으며 기본값은 프로젝트의 `.data/models`와 `.venv`입니다.

YouTube Data API의 계정 조회와 OAuth 읽기 권한 계약은 [재생목록 구현 문서](https://developers.google.com/youtube/v3/guides/implementation/playlists), [PlaylistItems API](https://developers.google.com/youtube/v3/docs/playlistItems/list), [Videos API](https://developers.google.com/youtube/v3/docs/videos/list), [Subscriptions API](https://developers.google.com/youtube/v3/docs/subscriptions/list), [OAuth 문서](https://developers.google.com/youtube/v3/guides/auth/client-side-web-apps)를 따릅니다.

## 3. LinkedIn 기본 프로필 연결

1. [LinkedIn Developer Portal](https://www.linkedin.com/developers/apps)에서 애플리케이션을 선택하거나 만듭니다. 앱 생성에 연결할 LinkedIn Page 등 포털의 요구 사항을 충족합니다.
2. Products에서 **Sign In with LinkedIn using OpenID Connect**를 신청하고 사용 가능 상태를 확인합니다.
3. Auth의 승인된 리디렉션 URL에 아래 주소를 정확히 등록합니다.

```text
http://localhost:8788/api/demo/oauth/linkedin/callback
```

4. Client ID와 Client Secret을 `.env`의 `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`에 입력합니다.
5. 서버를 다시 시작하고 **마이 → LinkedIn 연결**에서 기본 프로필 권한을 승인합니다.

Demo는 필요한 최소 범위인 `openid profile`을 요청하고 `https://api.linkedin.com/v2/userinfo`에서 이름·제공되는 경우 사진을 받습니다. 이메일은 요청하지 않습니다. 이 연결에서 경력·기술·교육 정보가 자동으로 온다고 표시하지 않습니다. 경력과 관심사 분석에는 다음 단계의 실제 프로필 파일이나 텍스트를 사용합니다.

LinkedIn은 [OIDC 안내](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2)와 [Authorization Code Flow 안내](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow)에 따라 연결합니다. 포털이 앱의 로컬 HTTP 주소를 승인하지 않는 경우, 현재의 로컬 Demo에서는 기본 로그인 연결을 사용할 수 없습니다. 그래도 실제 LinkedIn 프로필 PDF·텍스트 입력과 분석은 사용할 수 있습니다.

## 4. 실제 LinkedIn PDF·텍스트 입력

LinkedIn 프로필에서 제공되는 PDF 내보내기 기능을 사용하거나, 본인의 프로필 내용을 복사합니다. Demo의 **프로필 데이터 추가**에서 PDF/TXT 파일을 선택하거나 텍스트를 붙여 넣습니다.

- PDF는 실제 PDF.js 파서로 텍스트를 추출합니다. 암호 없는 텍스트 PDF를 사용합니다. 이미지로만 구성된 PDF는 텍스트를 붙여 넣어야 합니다.
- TXT는 UTF-8 형식으로 저장합니다.
- 파일 한도는 6 MB입니다. PDF는 최대 50페이지, 텍스트는 최대 120,000자를 처리합니다. 페이지·문자 한도에 걸린 경우 요약의 `truncated` 상태로 표시합니다.
- `Experience/경력`, `Top Skills/기술`, `Education/학력`, `Projects/프로젝트`, `Industry/산업 분야` 등 실제 문서의 섹션을 구분합니다. 제목이 없는 텍스트도 원문을 보존하여 분석 입력으로 사용합니다.
- 내용을 직접 읽거나 수정한 다음 **관심사 분석**을 실행하면 원문 evidence와 함께 분석 결과를 확인할 수 있습니다.

실제 계정과 업로드한 문서의 관심사를 미리 준비된 Demo 참가자의 태그로 채우지 않습니다. 연동·파싱·AI 분석이 실패하면 실제 오류를 표시합니다.

## 5. 오류 및 저장 방식

설정되지 않은 Client ID·Secret, 거부한 동의, 만료된 세션, API 권한 부족과 사용량 한도는 연결 실패로 표시됩니다. 테스트 사용자 등록·YouTube Data API 활성화·정확한 callback 주소·LinkedIn OIDC Product 승인부터 확인합니다.

OAuth는 서버가 인증 코드를 교환합니다. state는 랜덤·10분 만료·한 번만 사용하도록 저장하며, 시작한 Demo 세션과 callback의 세션이 같아야 합니다. PKCE S256을 함께 사용합니다. Client Secret, access token, refresh token은 프런트엔드 응답과 브라우저 저장소에 전달하지 않습니다. 로컬 서버는 토큰을 세션별로 암호화해 `.data` 아래에 보관합니다. YouTube 토큰은 유효한 refresh token이 있으면 서버가 갱신하고, 취소된 연결은 다시 승인해야 합니다.

가져온 데이터와 분석 결과 역시 로컬 Demo 세션에 속합니다. 여러 Demo 사용자의 개인정보를 다른 브라우저 세션에서 확인하도록 제공하지 않습니다.

## 6. 로컬 연결 코드 점검

```powershell
node backend/demo-data-smoke.mjs
```

OAuth 토큰 유출 방지·한 번만 사용하는 state·PKCE·세션 격리·권한 거부와 토큰 갱신, YouTube 전체 페이지 조회·선택된 계정 재생목록·한도 표시, LinkedIn 원문 섹션 및 실제 PDF byte stream 추출을 fixture로 확인합니다. 실제 Google/LinkedIn 로그인 성공은 `.env` 설정 후 본인이 브라우저에서 권한을 승인해야 확인할 수 있습니다.
