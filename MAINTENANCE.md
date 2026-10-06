# draw_flow 유지보수 안내

> 수업용 순서도 도구 draw_flow를 관리하는 사람을 위한 체크리스트입니다.
> 서버·데이터베이스가 없는 정적 사이트(GitHub Pages)라서 평소에 할 일은 많지 않습니다.

- 사이트: https://junghwan12.github.io/draw_flow/
- 저장소: https://github.com/JUNGHWAN12/draw_flow
- 개발 계획·기능 목록: [PLAN.md](PLAN.md) · 사용법과 구조: [README.md](README.md)

---

## 1. 절대 바꾸면 안 되는 것

| 항목 | 이유 |
|---|---|
| 저장소 이름 `draw_flow` | 사이트 주소에 들어 있습니다. 바꾸면 그동안 나눠 준 **문제 링크와 즐겨찾기가 모두 열리지 않습니다.** 꼭 바꿔야 하면 `vite.config.ts`의 `base`도 함께 바꾸고, 학생들에게 새 링크를 다시 나눠 주세요. |
| Settings → Pages → Source: **GitHub Actions** | "Deploy from a branch"로 바뀌면 빌드 전 파일이 올라가 화면이 하얗게 나오고 `main.tsx 404` 오류가 납니다. |
| Settings → Environments → `github-pages` → Deployment branches에 **`main`** 포함 | 빠지면 배포가 "Branch main is not allowed to deploy" 오류로 막힙니다. |
| Settings → General → Default branch: **`main`** | 자동 배포·Dependabot·이슈 양식이 모두 `main`을 기준으로 동작합니다. |
| 저장 파일·문제 링크 형식 | `.json` 파일에는 `version: 1`, 문제 링크에는 `v: 1`이 들어 있습니다. 형식을 바꿀 때는 **새 번호를 붙이고 예전 번호도 계속 읽도록** 해야 예전 파일·링크가 열립니다. (`src/io/files.ts`, `src/io/share.ts`) |

## 2. 학기 시작 전 (30분)

- [ ] 학교 PC(Chrome · Edge · 웨일)에서 사이트가 열리는지 확인
- [ ] 학교망에서 `github.io`가 차단되지 않았는지 확인
- [ ] 태블릿에서 도형 추가 · 연결 · 글자 고치기 · 삭제가 되는지 확인
- [ ] 문제 링크를 하나 만들어 학생 기기에서 열리고 채점되는지 확인 (아이패드는 iOS 16.4 이상 필요)
- [ ] 인쇄 / PDF가 A4 한 장으로 나오는지 확인
- [ ] 학생에게 안내: 작업은 **그 기기의 브라우저에만** 저장됩니다. 재부팅하면 초기화되는 학교 PC에서는 `저장 (.json)`이나 `인쇄 / PDF`로 제출하게 하세요.

## 3. 매달 — Dependabot PR 처리 (10분)

GitHub가 매달 라이브러리 업데이트를 확인해 **PR(풀 리퀘스트)** 을 엽니다. 저장소의 **Pull requests** 탭에서 확인합니다.

1. PR 아래쪽의 검사(CI) 결과를 봅니다.
   - ✅ 초록색: 타입 검사 · 테스트(150여 개) · 빌드가 모두 통과 → **Merge pull request** → 몇 분 뒤 사이트에 자동 반영
   - ❌ 빨간색: Merge하지 말고 그대로 둡니다. 다음 달 업데이트에서 풀리는 경우가 많습니다. 계속 빨간색이면 개발을 아는 사람에게 부탁하세요.
2. Merge 후 사이트를 열어 예제 하나를 변환·실행해 봅니다.

> 큰 버전 변경(예: React 19 → 20)은 자동 PR을 만들지 않도록 설정되어 있습니다(`.github/dependabot.yml`). 1년에 한 번쯤 아래 4번에서 직접 확인합니다.

## 4. 1년에 한 번 — 큰 업데이트 점검

개발 환경(Node.js 22 이상)이 있는 컴퓨터에서:

```bash
npm ci
npm outdated          # 오래된 라이브러리 목록
npm audit             # 알려진 보안 문제 (서버가 없어 위험도는 낮음)
npm install <이름>@latest   # 하나씩 올리기
npm run typecheck && npm test && npm run build
npm run dev           # 화면 직접 확인: 변환 · 편집 · 단계별 실행 · 문제 · 인쇄
```

특히 주의할 라이브러리: `@xyflow/react`(순서도 화면), `html-to-image`(PNG·SVG·인쇄 그림), `vite`(빌드).

## 5. 문제가 생겼을 때

| 증상 | 확인할 곳 |
|---|---|
| 배포 실패 메일이 옴 | 저장소 **Actions** 탭 → 빨간 실행 → 오류 메시지. 대부분 위 1번 설정 문제이거나 GitHub의 일시적 오류입니다. 일시적이면 **Re-run all jobs**. |
| 고쳤는데 사이트가 그대로 | Ctrl+Shift+R(강력 새로고침) 또는 최대 10분 기다리기 (GitHub Pages 캐시) |
| 화면이 하얗고 `main.tsx 404` | 1번 표의 Pages Source 설정 확인 |
| Actions에 경고(Node 버전, Ubuntu 버전 등) | 대부분 안내일 뿐입니다. Dependabot이 `github-actions` 업데이트 PR을 열어 주면 Merge하세요. |
| 학생이 버그를 알림 | 저장소 **Issues → New issue → 버그 제보** 양식으로 받기. 의사코드(`.py`)나 순서도(`.json`) 파일을 받으면 그대로 재현할 수 있습니다. |

## 6. 알고 쓰는 한계 (버그 아님)

- **문제 링크 안에 정답이 들어 있습니다.** 서버 없이 공유하기 위해서입니다. 연습용으로 쓰고, 시험용으로는 쓰지 않습니다.
- **단계별 실행은 실제 파이썬이 아닙니다.** 순서도 계산용 작은 해석기라서 딕셔너리, 클래스, 매개변수 기본값, `global` 등은 지원하지 않습니다. `입력: n` 도형은 숫자처럼 보이는 값을 숫자로 읽습니다.
- **작업은 기기마다 따로 저장**되고, 다른 기기와 공유되지 않습니다. 브라우저 기록을 지우면 사라집니다.
- 순서도 도형은 수업 약속대로 **터미널 · 처리 · 판단 · 화살표 4가지만** 사용합니다. 다른 도형을 추가하지 마세요.

## 7. 개발을 이어받는 사람에게

- 구조: `src/core`(분석·배치·실행·채점, 화면과 무관한 순수 로직) / `src/components` / `src/pages` / `src/io`
- 모든 변경은 작업 브랜치에서 하고, `npm run typecheck && npm test && npm run build`가 통과한 뒤 `main`에 합칩니다. `main`에 올라가면 테스트 후 자동 배포됩니다.
- 새 문법을 지원할 때는 `parser.ts` → `flowchart.ts`(그리기) → `structure.ts`(순서도 → 코드) → `interp/runner.ts`(실행) → `grade.ts`(채점) 순서로 모두 맞춰야 합니다. `tests/`의 왕복 변환 테스트가 빠진 곳을 알려 줍니다.
