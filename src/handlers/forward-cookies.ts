// better-auth が rotate した Set-Cookie を載せ忘れると本人が成功直後にログアウトする。
export function forwardSetCookie(response: Response, forwarded: Headers): Response {
  for (const cookie of forwarded.getSetCookie()) response.headers.append("set-cookie", cookie);
  return response;
}
