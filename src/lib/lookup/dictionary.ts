import type { DefinitionEntry } from "../nlp/pos";

/**
 * Chạy phía server. Tra phiên âm + từ loại + định nghĩa tiếng Anh
 * (Datamuse, dự phòng Free Dictionary API) và nghĩa tiếng Việt (MyMemory).
 * Tất cả miễn phí, không cần key.
 */
interface DictEntry {
  phonetic?: string;
  phonetics?: { text?: string; audio?: string }[];
  meanings?: { partOfSpeech?: string; definitions?: { definition?: string }[] }[];
}

const TIMEOUT_MS = 8000;

export interface DictionaryInfo {
  /** true = từ điển đã trả lời (có hoặc không có từ); false = lỗi, nên tra lại sau */
  found: boolean;
  phonetic?: string;
  audioUrl?: string;
  partOfSpeech?: string; // các từ loại có thể, "noun / verb"
  definitionEn?: string; // định nghĩa đầu tiên
  definitions?: DefinitionEntry[]; // định nghĩa đầu tiên của TỪNG từ loại, để chọn theo câu
}

/** Mỗi từ loại giữ một định nghĩa (cái đầu tiên) */
function onePerPos(defs: DefinitionEntry[]): DefinitionEntry[] {
  const seen = new Set<string>();
  return defs.filter((d) => d.text && !seen.has(d.pos) && seen.add(d.pos));
}

/** fetch có thử lại 1 lần nếu lỗi mạng / quá thời gian / server 5xx / 429 */
async function fetchWithRetry(url: string, label: string): Promise<Response | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.ok || res.status === 404) return res; // 404 = từ điển không có từ này
      console.warn(`[lookup] ${label} HTTP ${res.status} (lần ${attempt})`);
      if (res.status < 500 && res.status !== 429) return res;
    } catch (err) {
      console.warn(`[lookup] ${label} lỗi mạng (lần ${attempt}):`, err instanceof Error ? err.message : err);
    }
    if (attempt === 1) await new Promise((r) => setTimeout(r, 600));
  }
  return null;
}

async function lookupFreeDictionary(word: string): Promise<DictionaryInfo> {
  try {
    const res = await fetchWithRetry(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      `Từ điển "${word}"`,
    );
    if (!res) return { found: false };
    if (res.status === 404) return { found: true }; // từ điển không có từ này
    if (!res.ok) return { found: false };
    const data = (await res.json()) as DictEntry[];
    const entry = data[0];
    if (!entry) return { found: true };
    const phonetics = data.flatMap((e) => e.phonetics ?? []);
    const meanings = data.flatMap((e) => e.meanings ?? []);
    // Một từ thường có nhiều từ loại (hi: interjection, noun...) và thứ tự trong
    // Wiktionary KHÔNG theo độ phổ biến hay ngữ cảnh -> liệt kê hết thay vì đoán một.
    // Khi có AI, route sẽ dùng từ loại AI chọn theo câu thay cho danh sách này.
    const partsOfSpeech = [...new Set(meanings.map((m) => m.partOfSpeech).filter(Boolean))] as string[];
    return {
      found: true,
      phonetic: entry.phonetic ?? phonetics.find((p) => p.text)?.text,
      audioUrl: phonetics.find((p) => p.audio)?.audio || undefined,
      partOfSpeech: partsOfSpeech.join(" / ") || undefined,
      definitionEn: meanings[0]?.definitions?.[0]?.definition,
      definitions: onePerPos(
        meanings.map((m) => ({ pos: m.partOfSpeech ?? "", text: m.definitions?.[0]?.definition ?? "" })),
      ),
    };
  } catch (err) {
    console.warn(`[lookup] Không đọc được dữ liệu từ điển "${word}":`, err);
    return { found: false };
  }
}

const POS: Record<string, string> = { n: "noun", v: "verb", adj: "adjective", adv: "adverb", prop: "proper noun" };

interface DatamuseWord {
  word: string;
  tags?: string[];
  defs?: string[];
}

