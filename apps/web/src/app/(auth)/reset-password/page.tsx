"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== String(form.get("confirm"))) return setError("Passwords don't match.");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset your password");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="space-y-3">
        <h1 className="font-heading text-2xl font-semibold">Invalid reset link</h1>
        <p className="text-sm text-muted-foreground">This link is missing its token. Please request a new one.</p>
        <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">Request a new link</Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-chart-2/15 text-chart-2"><CheckCircle2 className="h-6 w-6" /></span>
        <h1 className="font-heading text-2xl font-semibold">Password updated</h1>
        <p className="text-sm text-muted-foreground">You can now sign in with your new password.</p>
        <Link href="/login" className="inline-block text-sm font-medium text-primary hover:underline">Back to sign in</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-semibold">Set a new password</h1>
        <p className="text-sm text-muted-foreground">Choose a strong password for your account.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input id="password" name="password" type={showPw ? "text" : "password"} placeholder="At least 8 characters" required minLength={8} autoComplete="new-password" className="pr-10" />
            <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={showPw ? "Hide" : "Show"}>
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input id="confirm" name="confirm" type={showPw ? "text" : "password"} placeholder="Re-enter password" required autoComplete="new-password" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Reset password
        </Button>
      </form>
    </div>
  );
}
