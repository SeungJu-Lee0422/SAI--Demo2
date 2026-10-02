# 사이 모바일 앱

iOS와 Android용 Expo / React Native 앱입니다. Demo2의 친구 / 그룹 / 마이 UI에서 계정, 취향 비교, 공유 프로필과 초대 모임을 지원합니다. 모임 참가 인원에 상한은 없으며 한 번의 CP-SAT 편성은 3~30명을 선택합니다.

실제 프로필·친구·모임은 백엔드 SQLite 또는 배포된 D1에 저장합니다. 샘플 체험은 별도이며 계정 데이터와 섞이지 않습니다. 기본 분석은 동일 태그 정규화와 분야 분류이며, 로컬 서버에서는 Qwen3 의미 비교와 실제 CP-SAT 편성을 실행할 수 있습니다. 개인 AI와 친구의 AI 의미 비교는 웹 브라우저에서 실행합니다. LLM은 백엔드에서 API 키를 설정한 경우에만 실행됩니다.

## 휴대폰 실행

1. 프로젝트 루트에서 `npm install`.
2. `npm run solver:setup` 후 `HOST=0.0.0.0 npm run server`로 LAN에서 접근 가능한 백엔드를 실행합니다. 기본 localhost 서버는 휴대폰에서 접근할 수 없습니다.
3. 같은 Wi-Fi에 연결한 휴대폰이 접근할 수 있는 컴퓨터의 LAN 주소를 `.env`의 `EXPO_PUBLIC_API_URL=http://컴퓨터주소:8788`로 설정.
4. `npm start` 후 Expo Go에서 QR 스캔. SDK와 Expo Go 버전이 맞지 않으면 `npx expo run:ios` 또는 `npx expo run:android`로 개발 빌드 생성.

`sai://?room=모임ID` 또는 `sai://?profile=프로필ID`로 초대를 처리합니다. Expo Go에서는 모임 코드·프로필 코드를 붙여 넣어 참여할 수 있습니다.

## 설치 파일

`eas.json`에 Android APK 및 iOS 개발 빌드 설정이 있습니다. EAS 계정과 서명 설정 후 `npx eas-cli build --platform android --profile preview` 또는 iOS development 빌드를 실행하세요. 이 프로젝트 자체는 APK/IPA가 아닙니다.

## 데이터와 보안

기기 세션 토큰은 native SecureStore에 저장합니다. 소개와 관심사의 공유 여부는 사용자가 선택합니다. 전화번호·이메일·식별번호를 입력에서 차단하는 기본 정제는 완전한 민감정보 탐지가 아닙니다. 기기 변경·앱 삭제 이후 계정 복구는 다음 단계입니다.
