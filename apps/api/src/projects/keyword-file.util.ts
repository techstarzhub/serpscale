// Extracts a clean keyword list from an uploaded file (CSV / Excel / Word / PDF)
// or a pasted text blob, for the "Import keywords → bulk analyse" feature.
// Parsing is done server-side so the browser never needs a PDF/DOCX worker and
// every format behaves consistently.
import * as XLSX from "xlsx";
import * as mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

const MAX_KEYWORDS = 300; // cap so a huge file can't blow the DataForSEO budget
const MAX_LEN = 80; // longer than this isn't a keyword (it's a sentence)
const HEADER_WORDS = new Set([
  "keyword", "keywords", "search volume", "volume", "term", "terms",
  "query", "queries", "cpc", "competition", "difficulty", "kd",
]);

// Normalise, drop headers/markers/dupes, and cap the list.
function cleanList(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    let s = (item || "").replace(/["“”'']/g, "").replace(/\s+/g, " ").trim();
    // strip a leading list marker / row index: "1." "2)" "- " "• "
    s = s.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim();
    if (!s) continue;
    const low = s.toLowerCase();
    if (low.length < 2 || low.length > MAX_LEN) continue;
    if (HEADER_WORDS.has(low)) continue;
    if (/^[\d.,%$€₹\s]+$/.test(s)) continue; // pure number/price cell
    if (seen.has(low)) continue;
    seen.add(low);
    out.push(s);
    if (out.length >= MAX_KEYWORDS) break;
  }
  return out;
}

// Split a text blob into candidate keyword cells. Handles newline lists and
// delimited rows (CSV/TSV): from a delimited row, take the first text cell
// (the keyword column), skipping numeric columns like volume/CPC.
function fromText(text: string): string[] {
  const cells: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[\t,;|]/);
    if (parts.length <= 1) { cells.push(line); continue; }
    const first = parts.find((p) => p.trim() && !/^[\d.,%$€₹]+$/.test(p.trim()));
    cells.push(first ?? parts[0]);
  }
  return cells;
}

/** Keywords from a pasted textarea (one per line, or comma/tab separated). */
export function extractKeywordsFromText(text: string): string[] {
  return cleanList(fromText(text || ""));
}

/** Keywords from an uploaded file, dispatched by extension / mime type. */
export async function extractKeywordsFromFile(file: {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
}): Promise<string[]> {
  const name = (file.originalname || "").toLowerCase();
  const mime = file.mimetype || "";

  // Excel — pull the first text cell of every row across all sheets.
  if (name.endsWith(".xlsx") || name.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("ms-excel")) {
    const wb = XLSX.read(file.buffer, { type: "buffer" });
    const rows: string[] = [];
    for (const sheetName of wb.SheetNames) {
      const json = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sheetName], { header: 1, blankrows: false });
      for (const row of json) {
        const cell = (row || [])
          .map((c) => (c == null ? "" : String(c)))
          .find((c) => c.trim() && !/^[\d.,%$€₹]+$/.test(c.trim()));
        if (cell) rows.push(cell);
      }
    }
    return cleanList(rows);
  }

  // Word — extract raw text, then treat like a line list.
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const r = await mammoth.extractRawText({ buffer: file.buffer });
    return cleanList(fromText(r.value || ""));
  }

  // PDF — extract text, then treat like a line list.
  if (name.endsWith(".pdf") || mime.includes("pdf")) {
    const parser = new PDFParse({ data: new Uint8Array(file.buffer) });
    const r = await parser.getText();
    return cleanList(fromText(r.text || ""));
  }

  // CSV / TSV / TXT / anything else — decode as UTF-8 text.
  return cleanList(fromText(file.buffer.toString("utf8")));
}
