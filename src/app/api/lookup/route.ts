import { NextResponse } from "next/server";
import { aiEnabled, translateInContext } from "@/lib/lookup/ai";
import { lookupDictionary, translateWord } from "@/lib/lookup/dictionary";
import type { LookupRequestItem, LookupResult } from "@/lib/types";

const MAX_ITEMS = 30;

// Cache đơn giản trong bộ nhớ server: "lemma|câu" -> kết quả (mất khi tắt server)
const cache = new Map<string, LookupResult>();
const keyOf = (it: LookupRequestItem) => `${it.lemma}|${it.context}`;

/**
 * POST /api/lookup
 * body:    { items: { lemma, surface, context }[] }   (tối đa 30 từ mỗi lần)
 * trả về: { results: LookupResult[], ai: boolean }
 */
export async function POST(req: Request) {
  let items: LookupRequestItem[];
  try {
    const body = (await req.json()) as { items?: LookupRequestItem[] };
    items = (body.items ?? [])
      .filter((it) => it && typeof it.lemma === "string" && typeof it.context === "string")
      .slice(0, MAX_ITEMS);
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const fresh = new Map<string, LookupResult>();
  const missing = items.filter((it) => !cache.has(keyOf(it)));

  if (missing.length) {
    const [aiMeanings, dictInfos] = await Promise.all([
      translateInContext(missing), // trả Map rỗng nếu chưa cấu hình AI
      Promise.all(missing.map((it) => lookupDictionary(it.lemma))),
    ]);

    await Promise.all(
      missing.map(async (it, i) => {
        const dict = dictInfos[i];
        const ai = aiMeanings.get(it.lemma);
        const meaning = ai?.meaning ?? (await translateWord(it.lemma));
        const result: LookupResult = {
          lemma: it.lemma,
          meaning,
          phonetic: dict.phonetic,
          audioUrl: dict.audioUrl,
          partOfSpeech: ai?.partOfSpeech ?? dict.partOfSpeech,
          definitionEn: dict.definitionEn,
          definitions: dict.definitions,
          source: ai ? "ai" : meaning || dict.definitionEn ? "dictionary" : "none",
          // dict.found = từ điển đã trả lời (kể cả "không có từ này")
          complete: Boolean(meaning) && dict.found,
        };
        fresh.set(keyOf(it), result);
        // Chỉ cache kết quả đầy đủ; thiếu do lỗi mạng thì lần sau tra lại
        if (result.complete) cache.set(keyOf(it), result);
      }),
    );
  }

  const results: LookupResult[] = items.map(
    (it) => cache.get(keyOf(it)) ?? fresh.get(keyOf(it)) ?? { lemma: it.lemma, source: "none" },
  );
  return NextResponse.json({ results, ai: aiEnabled() });
}
