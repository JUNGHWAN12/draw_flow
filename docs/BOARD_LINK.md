# 수업 게시판(class_board) 연계 링크 형식

draw_flow와 수업 게시판(https://github.com/JUNGHWAN12/class_board)이 서버 없이 내용을 주고받는 약속입니다.
두 사이트가 같은 형식을 써야 하므로, 바꿀 때는 **새 버전 번호(`v: 2`)를 붙이고 예전 번호도 계속 읽어야** 합니다.

코드: [`src/io/share.ts`](../src/io/share.ts) (형식·검사), [`src/io/board.ts`](../src/io/board.ts) (주소)

## 1. 주소에 담는 방법

- 내용(JSON)을 UTF-8로 바꾸고 `deflate-raw`로 압축한 뒤 base64url(`+`→`-`, `/`→`_`, `=` 제거)로 바꾸고 앞에 `z`를 붙입니다.
  압축을 못 하는 브라우저는 압축 없이 `j`를 붙입니다. (문제 링크와 같은 방식)
- 풀었을 때 **50,000바이트**를 넘으면 받지 않습니다.
- 받는 쪽은 아래 형식인지 검사하고, **약속에 없는 필드는 버립니다.** 다른 사이트에서 온 내용이므로 그대로 믿지 않습니다.

## 2. 주소

| 방향 | 주소 |
|---|---|
| 게시판 → draw_flow (의사코드) | `https://junghwan12.github.io/draw_flow/#/convert?src=<내용>&board=<게시판 아이디>` |
| 게시판 → draw_flow (순서도) | `https://junghwan12.github.io/draw_flow/#/editor?src=<내용>&board=<게시판 아이디>` |
| draw_flow → 게시판 | `<게시판 주소>/share#d=<내용>&board=<게시판 아이디>` (`board`는 알 때만) |

- 내용은 모두 `#` 뒤에 있어 서버로 전송되지 않습니다.
- 게시판 아이디는 `A-Z a-z 0-9 _ -` 1~64자만 허용합니다.
- 게시판 주소는 draw_flow를 빌드할 때 `VITE_BOARD_URL`로 넣습니다. 없으면 연계 버튼이 보이지 않고 지금처럼 동작합니다.
- 받은 내용은 **자동으로 저장·게시하지 않습니다.** draw_flow는 지금 작업을 덮어쓰기 전에 묻고, 게시판은 글쓰기 창에 채워 학생이 확인 후 올립니다.

## 3. 내용 형식 (`v: 1`)

공통 필드: `v: 1`, `app: "draw_flow" | "class_board"`(만든 사이트), `title`(100자까지), `kind`

### `kind: "pseudocode"` — 의사코드
```json
{ "v": 1, "app": "class_board", "kind": "pseudocode", "title": "반복문 연습", "code": "for i in range(3):\n    print(i)\n" }
```

### `kind: "flow"` — 직접 그린 순서도
`doc`은 draw_flow의 `.json` 저장 파일과 같은 모양입니다 (`app: "draw_flow"`, `version: 1`, `nodes`, `edges`, 선택 `pseudocode`).
도형 종류는 `terminal | process | decision`, 연결 지점은 `t | r | b | l`, 화살표 라벨은 `예 | 아니오`만 허용합니다. 도형·화살표는 각각 500개까지.

### `kind: "submission"` — 문제 풀이 제출
```json
{
  "v": 1, "app": "draw_flow", "kind": "submission", "title": "과제 1",
  "problem": { "id": "1x2y3z", "title": "1부터 n까지 합", "mode": "code2flow" },
  "doc": { "...": "학생이 그린 순서도 (code2flow)" },
  "code": "학생이 쓴 의사코드 (flow2code)",
  "grade": { "verdict": "correct", "items": [{ "ok": true, "text": "짜임새가 같습니다" }] }
}
```
- `problem.id`는 draw_flow의 `problemId(문제 링크의 d 값)`입니다. 게시판은 이 값으로 공지의 문제와 제출 글을 묶습니다.
- `code`와 `doc` 중 하나 이상이 있어야 합니다.
- **정답은 넣지 않습니다.** 채점(`grade`)은 학생 브라우저에서 계산한 **참고용** 결과입니다.
