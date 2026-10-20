/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 수업 게시판 주소. 없으면 게시판 연계 버튼이 보이지 않는다 */
  readonly VITE_BOARD_URL?: string;
}
