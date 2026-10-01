/** Explicit ok guard for fetch handlers (delete/save/refresh). */
export function checkResOk(res: Pick<Response, "ok" | "status">): boolean {
  return res.ok === true && res.status >= 200 && res.status < 300;
}
