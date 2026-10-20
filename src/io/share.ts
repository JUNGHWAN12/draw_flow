// 링크(URL) 하나에 내용을 담아 서버 없이 주고받기 — JSON을 압축해서 주소 뒤에 붙인다.
// 1) 문제 링크 (#/problem?d=…)
// 2) 수업 게시판(class_board)과 주고받는 링크 (의사코드 · 순서도 · 과제 제출) — docs/BOARD_LINK.md

import type { EdgeLabel, FlowDocument, FlowEdge, FlowNode, NodeKind, Side } from '../core/types';

// ---------------------------------------------------------------------------
// 공통: JSON ↔ 주소에 넣을 글자 ("z" 압축 / "j" 압축 없음)
// ---------------------------------------------------------------------------

/** 풀었을 때 JSON 크기 상한. 수업용 의사코드·순서도는 보통 수 KB이다. */
export const MAX_PAYLOAD_BYTES = 50_000;

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

/** 스트림을 끝까지 읽되, limit 바이트를 넘으면 멈추고 오류 (압축 폭탄 방지) */
async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
  limit = Infinity,
): Promise<Uint8Array<ArrayBuffer>> {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      throw new Error('too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

const canCompress = typeof CompressionStream !== 'undefined';

/** 값(JSON) → 주소에 넣을 글자 */
export async function encodePayload(value: unknown): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(value));
  if (canCompress) return 'z' + toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
  return 'j' + toBase64Url(json);
}

/** 주소의 글자 → 값(JSON). 형식이 틀리거나 너무 크면 오류 */
export async function decodePayload(s: string): Promise<unknown> {
  const kind = s[0];
  let bytes = fromBase64Url(s.slice(1));
  if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_PAYLOAD_BYTES);
  else if (kind !== 'j') throw new Error('unknown kind');
  if (bytes.length > MAX_PAYLOAD_BYTES) throw new Error('too large');
  return JSON.parse(new TextDecoder().decode(bytes));
}

// ---------------------------------------------------------------------------
// 문제 링크
// ---------------------------------------------------------------------------

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

/** 문제 → 주소에 넣을 글자 */
export async function encodeProblem(p: Problem): Promise<string> {
  return encodePayload(p);
}

