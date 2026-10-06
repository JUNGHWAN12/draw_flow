# draw_flow

수업용 순서도 도구 — **파이썬식 의사코드를 입력하면 바로 순서도로** 그려 주고, draw.io처럼 직접 순서도를 그릴 수도 있습니다.

- 배포 주소: https://junghwan12.github.io/draw_flow/
- 개발 계획: [PLAN.md](PLAN.md)

## 기능

| 화면 | 내용 |
|---|---|
| 의사코드 → 순서도 | 파이썬 문법으로 쓰면 0.3초 뒤 순서도로 변환. 오류는 줄 번호와 한국어 메시지로 안내. 코드 줄 ↔ 도형 강조 |
| 순서도 편집기 | 도형 추가(클릭/끌어다 놓기), 연결, 글자 편집, 예/아니오 라벨, 실행 취소, 자동 저장, 간단 점검 |
| 도움말 · 예제 | 문법 표와 예제 8개 |

- 도형은 **터미널 · 처리 · 판단 · 화살표** 4가지만 사용합니다. 입력/출력도 처리 도형에 `입력: n`, `출력: 합`으로 씁니다.
- 내보내기: PNG, SVG, `.drawio`(draw.io에서 열기), `.json`(다시 불러오기), `.py`(의사코드)
- 서버가 없습니다. 모든 처리는 브라우저에서 이루어지고, 작업 내용은 브라우저에 자동 저장됩니다.

## 지원하는 의사코드 (파이썬 부분집합)

```python
n = int(input("n을 입력하세요: "))
합 = 0
for i in range(1, n + 1):
    합 += i
if 합 > 100:
    print("크다")
elif 합 == 100:
    print("같다")
else:
    print("작다")
```

`input`, `print`, 대입(`=`, `+=` …), `if/elif/else`, `while`, `for … in range(…)`, `for x in 목록`, `break`, `continue`, `pass`, 주석.
`def`, `class`, `try`, `import` 등은 아직 지원하지 않습니다.

## 개발

```bash
npm install
npm run dev        # 개발 서버 (http://localhost:5173/draw_flow/)
npm test           # 단위 테스트 (파서, 순서도 배치, 예제의 파이썬 문법 검사)
npm run typecheck
npm run build      # dist/ 에 정적 파일 생성
```

### 구조

```
src/core/      의사코드 분석과 순서도 생성 (React와 무관한 순수 로직)
  parser.ts      파이썬식 의사코드 → 구문 트리(AST), 한국어 오류 메시지
  flowchart.ts   AST → 도형·화살표·좌표 (구조적 배치)
  labels.ts      도형 글자 (range 조건, ← 표기 등)
src/components/ 도형, 화살표, 코드 입력창
src/pages/      의사코드 변환 / 편집기 / 도움말 화면
src/io/         저장, 파일, PNG·SVG·draw.io 내보내기
```

## 배포

`main` 브랜치에 push하면 GitHub Actions가 테스트 후 GitHub Pages에 배포합니다.
처음 한 번은 저장소 **Settings → Pages → Source**를 **GitHub Actions**로 바꿔야 합니다.
