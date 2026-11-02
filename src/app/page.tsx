"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Highlight } from "@/components/Highlight";
import { SpeakButton } from "@/components/SpeakButton";
import { lookupWords } from "@/lib/lookup/client";
import { LEVELS, type Level } from "@/lib/nlp/data/common-words";
import { extractCandidates } from "@/lib/nlp/extract";
import { addCards, addKnownWords, getKnownWords, getLevel, setLevel } from "@/lib/storage/local";
import type { LookupResult, WordCandidate } from "@/lib/types";

export default function AddWordsPage() {
  const [text, setText] = useState("");
  const [level, setLevelState] = useState<Level>("B1");
  const [candidates, setCandidates] = useState<WordCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lookups, setLookups] = useState<Map<string, LookupResult>>(new Map());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [aiOn, setAiOn] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ text: string; link?: boolean } | null>(null);

  useEffect(() => setLevelState(getLevel()), []);

  function changeLevel(lv: Level) {
    setLevelState(lv);
    setLevel(lv);
  }

  async function handleExtract() {
    const found = extractCandidates(text, {
      knownWords: getKnownWords(),
      knownRankThreshold: LEVELS[level].threshold,
    });
    setCandidates(found);
    setSelected(new Set(found.map((c) => c.lemma)));
    setLookups(new Map());
    setEdits({});
    setMessage(found.length ? null : { text: "Không tìm thấy từ mới nào ở trình độ này." });
    if (!found.length) return;

    setLoading(true);
    const { ai } = await lookupWords(
      found.map((c) => ({ lemma: c.lemma, surface: c.surface, context: c.context })),
      (partial) => setLookups(partial),
    );
    if (ai !== null) setAiOn(ai);
    setLoading(false);
  }

  function toggle(lemma: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lemma)) next.delete(lemma);
      else next.add(lemma);
      return next;
    });
  }

  function handleSave() {
    const toLearn = candidates.filter((c) => selected.has(c.lemma));
    const known = candidates.filter((c) => !selected.has(c.lemma)).map((c) => c.lemma);
    const added = addCards(
      toLearn.map((c) => ({ candidate: c, lookup: lookups.get(c.lemma), meaning: edits[c.lemma] })),
    );
    addKnownWords(known); // từ bỏ chọn = đã biết, lần sau không hiện nữa
    setCandidates([]);
    setText("");
    setMessage({
      text: `Đã tạo ${added} thẻ mới${known.length ? `, ghi nhớ ${known.length} từ bạn đã biết` : ""}.`,
      link: added > 0,
    });
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Dán một đoạn tiếng Anh</h1>
            <p className="text-sm text-stone-500">
              Bài báo, email, lời thoại phim… hoặc chỉ 1–3 từ bạn muốn học.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            Trình độ
            <select
              value={level}
              onChange={(e) => changeLevel(e.target.value as Level)}
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5"
            >
              {Object.entries(LEVELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) handleExtract();
          }}
          rows={7}
          placeholder="Paste English text here…"
          className="w-full rounded-xl border border-stone-300 bg-white p-4 leading-relaxed shadow-sm focus:border-stone-500 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleExtract}
            disabled={!text.trim() || loading}
            className="rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            Lọc từ mới
          </button>
          <span className="text-xs text-stone-400">Ctrl + Enter</span>
        </div>
        {message && (
          <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            {message.text}{" "}
            {message.link && (
              <Link href="/review" className="font-medium underline">
                Ôn ngay →
              </Link>
            )}
          </p>
        )}
      </section>

      {candidates.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-stone-600">
              <b>{candidates.length}</b> từ có thể mới. Bỏ chọn từ bạn đã biết — app sẽ nhớ.
            </p>
            <div className="flex gap-2 text-sm">
              <button onClick={() => setSelected(new Set(candidates.map((c) => c.lemma)))} className="text-stone-600 underline">
                Chọn hết
              </button>
              <button onClick={() => setSelected(new Set())} className="text-stone-600 underline">
                Bỏ hết
              </button>
            </div>
          </div>

          {aiOn === false && (
            <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Nghĩa đang được dịch từng từ, chưa theo ngữ cảnh. Thêm <code>ANTHROPIC_API_KEY</code> vào{" "}
              <code>.env.local</code> để dịch đúng nghĩa trong câu (xem README).
            </p>
          )}

          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            {candidates.map((c) => {
              const info = lookups.get(c.lemma);
              const isSelected = selected.has(c.lemma);
              return (
                <li
                  key={c.lemma}
                  className={`flex gap-3 p-4 transition ${isSelected ? "" : "bg-stone-50 opacity-60"}`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(c.lemma)}
                    className="mt-1.5 h-4 w-4 accent-emerald-700"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="text-lg font-semibold">{c.lemma}</span>
                      {info?.phonetic && <span className="text-sm text-stone-500">{info.phonetic}</span>}
                      {info?.partOfSpeech && (
                        <span className="rounded bg-stone-100 px-1.5 text-xs text-stone-600">{info.partOfSpeech}</span>
                      )}
                      {c.count > 1 && <span className="text-xs text-stone-400">×{c.count}</span>}
                      <SpeakButton word={c.lemma} audioUrl={info?.audioUrl} />
                    </div>
                    <input
                      value={edits[c.lemma] ?? info?.meaning ?? ""}
                      onChange={(e) => setEdits((prev) => ({ ...prev, [c.lemma]: e.target.value }))}
                      placeholder={info ? "Không tra được — tự nhập nghĩa" : "Đang tra nghĩa…"}
                      className="w-full rounded-md border border-transparent bg-stone-50 px-2 py-1 text-stone-800 hover:border-stone-200 focus:border-stone-400 focus:bg-white focus:outline-none"
                    />
                    <p className="text-sm leading-relaxed text-stone-500">
                      <Highlight sentence={c.context} word={c.surface} />
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={selected.size === 0}
              className="rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
            >
              Tạo {selected.size} thẻ
            </button>
            {loading && <span className="text-sm text-stone-500">Đang tra nghĩa… (có thể lưu trước, nghĩa sẽ thiếu)</span>}
          </div>
        </section>
      )}
    </div>
  );
}
