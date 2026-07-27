"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { THEME_TOKENS, FONT_OPTIONS, type ThemeToken } from "./theme-config";
import { useTheme } from "./theme-provider";
import { hexToHslChannels, hslChannelsToHex } from "@/lib/colors";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { cn } from "@/lib/utils";

function readVar(key: string): string {
  if (typeof window === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(`--${key}`).trim();
}

export function ThemeCustomizer() {
  const { overrides, mode, setToken, resetToken, resetAll, setMode } = useTheme();

  // Force a re-read of computed values after mode/override changes so each control
  // reflects the live value (whether default or overridden).
  const [, bump] = useState(0);
  useEffect(() => {
    bump((n) => n + 1);
  }, [mode, overrides]);

  const groups = Array.from(new Set(THEME_TOKENS.map((t) => t.group)));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex rounded-md border border-border p-0.5">
          {(["light", "dark"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-3 py-1 text-sm capitalize transition-colors",
                mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={resetAll}>
          <RotateCcw className="h-4 w-4" />
          Reset all
        </Button>
      </div>

      {groups.map((group) => (
        <div key={group} className="space-y-3">
          <h3 className="text-sm font-semibold">{group}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {THEME_TOKENS.filter((t) => t.group === group).map((token) => (
              <TokenControl
                key={token.key}
                token={token}
                value={readVar(token.key)}
                overridden={token.key in overrides}
                onChange={(v) => setToken(token.key, v)}
                onReset={() => resetToken(token.key)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TokenControl({
  token,
  value,
  overridden,
  onChange,
  onReset,
}: {
  token: ThemeToken;
  value: string;
  overridden: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label>{token.label}</Label>
        {overridden && (
          <button
            type="button"
            onClick={onReset}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Reset
          </button>
        )}
      </div>

      {token.type === "color" && (
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={hslChannelsToHex(value)}
            onChange={(e) => onChange(hexToHslChannels(e.target.value))}
            className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1"
            aria-label={token.label}
          />
          <div className="flex h-9 flex-1 items-center rounded-md border border-input px-2 font-mono text-xs text-muted-foreground">
            {value || "-"}
          </div>
        </div>
      )}

      {token.type === "size" && (
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.05}
            value={parseFloat(value) || 0}
            onChange={(e) => onChange(`${e.target.value}rem`)}
            className="w-full accent-primary"
            aria-label={token.label}
          />
          <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
            {value || "0"}
          </span>
        </div>
      )}

      {token.type === "font" && (
        <Combobox
          value={value}
          onChange={onChange}
          searchPlaceholder="Search fonts…"
          options={[
            ...FONT_OPTIONS.map((f) => ({ value: f.value, label: f.label })),
            ...(!FONT_OPTIONS.some((f) => f.value === value) && value ? [{ value, label: "Current" }] : []),
          ]}
        />
      )}
    </div>
  );
}
