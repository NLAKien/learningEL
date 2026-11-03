"use client";

import { lemmatize } from "@/lib/nlp/lemmatize";
import { stripContraction, WORD_RE } from "@/lib/nlp/tokenize";

export type WordState = "selected" | "unselected" | "owned" | "none";

interface Props {
  sentence: string;
  translation?: string | null; // undefined = đang dịch, null = không dịch được
  wordState: (lemma: string) => WordState;
  onWordClick: (info: { lemma: string; surface: string; sentence: string }) => void;
}

/**
 * Một câu song ngữ: tiếng Anh (bấm được từng từ) và bản dịch tiếng Việt bên dưới.
 * Từ đang chọn học: nền vàng. Từ mới đã bỏ chọn: gạch chân chấm.
 * Từ đã có thẻ: chữ xanh gạch chân. Từ khác: bấm để thêm.
 */
export function SentenceView({ sentence, translation, wordState, onWordClick }: Props) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of sentence.matchAll(WORD_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push(sentence.slice(last, start));
    const raw = m[0];
    const cleaned = stripContraction(raw);
    if (!cleaned) {
      parts.push(raw);
    } else {
      const lemma = lemmatize(cleaned.toLowerCase());
      const state = wordState(lemma);
      parts.push(
        <button
          key={start}
          type="button"
          onClick={() => onWordClick({ lemma, surface: cleaned, sentence })}
          disabled={state === "owned"}
          title={
            state === "owned"
              ? "Đã có trong thẻ của bạn"
              : state === "selected"
                ? "Bấm để bỏ khỏi danh sách học"
                : "Bấm để thêm vào danh sách học"
          }
          className={
            state === "owned"
              ? "cursor-default rounded px-0.5 text-emerald-800 underline decoration-emerald-600/50 decoration-2 underline-offset-4"
              : state === "selected"
              ? "rounded bg-amber-200/80 px-0.5 font-semibold text-stone-900 hover:bg-amber-300"
              : state === "unselected"
                ? "rounded px-0.5 underline decoration-stone-400 decoration-dotted underline-offset-4 hover:bg-stone-100"
                : "rounded px-0.5 hover:bg-emerald-50 hover:text-emerald-800"
          }
        >
          {raw}
        </button>,
      );
    }
    last = start + raw.length;
  }
  if (last < sentence.length) parts.push(sentence.slice(last));

  return (
    <div className="space-y-1 py-3">
      <p className="text-lg leading-relaxed text-stone-900">{parts}</p>
      {translation === undefined ? (
        <p className="h-5 w-2/3 animate-pulse rounded bg-stone-100" aria-label="Đang dịch" />
      ) : translation === null ? (
        <p className="text-sm italic text-stone-400">Không dịch được câu này.</p>
      ) : (
        <p className="leading-relaxed text-emerald-900/80">{translation}</p>
      )}
    </div>
  );
}
