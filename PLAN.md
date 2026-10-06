# draw_flow 개발 계획서

> 수업용 순서도 편집기 + 의사코드 → 순서도 자동 변환 도구

| 항목 | 내용 |
|---|---|
| 프로젝트명 | draw_flow |
| 대상 | 중·고등학생 정보 수업 (교사 1명 + 학생 약 30명/반) |
| 배포 | GitHub Pages (`https://junghwan12.github.io/draw_flow/`) |
| 기술 스택 | React + Vite + TypeScript + React Flow |
| 작성일 | 2026-10-06 |

---

## 1. 목적

1. 학생이 **의사코드를 작성하면 즉시 순서도로 변환**되어, 알고리즘의 흐름을 눈으로 확인한다.
2. draw.io처럼 **직접 도형을 배치·연결하여 순서도를 그릴 수 있는** 편집기를 제공한다.
3. 설치·로그인 없이 **브라우저만으로** 수업에서 바로 사용할 수 있게 한다.

## 2. 기술 선택 근거

| 후보 | 판단 | 이유 |
|---|---|---|
| Streamlit | 제외 | 접속자마다 서버 세션 유지, 입력할 때마다 서버에서 재실행 → 동시 접속에 약함. 드래그 편집기 구현이 어려움 |
| Next.js | 보류 (2단계 이후) | 로그인·제출 등 서버 기능이 필요해질 때 고려 |
| **React + Vite** | **채택** | 모든 처리를 브라우저에서 수행 → 서버 부하 없음, GitHub Pages 무료 배포 가능 |

### 사용 라이브러리

| 용도 | 라이브러리 |
|---|---|
| UI 프레임워크 | React 18, TypeScript |
| 빌드 | Vite |
| 순서도 캔버스/편집기 | `@xyflow/react` (React Flow) |
| 자동 배치 | `elkjs` (대안: `dagre`) |
| 코드 입력창 | CodeMirror 6 (줄 번호, 오류 표시) |
| 이미지 내보내기 | `html-to-image` |
| 테스트 | Vitest |

## 3. 기능 범위

### 3.1 1단계 (MVP) — 서버 없이 동작

**A. 의사코드 → 순서도**
- 왼쪽: 의사코드 입력창 / 오른쪽: 순서도 실시간 미리보기
- 입력 후 약 0.3초 뒤 자동 변환 (debounce)
- 문법 오류 시 해당 줄 강조 + 한국어 안내 메시지
  - 예: `5번째 줄: '만약'에 대응하는 '만약끝'이 없습니다.`
- 의사코드 줄 ↔ 순서도 도형 연결 강조 (한쪽에 마우스를 올리면 다른 쪽도 표시)

**B. 순서도 편집기**
- 도형 팔레트: 시작/끝, 처리, 입력/출력, 조건, 반복 준비, 연결자
- 드래그로 배치, 핸들끼리 연결, 연결선에 `예/아니오` 라벨
- 텍스트 더블클릭 편집, 삭제, 실행 취소/다시 실행
- 확대·축소, 미니맵, 격자 맞춤
- "의사코드에서 가져오기": A에서 만든 순서도를 편집기로 넘겨 수정

**C. 저장/내보내기**
- 브라우저 자동 저장 (localStorage)
- 파일로 저장/불러오기: `.json` (draw_flow 형식)
- 이미지로 내보내기: PNG, SVG
- draw.io 호환 파일 내보내기: `.drawio` (mxGraph XML)

**D. 예제와 도움말**
- 문법 도움말 페이지
- 예제: 두 수 중 큰 수, 1~n 합계, 구구단, 최댓값 찾기, 버블 정렬

### 3.2 2단계 (선택) — 서버 기능

- Supabase 연동: 학생 로그인(학교 Google 계정), 작업 저장
- 과제 제출 및 교사용 대시보드 (반별 제출 현황, 미리보기)
- 필요 시 Next.js로 이전

### 3.3 3단계 (선택) — 확장

- 실시간 공동 편집 (Yjs)
- 순서도 → 의사코드 역변환
- 순서도 단계별 실행 시뮬레이션 (변수 값 추적)
- 의사코드 → Python 코드 변환

## 4. 의사코드 문법 (초안)

들여쓰기(공백 4칸 또는 탭)로 블록을 구분하며, 블록 끝 키워드도 함께 사용한다.

| 구문 | 문법 | 순서도 도형 |
|---|---|---|
| 시작/끝 | `시작`, `끝` | 둥근 사각형 (단말) |
| 입력 | `입력 변수[, 변수…]` | 평행사변형 |
| 출력 | `출력 식[, 식…]` | 평행사변형 |
| 대입/처리 | `변수 ← 식` (`<-`, `=` 허용) | 사각형 |
| 조건 | `만약 조건 이면` … `아니면 만약 조건 이면` … `아니면` … `만약끝` | 마름모 |
| 조건 반복 | `반복 조건 동안` … `반복끝` | 마름모 + 되돌아가는 선 |
| 횟수 반복 | `반복 i = 1 부터 n 까지 [k 씩]` … `반복끝` | 육각형(반복 준비) 또는 초기화+마름모 |
| 주석 | `# 설명` | 표시 안 함 |

예시:

```
시작
입력 n
합 ← 0
반복 i = 1 부터 n 까지
    합 ← 합 + i
반복끝
만약 합 > 100 이면
    출력 "크다"
아니면
    출력 "작다"
만약끝
출력 합
끝
```

> 교과서·수업에서 쓰는 표기법이 따로 있으면 키워드 표(`keywords.ts`)만 바꿔서 맞출 수 있도록 설계한다.

## 5. 구조 설계

### 5.1 변환 파이프라인

