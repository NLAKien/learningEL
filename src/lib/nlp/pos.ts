/**
 * Chọn từ loại của một từ TRONG CÂU, dựa vào các từ đứng trước/sau (luật đơn giản, không cần AI).
 * Từ điển chỉ cho biết các từ loại CÓ THỂ (share: noun / verb); hàm này chọn cái hợp với câu:
 *   "She shares more"  -> verb      "a fair share of"  -> noun
 * Không chắc thì giữ thứ tự của từ điển. Muốn chính xác hơn nữa: dùng POS tagger (wink-nlp, spaCy) hoặc AI.
 */
import { stripContraction, WORD_RE } from "./tokenize";

const DETERMINERS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "some", "any", "no", "every", "each", "many", "much", "few", "several", "another", "other", "such",
  "whose", "which", "what", "both", "all", "either", "neither", "more", "most", "less", "fewer",
]);
const SUBJECTS = new Set(["i", "you", "he", "she", "it", "we", "they", "who", "which", "that"]);
const MODALS = new Set([
  "will", "would", "can", "could", "should", "shall", "may", "might", "must", "do", "does", "did",
  "to", "not", "never", "also", "often", "always", "usually", "sometimes", "just", "let", "lets",
  "please", "don't", "doesn't", "didn't", "won't", "can't", "cannot",
]);
const BE = new Set(["be", "is", "am", "are", "was", "were", "been", "being", "become", "becomes", "became", "seem", "seems", "look", "looks", "very", "so", "too", "quite", "really", "extremely", "rather"]);
const OBJECT_STARTS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "my", "your", "his", "her", "its", "our", "their",
  "me", "him", "us", "them", "it", "some", "any", "all",
]);
const PREPOSITIONS = new Set(["of", "in", "on", "for", "with", "by", "from", "at", "about", "into", "over", "under", "between", "through", "during", "against", "without", "within", "among"]);

/** "noun / verb" -> ["noun", "verb"] */
export function parsePosList(pos: string | undefined): string[] {
  return (pos ?? "").split("/").map((p) => p.trim()).filter(Boolean);
}

function words(sentence: string): string[] {
  return [...sentence.matchAll(WORD_RE)].map((m) => (stripContraction(m[0]) ?? m[0]).toLowerCase());
}

export function pickPartOfSpeech(options: string[], surface: string, sentence: string): string | undefined {
  if (options.length <= 1) return options[0];
  const has = (p: string) => options.includes(p);
  const w = words(sentence);
  const target = surface.toLowerCase();
  const i = w.indexOf(target);
  if (i === -1) return options[0];

  const prev = w[i - 1] ?? "";
  const prev2 = w[i - 2] ?? "";
  const next = w[i + 1] ?? "";
  const isFirst = i === 0;

  // Đuôi từ cho manh mối mạnh
  if (has("adverb") && target.endsWith("ly")) return "adverb";

  // Đứng sau mạo từ / từ hạn định / giới từ / sở hữu -> danh từ (hoặc tính từ nếu theo sau là danh từ)
  if (DETERMINERS.has(prev) || PREPOSITIONS.has(prev) || sentence.toLowerCase().includes(`'s ${target}`)) {
    if (has("adjective") && next && !PREPOSITIONS.has(next) && !BE.has(next) && /^[a-z]+$/.test(next)) {
      // "the associated risks", "a remarkable species": tính từ đứng trước danh từ
      if (!has("noun") || target.endsWith("ed") || target.endsWith("al") || target.endsWith("ous") || target.endsWith("ble") || target.endsWith("ive") || target.endsWith("ic")) return "adjective";
    }
    if (has("noun")) return "noun";
  }

  // Sau to/modal/trợ động từ/chủ ngữ -> động từ
  if (has("verb") && (MODALS.has(prev) || SUBJECTS.has(prev) || (MODALS.has(prev2) && prev === "not"))) {
    // "it is" không áp dụng: chủ ngữ + be + X xử lý ở dưới
    return "verb";
  }

  // Theo sau là "of": "an equal share of", "the scale of" -> danh từ
  if (has("noun") && next === "of") return "noun";

  // Sau be/become/very -> tính từ (hoặc động từ -ing/-ed: "is growing", "was postponed")
  if (BE.has(prev)) {
    if (has("verb") && /(ing|ed)$/.test(target)) return "verb";
    if (has("adjective")) return "adjective";
  }

  // Theo sau là tân ngữ: "assess the scale", "share it" -> động từ (trừ khi đứng sau mạo từ, đã xử lý ở trên)
  if (has("verb") && OBJECT_STARTS.has(next) && !isFirst) return "verb";

  // Đuôi -ed/-ing mà có nghĩa động từ
  if (has("verb") && /(ing|ed)$/.test(target) && !DETERMINERS.has(prev)) return "verb";

  // Danh từ số nhiều đứng cuối cụm: "the risks." / "and environmental risks"
  if (has("noun") && !has("verb")) return "noun";

  return options[0];
}

export interface DefinitionEntry {
  pos: string;
  text: string;
}

/** Chọn định nghĩa tiếng Anh khớp từ loại đã chọn; không có thì lấy định nghĩa đầu tiên. */
export function pickDefinition(defs: DefinitionEntry[] | undefined, pos: string | undefined): string | undefined {
  if (!defs?.length) return undefined;
  return (pos && defs.find((d) => d.pos === pos)?.text) || defs[0].text;
}
