import { NextResponse } from "next/server";
import { aiEnabled, translateSentencesAI } from "@/lib/lookup/ai";

const MAX_SENTENCES = 40;

/**
 * POST /api/translate
 * body: { sentences: string[] }
 * - Có ANTHROPIC_API_KEY: dịch bằng Claude, trả { ai: true, translations }.
 * - Chưa có: trả { ai: false } ngay; trình duyệt tự dịch bằng MyMemory
 *   (gọi thẳng từ máy người dùng để mỗi người dùng hạn mức miễn phí của riêng mình).
 */
export async function POST(req: Request) {
  if (!aiEnabled()) return NextResponse.json({ ai: false });

  let sentences: string[];
  try {
    const body = (await req.json()) as { sentences?: unknown[] };
    sentences = (body.sentences ?? []).filter((s): s is string => typeof s === "string").slice(0, MAX_SENTENCES);
  } catch {
    return NextResponse.json({ error: "Body không hợp lệ" }, { status: 400 });
  }

  const translations = await translateSentencesAI(sentences);
  if (!translations) return NextResponse.json({ ai: false });
  return NextResponse.json({ ai: true, translations });
}
