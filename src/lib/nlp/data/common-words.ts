/**
 * Danh sách 15.000 từ tiếng Anh phổ biến nhất, xếp theo tần suất
 * (nguồn: hermitdave/FrequencyWords, dựa trên phụ đề OpenSubtitles 2018).
 * Danh sách chứa cả dạng biến thể (went, studies...), vị trí trong mảng + 1 = rank.
 */
import FREQUENCY from "./frequency.json";

export const COMMON_WORDS: string[] = FREQUENCY as string[];

const RANK = new Map<string, number>();
COMMON_WORDS.forEach((w, i) => {
  if (!RANK.has(w)) RANK.set(w, i + 1);
});

export function frequencyRank(word: string): number | null {
  return RANK.get(word) ?? null;
}

export function isCommonWord(word: string): boolean {
  return RANK.has(word);
}

/** Ngưỡng "đã biết" ước lượng theo trình độ: từ có rank <= ngưỡng bị lọc bỏ. */
export const LEVELS = {
  A2: { label: "A2 – Sơ cấp", threshold: 1500 },
  B1: { label: "B1 – Trung cấp", threshold: 3000 },
  B2: { label: "B2 – Trung cao cấp", threshold: 5000 },
  C1: { label: "C1 – Cao cấp", threshold: 8000 },
  C2: { label: "C2 – Thành thạo", threshold: 12000 },
} as const;

export type Level = keyof typeof LEVELS;
export const DEFAULT_LEVEL: Level = "B1";