export async function decodeProblem(s: string): Promise<Problem> {
  try {
    const p = (await decodePayload(s)) as Problem;
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

// ---------------------------------------------------------------------------
// 수업 게시판 연계 링크 (형식: docs/BOARD_LINK.md)
// ---------------------------------------------------------------------------

export type LinkApp = 'draw_flow' | 'class_board';
export type Verdict = 'correct' | 'partial' | 'wrong';

interface LinkBase {
  v: 1;
  /** 이 내용을 만든 사이트 */
  app: LinkApp;
  title: string;
}

/** 의사코드 (의사코드 → 순서도 화면) */
export interface PseudocodeLink extends LinkBase {
  kind: 'pseudocode';
  code: string;
}

/** 직접 그린 순서도 (순서도 편집기) */
export interface FlowLink extends LinkBase {
  kind: 'flow';
  doc: FlowDocument;
}

/** 문제를 풀고 게시판에 제출. 정답은 들어가지 않는다. */
export interface SubmissionLink extends LinkBase {
  kind: 'submission';
  problem: { id: string; title: string; mode: ProblemMode };
  /** 학생이 쓴 의사코드 (flow2code). 순서도로 푼 경우에도 변환된 의사코드를 담을 수 있다 */
  code?: string;
  /** 학생이 그린 순서도 (code2flow) */
  doc?: FlowDocument;
  /** 학생 브라우저에서 계산한 채점 결과 (참고용) */
  grade: { verdict: Verdict; items: { ok: boolean; text: string }[] };
}

export type BoardLink = PseudocodeLink | FlowLink | SubmissionLink;

const LINK_ERROR = '게시판 링크가 올바르지 않습니다. 링크가 잘리지 않았는지 확인해 주세요.';
const MAX_TITLE = 100;
const MAX_ITEMS = 50;
const MAX_SHAPES = 500;
const KINDS: NodeKind[] = ['terminal', 'process', 'decision'];
const SIDES: Side[] = ['t', 'r', 'b', 'l'];
const LABELS: EdgeLabel[] = ['예', '아니오'];

function fail(): never {
  throw new Error('invalid');
}

function str(v: unknown, max = Infinity): string {
  if (typeof v !== 'string') fail();
  return v.slice(0, max);
}

function num(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail();
  return v;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function cleanNode(v: unknown): FlowNode {
  if (!isObj(v) || !KINDS.includes(v.kind as NodeKind)) fail();
  return {
    id: str(v.id, 64),
    kind: v.kind as NodeKind,
    label: str(v.label, 500),
    ...(typeof v.line === 'number' ? { line: num(v.line) } : {}),
    x: num(v.x),
    y: num(v.y),
    width: num(v.width),
    height: num(v.height),
  };
}

function cleanEdge(v: unknown): FlowEdge {
  if (!isObj(v) || !SIDES.includes(v.sourceHandle as Side) || !SIDES.includes(v.targetHandle as Side)) fail();
  if (v.label !== undefined && !LABELS.includes(v.label as EdgeLabel)) fail();
  if (v.points !== undefined && (!Array.isArray(v.points) || v.points.length > MAX_SHAPES)) fail();
  return {
    id: str(v.id, 64),
    source: str(v.source, 64),
    target: str(v.target, 64),
    sourceHandle: v.sourceHandle as Side,
    targetHandle: v.targetHandle as Side,
    ...(v.label !== undefined ? { label: v.label as EdgeLabel } : {}),
    ...(v.points !== undefined
      ? {
          points: (v.points as unknown[]).map((p) => {
            if (!isObj(p)) fail();
            return { x: num(p.x), y: num(p.y) };
          }),
        }
      : {}),
  };
}

/** 순서도 파일 모양을 확인하고, 약속한 필드만 남긴다 */
function cleanDoc(v: unknown): FlowDocument {
  if (!isObj(v) || v.app !== 'draw_flow' || !Array.isArray(v.nodes) || !Array.isArray(v.edges)) fail();
  if (v.nodes.length > MAX_SHAPES || v.edges.length > MAX_SHAPES) fail();
  return {
    app: 'draw_flow',
    version: 1,
    title: typeof v.title === 'string' ? v.title.slice(0, MAX_TITLE) : '',
    ...(typeof v.pseudocode === 'string' ? { pseudocode: v.pseudocode } : {}),
    nodes: v.nodes.map(cleanNode),
    edges: v.edges.map(cleanEdge),
  };
}

function cleanGrade(v: unknown): SubmissionLink['grade'] {
  if (!isObj(v) || !['correct', 'partial', 'wrong'].includes(v.verdict as string) || !Array.isArray(v.items)) fail();
  return {
    verdict: v.verdict as Verdict,
    items: v.items.slice(0, MAX_ITEMS).map((it) => {
      if (!isObj(it)) fail();
      return { ok: it.ok === true, text: str(it.text, 300) };
    }),
  };
}

/**
 * 받은 값이 약속한 형식인지 확인하고, 약속에 없는 필드는 버린다.
 * 다른 사이트에서 온 내용이므로 그대로 믿지 않는다.
 */
export function parseBoardLink(value: unknown): BoardLink {
  if (!isObj(value) || value.v !== 1 || (value.app !== 'draw_flow' && value.app !== 'class_board')) fail();
  const base = { v: 1 as const, app: value.app as LinkApp, title: str(value.title ?? '', MAX_TITLE) };
  switch (value.kind) {
    case 'pseudocode':
      return { ...base, kind: 'pseudocode', code: str(value.code) };
    case 'flow':
      return { ...base, kind: 'flow', doc: cleanDoc(value.doc) };
    case 'submission': {
      const p = value.problem;
      if (!isObj(p) || (p.mode !== 'code2flow' && p.mode !== 'flow2code')) fail();
      const code = value.code === undefined ? undefined : str(value.code);
      const doc = value.doc === undefined ? undefined : cleanDoc(value.doc);
      if (code === undefined && doc === undefined) fail();
      return {
        ...base,
        kind: 'submission',
        problem: { id: str(p.id, 32), title: str(p.title, MAX_TITLE), mode: p.mode },
        ...(code !== undefined ? { code } : {}),
        ...(doc !== undefined ? { doc } : {}),
        grade: cleanGrade(value.grade),
      };
    }
    default:
      return fail();
  }
}

export async function encodeBoardLink(link: BoardLink): Promise<string> {
  return encodePayload(parseBoardLink(link));
}

export async function decodeBoardLink(s: string): Promise<BoardLink> {
  try {
    return parseBoardLink(await decodePayload(s));
  } catch {
    throw new Error(LINK_ERROR);
  }
}
