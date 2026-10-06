// 브라우저 자동 저장 (localStorage). 사생활 보호 모드 등에서 실패해도 앱은 동작해야 한다.

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`draw_flow:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(`draw_flow:${key}`, JSON.stringify(value));
  } catch {
    /* 저장 공간이 없거나 차단된 경우 무시 */
  }
}
