"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

/**
 * Wraps the auth pages (login/signup). If a valid session already exists, sends
 * the visitor straight to the dashboard (or their intended ?next=) instead of
 * showing the login form again.
 */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api
      .get("/auth/me")
      .then(() => {
        const next = new URLSearchParams(window.location.search).get("next");
        router.replace(next && next.startsWith("/") ? next : "/dashboard");
      })
      .catch(() => setChecking(false)); // not signed in — show the form
  }, [router]);

  if (checking) return null; // brief blank while the session is verified (no flash of the form)
  return <>{children}</>;
}
