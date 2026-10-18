# 2SPEAKER

**One AI. Two ways to speak.**

- **Speaks to you** — 실시간 통역·회화 연습·표현 설명
- **Speaks for you** — 사용자의 의도를 상대방 언어로 전달하는 대화 통역

## 현재 구현 범위

- 반응형 PC·모바일 UI
- 메인, 길찾기 화면 뼈대
- 음성·문자 통역 화면
- 로그인·회원가입, 앱 언어
- 도움말, 서비스 정보

별도 빌드 없이 정적 웹사이트로 실행할 수 있습니다.

## 계정별 대화 보관

2페이지 및 거리뷰의 AI 대화·통역 기록은 Supabase Auth 계정에 연결해 보관합니다.
`supabase/migrations/20261018_conversation_history.sql`은 대화 테이블, 본인 계정만 접근하는 RLS 정책,
삭제 기록을 다시 살리지 않는 저장 함수를 설치합니다. 브라우저에는 publishable key만 사용합니다.

- 기존 더보기 → 로그인 / 회원가입에서 이메일 계정을 만들고 인증한 뒤 로그인합니다.
- 로그인 전 기기에 남은 대화는 처음 로그인한 계정에 이관합니다. 계정별 로컬 사본은 분리합니다.
- 사이트 데이터를 삭제해 로그인 정보가 사라져도 같은 계정으로 로그인하면 서버 기록을 불러옵니다.
- 인터넷 연결이 끊긴 동안의 변경은 기기에 대기시켰다가 연결·로그인 복구 시 전송합니다.
  서버 저장이 끝나기 전에 사이트 데이터를 삭제한 미전송 기록은 복원할 수 없습니다.
- 휴지통으로 삭제한 대화 내용은 서버에서도 비우고 삭제 표식을 남겨 이전 기기의 사본으로 되살아나지 않게 합니다.
- 기존 브라우저에서 이미 지웠고 서버에 업로드한 적 없는 대화를 되살리는 기능은 아닙니다.

Supabase 이메일 인증은 유지합니다. 인증 메일의 Site URL은 실제 앱 주소여야 하며,
운영 계정의 메일 발송은 Supabase의 SMTP 설정과 발송 제한을 따릅니다.

## AI 및 번역 서버 설정

Vercel 서버리스 API는 `api/`에서 실행됩니다. 일반 한국어·영어 통역은 의도 분류 뒤 Google Cloud Translation API를 사용하며 AI 모델을 호출하지 않습니다. 표현 설명과 회화 연습만 `AI_PROVIDER`가 지정한 AI 공급자로 전달합니다. 기본값은 `vertex`이며, Vertex 요청 실패 시 다른 유료 공급자로 자동 전환하지 않습니다.

Google Cloud 연결은 장기 서비스 계정 JSON 키가 아닌 Vercel OIDC + Google Workload Identity Federation을 사용합니다. Vercel Function 요청의 `x-vercel-oidc-token`을 Google STS에서 교환하고, 제한된 서비스 계정을 가장해 단기 액세스 토큰을 발급받습니다. 토큰 원문은 저장소나 브라우저로 보내지 않습니다.

초기 클라우드 설정은 다음과 같습니다.

1. Vercel 프로젝트 설정에서 OIDC를 활성화합니다. Google Cloud의 Workload Identity Federation에서 Pool을 만들고 OIDC Provider의 Team issuer URL을 `https://oidc.vercel.com/2-speaker`로, 허용 Audience를 `https://vercel.com/2-speaker`로 지정합니다.
2. Provider attribute mapping은 `google.subject=assertion.sub`로 설정합니다.
3. `speaker-vertex-runtime@speaker-510912.iam.gserviceaccount.com` 서비스 계정에 `roles/iam.workloadIdentityUser` 권한을 부여하고, 구성원을 `principal://iam.googleapis.com/projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL_ID/subject/owner:2-speaker:project:2speaker:environment:production`으로 제한합니다. `PROJECT_NUMBER`, `POOL_ID`는 실제 값으로 바꿉니다. 이 서비스 계정에는 Vertex AI 및 Cloud Translation에 필요한 역할만 부여합니다.
4. Vertex AI API, Cloud Translation API, Security Token Service API, IAM Service Account Credentials API가 활성화되어 있는지 확인합니다.
5. `.env.example`의 WIF 변수와 모델 ID를 Vercel의 서버 환경 변수에 추가합니다. 이들은 서비스 계정 개인 키가 아니며, Vercel UI의 OIDC 토큰 헤더를 별도 환경 변수로 복사하지 않습니다.

현재 Gemini Flash 모델 ID는 `gemini-3.8-flash`입니다. 기존 Vercel 값 `gemini-3-flash-preview`도 서버에서 최신 Flash ID로 호환 처리합니다. 추후 GPT Luna로 바꾸기로 결정하면 서버에서 `AI_PROVIDER=openai`와 `OPENAI_API_KEY`를 직접 설정하고 재배포합니다. GPT adapter는 같은 의도와 대화 입력을 사용하며, 키를 넣거나 provider를 바꾸기 전에는 전혀 호출되지 않습니다. 통역은 계속 Google Translation API를 사용합니다.

길찾기 화면은 현재 입력·화면 틀만 남아 있으며 경로 계산이나 지도 안내를 제공하지 않습니다. 관련 지도·교통 API 호출도 제거했습니다.
