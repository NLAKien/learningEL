import { frequencyRank } from "./data/common-words";

/**
 * Lemmatizer dựa trên luật — đủ cho bản chạy thử.
 * TODO (nâng cấp): thay bằng `wink-lemmatizer` (chạy trên trình duyệt)
 * hoặc spaCy (service Python) để chính xác hơn.
 */
const IRREGULAR: Record<string, string> = {
  am: "be", is: "be", are: "be", was: "be", were: "be", been: "be", being: "be",
  has: "have", had: "have", having: "have", does: "do", did: "do", done: "do",
  went: "go", gone: "go", made: "make", said: "say", got: "get", gotten: "get",
  took: "take", taken: "take", came: "come", saw: "see", seen: "see", knew: "know",
  known: "know", thought: "think", told: "tell", found: "find", gave: "give",
  given: "give", felt: "feel", left: "leave", kept: "keep", began: "begin",
  begun: "begin", brought: "bring", wrote: "write", written: "write", stood: "stand",
  lost: "lose", paid: "pay", met: "meet", led: "lead", ran: "run", spoke: "speak",
  spoken: "speak", read: "read", grew: "grow", grown: "grow", won: "win",
  bought: "buy", sent: "send", built: "build", fell: "fall", fallen: "fall",
  sold: "sell", taught: "teach", caught: "catch", children: "child", men: "man",
  women: "woman", people: "people", feet: "foot", teeth: "tooth", mice: "mouse",
  better: "good", best: "good", worse: "bad", worst: "bad",
  // từ có đuôi giống số nhiều nhưng không phải
  species: "species", series: "series", news: "news", always: "always",
};

/**
 * Sinh các dạng gốc có thể. `regular` = biến đổi ngữ pháp chắc chắn (số nhiều, -ed, -ing);
 * còn lại (-er, -est, -ly) dễ nhầm hơn (after -> aft) nên cần kiểm tra chặt hơn.
 */
function candidates(w: string): { form: string; regular: boolean }[] {
  const out: { form: string; regular: boolean }[] = [];
  const push = (form: string, regular = true) => form.length >= 3 && out.push({ form, regular });

  if (w.endsWith("ies")) push(w.slice(0, -3) + "y");
  if (w.endsWith("ied")) push(w.slice(0, -3) + "y");
  if (w.endsWith("ves")) { push(w.slice(0, -3) + "f"); push(w.slice(0, -3) + "fe"); }
  if (/(s|x|z|ch|sh)es$/.test(w)) push(w.slice(0, -2));
  if (w.endsWith("s") && !/(ss|us|is)$/.test(w)) push(w.slice(0, -1));

  for (const suf of ["ing", "ed"]) {
    if (!w.endsWith(suf)) continue;
    const stem = w.slice(0, -suf.length);
    if (/([bcdfghjklmnpqrstvwz])\1$/.test(stem)) push(stem.slice(0, -1)); // stopped -> stop
    push(stem + "e"); // making -> make, used -> use
    push(stem); // walked -> walk
  }
  if (w.endsWith("er")) push(w.slice(0, -2), false); // faster -> fast
  if (w.endsWith("est")) push(w.slice(0, -3), false);
  if (w.endsWith("ly")) push(w.slice(0, -2), false); // quickly -> quick
  return out;
}

export function lemmatize(word: string): string {
  const w = word.toLowerCase();
  if (IRREGULAR[w]) return IRREGULAR[w];

  const ownRank = frequencyRank(w);
  for (const { form, regular } of candidates(w)) {
    const candRank = frequencyRank(form);
    if (candRank === null) continue;
    // Từ chưa có trong danh sách, hoặc biến đổi ngữ pháp chắc chắn -> nhận dạng gốc.
    // Biến đổi dễ nhầm (-er/-est/-ly) -> chỉ nhận khi dạng gốc phổ biến hơn (after -/-> aft).
    if (ownRank === null || (regular && form.length >= 4) || candRank < ownRank) return form;
  }
  if (ownRank !== null) return w;

  // Không xác minh được: chỉ áp dụng các luật an toàn nhất
  if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
  if (/(ss|us|is)$/.test(w)) return w;
  if (/(x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);
  if (w.endsWith("s") && w.length > 3) return w.slice(0, -1);
  return w;
}
