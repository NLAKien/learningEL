/**
 * Chấm đáp án gõ tay khi ôn tập. Hàm thuần, không phụ thuộc giao diện.
 *
 * - Việt → Anh: so với từ gốc (lemma) và dạng trong câu (surface). Sai 1 ký tự = gần đúng.
 * - Anh → Việt: nghĩa tiếng Việt có nhiều cách nói nên chỉ chấm được tương đối:
 *   tách nghĩa đúng thành các ý ("quy mô; tỉ lệ"), khớp một ý là đúng, gõ không dấu là gần đúng.
 *   Kết quả chỉ là GỢI Ý, người học vẫn tự chấm lại được.
 */
import type { Grade } from "../types";

export type Verdict = "correct" | "close" | "wrong";

export interface CheckResult {
  verdict: Verdict;
  suggested: Grade;
}

/** Chữ thường, chuẩn Unicode, bỏ dấu câu, gộp khoảng trắng */
export function normalize(s: string): string {
  return s
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bỏ dấu tiếng Việt: "quy mô" -> "quy mo", "đường" -> "duong" */
export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Khoảng cách Levenshtein (số lần thêm/xoá/sửa ký tự) */
export function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** Số lỗi gõ chấp nhận được, tuỳ độ dài từ */
function typoAllowance(len: number): number {
  return len <= 5 ? 0 : len <= 9 ? 1 : 2;
}

/** Tách nghĩa thành các ý: "quy mô; tỉ lệ (bản đồ), thang đo" -> ["quy mô", "tỉ lệ bản đồ", "tỉ lệ", "thang đo"] */
export function meaningParts(meaning: string): string[] {
  const parts = new Set<string>();
  for (const raw of meaning.split(/[;,/]|\bhoặc\b/)) {
    const full = normalize(raw);
    if (full) parts.add(full);
    const noParen = normalize(raw.replace(/\([^)]*\)/g, " "));
    if (noParen) parts.add(noParen);
  }
  return [...parts];
}

/** Có chứa nguyên cụm từ (theo ranh giới từ) không */
function containsPhrase(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `);
}

function suggest(verdict: Verdict, usedHint: boolean): Grade {
  if (verdict === "wrong") return 0;
  if (verdict === "close" || usedHint) return 1;
  return 2;
}

/** Việt → Anh: người học gõ từ tiếng Anh */
export function checkEnglish(input: string, accepted: string[], usedHint = false): CheckResult {
  const answer = normalize(input);
  const targets = accepted.map(normalize).filter(Boolean);
  let verdict: Verdict = "wrong";
  if (answer && targets.includes(answer)) verdict = "correct";
  else if (answer && targets.some((t) => editDistance(answer, t) <= typoAllowance(t.length))) verdict = "close";
  return { verdict, suggested: suggest(verdict, usedHint) };
}

/** Anh → Việt: người học gõ nghĩa tiếng Việt */
export function checkVietnamese(input: string, meaning: string | undefined, usedHint = false): CheckResult {
  const answer = normalize(input);
  if (!answer || !meaning) return { verdict: "wrong", suggested: 0 };

  const parts = meaningParts(meaning);
  const matches = (a: string, p: string) =>
    a === p ||
    containsPhrase(a, p) || // gõ dài hơn nhưng có chứa đúng ý: "sự quy mô lớn" ⊃ "quy mô"
    (containsPhrase(p, a) && a.length * 2 >= p.length); // gõ thiếu chút: "hoãn" cho "hoãn lại"

  let verdict: Verdict = "wrong";
  if (parts.some((p) => matches(answer, p))) {
    verdict = "correct";
  } else {
    const plain = stripDiacritics(answer);
    const plainParts = parts.map(stripDiacritics);
    if (
      plainParts.some((p) => matches(plain, p)) || // gõ không dấu / sai dấu
      parts.some((p) => editDistance(answer, p) <= typoAllowance(p.length)) // gõ nhầm 1–2 ký tự
    ) {
      verdict = "close";
    }
  }
  return { verdict, suggested: suggest(verdict, usedHint) };
}

/** Gợi ý cho Việt → Anh: "s _ _ _ e" (chữ đầu và chữ cuối) */
export function letterHint(word: string): string {
  const w = word.trim();
  if (w.length <= 2) return w[0] + " _".repeat(Math.max(0, w.length - 1));
  return [w[0], ...Array(w.length - 2).fill("_"), w[w.length - 1]].join(" ");
}
