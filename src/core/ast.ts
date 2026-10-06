// 파이썬식 의사코드의 구문 트리(AST)

export type Stmt =
  | SimpleStmt
  | IfStmt
  | WhileStmt
  | ForRangeStmt
  | ForEachStmt
  | JumpStmt
  | FuncDef
  | ReturnStmt;

/** 대입·계산·함수 호출, 입력, 출력 — 모두 '처리' 도형이 된다. */
export interface SimpleStmt {
  type: 'simple';
  role: 'process' | 'input' | 'output';
  /** 도형에 표시할 글자 (입력/출력은 접두어 없이 대상만) */
  text: string;
  line: number;
}

export interface IfStmt {
  type: 'if';
  /** if, elif 순서대로 */
  branches: { cond: string; body: Stmt[]; line: number }[];
  elseBody?: Stmt[];
  line: number;
}

export interface WhileStmt {
  type: 'while';
  cond: string;
  body: Stmt[];
  line: number;
}

export interface ForRangeStmt {
  type: 'forRange';
  variable: string;
  start: string;
  stop: string;
  step: string;
  body: Stmt[];
  line: number;
}

export interface ForEachStmt {
  type: 'forEach';
  variable: string;
  iterable: string;
  body: Stmt[];
  line: number;
}

/** def 함수이름(매개변수): — 맨 바깥에서만 쓸 수 있고, 따로 된 순서도로 그린다 */
export interface FuncDef {
  type: 'def';
  name: string;
  params: string[];
  body: Stmt[];
  line: number;
}

export interface ReturnStmt {
  type: 'return';
  /** 돌려줄 값 (없으면 빈 글자) */
  value: string;
  line: number;
}

export interface JumpStmt {
  type: 'break' | 'continue' | 'pass';
  line: number;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  body: Stmt[];
  errors: ParseError[];
}
