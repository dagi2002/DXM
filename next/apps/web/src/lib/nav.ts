/** True when `pathname` is one of `match` or a child of it (`/fixes/abc`), but not a lookalike (`/fixes-old`). */
export function isNavActive(pathname: string, match: readonly string[]): boolean {
  return match.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
