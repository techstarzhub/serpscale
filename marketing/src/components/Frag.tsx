import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

function read(file: string): string {
  // Cache only in production; in dev always re-read so content edits show live.
  if (process.env.NODE_ENV === "production" && cache.has(file)) return cache.get(file)!;
  const html = fs.readFileSync(path.join(process.cwd(), "src/content", file), "utf8");
  cache.set(file, html);
  return html;
}

/**
 * Renders a static HTML fragment (from src/content) as server-rendered markup.
 * Keeps the original template's exact classes/behavior while letting us edit
 * copy as plain HTML — and the output is real HTML in the page (SEO-friendly).
 */
export function Frag({ file }: { file: string }) {
  return <div dangerouslySetInnerHTML={{ __html: read(file) }} />;
}
