import type { WordCandidate } from "../types";
import { DEFAULT_LEVEL, frequencyRank, LEVELS } from "./data/common-words";
import { lemmatize } from "./lemmatize";
import { tokenize } from "./tokenize";

export interface ExtractOptions {
  /** Từ có rank <= ngưỡng này coi như người dùng đã biết. Mặc định: trình độ B1. */
  knownRankThreshold?: number;
  /** Các lemma người dùng đã đánh dấu "đã biết". */
  knownWords?: Set<string>;
  /** Bỏ qua từ ngắn hơn số ký tự này. */
  minLength?: number;
  /** Bỏ qua từ viết hoa giữa câu (có thể là tên riêng). */
  skipProperNouns?: boolean;
}

export function extractCandidates(text: string, opts: ExtractOptions = {}): WordCandidate[] {
  const {
    knownRankThreshold = LEVELS[DEFAULT_LEVEL].threshold,
    knownWords = new Set<string>(),
    minLength = 3,
    skipProperNouns = true,
  } = opts;

  const byLemma = new Map<string, WordCandidate>();
  const tokens = tokenize(text);

  // Dán 1–3 từ: người dùng chủ động muốn học đúng những từ đó -> không lọc
  if (tokens.length <= 3) {
    for (const tok of tokens) {
      const lemma = lemmatize(tok.lower);
      if (byLemma.has(lemma)) continue;
      byLemma.set(lemma, {
        lemma,
        surface: tok.surface,
        context: tok.sentence,
        frequencyRank: frequencyRank(lemma),
        count: 1,
      });
    }
    return [...byLemma.values()];
  }

  for (const tok of tokens) {
    if (tok.lower.length < minLength) continue;
    if (skipProperNouns && tok.likelyProperNoun) continue;

    const lemma = lemmatize(tok.lower);
    // Danh sách tần suất có cả dạng biến thể -> lấy rank tốt hơn giữa dạng gốc và dạng gặp
    const ranks = [frequencyRank(lemma), frequencyRank(tok.lower)].filter((r): r is number => r !== null);
    const rank = ranks.length ? Math.min(...ranks) : null;
    if (rank !== null && rank <= knownRankThreshold) continue;
    if (knownWords.has(lemma)) continue;

    const existing = byLemma.get(lemma);
    if (existing) {
      existing.count++;
    } else {
      byLemma.set(lemma, {
        lemma,
        surface: tok.surface,
        context: tok.sentence,
        frequencyRank: rank,
        count: 1,
      });
    }
  }

  // Từ xuất hiện nhiều lần lên trước
  return [...byLemma.values()].sort((a, b) => b.count - a.count);
}
