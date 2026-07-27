"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Globe, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { ReviewerPicker } from "./reviewer-picker";

interface Match { name: string; domain: string }

/**
 * Request access to a campaign by typing its website. Matching campaigns are
 * surfaced as you type (typeahead) — the full list is never shown, so members
 * can't discover campaigns they don't have access to.
 */
export function CampaignRequestInput({ compact = false, onDone }: { compact?: boolean; onDone?: () => void }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced typeahead search — only fires once you've typed 2+ chars.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (query.length < 2) {
      setMatches([]);
      return;
    }
    timer.current = setTimeout(() => {
      api
        .get<Match[]>(`/access-requests/campaign-search?q=${encodeURIComponent(query)}`)
        .then((r) => {
          setMatches(Array.isArray(r) ? r : []);
          setOpen(true);
        })
        .catch(() => setMatches([]));
    }, 300);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  async function submit() {
    const website = q.trim();
    if (!website) return;
    if (recipients.length === 0) { setDone("Pick at least one person to send to."); return; }
    setBusy(true);
    setDone(null);
    try {
      await api.post("/access-requests", { type: "project", target: website, note: note.trim() || undefined, recipientIds: recipients });
      setDone(`Request sent for "${website}".`);
      setQ(""); setNote(""); setMatches([]); setRecipients([]);
      onDone?.();
      setTimeout(() => setDone(null), 3000);
    } catch (e) {
      setDone(e instanceof Error ? e.message : "Could not send request.");
    } finally {
      setBusy(false);
    }
  }

  const inputCls = cn(
    "w-full rounded-lg border border-border bg-background outline-none transition-colors focus:border-primary",
    compact ? "px-2.5 py-1.5 text-xs" : "px-3 py-2 text-sm",
  );

  return (
    <div className="space-y-2">
      <div className="relative" ref={boxRef}>
        <Globe className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground", compact ? "left-2.5 h-3.5 w-3.5" : "left-3 h-4 w-4")} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => matches.length && setOpen(true)}
          placeholder="Enter a website, e.g. example.com"
          className={cn(inputCls, compact ? "pl-8" : "pl-9")}
        />
        {open && matches.length > 0 && (
          <div className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {matches.map((m) => (
              <button
                key={m.domain}
                onClick={() => { setQ(m.domain); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-sm">{m.domain}</span>
                  {m.name && <span className="block truncate text-xs text-muted-foreground">{m.name}</span>}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <ReviewerPicker value={recipients} onChange={setRecipients} compact={compact} />

      {!compact && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a note (optional)"
          className="min-h-[56px] w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      )}

      {done && <p className={cn(compact ? "text-[11px]" : "text-sm", done.startsWith("Request sent") ? "text-chart-2" : "text-destructive")}>{done}</p>}

      <Button size={compact ? "sm" : "default"} onClick={submit} disabled={busy || q.trim().length < 3 || recipients.length === 0} className={compact ? "w-full" : ""}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : done?.startsWith("Request sent") ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        Request access
      </Button>
    </div>
  );
}
