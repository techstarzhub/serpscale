import fs from "node:fs";
import path from "node:path";

const cache = new Map<string, string>();

// The dashboard app URL — used for Login / Get Started links in static fragments.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.serpscale.com";

function read(file: string): string {
  // Cache only in production; in dev always re-read so content edits show live.
  if (process.env.NODE_ENV === "production" && cache.has(file)) return cache.get(file)!;
  let html = fs.readFileSync(path.join(process.cwd(), "src/content", file), "utf8");
  // Let fragments reference the app with {{APP_URL}} (e.g. login / signup links).
  html = html.replace(/\{\{APP_URL\}\}/g, APP_URL);
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
