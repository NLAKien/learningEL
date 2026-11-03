"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Highlight } from "@/components/Highlight";
import { SentenceView, type WordState } from "@/components/SentenceView";
import { SpeakButton } from "@/components/SpeakButton";
import { lookupWords } from "@/lib/lookup/client";
import { resolveWordInfo } from "@/lib/lookup/resolve";
import { translateSentences } from "@/lib/lookup/translate-client";
import { frequencyRank, LEVELS, type Level } from "@/lib/nlp/data/common-words";
import { extractCandidates } from "@/lib/nlp/extract";
import { lemmatize } from "@/lib/nlp/lemmatize";
import { splitSentences, tokenize } from "@/lib/nlp/tokenize";
import {
  addCards,
  addKnownWords,
  getCards,
  getKnownWords,
  getLevel,
  removeKnownWord,
  setLevel,
} from "@/lib/storage/local";
import type { LookupResult, WordCandidate } from "@/lib/types";

/** undefined = đang dịch, null = không dịch được */
type Translation = string | null | undefined;

export default function AddWordsPage() {
  const [text, setText] = useState("");
  const [level, setLevelState] = useState<Level>("B1");
  const [stage, setStage] = useState<"input" | "result">("input");

  const [sentences, setSentences] = useState<string[]>([]);
  const [translations, setTranslations] = useState<Translation[]>([]);

  const [candidates, setCandidates] = useState<WordCandidate[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lookups, setLookups] = useState<Map<string, LookupResult>>(new Map());
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [owned, setOwned] = useState<Set<string>>(new Set()); // lemma đã có thẻ
  const [ownedInText, setOwnedInText] = useState<string[]>([]); // các từ đã có thẻ xuất hiện trong đoạn văn
  const [loading, setLoading] = useState(0); // số lượt tra nghĩa đang chạy
  const [message, setMessage] = useState<{ text: string; link?: boolean } | null>(null);
  const runId = useRef(0); // bỏ kết quả của lần bấm cũ nếu người dùng bấm lại

  useEffect(() => setLevelState(getLevel()), []);

  function changeLevel(lv: Level) {
    setLevelState(lv);
    setLevel(lv);
  }

  /** Tra nghĩa và gộp dần vào bảng kết quả */
  async function lookup(list: WordCandidate[], id: number) {
    setLoading((n) => n + 1);
    await lookupWords(
      list.map((c) => ({ lemma: c.lemma, surface: c.surface, context: c.context })),
      (partial) => {
        if (runId.current === id) setLookups((prev) => new Map([...prev, ...partial]));
      },
    );
    setLoading((n) => n - 1);
  }

  function handleProcess() {
    const id = ++runId.current;
    const sents = splitSentences(text);
    // Từ đã có thẻ không đề xuất lại (giống từ "đã biết")
    const ownedLemmas = new Set(getCards().map((c) => c.lemma));
    const found = extractCandidates(text, {
      knownWords: new Set([...getKnownWords(), ...ownedLemmas]),
      knownRankThreshold: LEVELS[level].threshold,
    });
    const inText = [...new Set(tokenize(text).map((t) => lemmatize(t.lower)))].filter((l) => ownedLemmas.has(l));

    setOwned(ownedLemmas);
    setOwnedInText(inText);
    setSentences(sents);
    setTranslations(sents.map(() => undefined));
    setCandidates(found);
    setSelected(new Set(found.map((c) => c.lemma)));
    setLookups(new Map());
    setEdits({});
    setMessage(null);
    setStage("result");
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Dịch câu và tra nghĩa từ chạy song song
    translateSentences(sents, (i, t) => {
      if (runId.current !== id) return;
      setTranslations((prev) => prev.map((old, j) => (j === i ? (t ?? null) : old)));
    });
    if (found.length) lookup(found, id);
  }

  function toggle(lemma: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lemma)) next.delete(lemma);
      else next.add(lemma);
      return next;
    });
  }

  /** Bấm vào một từ trong câu: từ đã có trong danh sách thì bật/tắt, chưa có thì thêm */
  function handleWordClick({ lemma, surface, sentence }: { lemma: string; surface: string; sentence: string }) {
    if (owned.has(lemma)) return; // đã có thẻ
    if (candidates.some((c) => c.lemma === lemma)) {
      toggle(lemma);
      return;
    }
    const added: WordCandidate = { lemma, surface, context: sentence, frequencyRank: frequencyRank(lemma), count: 1 };
    setCandidates((prev) => [...prev, added]);
    setSelected((prev) => new Set(prev).add(lemma));
    lookup([added], runId.current);
  }

  function wordState(lemma: string): WordState {
    if (owned.has(lemma)) return "owned";
    if (selected.has(lemma)) return "selected";
    if (candidates.some((c) => c.lemma === lemma)) return "unselected";
    return "none";
  }

  function handleSave() {
    const toLearn = candidates.filter((c) => selected.has(c.lemma));
    const known = candidates.filter((c) => !selected.has(c.lemma)).map((c) => c.lemma);
    const added = addCards(
      toLearn.map((c) => ({
        candidate: c,
        lookup: lookups.get(c.lemma),
        meaning: edits[c.lemma],
        contextVi: translations[sentences.indexOf(c.context)] ?? undefined,
      })),
    );
    toLearn.forEach((c) => removeKnownWord(c.lemma)); // từng đánh dấu "đã biết" nhưng giờ muốn học lại
    addKnownWords(known); // từ bỏ chọn = đã biết, lần sau không hiện nữa
    runId.current++;
    setStage("input");
    setCandidates([]);
    setText("");
    setMessage({
      text: `Đã tạo ${added} thẻ mới${known.length ? `, ghi nhớ ${known.length} từ bạn đã biết` : ""}.`,
      link: added > 0,
    });
  }

  // ---------------- Bước 1: dán đoạn văn ----------------
  if (stage === "input") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold">Dán một đoạn tiếng Anh</h1>
            <p className="text-sm text-stone-500">
              Bài báo, email, lời thoại phim… App sẽ dịch từng câu rồi tách từ mới cho bạn.
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
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && text.trim()) handleProcess();
          }}
          rows={8}
          placeholder="Paste English text here…"
          className="w-full rounded-xl border border-stone-300 bg-white p-4 leading-relaxed shadow-sm focus:border-stone-500 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={handleProcess}
            disabled={!text.trim()}
            className="rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700 disabled:opacity-40"
          >
            Dịch & tách từ
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
      </div>
    );
  }

  // ---------------- Bước 2: bản dịch + danh sách từ ----------------
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-serif text-2xl font-semibold">Bản dịch</h1>
          <button
            onClick={() => {
              runId.current++;
              setStage("input");
            }}
            className="text-sm text-stone-600 underline"
          >
            ← Sửa / dán đoạn khác
          </button>
        </div>
        <div className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white px-5 shadow-sm">
          {sentences.map((s, i) => (
            <SentenceView
              key={i}
              sentence={s}
              translation={translations[i]}
              wordState={wordState}
              onWordClick={handleWordClick}
            />
          ))}
        </div>
        <p className="text-xs text-stone-500">
          <span className="rounded bg-amber-200/80 px-1 font-semibold text-stone-900">Từ tô vàng</span> sẽ được tạo
          thẻ.{" "}
          {ownedInText.length > 0 && (
            <>
              <span className="text-emerald-800 underline decoration-emerald-600/50 decoration-2 underline-offset-2">
                Từ gạch xanh
              </span>{" "}
              đã có thẻ.{" "}
            </>
          )}
          Bấm vào bất kỳ từ nào khác trong câu để thêm hoặc bỏ.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-xl font-semibold">
            Từ mới <span className="text-base font-normal text-stone-500">({selected.size}/{candidates.length} đã chọn)</span>
          </h2>
          {candidates.length > 0 && (
            <div className="flex gap-2 text-sm">
              <button onClick={() => setSelected(new Set(candidates.map((c) => c.lemma)))} className="text-stone-600 underline">
                Chọn hết
              </button>
              <button onClick={() => setSelected(new Set())} className="text-stone-600 underline">
                Bỏ hết
              </button>
            </div>
          )}
        </div>

        {ownedInText.length > 0 && (
          <p className="text-sm text-stone-500">
            Đã bỏ qua {ownedInText.length} từ bạn đã có thẻ: {ownedInText.slice(0, 8).join(", ")}
            {ownedInText.length > 8 ? "…" : ""}
          </p>
        )}

        {candidates.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
            Không có từ mới ở trình độ {LEVELS[level].label}. Bấm vào một từ trong câu ở trên để tự thêm.
          </p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            {candidates.map((c) => {
              const info = lookups.get(c.lemma);
              const pos = resolveWordInfo(info, c.surface, c.context).partOfSpeech;
              const isSelected = selected.has(c.lemma);
              return (
                <li key={c.lemma} className={`flex gap-3 p-4 transition ${isSelected ? "" : "bg-stone-50 opacity-60"}`}>
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
                      {pos && <span className="rounded bg-stone-100 px-1.5 text-xs text-stone-600">{pos}</span>}
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
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={selected.size === 0}
            className="rounded-lg bg-emerald-700 px-5 py-2.5 font-medium text-white hover:bg-emerald-800 disabled:opacity-40"
          >
            Tạo {selected.size} thẻ
          </button>
          {loading > 0 && <span className="text-sm text-stone-500">Đang tra nghĩa…</span>}
        </div>
      </section>
    </div>
  );
}
