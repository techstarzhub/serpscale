"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";

export default function SecurityPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const form = e.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("current"));
    const newPassword = String(data.get("new"));
    const confirm = String(data.get("confirm"));

    if (newPassword !== confirm) {
      setMsg({ type: "err", text: "New passwords do not match." });
      return;
    }
    setLoading(true);
    try {
      await api.patch("/users/me/password", { currentPassword, newPassword });
      form.reset();
      setMsg({ type: "ok", text: "Password updated." });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Could not update password." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-heading text-lg font-semibold">Security</h3>
        <p className="text-sm text-muted-foreground">
          Keep your account secure. Change your password regularly.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Use at least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="max-w-md space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" name="current" type="password" autoComplete="current-password" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input id="new" name="new" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </div>
            {msg && (
              <p className={msg.type === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
                {msg.text}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
