// 문제를 링크(URL) 하나에 담기 — 서버 없이 공유하기 위해 압축해서 주소 뒤에 붙인다.

export type ProblemMode = 'code2flow' | 'flow2code';

export interface Problem {
  v: 1;
  title: string;
  desc: string;
  mode: ProblemMode;
  /** 정답 의사코드 */
  answer: string;
  /** 테스트마다 입력값 목록 */
  tests: string[][];
}

function toBase64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

const canCompress = typeof CompressionStream !== 'undefined';

/** 문제 → 주소에 넣을 글자 ("z" 압축 / "j" 압축 없음) */
export async function encodeProblem(p: Problem): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  if (canCompress) return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + toBase64Url(json);
}

export async function decodeProblem(s: string): Promise<Problem> {
  try {
    const kind = s[0];
    let bytes = fromBase64Url(s.slice(1));
    if (kind === 'z') bytes = (await pipe(bytes, new DecompressionStream('deflate-raw'))) as Uint8Array<ArrayBuffer>;
    else if (kind !== 'j') throw new Error();
    const p = JSON.parse(new TextDecoder().decode(bytes)) as Problem;
    if (p.v !== 1 || typeof p.answer !== 'string') throw new Error();
    return { ...p, tests: Array.isArray(p.tests) ? p.tests : [] };
  } catch {
    throw new Error('문제 링크가 올바르지 않습니다. 링크가 잘리지 않았는지 확인해 주세요.');
  }
}

/** 같은 문제에 학생 답을 저장할 때 쓸 짧은 아이디 */
export function problemId(encoded: string): string {
  let h = 2166136261;
  for (let i = 0; i < encoded.length; i++) h = Math.imul(h ^ encoded.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function problemUrl(encoded: string): string {
  return `${location.origin}${location.pathname}#/problem?d=${encoded}`;
}
