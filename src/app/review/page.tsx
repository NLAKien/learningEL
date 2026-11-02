"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Highlight } from "@/components/Highlight";
import { SpeakButton } from "@/components/SpeakButton";
import { formatInterval } from "@/lib/format";
import { speak } from "@/lib/speech";
import { isDue, review } from "@/lib/srs/sm2";
import { getCards, saveCard } from "@/lib/storage/local";
import type { Card, Grade } from "@/lib/types";

const GRADES: { grade: Grade; label: string; style: string }[] = [
  { grade: 0, label: "Quên", style: "bg-rose-600 hover:bg-rose-700" },
  { grade: 1, label: "Khó", style: "bg-amber-600 hover:bg-amber-700" },
  { grade: 2, label: "Được", style: "bg-emerald-700 hover:bg-emerald-800" },
  { grade: 3, label: "Dễ", style: "bg-sky-700 hover:bg-sky-800" },
];

export default function ReviewPage() {
  const [queue, setQueue] = useState<Card[] | null>(null);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    // localStorage chỉ có ở trình duyệt nên đọc trong useEffect
    const due = getCards()
      .filter((c) => isDue(c.srs))
      .sort((a, b) => a.srs.dueAt.localeCompare(b.srs.dueAt));
    setQueue(due);
    setTotal(due.length);
  }, []);

  const card = queue?.[0];

  const reveal = useCallback(() => {
    if (!card) return;
    setRevealed(true);
    speak(card.lemma, card.audioUrl);
  }, [card]);

  const grade = useCallback(
    (g: Grade) => {
      if (!card) return;
      const updated: Card = { ...card, srs: review(card.srs, g) };
      saveCard(updated);
      // Quên thì đưa thẻ xuống cuối hàng để ôn lại ngay trong phiên
      setQueue((q) => (q ? [...q.slice(1), ...(g === 0 ? [updated] : [])] : q));
      if (g !== 0) setDone((d) => d + 1);
      setRevealed(false);
    },
    [card],
  );

  // Phím tắt: Space/Enter = hiện đáp án, 1–4 = chấm điểm
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!revealed && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        reveal();
      } else if (revealed && ["1", "2", "3", "4"].includes(e.key)) {
        grade((Number(e.key) - 1) as Grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, reveal, grade]);

  if (queue === null) return null;

  if (!card) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="font-serif text-2xl font-semibold">
          {total > 0 ? "Xong phiên ôn hôm nay!" : "Chưa có thẻ nào cần ôn"}
        </p>
        <p className="text-stone-500">
          {total > 0 ? `Bạn vừa ôn ${done} thẻ. Quay lại vào ngày mai nhé.` : "Thêm từ mới từ một đoạn văn để bắt đầu."}
        </p>
        <Link href="/" className="inline-block rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white">
          Thêm từ mới
        </Link>
      </div>
    );
  }

  const progress = total ? Math.min(100, (done / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-stone-500">
          <span>
            Đã ôn {done}/{total}
          </span>
          <span>Còn {queue.length} thẻ</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full bg-emerald-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <span className="font-serif text-3xl font-semibold">{card.surface}</span>
          <SpeakButton word={card.surface} audioUrl={card.surface === card.lemma ? card.audioUrl : undefined} />
        </div>
        <p className="text-lg leading-relaxed text-stone-700">
          <Highlight sentence={card.context} word={card.surface} />
        </p>

        {revealed && (
          <div className="space-y-2 border-t border-stone-200 pt-5">
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-stone-500">
              <span className="font-medium text-stone-700">{card.lemma}</span>
              {card.phonetic && <span>{card.phonetic}</span>}
              {card.partOfSpeech && <span className="rounded bg-stone-100 px-1.5 text-xs">{card.partOfSpeech}</span>}
            </div>
            <p className="text-xl font-medium text-emerald-800">
              {card.meaning ?? <em className="text-base font-normal text-stone-400">Chưa có nghĩa — sửa trong “Thẻ của tôi”</em>}
            </p>
            {card.definitionEn && <p className="text-sm italic text-stone-500">{card.definitionEn}</p>}
          </div>
        )}
      </div>

      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {GRADES.map((g, i) => (
            <button
              key={g.grade}
              onClick={() => grade(g.grade)}
              className={`rounded-xl py-3 text-white ${g.style}`}
            >
              <div className="font-medium">{g.label}</div>
              <div className="text-xs opacity-80">
                {formatInterval(review(card.srs, g.grade).interval)} · {i + 1}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <button onClick={reveal} className="w-full rounded-xl bg-stone-900 py-3 font-medium text-white hover:bg-stone-700">
          Hiện đáp án <span className="text-sm opacity-60">(Space)</span>
        </button>
      )}
    </div>
  );
}
