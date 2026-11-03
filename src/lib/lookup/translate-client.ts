/**
 * Dịch cả câu, chạy trên trình duyệt.
 * Hỏi /api/translate trước (dùng AI nếu server có key); không có thì gọi thẳng MyMemory.
 */
const CACHE_KEY = "learningEL.sentenceCache.v1";
const MAX_CHARS = 450; // MyMemory nhận tối đa 500 byte mỗi lần
const CONCURRENCY = 3;

function readCache(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, string>) {
  try {
    // Giữ tối đa 500 câu gần nhất
    const entries = Object.entries(cache).slice(-500);
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* bỏ qua */
  }
}

/** Cắt câu quá dài thành các đoạn <= MAX_CHARS, ưu tiên cắt ở dấu phẩy / chấm phẩy. */
function chunk(sentence: string): string[] {
  if (sentence.length <= MAX_CHARS) return [sentence];
  const parts: string[] = [];
  let current = "";
  for (const piece of sentence.split(/(?<=[,;:])\s+|\s+/)) {
    if ((current + " " + piece).trim().length > MAX_CHARS && current) {
      parts.push(current.trim());
      current = piece;
    } else {
      current = `${current} ${piece}`;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

async function myMemory(text: string): Promise<string | undefined> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(
        `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|vi`,
        { signal: AbortSignal.timeout(10000) },
      );
      const data = (await res.json()) as {
        responseStatus?: number | string;
        quotaFinished?: boolean;
        responseData?: { translatedText?: string };
      };
      if (data.quotaFinished) {
        console.warn("[translate] MyMemory: đã hết hạn mức miễn phí hôm nay");
        return undefined;
      }
      const out = data.responseData?.translatedText?.trim();
      if (Number(data.responseStatus) === 200 && out) return out;
    } catch (err) {
      console.warn(`[translate] MyMemory lỗi (lần ${attempt})`, err);
    }
  }
  return undefined;
}

async function translateOne(sentence: string): Promise<string | undefined> {
  const parts = await Promise.all(chunk(sentence).map(myMemory));
  return parts.every(Boolean) ? parts.join(" ") : undefined;
}

/**
 * Dịch danh sách câu. `onPartial(index, text)` được gọi mỗi khi xong một câu
 * (text = undefined nghĩa là không dịch được câu đó).
 */
export async function translateSentences(
  sentences: string[],
  onPartial: (index: number, text: string | undefined) => void,
): Promise<void> {
  const cache = readCache();
  const todo: number[] = [];
  sentences.forEach((s, i) => {
    if (cache[s]) onPartial(i, cache[s]);
    else todo.push(i);
  });
  if (!todo.length) return;

  // 1. Server có AI không?
  try {
    const res = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentences: todo.map((i) => sentences[i]) }),
    });
    const data = (await res.json()) as { ai: boolean; translations?: string[] };
    if (data.ai && data.translations) {
      todo.forEach((i, j) => {
        const t = data.translations![j];
        if (t) cache[sentences[i]] = t;
        onPartial(i, t || undefined);
      });
      writeCache(cache);
      return;
    }
  } catch {
    /* rơi xuống MyMemory */
  }

  // 2. MyMemory, chạy song song vài câu một lúc
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const i = todo[next++];
      const t = await translateOne(sentences[i]);
      if (t) cache[sentences[i]] = t;
      onPartial(i, t);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  writeCache(cache);
}
