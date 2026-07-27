import { detectContentQuality } from "./content-quality";

// A long, deliberately convoluted paragraph → very low Flesch score.
const HARD =
  "Notwithstanding the aforementioned considerations, the multifaceted implementation " +
  "necessitates comprehensive optimization methodologies whereby stakeholders " +
  "systematically operationalize interdependent infrastructural components throughout " +
  "heterogeneous organizational architectures, consequently precipitating substantial " +
  "ramifications across numerous interconnected operational dimensions simultaneously. ".repeat(4);

const EASY = "The cat sat on the mat. It was a warm day. The sun was out. Birds sang in the trees. ".repeat(20);

describe("detectContentQuality", () => {
  it("flags hard-to-read content on a real content page", () => {
    const codes = detectContentQuality({ bodyText: HARD, lang: "en", wordCount: 400 }).map((i) => i.code);
    expect(codes).toContain("poor-readability");
  });

  it("does not flag easy content", () => {
    const codes = detectContentQuality({ bodyText: EASY, lang: "en", wordCount: 400 }).map((i) => i.code);
    expect(codes).not.toContain("poor-readability");
  });

  it("skips readability on thin pages", () => {
    const codes = detectContentQuality({ bodyText: HARD, lang: "en", wordCount: 100 }).map((i) => i.code);
    expect(codes).not.toContain("poor-readability");
  });

  it("flags a language mismatch", () => {
    const spanish = "Hola mundo. Esta pagina esta escrita completamente en espanol para los usuarios. " +
      "Ofrecemos servicios de marketing digital y desarrollo web para empresas locales. ".repeat(8);
    const codes = detectContentQuality({ bodyText: spanish, lang: "en", wordCount: 250 }).map((i) => i.code);
    expect(codes).toContain("lang-mismatch");
  });

  it("does not flag when declared language matches", () => {
    const english = "This page is written entirely in English for our readers and customers. " +
      "We provide digital marketing and web development services for local businesses. ".repeat(8);
    const codes = detectContentQuality({ bodyText: english, lang: "en", wordCount: 250 }).map((i) => i.code);
    expect(codes).not.toContain("lang-mismatch");
  });
});
