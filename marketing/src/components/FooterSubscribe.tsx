"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/**
 * Working newsletter form for the footer. Hydrates into the
 * `#footer-subscribe-root` placeholder in footer.raw.html via a portal so the
 * template styling is untouched. POSTs to the API (stores the subscriber +
 * emails a confirmation). Guarded by a math captcha + honeypot.
 */
export function FooterSubscribe() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setMount(document.getElementById("footer-subscribe-root"));
  }, []);

  const loadCaptcha = () => {
    fetch(`${API}/public/captcha`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && setCaptcha(c))
      .catch(() => setCaptcha(null));
  };
  useEffect(loadCaptcha, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const f = e.currentTarget;
    const body = {
      email: (f.elements.namedItem("email") as HTMLInputElement).value.trim(),
      website: (f.elements.namedItem("website") as HTMLInputElement).value,
      captchaToken: captcha?.token || "",
      captchaAnswer: (f.elements.namedItem("captchaAnswer") as HTMLInputElement).value.trim(),
    };
    if (!body.email) {
      setStatus("error");
      setMsg("Please enter your email.");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch(`${API}/public/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setStatus("ok");
        setMsg("You're subscribed! Check your inbox.");
        f.reset();
        loadCaptcha();
      } else {
        const j = await res.json().catch(() => ({}));
        setStatus("error");
        setMsg(j?.message || "Something went wrong. Please try again.");
        loadCaptcha();
      }
    } catch {
      setStatus("error");
      setMsg("Network error. Please try again.");
    }
  }

  if (!mount) return null;

  return createPortal(
    <form onSubmit={onSubmit} noValidate>
      <div className="form-clt">
        <input type="email" name="email" placeholder="Enter your email" required />
        <button type="submit" className="pp-theme-btn" disabled={status === "sending"} aria-label="Subscribe">
          <i className="fa-solid fa-arrow-right-long" />
        </button>
      </div>

      {/* Honeypot */}
      <div style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="text"
          name="captchaAnswer"
          inputMode="numeric"
          autoComplete="off"
          required
          placeholder={captcha ? captcha.question : "Loading…"}
          style={{ width: 150, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,.25)", background: "rgba(255,255,255,.08)", color: "#fff", fontSize: 13.5 }}
        />
        <span style={{ fontSize: 12, color: "rgba(255,255,255,.6)" }}>Quick check to stop bots</span>
      </div>

      {msg && (
        <p role="status" style={{ marginTop: 10, fontSize: 13.5, fontWeight: 600, color: status === "ok" ? "#6ee7b7" : "#fca5a5" }}>
          {msg}
        </p>
      )}
    </form>,
    mount,
  );
}
