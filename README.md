# CPA Audit Workspace

회계감사 기출문제를 실제 답안지 형식으로 타이핑하고 저장하는 웹 기반 연습 도구입니다.

**배포:** https://cpa-audit-workspace.onrender.com

<!-- 스크린샷 (추후 docs/images/ 에 추가)
![메인 작업 화면](docs/images/main-workspace.png)
![주석 도구](docs/images/annotation-tools.png)
![답안 미리보기](docs/images/answer-preview.png)
![PDF 저장 결과](docs/images/exported-pdf.png)
-->

## 개발 배경

회계감사 기출문제를 손으로 반복해서 풀기에는 부담이 크고, PDF·답안지·풀이 기록을 별도로 관리하는 것이 불편했습니다. 이를 해결하기 위해 시험지를 보면서 실제 답안지 형식으로 타이핑하고 저장·출력할 수 있는 웹 기반 연습 도구를 제작했습니다.

## 주요 기능

- 여러 시험지 PDF 업로드 및 선택
- 시험지 한 페이지씩 열람 (확대·축소, 너비 맞춤)
- 형광펜·밑줄·펜·지우개 주석
- 실제 답안지 형식의 타이핑 (페이지 이동, 동그라미 번호, 글자 크기·자간 조절)
- 자동 저장 및 새로고침 복원 (IndexedDB, localStorage)
- 타이머와 시험 종료
- 답안 미리보기
- 답안 PDF 저장 및 인쇄

## 사용 방법

1. 상단에서 **시험지 PDF 선택** (또는 ⚙ 시험지 관리에서 새 PDF 추가)
2. 왼쪽에서 시험지를 보며 **오른쪽 답안지에 작성**
3. 필요 시 주석 도구로 시험지에 표시
4. **시험 종료** 후 결과 화면에서 **PDF 저장**

## 기술 스택

| 구분 | 기술 |
|------|------|
| 런타임 | Node.js (>= 18) |
| 서버 | Express |
| 환경 설정 | dotenv |
| 프론트엔드 | HTML, CSS, Vanilla JavaScript (ES Modules) |
| PDF 열람 | pdfjs-dist (PDF.js) |
| PDF 내보내기 | html2canvas, jsPDF |
| 클라이언트 저장 | IndexedDB, localStorage |
| 테스트 | Puppeteer |

## 개발 과정과 방향 전환

처음에는 AI 기반 문제 분석과 답안 첨삭 기능을 기획했지만, 실제 테스트 과정에서 답안 정확성을 안정적으로 평가하기 어렵고 문제 풀이 집중을 방해할 수 있다는 점을 확인했습니다. 이에 AI 기능을 줄이고, PDF 열람·답안 작성·자동 저장·주석·출력이라는 핵심 사용자 경험에 집중해 MVP를 재설계했습니다.

## 현재 한계

- 브라우저 로컬 저장(IndexedDB) 기반이라 기기·브라우저 간 데이터 동기화는 지원하지 않습니다.
- 로그인·계정 기능이 없어 여러 사용자가 같은 기기를 공유하면 데이터가 섞일 수 있습니다.
- 시험지 마우스 휠 확대·드래그 이동(Pan)은 MVP 범위에서 제외되었습니다.
- Problem Library, Review Notebook, AI 피드백 등은 UI에서 숨겨져 있으며 MVP 핵심 흐름과 분리되어 있습니다.

## 향후 계획

- 실제 응시자 사용자 테스트 피드백 반영
- 답안·시험지 데이터 백업/복원 UX 개선
- 포트폴리오용 스크린샷 및 사용 가이드 보강
- (장기) 계정·클라우드 동기화 검토

## 로컬 실행 방법

```bash
git clone https://github.com/minwookim5433/cpa-audit-workspace.git
cd cpa-audit-workspace
npm install
npm start
```

브라우저에서 http://localhost:3000 을 엽니다.

MVP 클라이언트는 OpenAI API 키 없이 동작합니다. `OPENAI_API_KEY`는 서버의 레거시 AI API용이며 답안 연습 기능에는 필요하지 않습니다.
