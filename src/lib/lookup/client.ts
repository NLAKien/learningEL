/** Gọi /api/lookup từ trình duyệt, chia nhỏ theo lô và có cache trong localStorage. */
import type { LookupRequestItem, LookupResult } from "../types";

const BATCH = 25;
// Đổi hậu tố version khi thay cách tra nghĩa, để bỏ kết quả cũ đã cache
const CACHE_KEY = "learningEL.lookupCache.v4";

function readCache(): Record<string, LookupResult> {
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, LookupResult>) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* bỏ qua */
  }
}

const keyOf = (it: LookupRequestItem) => `${it.lemma}|${it.context}`;

/**
 * Tra nghĩa cho danh sách từ. `onPartial` được gọi mỗi khi xong một lô,
 * để giao diện hiện dần kết quả thay vì chờ hết.
 */
export interface LookupOutcome {
  results: Map<string, LookupResult>;
  /** true = server đang dùng AI dịch theo ngữ cảnh; null = không gọi server (toàn cache) */
  ai: boolean | null;
}

export async function lookupWords(
  items: LookupRequestItem[],
  onPartial?: (results: Map<string, LookupResult>) => void,
): Promise<LookupOutcome> {
  let ai: boolean | null = null;
  const cache = readCache();
  const out = new Map<string, LookupResult>();
  const todo: LookupRequestItem[] = [];

  for (const it of items) {
    const hit = cache[keyOf(it)];
    if (hit) out.set(it.lemma, hit);
    else todo.push(it);
  }
  if (out.size) onPartial?.(new Map(out));

  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    try {
      const res = await fetch("/api/lookup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: chunk }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { results: LookupResult[]; ai: boolean };
      ai = data.ai;
      data.results.forEach((r, j) => {
        out.set(chunk[j].lemma, r);
        if (r.complete) cache[keyOf(chunk[j])] = r; // kết quả thiếu thì không cache
      });
    } catch (err) {
      console.error("Tra nghĩa thất bại", err);
      chunk.forEach((it) => out.set(it.lemma, { lemma: it.lemma, source: "none" }));
    }
    writeCache(cache);
    onPartial?.(new Map(out));
  }
  return { results: out, ai };
}
