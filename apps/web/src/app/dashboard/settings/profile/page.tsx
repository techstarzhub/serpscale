"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
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
import { UserAvatar } from "@/components/ui/user-avatar";
import { api } from "@/lib/api";
import { useCurrentUser, type CurrentUser } from "@/components/providers/user-provider";

export default function ProfilePage() {
  const { user, refresh } = useCurrentUser();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setEmail(user.email ?? "");
    }
  }, [user]);

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      await api.patch<CurrentUser>("/users/me", { name, email });
      await refresh();
      setMsg({ type: "ok", text: "Profile updated." });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    setMsg(null);
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await api.upload<CurrentUser>("/users/me/avatar", form);
      await refresh();
      setMsg({ type: "ok", text: "Photo updated." });
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Upload failed." });
    } finally {
      setUploading(false);
    }
  }

  async function onRemovePhoto() {
    setMsg(null);
    setUploading(true);
    try {
      await api.del("/users/me/avatar");
      await refresh();
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Could not remove." });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="font-heading text-lg font-semibold">Profile</h3>
        <p className="text-sm text-muted-foreground">
          Your personal information and how you appear in the app.
        </p>
      </div>

      {msg && (
        <p className={msg.type === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>
          {msg.text}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profile photo</CardTitle>
          <CardDescription>PNG, JPG, or WebP, up to 2MB.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-5">
            <UserAvatar src={user?.avatarUrl} className="h-20 w-20 text-xl" />
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={onPickFile}
              />
              <Button
                variant="outline"
                className="gap-2"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Upload photo
              </Button>
              {user?.avatarUrl && (
                <Button variant="ghost" disabled={uploading} onClick={onRemovePhoto}>
                  Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal information</CardTitle>
          <CardDescription>Update your name and email.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSaveProfile}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save changes
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {user?.isAgencyClient && <AgencyBrandingCard onSaved={refresh} />}
    </div>
  );
}

function AgencyBrandingCard({ onSaved }: { onSaved: () => void }) {
  const [b, setB] = useState<{ agencyName: string; logoDataUrl: string | null; logoBg: string | null }>({ agencyName: "", logoDataUrl: null, logoBg: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.get<typeof b>("/clients/me/branding").then((r) => setB({ agencyName: r.agencyName || "", logoDataUrl: r.logoDataUrl, logoBg: r.logoBg })).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pickLogo(file: File) {
    if (file.size > 500 * 1024) { setMsg({ type: "err", text: "Logo must be under 500 KB." }); return; }
    const r = new FileReader();
    r.onload = () => setB((p) => ({ ...p, logoDataUrl: String(r.result) }));
    r.readAsDataURL(file);
  }

  async function save() {
    setSaving(true); setMsg(null);
    try {
      await api.patch("/clients/me/branding", b);
      setMsg({ type: "ok", text: "Branding saved." });
      onSaved();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Could not save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Agency branding</CardTitle>
        <CardDescription>Your agency name and logo — shown across your portal and on white-label reports.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && <p className={msg.type === "ok" ? "text-sm text-success" : "text-sm text-destructive"}>{msg.text}</p>}
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : (
          <>
            <div className="flex items-center gap-5">
              <span className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-2xl border border-border" style={{ backgroundColor: b.logoBg || "hsl(var(--card))" }}>
                {b.logoDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={b.logoDataUrl} alt="Logo" className="h-full w-full object-contain" />
                ) : <Upload className="h-6 w-6 text-muted-foreground" />}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => e.target.files?.[0] && pickLogo(e.target.files[0])} />
                <Button variant="outline" className="gap-2" onClick={() => logoRef.current?.click()}><Upload className="h-4 w-4" /> Upload logo</Button>
                {b.logoDataUrl && <Button variant="ghost" onClick={() => setB((p) => ({ ...p, logoDataUrl: null }))}>Remove</Button>}
                <input type="color" value={b.logoBg || "#4f46e5"} onChange={(e) => setB((p) => ({ ...p, logoBg: e.target.value }))} className="h-9 w-10 cursor-pointer rounded-lg border border-border bg-background p-1" title="Logo background" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="agencyName">Agency name</Label>
              <Input id="agencyName" value={b.agencyName} onChange={(e) => setB((p) => ({ ...p, agencyName: e.target.value }))} placeholder="Your agency name" />
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save branding</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