```
의사코드 텍스트
   │  ① 토큰화/줄 분석 (lexer)      — 줄 번호, 들여쓰기, 키워드 판별
   ▼
줄 단위 토큰 목록
   │  ② 구문 분석 (parser)          — 블록 짝 맞추기, 오류 수집
   ▼
AST (구문 트리)
   │  ③ 그래프 생성 (graph builder) — 도형(node)·연결선(edge) 생성
   ▼
순서도 그래프 { nodes, edges }
   │  ④ 자동 배치 (elkjs)            — 좌표 계산
   ▼
React Flow 렌더링
```

각 단계는 React와 분리된 순수 TypeScript 함수로 작성하여 단위 테스트한다.

### 5.2 핵심 데이터 형식

```ts
type NodeKind = 'terminal' | 'process' | 'io' | 'decision' | 'loop' | 'connector';

interface FlowNode {
  id: string;
  kind: NodeKind;
  label: string;
  sourceLine?: number;          // 의사코드 줄 번호 (연결 강조용)
  position: { x: number; y: number };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: '예' | '아니오';
}

interface FlowDocument {
  version: 1;
  title: string;
  pseudocode?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}
```

### 5.3 디렉터리 구조

```
draw_flow/
├─ .github/workflows/deploy.yml   # GitHub Pages 자동 배포
├─ public/
├─ src/
│  ├─ main.tsx
│  ├─ App.tsx                     # 탭/라우팅 (HashRouter)
│  ├─ pages/
│  │  ├─ ConverterPage.tsx        # 의사코드 → 순서도
│  │  ├─ EditorPage.tsx           # 자유 편집기
│  │  └─ HelpPage.tsx             # 문법 도움말·예제
│  ├─ core/                       # React와 무관한 순수 로직
│  │  ├─ keywords.ts
│  │  ├─ lexer.ts
│  │  ├─ parser.ts
│  │  ├─ graphBuilder.ts
│  │  ├─ layout.ts
│  │  └─ errors.ts
│  ├─ components/
│  │  ├─ nodes/                   # 도형별 커스텀 노드
│  │  ├─ Palette.tsx
│  │  ├─ CodeEditor.tsx
│  │  └─ Toolbar.tsx
│  ├─ io/
│  │  ├─ storage.ts               # localStorage
│  │  ├─ jsonFile.ts
│  │  ├─ imageExport.ts
│  │  └─ drawioExport.ts
│  └─ examples/
├─ tests/
├─ index.html
├─ vite.config.ts                 # base: '/draw_flow/'
├─ package.json
└─ PLAN.md
```

## 6. 배포 계획 (GitHub Pages)

1. `vite.config.ts`에 `base: '/draw_flow/'` 설정
2. `.github/workflows/deploy.yml`: `main` 브랜치에 push 시 `npm ci → npm run build → Pages 배포`
3. 저장소 **Settings → Pages → Source: GitHub Actions** 선택 (최초 1회, 수동)
4. 라우팅은 `HashRouter` 사용 (새로고침 시 404 방지)

**확인 사항**
- 무료 계정은 공개 저장소에서만 Pages 사용 가능 (GitHub Education으로 Pro 무료 신청 가능)
- 학교 네트워크에서 `github.io` 접속 가능 여부 사전 확인

## 7. 일정 (안)

| 주차 | 작업 | 산출물 |
|---|---|---|
| 1주 | 프로젝트 생성, 배포 파이프라인, 기본 레이아웃 | 빈 화면이 GitHub Pages에 배포됨 |
| 2주 | lexer/parser + 단위 테스트 (순차·조건) | 문법 오류 메시지 동작 |
| 3주 | 반복문 처리, graphBuilder, elkjs 자동 배치 | 의사코드 → 순서도 변환 완성 |
| 4주 | 편집기 (팔레트, 연결, 편집, 실행 취소) | 자유 편집 가능 |
| 5주 | 저장/불러오기, PNG·SVG·.drawio 내보내기, 예제·도움말 | MVP 완성 |
| 6주 | 수업 시범 적용, 피드백 반영 | v1.0 |

## 8. 테스트 계획

- **단위 테스트 (Vitest)**: 파서 — 정상 예제 전부, 오류 케이스(짝 없는 블록, 잘못된 들여쓰기, 알 수 없는 키워드)
- **스냅샷 테스트**: 예제 의사코드 → 그래프(nodes/edges) 결과 고정
- **수동 테스트**: 학교 PC(Chrome/Edge/Whale), 태블릿, 프로젝터 화면 크기
- CI: PR마다 `lint + typecheck + test` 실행

## 9. 위험 요소와 대응

| 위험 | 대응 |
|---|---|
| 중첩된 조건/반복의 순서도 배치가 지저분함 | elkjs 계층 배치 + 반복 되돌림 선 별도 경로 지정, 예제로 지속 점검 |
| 학생 의사코드 표기가 제각각 | 키워드 동의어 허용(`<-`, `=`, `←`), 친절한 오류 메시지, 문법 도움말 상시 노출 |
| 브라우저 데이터 삭제로 작업 손실 | 파일 저장 버튼 강조, 자동 저장 안내 |
| 학교망에서 github.io 차단 | 사전 확인, 필요 시 Netlify/Vercel 또는 학교 서버에 동일 빌드 배포 |

## 10. 결정이 필요한 사항

- [ ] 수업에서 사용하는 의사코드 표기법 (교과서 기준이 있는지)
- [ ] 횟수 반복의 순서도 표현: 육각형(반복 준비 기호) vs 초기화 + 조건 마름모
- [ ] 저장소 공개 여부 (Pages 무료 사용 조건)
- [ ] 2단계(로그인·과제 제출) 진행 여부와 시기
