"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Imperative confirm — replaces the native window.confirm() everywhere so every
// confirmation is an on-brand dialog (dynamic tokens, no browser chrome).
export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = createContext<(opts: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false),
);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const [busy, setBusy] = useState(false);
  const resolver = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    setBusy(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[120] grid place-items-center bg-background/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => !busy && close(false)}
        >
          <div
            className="fade-up w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 p-5">
              <span
                className={cn(
                  "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg",
                  opts.destructive ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary",
                )}
              >
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="font-heading text-base font-bold leading-tight">{opts.title}</h2>
                {opts.description && (
                  <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{opts.description}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-secondary/30 px-5 py-3">
              <Button variant="outline" size="sm" disabled={busy} onClick={() => close(false)}>
                {opts.cancelText || "Cancel"}
              </Button>
              <Button
                variant={opts.destructive ? "destructive" : "default"}
                size="sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  close(true);
                }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : opts.confirmText || "Confirm"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

/** Returns an async confirm() — `if (!(await confirm({...}))) return;`. */
export function useConfirm() {
  return useContext(ConfirmContext);
}
