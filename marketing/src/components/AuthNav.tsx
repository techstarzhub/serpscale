"use client";

import { useEffect } from "react";

/** Progressive enhancement for the header: if the visitor already has a session
 *  (checked against the API with their cookie), swap the static "Login" link for
 *  "Dashboard" + their avatar. Logged-out visitors keep the SSR "Login" link. */
export function AuthNav() {
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const APP = process.env.NEXT_PUBLIC_APP_URL || "https://app.serpscale.com";
    let cancelled = false;
    fetch(`${API}/auth/me`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (cancelled || !me || !me.id) return;
        const links = document.querySelectorAll<HTMLAnchorElement>("a.pp-login-link");
        const avatar = me.avatarUrl
          ? `<img src="${me.avatarUrl}" alt="" style="width:26px;height:26px;border-radius:50%;object-fit:cover;margin-right:8px;vertical-align:middle" />`
          : "";
        links.forEach((a) => {
          a.href = `${APP}/dashboard`;
          a.innerHTML = `${avatar}<span style="vertical-align:middle">Dashboard</span>`;
          a.classList.add("pp-auth-in");
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
