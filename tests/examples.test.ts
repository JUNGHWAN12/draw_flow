import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { EXAMPLES } from '../src/examples';

// 예제 의사코드가 실제 파이썬 문법으로도 올바른지 확인 (python3가 없으면 건너뜀)
const hasPython = spawnSync('python3', ['--version']).status === 0;

describe.skipIf(!hasPython)('예제는 실제 파이썬 문법이다', () => {
  it.each(EXAMPLES.map((e) => [e.title, e.code]))('%s', (_, code) => {
    const r = spawnSync('python3', ['-c', 'import ast,sys; ast.parse(sys.stdin.read())'], { input: code });
    expect(r.stderr.toString()).toBe('');
    expect(r.status).toBe(0);
  });
});
