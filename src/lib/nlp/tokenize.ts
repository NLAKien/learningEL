export interface Token {
  surface: string; // nguyên văn trong câu
  lower: string;
  sentence: string; // câu chứa token
  likelyProperNoun: boolean; // viết hoa giữa câu -> có thể là tên riêng
}

/** Tách câu đơn giản theo dấu . ! ? và xuống dòng. */
export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z"'“])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;

/** Bỏ đuôi rút gọn: "it's" -> "it", "they're" -> "they"; "don't" -> null (bỏ qua). */
function stripContraction(word: string): string | null {
  const w = word.replace(/’/g, "'");
  if (/n't$/i.test(w)) return null;
  return w.replace(/'(s|re|ll|ve|d|m)$/i, "");
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const sentence of splitSentences(text)) {
    let index = 0;
    for (const match of sentence.matchAll(WORD_RE)) {
      const cleaned = stripContraction(match[0]);
      const isFirst = index === 0;
      index++;
      if (!cleaned) continue;
      tokens.push({
        surface: cleaned,
        lower: cleaned.toLowerCase(),
        sentence,
        likelyProperNoun: !isFirst && /^[A-Z]/.test(cleaned),
      });
    }
  }
  return tokens;
}
