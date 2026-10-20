// 수업 게시판(class_board) 연계 — 주소 만들기와 받은 주소 읽기 (형식: docs/BOARD_LINK.md)
// 게시판 주소(VITE_BOARD_URL)가 없으면 연계 기능은 모두 꺼진다.

import { encodePayload, MAX_PAYLOAD_BYTES, parseBoardLink, type BoardLink } from './share';

/** 빌드할 때 넣는 게시판 주소. 예: https://class-board.vercel.app */
export const BOARD_URL = normalizeBase(import.meta.env.VITE_BOARD_URL ?? '');

export function normalizeBase(url: string): string {
  const u = url.trim().replace(/\/+$/, '');
  return /^https?:\/\/[^\s]+$/.test(u) ? u : '';
}

export function boardEnabled(base = BOARD_URL): boolean {
  return base !== '';
}

/** 게시판 아이디는 주소에 그대로 들어가므로 안전한 글자만 허용 */
export function isBoardId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}

/** draw_flow → 게시판: 받은 내용을 글쓰기 창에 채워 여는 주소. 내용은 # 뒤에 있어 서버로 전송되지 않는다 */
export function boardShareUrl(encoded: string, boardId?: string | null, base = BOARD_URL): string {
  const board = isBoardId(boardId) ? `&board=${boardId}` : '';
  return `${base}/share#d=${encoded}${board}`;
}

/** 게시판 → draw_flow 주소의 # 뒷부분에서 src(내용)와 board(돌아갈 게시판)를 읽는다. 예: #/convert?src=z…&board=abc */
export function readIncoming(hash: string): { src: string | null; board: string | null } {
  const params = new URLSearchParams(hash.split('?')[1] ?? '');
  const src = params.get('src');
  const board = params.get('board');
  return {
    src: src && /^[zj][A-Za-z0-9_-]+$/.test(src) ? src : null,
    board: isBoardId(board) ? board : null,
  };
}

const BOARD_KEY = 'draw_flow:board-return';

/** 게시판에서 열렸으면 그 게시판 아이디를 기억해 두었다가 [게시판에 올리기]에서 쓴다 (탭을 닫으면 잊음) */
export function rememberBoard(id: string | null): void {
  try {
    if (isBoardId(id)) sessionStorage.setItem(BOARD_KEY, id);
  } catch {
    // 사생활 보호 모드 등: 기억하지 못해도 게시판 쪽에서 게시판을 고르게 한다
  }
}

export function rememberedBoard(): string | null {
  try {
    const id = sessionStorage.getItem(BOARD_KEY);
    return isBoardId(id) ? id : null;
  } catch {
    return null;
  }
}

/**
 * 게시판으로 보낼 주소를 만든다. 게시판이 받는 한도(풀었을 때 50KB)를 넘으면 오류.
 * 게시판에서 열렸던 탭이면 그 게시판 아이디를 붙여 바로 그 게시판으로 돌아간다.
 */
export async function boardLinkUrl(link: BoardLink, base = BOARD_URL): Promise<string> {
  const clean = parseBoardLink(link);
  if (new TextEncoder().encode(JSON.stringify(clean)).length > MAX_PAYLOAD_BYTES) {
    throw new Error('내용이 너무 길어 게시판으로 보낼 수 없습니다. (최대 50KB)');
  }
  return boardShareUrl(await encodePayload(clean), rememberedBoard(), base);
}

/**
 * 게시판을 새 탭으로 연다. 압축을 기다리는 동안 팝업 차단에 걸리지 않도록
 * 빈 탭을 먼저 열고 주소를 나중에 넣는다.
 */
export async function openOnBoard(link: BoardLink): Promise<void> {
  const win = window.open('', '_blank');
  try {
    const url = await boardLinkUrl(link);
    if (win) {
      win.opener = null;
      win.location.href = url;
    } else {
      location.href = url;
    }
  } catch (e) {
    win?.close();
    alert((e as Error).message);
  }
}
