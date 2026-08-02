"use client";

import { type ReactNode, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Link2, Globe2, Search as SearchIcon, ImagePlus, Sparkles, Loader2, RefreshCw, Check, Wand2, Maximize2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { useTheme } from "@/components/theme/theme-provider";
import * as commands from "@uiw/react-md-editor/commands";
import "@uiw/react-md-editor/markdown-editor.css";

// The editor touches `window`, so load it client-only.
const MDEditor = dynamic(() => import("@uiw/react-md-editor").then((m) => m.default), { ssr: false });

interface InternalPage { url: string; title: string }

function escapeRe(s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// Wrap any occurrence of a targeted keyword in a highlight with its volume on hover.
function highlight(text: string, vols: Map<string, number | null>, kp: string): ReactNode[] {
  const keys = [...vols.keys()].filter(Boolean).sort((a, b) => b.length - a.length);
  if (!keys.length) return [text];
  let re: RegExp;
  try { re = new RegExp(`\\b(${keys.map(escapeRe).join("|")})\\b`, "gi"); } catch { return [text]; }
  return text.split(re).map((p, i) => {
    if (p && vols.has(p.toLowerCase())) {
      const v = vols.get(p.toLowerCase());
      return (
        <mark
          key={`${kp}-${i}`}
          title={v != null ? `Search volume: ${v.toLocaleString()}/mo` : "Target keyword"}
          className="cursor-help rounded bg-primary/15 px-0.5 font-medium text-primary"
        >
          {p}
        </mark>
      );
    }
    return <span key={`${kp}-${i}`}>{p}</span>;
  });
}

function boldAndHi(text: string, vols: Map<string, number | null>, kp: string): ReactNode[] {
  const out: ReactNode[] = [];
  text.split(/(\*\*[^*]+\*\*)/g).forEach((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) {
      out.push(<strong key={`${kp}-b${i}`} className="font-semibold text-foreground">{highlight(p.slice(2, -2), vols, `${kp}-bh${i}`)}</strong>);
    } else if (p) {
      out.push(...highlight(p, vols, `${kp}-h${i}`));
    }
  });
  return out;
}

// Inline markdown: links, then bold + keyword highlighting inside the rest.
function inline(text: string, vols: Map<string, number | null>, kp: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m: RegExpExecArray | null, idx = 0;
  while ((m = linkRe.exec(text))) {
    if (m.index > last) nodes.push(...boldAndHi(text.slice(last, m.index), vols, `${kp}-${idx++}`));
    nodes.push(
      <a key={`${kp}-l${idx++}`} href={m[2]} target="_blank" rel="noreferrer" className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
        {boldAndHi(m[1], vols, `${kp}-la${idx}`)}
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(...boldAndHi(text.slice(last), vols, `${kp}-e`));
  return nodes;
}

// Turn stray markdown tables into plain bullets and drop horizontal rules, so no
// "borders" ever render (matches the server-side sanitizer for live streaming).
function deTable(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (/^\|?[\s:|-]*-[\s:|-]*\|[\s:|-]*$/.test(t)) return null;
      if (/^\|.*\|?$/.test(t) && t.includes("|")) {
        const cells = t.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim()).filter(Boolean);
        return cells.length ? `- ${cells.join(" — ")}` : null;
      }
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(t)) return null;
      return line;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
}

// Length quality for an SEO field (green in range, amber under, red over).
function lenTone(n: number, min: number, max: number) {
  if (n === 0) return "text-muted-foreground";
  if (n > max) return "text-destructive";
  if (n < min) return "text-chart-3";
  return "text-chart-2";
}

// The labeled SEO panel: meta title, meta description, H1 — with character counts
// and a search-result preview so it's clear which is which.
function SeoMeta({ title, desc, h1, domain }: { title: string; desc: string; h1: string; domain?: string }) {
  const host = (domain || "").replace(/^https?:\/\//, "").replace(/\/.*$/, "") || "yoursite.com";
  const Row = ({ label, value, min, max }: { label: string; value: string; min?: number; max?: number }) => (
    <div className="flex flex-col gap-0.5 py-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        {min != null && max != null && <span className={cn("text-[11px] tabular-nums", lenTone(value.length, min, max))}>{value.length} chars · ideal {min}-{max}</span>}
      </div>
      <span className="text-sm text-foreground">{value || <span className="text-muted-foreground">—</span>}</span>
    </div>
  );
  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border bg-secondary/30 px-3 py-2">
        <SearchIcon className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">SEO metadata</span>
      </div>
      <div className="divide-y divide-border px-3">
        <Row label="Meta title (title tag)" value={title} min={50} max={60} />
        <Row label="Meta description" value={desc} min={140} max={160} />
        <Row label="H1 (on-page headline)" value={h1} />
      </div>
      {/* Google-style search result preview */}
      {(title || desc) && (
        <div className="border-t border-border bg-secondary/20 px-3 py-2.5">
          <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Search preview</div>
          <div className="mt-1">
            <div className="text-[13px] text-muted-foreground">{host}</div>
            <div className="line-clamp-1 text-base font-medium text-primary">{title || h1}</div>
            <div className="line-clamp-2 text-[13px] text-muted-foreground">{desc}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// Block-level markdown renderer for the preview pane (our own — keeps keyword
// highlighting, volume tooltips and clickable internal links).
export function BlogPreview({ text, vols, domain, imagesBusy }: { text: string; vols: Map<string, number | null>; domain?: string; imagesBusy?: boolean }) {
  const [zoom, setZoom] = useState<string | null>(null);
  useEffect(() => {
    if (!zoom) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setZoom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);
  const clean = deTable(text.replace(/\r/g, ""));
  const metaTitle = (clean.match(/^\s*meta title:\s*(.+)$/im)?.[1] || "").replace(/[*#]/g, "").trim();
  const metaDesc = (clean.match(/^\s*meta description:\s*(.+)$/im)?.[1] || "").replace(/[*#]/g, "").trim();
  const h1 = (clean.match(/^#\s+(.+)$/m)?.[1] || "").trim();
  // Strip the meta lines from the article body — they show in the SEO panel instead.
  const body = clean
    .replace(/^\s*meta title:\s*.+$/im, "")
    .replace(/^\s*meta description:\s*.+$/im, "")
    .replace(/\n{3,}/g, "\n\n");
  const blocks = body.trimEnd().split(/\n{2,}/).filter((b) => b.trim());
  return (
    <>
    {zoom && (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm"
        onClick={() => setZoom(null)}
      >
        <button type="button" onClick={() => setZoom(null)} className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20" aria-label="Close preview">
          <X className="h-5 w-5" />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={zoom} alt="preview" onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-xl object-contain shadow-2xl" />
      </div>
    )}
    <div className="text-sm leading-relaxed text-foreground">
      {(metaTitle || metaDesc || h1) && <SeoMeta title={metaTitle} desc={metaDesc} h1={h1} domain={domain} />}
      <div className="space-y-3">
      {blocks.map((block, bi) => {
        const lines = block.split("\n");
        const first = lines[0] ?? "";
        // Standalone image: ![alt](url)
        const img = first.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (img) {
          return (
            <figure key={bi} className="group my-4 overflow-hidden rounded-xl border border-border bg-secondary/30">
              <button type="button" onClick={() => !imagesBusy && setZoom(img[2])} className={cn("relative block w-full", imagesBusy ? "cursor-wait" : "cursor-zoom-in")} title={imagesBusy ? "Regenerating…" : "Click to preview"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img[2]} alt={img[1]} loading="lazy" className={cn("block h-auto w-full object-cover transition-all duration-300", imagesBusy ? "scale-[1.01] blur-sm brightness-90" : "group-hover:scale-[1.02]")} />
                {imagesBusy ? (
                  <span className="absolute inset-0 grid place-items-center">
                    {/* sweeping shimmer */}
                    <span className="img-shimmer absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                    <span className="relative flex items-center gap-2 rounded-full bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground shadow-lg ring-1 ring-border">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Regenerating…
                    </span>
                  </span>
                ) : (
                  <span className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg bg-black/50 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
                    <Maximize2 className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
              {img[1] && <figcaption className="px-3 py-2 text-center text-xs text-muted-foreground">{img[1]}</figcaption>}
            </figure>
          );
        }
        if (/^#\s+/.test(first)) return <h1 key={bi} className="font-heading text-2xl font-bold tracking-tight">{inline(first.replace(/^#\s+/, ""), vols, `h1${bi}`)}</h1>;
        if (/^##\s+/.test(first) && !/^###/.test(first)) return <h2 key={bi} className="font-heading text-xl font-semibold tracking-tight">{inline(first.replace(/^##\s+/, ""), vols, `h2${bi}`)}</h2>;
        if (/^###\s+/.test(first)) return <h3 key={bi} className="font-heading text-base font-semibold">{inline(first.replace(/^###\s+/, ""), vols, `h3${bi}`)}</h3>;
        const isList = lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l));
        if (isList) {
          return (
            <ul key={bi} className="space-y-1.5">
              {lines.map((l, li) => (
                <li key={li} className="flex gap-2">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""), vols, `li${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>{inline(l, vols, `p${bi}-${li}`)}{li < lines.length - 1 && <br />}</span>
            ))}
          </p>
        );
      })}
      </div>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// AI image generation panel (opened from the editor toolbar)
// ---------------------------------------------------------------------------
const ASPECTS = [
  { key: "16:9", label: "Wide", box: "h-3 w-5" },
  { key: "1:1", label: "Square", box: "h-4 w-4" },
  { key: "4:3", label: "Classic", box: "h-3.5 w-[1.15rem]" },
  { key: "9:16", label: "Tall", box: "h-5 w-3" },
];

function ImageGenPanel({
  projectId, textApi, close,
}: {
  projectId: string;
  textApi?: commands.TextAreaTextApi;
  close: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    const p = prompt.trim();
    if (!p || loading) return;
    setLoading(true); setError(null); setUrl(null);
    try {
      const res = await api.post<{ url: string }>(`/projects/${projectId}/blog/image`, { prompt: p, aspectRatio: aspect });
      setUrl(res.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate an image.");
    } finally {
      setLoading(false);
    }
  }

  function insert() {
    if (!url) return;
    const alt = prompt.trim().replace(/[[\]()]/g, "").slice(0, 100) || "AI image";
    textApi?.replaceSelection(`\n\n![${alt}](${url})\n\n`);
    close();
  }

  return (
    <div className="w-[22rem] p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary"><Wand2 className="h-4 w-4" /></span>
        <div>
          <div className="text-sm font-semibold leading-none">Generate an image</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">On-brand, AI-generated — inserts into your blog</div>
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
        rows={2}
        autoFocus
        placeholder="Describe the image… e.g. a team collaborating in a bright modern office"
        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
      />

      {/* Aspect ratio */}
      <div className="mt-2 flex items-center gap-1.5">
        {ASPECTS.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setAspect(a.key)}
            title={`${a.label} (${a.key})`}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-lg border px-1 py-1.5 text-[10px] font-medium transition-colors",
              aspect === a.key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            <span className={cn("rounded-sm border", a.box, aspect === a.key ? "border-primary bg-primary/20" : "border-muted-foreground/40")} />
            {a.key}
          </button>
        ))}
      </div>

      {/* Result / loading */}
      {loading && (
        <div className="mt-2 grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-border bg-secondary/40">
          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Painting your image…
          </div>
        </div>
      )}
      {url && !loading && (
        <div className="mt-2 overflow-hidden rounded-lg border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="preview" className="block w-full" />
        </div>
      )}
      {error && <div className="mt-2 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive">{error}</div>}

      {/* Actions */}
      <div className="mt-2.5 flex items-center gap-1.5">
        {!url ? (
          <button
            type="button"
            onClick={generate}
            disabled={!prompt.trim() || loading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Generating…" : "Generate"}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={insert}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Check className="h-4 w-4" /> Insert
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={loading}
              title="Generate another"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function BlogEditor({
  value, onChange, vols, internalPages, domain, projectId, imagesBusy,
}: {
  value: string;
  onChange: (v: string) => void;
  vols: Map<string, number | null>;
  internalPages: InternalPage[];
  generating: boolean;
  domain?: string;
  projectId: string;
  imagesBusy?: boolean;
}) {
  const { mode } = useTheme();
  // A toolbar dropdown that inserts a markdown link to one of the site's real pages.
  const internalLink = commands.group([], {
    name: "internal-link",
    groupName: "internal-link",
    buttonProps: { "aria-label": "Insert internal link", title: "Insert a link to one of your pages" },
    icon: <Link2 style={{ width: 12, height: 12 }} />,
    children: ({ textApi, close }: { textApi?: commands.TextAreaTextApi; close: () => void }) => (
      <div className="w-72">
        <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Link to a page on your site</div>
        <div className="max-h-64 overflow-y-auto">
          {internalPages.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No crawled pages yet. Run a Site Audit to list your pages here.</div>
          ) : internalPages.map((p) => (
            <button
              key={p.url}
              type="button"
              onClick={() => { textApi?.replaceSelection(`[${p.title || p.url}](${p.url})`); close(); }}
              className="flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary"
            >
              <span className="line-clamp-1 text-sm text-foreground">{p.title || p.url}</span>
              <span className="line-clamp-1 text-[11px] text-muted-foreground"><Globe2 className="mr-1 inline h-3 w-3" />{p.url.replace(/^https?:\/\//, "")}</span>
            </button>
          ))}
        </div>
      </div>
    ),
  });

  // AI image generator — opens a rich panel to describe, generate, preview and insert.
  const aiImage = commands.group([], {
    name: "ai-image",
    groupName: "ai-image",
    buttonProps: { "aria-label": "Generate an image with AI", title: "Generate an image with AI" },
    icon: <ImagePlus style={{ width: 12, height: 12 }} />,
    children: ({ textApi, close }: { textApi?: commands.TextAreaTextApi; close: () => void }) => (
      <ImageGenPanel projectId={projectId} textApi={textApi} close={close} />
    ),
  });

  const toolbar = [
    commands.title2, commands.title3,
    commands.divider,
    commands.bold, commands.italic, commands.strikethrough,
    commands.divider,
    commands.unorderedListCommand, commands.orderedListCommand, commands.quote,
    commands.divider,
    commands.link, internalLink, aiImage,
  ];

  return (
    <div data-color-mode={mode === "dark" ? "dark" : "light"} className="blog-md-editor">
      <MDEditor
        value={value}
        onChange={(v) => onChange(v ?? "")}
        height={560}
        preview="live"
        visibleDragbar={false}
        commands={toolbar}
        components={{ preview: (source: string) => <BlogPreview text={source} vols={vols} domain={domain} imagesBusy={imagesBusy} /> }}
        textareaProps={{ placeholder: "Write or edit your blog in markdown…" }}
      />
    </div>
  );
}
