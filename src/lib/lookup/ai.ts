/**
 * Chạy phía server. Dịch nghĩa tiếng Việt THEO NGỮ CẢNH bằng Claude API.
 * Chỉ bật khi có ANTHROPIC_API_KEY trong .env.local (key không bao giờ lộ ra trình duyệt).
 */
import type { LookupRequestItem } from "../types";

export interface AiMeaning {
  lemma: string;
  meaning: string;
  partOfSpeech?: string;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export async function translateInContext(items: LookupRequestItem[]): Promise<Map<string, AiMeaning>> {
  const result = new Map<string, AiMeaning>();
  if (!aiEnabled() || items.length === 0) return result;

  const list = items
    .map((it, i) => `${i + 1}. word: "${it.surface}" (base form: "${it.lemma}")\n   sentence: "${it.context}"`)
    .join("\n");

  const prompt = `You help Vietnamese learners of English. For each word below, give its meaning in Vietnamese as used in that sentence.

${list}

Reply with ONLY a JSON array, one object per word, in the same order:
[{"lemma": "<base form as given>", "meaning": "<short Vietnamese meaning in this context, max 8 words>", "partOfSpeech": "<noun|verb|adjective|adverb|phrase|...>"}]`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 60 * items.length + 200,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      console.error("[lookup] Claude API lỗi", res.status, await res.text());
      return result;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const json = text.slice(text.indexOf("["), text.lastIndexOf("]") + 1);
    const parsed = JSON.parse(json) as AiMeaning[];
    parsed.forEach((m, i) => {
      const lemma = items[i]?.lemma ?? m.lemma;
      if (m?.meaning) result.set(lemma, { ...m, lemma });
    });
  } catch (err) {
    console.error("[lookup] Không đọc được phản hồi AI", err);
  }
  return result;
}

/** Dịch cả câu sang tiếng Việt bằng Claude. Trả null nếu chưa bật AI hoặc lỗi. */
export async function translateSentencesAI(sentences: string[]): Promise<string[] | null> {
  if (!aiEnabled() || sentences.length === 0) return null;
  const list = sentences.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const prompt = `Translate each English sentence below into natural Vietnamese.

${list}

Reply with ONLY a JSON array of strings, one translation per sentence, in the same order.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200 * sentences.length + 200,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) {
      console.error("[translate] Claude API lỗi", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((c) => c.type === "text")?.text ?? "";
    const parsed = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1)) as unknown[];
    if (!Array.isArray(parsed) || parsed.length !== sentences.length) return null;
    return parsed.map((t) => String(t ?? ""));
  } catch (err) {
    console.error("[translate] Không đọc được phản hồi AI", err);
    return null;
  }
}