/** Datamuse: nhanh, ổn định, có IPA và định nghĩa gắn từ loại (dữ liệu từ Wiktionary/WordNet). */
async function lookupDatamuse(word: string): Promise<DictionaryInfo> {
  try {
    const res = await fetchWithRetry(
      `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=dpr&ipa=1&max=1`,
      `Datamuse "${word}"`,
    );
    if (!res?.ok) return { found: false };
    const data = (await res.json()) as DatamuseWord[];
    const entry = data[0];
    if (!entry || entry.word.toLowerCase() !== word.toLowerCase()) return { found: true };

    const tags = entry.tags ?? [];
    const ipa = tags.find((t) => t.startsWith("ipa_pron:"))?.slice("ipa_pron:".length).trim();
    // Từ loại: lấy theo thứ tự xuất hiện trong định nghĩa, sau đó tới tags
    const posKeys = [...(entry.defs ?? []).map((d) => d.split("\t")[0]), ...tags];
    const partsOfSpeech = [...new Set(posKeys.map((k) => POS[k]).filter(Boolean))];
    // Định nghĩa dạng "n\tThe word ... [giải thích thêm]" -> tách từ loại, bỏ phần trong []
    const definitions = onePerPos(
      (entry.defs ?? []).map((d) => {
        const [key, text = ""] = d.split("\t");
        return {
          pos: POS[key] ?? key,
          // bỏ "[giải thích thêm]" ở cuối và nhãn "(transitive)", "(obsolete)"… ở đầu
          text: text.replace(/\s*\[.*$/, "").replace(/^(\([^)]*\)\s*)+/, "").trim(),
        };
      }),
    );
    const def = definitions[0]?.text;

    return {
      found: true,
      phonetic: ipa ? `/${ipa}/` : undefined,
      partOfSpeech: partsOfSpeech.join(" / ") || undefined,
      definitionEn: def || undefined,
      definitions,
    };
  } catch (err) {
    console.warn(`[lookup] Không đọc được dữ liệu Datamuse "${word}":`, err);
    return { found: false };
  }
}

/** Datamuse trước; thiếu gì thì hỏi thêm Free Dictionary (có file audio phát âm). */
export async function lookupDictionary(word: string): Promise<DictionaryInfo> {
  const primary = await lookupDatamuse(word);
  if (primary.phonetic && primary.definitionEn) return primary;
  const backup = await lookupFreeDictionary(word);
  return {
    found: primary.found || backup.found,
    phonetic: primary.phonetic ?? backup.phonetic,
    partOfSpeech: primary.partOfSpeech ?? backup.partOfSpeech,
    definitionEn: primary.definitionEn ?? backup.definitionEn,
    definitions: primary.definitions?.length ? primary.definitions : backup.definitions,
    audioUrl: backup.audioUrl,
  };
}

interface MyMemoryResponse {
  responseData?: { translatedText?: string };
  matches?: { segment?: string; translation?: string; quality?: string | number; match?: number }[];
}

/** Bỏ dấu câu, gạch đầu dòng, "..." ở hai đầu; "Tình Cờ" -> "tình cờ" */
function clean(text: string): string {
  let t = text
    .replace(/\.{3}|…/g, "")
    .replace(/^[\s\-–—"'“”«»(]+|[\s.!?,;:"'“”»)]+$/g, "")
    .trim();
  const words = t.split(/\s+/);
  if (words.length > 1 && words.every((w) => /^\p{Lu}/u.test(w))) t = t.toLowerCase();
  return t;
}

/**
 * Bản dịch có đáng tin là tiếng Việt không? Kho MyMemory có cả bản "dịch" nhầm
 * vẫn là tiếng Anh (beyond -> "beyond imagination", chất lượng 74!).
 */
function looksVietnamese(text: string, source: string): boolean {
  if (!text || text.length > 40 || /["“”]/.test(text)) return false;
  if (new RegExp(`\\b${source}\\b`, "i").test(text)) return false; // còn chứa từ gốc
  return /[^\x00-\x7F]/.test(text); // nghĩa tiếng Việt gần như luôn có dấu
}

/**
 * Dịch từng từ sang tiếng Việt (không theo ngữ cảnh) — dùng khi chưa có AI.
 * MyMemory lấy cả câu thoại phim trong kho dữ liệu (serendipity -> 'Quán "Tình cờ"...'),
 * nên tự chọn lại trong các kết quả: đúng từ gốc, ngắn gọn, chất lượng cao nhất.
 */
export async function translateWord(word: string): Promise<string | undefined> {
  try {
    const res = await fetchWithRetry(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|vi`,
      `Dịch "${word}"`,
    );
    if (!res?.ok) return undefined;
    const data = (await res.json()) as MyMemoryResponse;
    const target = word.toLowerCase();

    const options = (data.matches ?? [])
      .filter((m) => m.segment && clean(m.segment).toLowerCase() === target && m.translation)
      .map((m) => ({
        text: clean(m.translation!),
        quality: Number(m.quality) || 0,
        match: m.match ?? 0,
        exact: m.segment!.trim().toLowerCase() === target, // đúng từ, không kèm dấu câu
      }))
      .filter((o) => looksVietnamese(o.text, target))
      .sort((a, b) => b.quality - a.quality || b.match - a.match);

    // Lấy bản tốt nhất; thêm bản thứ hai nếu khác nghĩa và cũng được chấm chất lượng khá
    const picked: string[] = [];
    for (const o of options) {
      if (picked.some((p) => p.toLowerCase() === o.text.toLowerCase())) continue;
      if (picked.length === 0 || (picked.length === 1 && o.exact && o.quality >= 50)) picked.push(o.text);
    }
    if (picked.length) return picked.join("; ");

    const fallback = clean(data.responseData?.translatedText ?? "");
    return looksVietnamese(fallback, target) ? fallback : undefined;
  } catch {
    return undefined;
  }
}
