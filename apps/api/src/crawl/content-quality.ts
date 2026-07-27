// Content-quality checks:
//   - readability → Flesch reading-ease (computed inline; no ESM-only deps)
//   - language    → does the content match the declared <html lang>? (languagedetect)
// Both are advisory (notice-level) and conservative to avoid false positives.
import LanguageDetect from "languagedetect";
import type { Issue } from "./crawler";

const detector = new LanguageDetect();
detector.setLanguageType("iso2"); // return ISO-639-1 codes ("en") to match <html lang>

// English syllable heuristic (the classic text-statistics approach): count vowel
// groups, drop common silent endings. Good enough for a readability signal.
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return groups ? groups.length : 1;
}

// Flesch Reading Ease: 206.835 − 1.015·(words/sentence) − 84.6·(syllables/word).
// Higher = easier. <30 is "very difficult".
export function fleschReadingEase(text: string): number | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 20) return null;
  const sentences = Math.max(1, (text.match(/[.!?]+/g) || []).length);
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  return 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
}

export function detectContentQuality(ctx: { bodyText: string; lang: string | null; wordCount: number }): Issue[] {
  const out: Issue[] = [];

  // ---- Readability (only on real content pages) ----
  if (ctx.wordCount >= 300 && ctx.bodyText) {
    const score = fleschReadingEase(ctx.bodyText);
    if (score != null && Number.isFinite(score) && score < 30) {
      out.push({
        code: "poor-readability",
        severity: "notice",
        category: "content",
        message: `Content is hard to read (Flesch ${Math.round(score)}/100) — shorter sentences help users and AI answer engines`,
      });
    }
  }

  // ---- Declared language vs actual content language ----
  if (ctx.lang && ctx.wordCount >= 200 && ctx.bodyText) {
    try {
      const declared = ctx.lang.trim().toLowerCase().split("-")[0];
      const detected = detector.detect(ctx.bodyText, 1) as [string, number][];
      if (declared && detected.length && detected[0][1] > 0.35) {
        const top = String(detected[0][0]).toLowerCase();
        if (top && top !== declared) {
          out.push({
            code: "lang-mismatch",
            severity: "notice",
            category: "technical",
            message: `Declared language "${declared}" but the content reads as "${top}" — set the correct <html lang>`,
          });
        }
      }
    } catch { /* ignore */ }
  }

  return out;
}
