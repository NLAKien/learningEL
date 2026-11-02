import { describe, expect, it } from "vitest";
import { extractCandidates } from "./extract";
import { lemmatize } from "./lemmatize";
import { splitSentences } from "./tokenize";

describe("lemmatize", () => {
  it.each([
    ["running", "run"],
    ["stopped", "stop"],
    ["making", "make"],
    ["studies", "study"],
    ["went", "go"],
    ["children", "child"],
    ["boxes", "box"],
    ["analysis", "analysis"],
    ["species", "species"],
    ["postponed", "postpone"],
    ["yes", "yes"],
    ["nothing", "nothing"],
    ["researchers", "researcher"],
    ["after", "after"],
    ["really", "really"],
    // Giới hạn của luật đơn giản -> lý do nên thay bằng thư viện lemmatizer:
    ["hypotheses", "hypothese"],
  ])("%s -> %s", (input, expected) => {
    expect(lemmatize(input)).toBe(expected);
  });
});

describe("splitSentences", () => {
  it("tách theo dấu câu", () => {
    expect(splitSentences("I ran. She smiled! Did it work?")).toEqual([
      "I ran.",
      "She smiled!",
      "Did it work?",
    ]);
  });
});

describe("extractCandidates", () => {
  it("dán 1–3 từ thì không lọc", () => {
    expect(extractCandidates("hello world").map((c) => c.lemma)).toEqual(["hello", "world"]);
  });

  const text =
    "The committee postponed the meeting. Researchers remain skeptical, " +
    "and the committee will reconvene in Saigon next week.";
  // Cố định ngưỡng để test không phụ thuộc trình độ mặc định
  const opts = { knownRankThreshold: 1000 };

  it("bỏ từ thông dụng, giữ từ khó kèm câu gốc", () => {
    const words = extractCandidates(text, opts).map((c) => c.lemma);
    expect(words).toContain("skeptical");
    expect(words).toContain("researcher");
    expect(words).toContain("reconvene");
    expect(words).not.toContain("the");
    expect(words).not.toContain("week");
  });

  it("gộp từ lặp lại và đếm số lần", () => {
    const c = extractCandidates(text, opts).find((x) => x.lemma === "committee");
    expect(c?.count).toBe(2);
    expect(c?.context).toBe("The committee postponed the meeting.");
  });

  it("bỏ tên riêng viết hoa giữa câu", () => {
    expect(extractCandidates(text, opts).map((c) => c.lemma)).not.toContain("saigon");
  });

  it("bỏ từ người dùng đã đánh dấu biết", () => {
    const words = extractCandidates(text, { ...opts, knownWords: new Set(["skeptical"]) });
    expect(words.map((c) => c.lemma)).not.toContain("skeptical");
  });
});
