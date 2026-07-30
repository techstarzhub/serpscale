"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { OtpStep } from "@/components/auth/otp-step";

export default function SignupPage() {
  return <Suspense fallback={null}><SignupForm /></Suspense>;
}

function SignupForm() {
  const params = useSearchParams();
  const plan = params.get("plan");
  const keywords = params.get("keywords");
  const isTrial = params.get("trial") === "1";
  // A paid "Get started" (a plan chosen without the trial flag) must pay first.
  const isPaid = !!plan && !isTrial;

  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [otpEmail, setOtpEmail] = useState<string | null>(null);

  // After the account exists + the user is signed in: paid plans go to checkout
  // and only reach the dashboard once payment succeeds; everyone else goes in.
  async function finish() {
    if (!isPaid) { window.location.href = "/dashboard"; return; }
    try {
      const [plans, gw] = await Promise.all([
        api.get<{ id: string; slug: string }[]>("/billing/plans"),
        api.get<{ active: string }>("/billing/gateway"),
      ]);
      const p = plans.find((x) => x.slug === plan);
      // No matching plan or no payment method configured — send them to billing
      // to pick a plan, with a clear note rather than a silent bounce.
      if (!p || !gw.active) { window.location.href = "/dashboard/settings/billing?setup=1"; return; }
      const res = await api.post<{ url: string }>("/billing/checkout", { planId: p.id, gateway: gw.active, keywords: keywords ? Number(keywords) : undefined });
      if (res.url) { window.location.href = res.url; return; }
      window.location.href = "/dashboard/settings/billing";
    } catch (err) {
      // Account already exists — surface the error instead of stranding them.
      setError(err instanceof Error ? err.message : "Couldn't start checkout. You can subscribe from the billing page.");
      setLoading(false);
      setTimeout(() => (window.location.href = "/dashboard/settings/billing"), 1800);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    try {
      const res = await api.post<{ otpRequired?: boolean; email?: string }>("/auth/signup", {
        name: form.get("name"),
        email: form.get("email"),
        password: form.get("password"),
        plan: plan ?? undefined,
        keywords: keywords ? Number(keywords) : undefined,
        trial: isTrial,
      });
      if (res.otpRequired) setOtpEmail(res.email ?? String(form.get("email")));
      else await finish();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
      setLoading(false);
    }
  }

  if (otpEmail) return <OtpStep email={otpEmail} purpose="SIGNUP" onVerified={finish} onBack={() => setOtpEmail(null)} />;

  const planLabel = plan ? plan.charAt(0).toUpperCase() + plan.slice(1).replace("-", " ") : null;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="font-heading text-2xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          {isTrial ? "Start your free trial in minutes." : isPaid ? "Enter your details, then complete payment to activate." : "Start owning your SEO data in minutes."}
        </p>
        {planLabel && (
          <div className="!mt-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            {isTrial ? `Free trial · ${planLabel}` : `Plan · ${planLabel}${keywords ? ` · ${Number(keywords).toLocaleString()} keywords` : ""}`}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Full name</Label>
          <Input id="name" name="name" type="text" placeholder="Jane Doe" required autoComplete="name" />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@company.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              placeholder="At least 8 characters"
              required
              minLength={8}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isTrial ? "Start free trial" : isPaid ? "Continue to payment" : "Create account"}
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
