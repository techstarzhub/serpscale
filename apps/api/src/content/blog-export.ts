// Convert a blog draft (our lightweight markdown) into clean, self-contained
// HTML — used both for the PDF (via Playwright) and the Word (.doc) export.

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Inline markdown → HTML on already-escaped text: links, bold, italic.
function inline(text: string): string {
  let t = esc(text);
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, url) => `<a href="${url}">${label}</a>`);
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return t;
}

const CSS = `
  body{font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#18181b;line-height:1.65;max-width:760px;margin:0 auto;padding:28px;}
  h1{font-size:28px;line-height:1.25;margin:0 0 10px;font-weight:700;}
  h2{font-size:21px;margin:26px 0 8px;font-weight:600;}
  h3{font-size:16px;margin:20px 0 6px;font-weight:600;}
  p{margin:0 0 12px;}
  ul{margin:0 0 12px 22px;padding:0;} li{margin:0 0 4px;}
  a{color:#2563eb;text-decoration:underline;}
  figure{margin:18px 0;text-align:center;} img{max-width:100%;height:auto;border-radius:8px;}
  figcaption{color:#71717a;font-size:12px;margin-top:6px;}
  .meta{color:#52525b;font-size:13px;border-left:3px solid #e4e4e7;padding:6px 12px;margin:0 0 18px;background:#fafafa;}
`;

export function blogToHtml(markdown: string, title: string): string {
  const clean = markdown.replace(/\r/g, "");
  const metaDesc = clean.match(/^\s*meta description:\s*(.+)$/im)?.[1]?.trim();
  const body = clean
    .replace(/^\s*meta title:\s*.+$/im, "")
    .replace(/^\s*meta description:\s*.+$/im, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const parts: string[] = [];
  for (const block of body.split(/\n{2,}/).filter((b) => b.trim())) {
    const lines = block.split("\n");
    const first = lines[0] ?? "";
    const img = first.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (img) { parts.push(`<figure><img src="${img[2]}" alt="${esc(img[1])}"/>${img[1] ? `<figcaption>${esc(img[1])}</figcaption>` : ""}</figure>`); continue; }
    if (/^#\s+/.test(first)) { parts.push(`<h1>${inline(first.replace(/^#\s+/, ""))}</h1>`); continue; }
    if (/^##\s+/.test(first) && !/^###/.test(first)) { parts.push(`<h2>${inline(first.replace(/^##\s+/, ""))}</h2>`); continue; }
    if (/^###\s+/.test(first)) { parts.push(`<h3>${inline(first.replace(/^###\s+/, ""))}</h3>`); continue; }
    if (lines.every((l) => /^\s*([-*•]|\d+\.)\s+/.test(l))) {
      parts.push(`<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*([-*•]|\d+\.)\s+/, ""))}</li>`).join("")}</ul>`);
      continue;
    }
    parts.push(`<p>${lines.map((l) => inline(l)).join("<br/>")}</p>`);
  }

  const meta = metaDesc ? `<p class="meta"><strong>Meta description:</strong> ${esc(metaDesc)}</p>` : "";
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${esc(title || "Blog")}</title><style>${CSS}</style></head><body>${meta}${parts.join("\n")}</body></html>`;
}
