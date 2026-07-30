"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type Status = { type: "idle" | "sending" | "ok" | "error"; msg?: string };

/**
 * Real, working contact form. It hydrates into the `#contact-form-root`
 * placeholder inside the static contact.raw.html markup (via a portal) so the
 * template layout is preserved. Submissions POST to the API, which emails the
 * super admin + a confirmation to the sender. Guarded by a math captcha + honeypot.
 */
export function ContactForm() {
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [captcha, setCaptcha] = useState<{ token: string; question: string } | null>(null);
  const [status, setStatus] = useState<Status>({ type: "idle" });

  useEffect(() => {
    setMount(document.getElementById("contact-form-root"));
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
    if (status.type === "sending") return;
    const f = e.currentTarget;
    const data = {
      name: (f.elements.namedItem("name") as HTMLInputElement).value.trim(),
      email: (f.elements.namedItem("email") as HTMLInputElement).value.trim(),
      company: (f.elements.namedItem("company") as HTMLInputElement).value.trim(),
      message: (f.elements.namedItem("message") as HTMLTextAreaElement).value.trim(),
      website: (f.elements.namedItem("website") as HTMLInputElement).value, // honeypot
      captchaToken: captcha?.token || "",
      captchaAnswer: (f.elements.namedItem("captchaAnswer") as HTMLInputElement).value.trim(),
    };
    if (!data.name || !data.email || !data.message) {
      setStatus({ type: "error", msg: "Please fill in your name, email and message." });
      return;
    }
    setStatus({ type: "sending" });
    try {
      const res = await fetch(`${API}/public/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setStatus({ type: "ok", msg: "Thanks! Your message has been sent — we'll get back to you shortly." });
        f.reset();
        loadCaptcha();
      } else {
        const j = await res.json().catch(() => ({}));
        setStatus({ type: "error", msg: j?.message || "Something went wrong. Please try again." });
        loadCaptcha();
      }
    } catch {
      setStatus({ type: "error", msg: "Network error. Please try again." });
    }
  }

  if (!mount) return null;

  return createPortal(
    <form onSubmit={onSubmit} className="pp-contact-form-items" noValidate>
      <div className="row g-4">
        <div className="col-lg-6">
          <div className="form-clt">
            <span>Name*</span>
            <input type="text" name="name" placeholder="Your name" required />
          </div>
        </div>
        <div className="col-lg-6">
          <div className="form-clt">
            <span>Email*</span>
            <input type="email" name="email" placeholder="Your email" required />
          </div>
        </div>
        <div className="col-lg-12">
          <div className="form-clt">
            <span>Company</span>
            <input type="text" name="company" placeholder="Your company" />
          </div>
        </div>
        <div className="col-lg-12">
          <div className="form-clt">
            <span>Message*</span>
            <textarea name="message" placeholder="How can we help?" required />
          </div>
        </div>

        {/* Honeypot — hidden from humans; bots that fill it get silently dropped. */}
        <div style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }} aria-hidden="true">
          <label>Leave this empty<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
        </div>

        <div className="col-lg-12">
          <div className="form-clt">
            <span>{captcha ? captcha.question : "Loading verification…"} *</span>
            <input type="text" name="captchaAnswer" inputMode="numeric" placeholder="Answer" autoComplete="off" required />
          </div>
        </div>

        <div className="col-lg-12">
          <button type="submit" className="pp-theme-btn" disabled={status.type === "sending"}>
            {status.type === "sending" ? "Sending…" : "Send message"} <i className="fa-solid fa-arrow-right-long" />
          </button>
          {status.msg && (
            <p
              role="status"
              style={{ marginTop: 14, fontSize: 14.5, fontWeight: 600, color: status.type === "ok" ? "#059669" : "#dc2626" }}
            >
              {status.msg}
            </p>
          )}
        </div>
      </div>
    </form>,
    mount,
  );
}
