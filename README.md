# CPA Audit Workspace

> CPA 회계감사 사례형 문제를 실제 시험처럼 연습하고,  
> 풀이 기록을 저장·관리할 수 있는 웹 기반 학습 워크스페이스

**Live Demo:** https://cpa-audit-workspace.onrender.com  
**GitHub Repository:** https://github.com/minwookim5433/cpa-audit-workspace

Google 로그인 후 사용할 수 있는 서비스입니다.

CPA 회계감사 **기출문제와 모의고사**를 반복 연습하면서, 손으로 답안을 작성해야 하는 부담, 문제지·답안지를 따로 관리해야 하는 불편, 이전 풀이를 다시 찾기 어려운 점을 해결하기 위해 시작한 프로젝트입니다. 실제 시험처럼 **타이핑**하고, 문제지와 답안지를 **동시에** 보며, **임시저장**·**이어풀기**·**PDF 출력**까지 하나의 흐름으로 연결했습니다.

![Main Workspace](docs/images/main-workspace.png)

문제지 PDF와 답안지를 한 화면에서 보며, 형광펜·밑줄·펜 주석과 타이머·임시저장을 함께 사용할 수 있습니다.

---

## 한눈에 보는 프로젝트

| 단계 | 내용 |
|---|---|
| Problem | 손답안 작성 부담, 문제지·답안지 분리 보관, 이전 풀이 재확인의 어려움 |
| Idea | 시험지를 펼친 채 답안지 형식으로 타이핑하고, 풀이 기록을 저장·재학습할 수 있는 워크스페이스 |
| Development | PDF 열람·주석·답안 작성, Google 로그인, Supabase **임시저장**·이어풀기 |
| Result | [배포 서비스](https://cpa-audit-workspace.onrender.com)에서 풀이·기록 관리·이어풀기·답안 PDF 출력 |

---

## 프로젝트 소개

사례형 답안을 매번 손으로 쓰는 방식은 실제 시험 감각에는 도움이 되지만, 기출·모의고사를 반복할수록 시간과 체력 부담이 커집니다. PDF, 답안, 주석, 진행 상태가 흩어져 있으면 이전 풀이를 이어가기도 어렵습니다.

이를 위해 시험지와 답안지를 나란히 두고, 실제 시험 답안지와 유사한 형식으로 **타이핑**하며 연습할 수 있도록 만들었습니다. 학습 중 **임시저장**으로 중단하고, 다시 접속해 **이어풀기**할 수 있으며, 시험 종료 후 **PDF**로 답안을 남길 수 있습니다.

**답안·주석·진행 상태**는 사용자 계정(Supabase)에 저장되고, **PDF 원본**은 기기 로컬(IndexedDB)에만 둡니다. 다른 기기이거나 PDF 원본이 남아 있지 않으면, 동일한 PDF 파일을 다시 선택해야 할 수 있습니다.

초기에는 AI 답안 첨삭을 검토했으나, 검증되지 않은 채점보다 기록 관리 문제를 먼저 해결하는 편이 실용적이라 Workspace 중심으로 전환했습니다.

---

## 주요 기능

| 구분 | 기능 설명 |
|---|---|
| PDF 문제지 열람 | 기출·모의·연습 PDF 업로드, 확대·축소, 너비 맞춤 |
| 답안 작성 | 시험 답안지 형식 타이핑, 글자 크기·자간, 동그라미 번호, Undo/Redo |
| 문제지 주석 | 형광펜, 밑줄, 펜, 지우개 |
| Google 로그인 | Supabase Auth + Google OAuth |
| 사용자별 저장 | RLS로 답안·주석·진행 상태를 계정별 분리 (PDF 원본 제외) |
| 임시저장·이어풀기 | 임시저장 후 다시 접속해 이어풀기. 다른 기기이거나 PDF 원본이 없으면 동일 PDF 재선택 필요 |
| 답안 PDF 출력 | 시험 종료 후 사용자가 파일 이름을 지정해 PDF 저장 |
| PDF 검색 | 텍스트 레이어 PDF만 검색·결과 이동 (스캔·스크린샷 PDF 불가) |
| 시험 타이머 | 시간 설정, 시작·일시정지·초기화 |
| 다중 PDF 관리 | 여러 PDF 슬롯 등록·전환 |
| 대용량 PDF 대응 | 업로드 용량 안내·제한, 버퍼 최적화, 활성 PDF Lazy Loading |

---

## 서비스 사용 흐름

```
Google 로그인 → PDF 업로드 → 시험지 열람·주석 → 답안 작성
  → 임시저장 또는 시험 종료 → 이어풀기 또는 답안 PDF 출력
```

---

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | HTML, CSS, JavaScript (ES Modules) |
| PDF 처리 | PDF.js (`pdfjs-dist`), html2canvas, jsPDF |
| Authentication | Supabase Auth, Google OAuth |
| Database | Supabase PostgreSQL |
| Browser Storage | IndexedDB, localStorage |
| Backend | Node.js, Express |
| Deployment | Render |
| Version Control | Git, GitHub |
| AI-assisted Development | Cursor, 생성형 AI *(개발 보조)* |

---

## 시스템 및 데이터 구조

```
사용자 → Google OAuth / Supabase Auth → CPA Audit Workspace
  ├─ PDF.js: 렌더링·검색·주석
  ├─ IndexedDB: PDF 원본 (기기 로컬)
  └─ Supabase: 답안 · 주석 · 진행 상태
```

| 데이터 | 저장 위치 | 비고 |
|---|---|---|
| PDF 원본 | IndexedDB (기기 로컬) | 서버·DB에 업로드하지 않음 |
| 답안·주석·진행 상태 | Supabase | `auth.uid()` + RLS |
| 세션 UI 상태 | localStorage | PDF 슬롯 메타, 화면 설정 |
| 인증 | Supabase Auth | Google OAuth |

---

## 개발 과정에서의 핵심 판단

| 판단 또는 문제 | 결정 |
|---|---|
| AI 첨삭 | 현재 기능 아님 → 기록 관리 우선 (향후 검토) |
| 저장 방식 | **임시저장** 버튼으로 사용자가 저장 시점 통제 |
| 계정 간 데이터 | RLS로 `user_id` 행 접근 제한 |
| PDF 원본 | IndexedDB만, Supabase에는 풀이 데이터만 |
| 대용량 PDF | 30/50MB 가드, 버퍼 최적화, 활성 PDF Lazy Loading |
| 기능 범위 | 사용 테스트 후 불필요·불안정 기능 제거 |

---

## 대용량 PDF 지원 범위

| 구분 | 정책 |
|---|---|
| 30MB 이하 | 권장 |
| 30~50MB | 경고 후 사용 가능 |
| 50MB 초과 | 업로드 제한 |
| 300페이지 초과 | 성능 안내 (차단 없음) |
| 모바일 20MB 초과 | 추가 경고 |

기기·PDF 구조에 따라 로딩·검색 속도는 달라질 수 있습니다.

---

## 보안과 사용자 데이터

- Google OAuth + Supabase Auth
- `workspaces` RLS (`auth.uid() = user_id`)
- 브라우저 publishable key만 노출
- 환경변수는 `.env`(로컬)와 Render Environment Variables(배포) 분리

---

## 프로젝트 화면

### Login

![Login](docs/images/login.png)

Google 계정으로 로그인해 개인별 풀이 기록을 사용합니다. Supabase Auth가 세션을 관리합니다.

### Main Workspace

![Main Workspace](docs/images/main-workspace.png)

문제지와 답안지를 동시에 보며 실제 시험 환경처럼 답안을 작성합니다. 형광펜·밑줄·펜 주석, 타이머, **임시저장**을 한 화면에서 사용할 수 있습니다.

### Resume Workspace

![Resume Workspace](docs/images/resume-workspace.png)

저장된 풀이가 있으면 **이어서 풀기**를 선택해 답안·주석·페이지·타이머 상태를 복원합니다. PDF 원본이 없는 기기에서는 같은 PDF를 다시 선택해야 할 수 있습니다.

### PDF Preview

![PDF Preview](docs/images/pdf-preview.png)

시험 종료 후 답안지를 미리보기하고, 사용자가 지정한 이름으로 PDF를 저장합니다.

---

## 로컬 실행

```bash
git clone https://github.com/minwookim5433/cpa-audit-workspace.git
cd cpa-audit-workspace
npm install
npm start
```

`http://localhost:3000` · `.env.example` 참고:

| 변수 | 필수 | 설명 |
|---|---|---|
| `SUPABASE_URL` | 예 | Supabase 프로젝트 URL |
| `SUPABASE_PUBLISHABLE_KEY` | 예 | publishable (anon) key |
| `PORT` | 아니오 | 기본 3000 |

Supabase Google OAuth Redirect URL(로컬·배포) 등록 필요.

---

## 현재 한계 · 향후 계획

**한계** — 스캔 PDF 검색 불가 · 다른 기기 PDF 재선택 · 대용량·모바일 성능 제약 · 상용 수준 통합 테스트·운영 모니터링 미적용.

**향후** — PDF 해시 검증 이어풀기 · 모바일 UI · 대용량 최적화 · 학습 이력·통계 · 평가 기준 확보 시 제한적 AI 피드백 검토.

---

## 프로젝트 회고

- CPA 사례형 학습 과정에서 느낀 **실제 불편**을 해결하기 위해 시작했습니다.
- Cursor와 생성형 AI는 **개발 보조 도구**로 활용했습니다.
- 기능 정의, 설계, 우선순위, 테스트, 오류 수정, 기능 삭제·방향 전환은 **직접** 수행했습니다.
- Google OAuth, Supabase(RLS), IndexedDB, Render 배포까지 연결해 **하나의 웹 서비스**로 완성했습니다.

---

## 라이선스 및 이용 안내

- 개인 학습·포트폴리오 목적 제작
- 합법적으로 이용 가능한 PDF만 업로드
- PDF 원본을 사용자 간 제공·공유하지 않음
