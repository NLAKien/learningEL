/**
 * Chạy phía server. Tra phiên âm + định nghĩa tiếng Anh (Free Dictionary API)
 * và nghĩa tiếng Việt dự phòng (MyMemory) — cả hai miễn phí, không cần key.
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
  partOfSpeech?: string;
  definitionEn?: string;
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

export async function lookupDictionary(word: string): Promise<DictionaryInfo> {
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
    };
  } catch (err) {
    console.warn(`[lookup] Không đọc được dữ liệu từ điển "${word}":`, err);
    return { found: false };
  }
}

/** Dịch từng từ sang tiếng Việt (không theo ngữ cảnh) — dùng khi chưa có AI. */
export async function translateWord(word: string): Promise<string | undefined> {
  try {
    const res = await fetchWithRetry(
      `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|vi`,
      `Dịch "${word}"`,
    );
    if (!res?.ok) return undefined;
    const data = (await res.json()) as { responseData?: { translatedText?: string } };
    const text = data.responseData?.translatedText?.trim();
    // MyMemory trả lại nguyên từ khi không dịch được
    if (!text || text.toLowerCase() === word.toLowerCase()) return undefined;
    return text;
  } catch {
    return undefined;
  }
}
