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
    </div>
  );
}
