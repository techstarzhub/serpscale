import { Response } from "express";

/** The httpOnly session cookies. Shared by every place that logs a user in
 *  (password login, OTP, magic link, and re-issuing after an onboarding password
 *  change) so cookie flags stay identical everywhere. */
export function setAuthCookies(res: Response, tokens: { accessToken: string; refreshToken: string }) {
  const secure = process.env.NODE_ENV === "production";
  res.cookie("access_token", tokens.accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 1000 * 60 * 60,
  });
  res.cookie("refresh_token", tokens.refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30-day session
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
}
