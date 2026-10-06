import { EXAMPLES } from '../examples';

interface Props {
  onOpenExample: (code: string) => void;
}

const SYNTAX: [string, string, string][] = [
  ['입력', 'n = int(input("수: "))', '처리 — 입력: n'],
  ['출력', 'print(합)', '처리 — 출력: 합'],
  ['대입·계산', '합 = 합 + i   /   합 += i', '처리 — 합 = 합 + i'],
  ['조건', 'if 조건:  /  elif 조건:  /  else:', '판단 (예/아니오)'],
  ['조건 반복', 'while 조건:', '판단 + 되돌아가는 화살표'],
  ['횟수 반복', 'for i in range(1, n + 1):', '처리(i = 1) → 판단(i <= n) → … → 처리(i = i + 1)'],
  ['목록 반복', 'for x in 점수:', '처리(k = 0) → 판단(k < len(점수)) → 처리(x = 점수[k]) …'],
  ['반복 제어', 'break  /  continue', '화살표만 (반복 밖으로 / 다음 회차로)'],
  ['빈 블록', 'pass', '표시 안 함'],
  ['주석', '# 설명', '표시 안 함'],
];

export function HelpPage({ onOpenExample }: Props) {
  return (
    <div className="help">
      <section>
        <h2>순서도 도형은 4가지만 사용합니다</h2>
        <div className="shape-legend">
          <div>
            <span className="palette-shape palette-terminal" />
            <b>터미널</b>
            <small>시작, 끝</small>
          </div>
          <div>
            <span className="palette-shape palette-process" />
            <b>처리</b>
            <small>계산, 대입, 입력, 출력</small>
          </div>
          <div>
            <span className="palette-shape palette-decision" />
            <b>판단</b>
            <small>조건 (예/아니오)</small>
          </div>
          <div>
            <span className="palette-arrow">→</span>
            <b>화살표</b>
            <small>흐름의 방향</small>
          </div>
        </div>
      </section>

      <section>
        <h2>의사코드 문법 (파이썬)</h2>
        <ul>
          <li>
            블록은 <b>콜론(:)</b>으로 시작하고, 다음 줄부터 <b>공백 4칸 들여쓰기</b>합니다. (입력창에서 Tab 키를
            누르면 4칸이 들어가고, 콜론 뒤에서 Enter를 누르면 자동으로 들여써집니다.)
          </li>
          <li>
            <code>시작</code>, <code>끝</code>은 자동으로 붙으므로 쓰지 않아도 됩니다.
          </li>
          <li>변수 이름과 문자열에 한글을 쓸 수 있습니다.</li>
          <li>
            <code>def</code>, <code>class</code>, <code>try</code>, <code>import</code> 등은 아직 지원하지 않습니다.
          </li>
        </ul>
        <table>
          <thead>
            <tr>
              <th>구문</th>
              <th>쓰는 법</th>
              <th>순서도</th>
            </tr>
          </thead>
          <tbody>
            {SYNTAX.map(([a, b, c]) => (
              <tr key={a}>
                <td>{a}</td>
                <td>
                  <code>{b}</code>
                </td>
                <td>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>단계별 실행 (추적 표)</h2>
        <ul>
          <li>
            순서도 위의 <b>▶ 단계별 실행</b>을 누르면 시작부터 한 단계씩 실행합니다. 지금 실행 중인 도형과 코드 줄이
            노란색으로 표시됩니다.
          </li>
          <li>
            <b>추적 표</b>에는 단계마다 값이 바뀐 변수가 기록되고, <b>출력</b> 칸에는 print 결과가 나옵니다. 표의 줄을
            누르면 그 단계로 이동합니다.
          </li>
          <li>
            <code>input()</code>에 들어갈 값은 <b>입력값</b> 칸에 한 줄에 하나씩 적습니다. 숫자처럼 보이면 숫자로
            읽습니다.
          </li>
          <li>편집기에서 직접 그린 순서도도 실행할 수 있습니다. 도형 글자는 파이썬 문법으로 쓰세요.</li>
        </ul>
      </section>

      <section>
        <h2>예제</h2>
        <div className="examples">
          {EXAMPLES.map((ex) => (
            <article key={ex.id} className="example">
              <h3>{ex.title}</h3>
              <pre>{ex.code}</pre>
              <button onClick={() => onOpenExample(ex.code)}>순서도로 보기 →</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
