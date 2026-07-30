"use client";

import { useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

/** Second step of signup/login: the user enters the 6-digit code emailed to
 *  them. On success the API sets the session cookies and we call onVerified. */
export function OtpStep({
  email,
  purpose,
  onVerified,
  onBack,
}: {
  email: string;
  purpose: "SIGNUP" | "LOGIN";
  onVerified: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resent, setResent] = useState(false);

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/verify-otp", { purpose, email, code: code.trim() });
      onVerified();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify the code");
      setLoading(false);
    }
  }

  async function resend() {
    setError("");
    setResent(false);
    try {
      await api.post("/auth/resend-otp", { purpose, email });
      setResent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the code");
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="h-5 w-5" />
        </span>
        <h1 className="font-heading text-2xl font-semibold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>. Enter it below to continue.
        </p>
      </div>

      <form onSubmit={verify} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Verification code</Label>
          <Input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="text-center text-lg tracking-[0.5em]"
            required
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {resent && <p className="text-sm text-primary">A new code is on its way.</p>}

        <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Verify &amp; continue
        </Button>
      </form>

      <div className="flex items-center justify-between text-sm">
        <button type="button" onClick={onBack} className="text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <button type="button" onClick={resend} className="font-medium text-primary hover:underline">
          Resend code
        </button>
      </div>
    </div>
  );
}
