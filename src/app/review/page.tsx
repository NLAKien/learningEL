"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Highlight } from "@/components/Highlight";
import { SpeakButton } from "@/components/SpeakButton";
import { formatInterval } from "@/lib/format";
import { type CheckResult, checkEnglish, checkVietnamese, letterHint } from "@/lib/review/answer";
import {
  canReview,
  dueCards,
  MODES,
  PRACTICE_KINDS,
  type PracticeKind,
  practiceCards,
  type ReviewMode,
  srsFor,
  withSrs,
} from "@/lib/review/mode";
import { speak } from "@/lib/speech";
import { review } from "@/lib/srs/sm2";
import { groupDecks } from "@/lib/review/decks";
import { getCards, getReviewMode, markCardKnown, restoreCard, saveCard, setReviewMode } from "@/lib/storage/local";
import type { Card, Grade } from "@/lib/types";

const GRADES: { grade: Grade; label: string; style: string; ring: string }[] = [
  { grade: 0, label: "Quên", style: "bg-rose-600 hover:bg-rose-700", ring: "ring-rose-300" },
  { grade: 1, label: "Khó", style: "bg-amber-600 hover:bg-amber-700", ring: "ring-amber-300" },
  { grade: 2, label: "Được", style: "bg-emerald-700 hover:bg-emerald-800", ring: "ring-emerald-300" },
  { grade: 3, label: "Dễ", style: "bg-sky-700 hover:bg-sky-800", ring: "ring-sky-300" },
];

/** Kết quả sau khi kiểm tra; verdict null = không chấm tự động được (thẻ chưa có nghĩa) */
interface Outcome {
  answer: string;
  gaveUp: boolean;
  check: CheckResult | null;
}

/** Câu ví dụ có từ cần đoán bị che: "full-_____ invasion" */
function blankWord(sentence: string, word: string) {
  return sentence.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), (m) =>
    "_".repeat(m.length),
  );
}

export default function ReviewPage() {
  const [mode, setMode] = useState<ReviewMode>("en-vi");
  const [allCards, setAllCards] = useState<Card[] | null>(null);
  const [queue, setQueue] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(0);
  const [correct, setCorrect] = useState(0);

  const [input, setInput] = useState("");
  const [hint, setHint] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Luyện thêm: ôn lại ngay thẻ chưa đến hạn, KHÔNG lưu vào lịch SM-2
  const [practice, setPractice] = useState<PracticeKind | null>(null);
  const [deck, setDeck] = useState<number | null>(null); // null = tất cả các bộ
  const [knownNotice, setKnownNotice] = useState<Card | null>(null); // thẻ vừa chuyển sang "đã biết"
  const inputRef = useRef<HTMLInputElement>(null);

  const startSession = useCallback((m: ReviewMode, d: number | null) => {
    const cards = getCards();
    const due = dueCards(cards, m).filter((c) => d === null || c.deck === d);
    setAllCards(cards);
    setQueue(due);
    setTotal(due.length);
    setDone(0);
    setCorrect(0);
    setInput("");
    setHint(false);
    setOutcome(null);
    setPractice(null);
  }, []);

  function startPractice(kind: PracticeKind) {
    const cards = getCards();
    const list = practiceCards(cards, mode, kind).filter((c) => deck === null || c.deck === deck);
    setAllCards(cards);
    setQueue(list);
    setTotal(list.length);
    setDone(0);
    setCorrect(0);
    setInput("");
    setHint(false);
    setOutcome(null);
    setPractice(kind);
  }

  // localStorage chỉ có ở trình duyệt nên đọc trong useEffect
  useEffect(() => {
    const m = getReviewMode();
    // /review?deck=3 (từ nút "Học bộ này" ở trang Thẻ của tôi)
    const fromUrl = Number(new URLSearchParams(window.location.search).get("deck"));
    const d = Number.isInteger(fromUrl) && fromUrl > 0 ? fromUrl : null;
    setMode(m);
    setDeck(d);
    startSession(m, d);
  }, [startSession]);

  function changeMode(m: ReviewMode) {
    if (m === mode) return;
    setMode(m);
    setReviewMode(m);
    startSession(m, deck);
  }

  function changeDeck(d: number | null) {
    setDeck(d);
    window.history.replaceState(null, "", d === null ? "/review" : `/review?deck=${d}`);
    startSession(mode, d);
  }

  function markKnown() {
    if (!card) return;
    markCardKnown(card.id);
    setKnownNotice(card);
    setQueue((q) => q.filter((c) => c.id !== card.id));
    setTotal((t) => Math.max(0, t - 1));
    setAllCards(getCards());
    setInput("");
    setHint(false);
    setOutcome(null);
  }

  function undoKnown() {
    if (!knownNotice) return;
    restoreCard(knownNotice);
    setQueue((q) => [knownNotice, ...q]);
    setTotal((t) => t + 1);
    setAllCards(getCards());
    setKnownNotice(null);
  }

  const decks = useMemo(() => groupDecks(allCards ?? []), [allCards]);
  const dueCount = useMemo(() => {
    const cards = (allCards ?? []).filter((c) => deck === null || c.deck === deck);
    return { "en-vi": dueCards(cards, "en-vi").length, "vi-en": dueCards(cards, "vi-en").length };
  }, [allCards, deck]);
  const practiceCount = useMemo(() => {
    const cards = (allCards ?? []).filter((c) => deck === null || c.deck === deck);
    return Object.fromEntries(PRACTICE_KINDS.map((k) => [k.id, practiceCards(cards, mode, k.id).length])) as Record<
      PracticeKind,
      number
    >;
  }, [allCards, mode, deck]);
  const noMeaning = useMemo(() => (allCards ?? []).filter((c) => !canReview(c, "vi-en")).length, [allCards]);

  const card = queue[0];

  function submit(gaveUp = false) {
    if (!card || outcome) return;
    const answer = gaveUp ? "" : input.trim();
    let check: CheckResult | null;
    if (gaveUp) check = { verdict: "wrong", suggested: 0 };
    else if (mode === "vi-en") check = checkEnglish(answer, [card.lemma, card.surface], hint);
    else check = card.meaning ? checkVietnamese(answer, card.meaning, hint) : null;
    setOutcome({ answer, gaveUp, check });
    speak(card.lemma, card.audioUrl);
  }

  const grade = useCallback(
    (g: Grade) => {
      if (!card || !outcome) return;
      const updated = withSrs(card, mode, review(srsFor(card, mode), g));
      saveCard(updated);
      if (outcome.check?.verdict === "correct") setCorrect((n) => n + 1);
      // Quên thì đưa thẻ xuống cuối hàng để ôn lại ngay trong phiên
      setQueue((q) => [...q.slice(1), ...(g === 0 ? [updated] : [])]);
      if (g !== 0) setDone((d) => d + 1);
      setInput("");
      setHint(false);
      setOutcome(null);
    },
    [card, mode, outcome],
  );

  /** Luyện thêm: nhớ rồi -> bỏ khỏi lượt; chưa nhớ -> quay lại cuối hàng. Không đụng tới lịch ôn. */
  const practiceNext = useCallback(
    (remembered: boolean) => {
      if (!card || !outcome) return;
      if (outcome.check?.verdict === "correct") setCorrect((n) => n + 1);
      setQueue((q) => [...q.slice(1), ...(remembered ? [] : [card])]);
      if (remembered) setDone((d) => d + 1);
      setInput("");
      setHint(false);
      setOutcome(null);
    },
    [card, outcome],
  );

  // Phím tắt ở bước chấm điểm: Enter = nhận mức gợi ý, 1–4 = chọn mức
  // (Luyện thêm: Enter = theo kết quả, 1 = Chưa nhớ, 2 = Nhớ rồi)
  useEffect(() => {
    if (!outcome) return;
    function onKey(e: KeyboardEvent) {
      // Bỏ qua phím Enter vừa bấm trong ô trả lời (nó dùng để Kiểm tra, không phải để chấm)
      // và phím bấm trên một nút (nút tự xử lý), tránh chấm 2 lần.
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
      if (practice) {
        if (e.key === "Enter") {
          e.preventDefault();
          practiceNext(outcome?.check?.verdict === "correct");
        } else if (e.key === "1" || e.key === "2") {
          practiceNext(e.key === "2");
        }
        return;
      }
      if (e.key === "Enter" && outcome?.check) {
        e.preventDefault();
        grade(outcome.check.suggested);
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        grade((Number(e.key) - 1) as Grade);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [outcome, grade, practice, practiceNext]);

  // Đưa con trỏ vào ô nhập mỗi khi sang thẻ mới
  useEffect(() => {
    if (!outcome) inputRef.current?.focus();
  }, [card, outcome]);

  if (allCards === null) return null;

  const modeSwitcher = (
    <div className="flex rounded-full bg-stone-200 p-1 text-sm">
      {MODES.map((m) => (
        <button
          key={m.id}
          onClick={() => changeMode(m.id)}
          title={m.hint}
          className={`flex-1 rounded-full px-4 py-1.5 transition ${
            mode === m.id ? "bg-white font-medium text-stone-900 shadow-sm" : "text-stone-600 hover:text-stone-900"
          }`}
        >
          {m.label}
          {dueCount[m.id] > 0 && <span className="ml-1.5 text-xs text-emerald-700">{dueCount[m.id]}</span>}
        </button>
      ))}
    </div>
  );

  const deckPicker =
    decks.length > 1 ? (
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-sm">
        {[{ id: null as number | null, label: "Tất cả", size: allCards.length }, ...decks.map((d) => ({ id: d.id as number | null, label: `Bộ ${d.id}`, size: d.cards.length }))].map(
          (d) => {
            const due = dueCards(d.id === null ? allCards : allCards.filter((c) => c.deck === d.id), mode).length;
            const active = deck === d.id;
            return (
              <button
                key={d.label}
                onClick={() => changeDeck(d.id)}
                title={`${d.size} thẻ, ${due} thẻ đến hạn`}
                className={`shrink-0 rounded-full border px-3 py-1 ${
                  active ? "border-stone-900 bg-stone-900 text-white" : "border-stone-300 bg-white text-stone-700 hover:border-stone-500"
                }`}
              >
                {d.label}
                <span className={`ml-1.5 text-xs ${active ? "text-white/70" : due ? "text-emerald-700" : "text-stone-400"}`}>
                  {due ? due : "✓"}
                </span>
              </button>
            );
          },
        )}
      </div>
    ) : null;

  const knownBanner = knownNotice && (
    <div className="flex items-center justify-between rounded-xl bg-stone-100 px-4 py-2 text-sm text-stone-700">
      <span>
        Đã chuyển <b>{knownNotice.lemma}</b> sang Từ đã biết.
      </span>
      <button onClick={undoKnown} className="underline">
        Hoàn tác
      </button>
    </div>
  );

  const practicePicker = (
    <div className="space-y-2 text-left">
      <p className="text-sm font-medium text-stone-700">Luyện thêm ngay (không ảnh hưởng lịch ôn)</p>
      <div className="grid gap-2 sm:grid-cols-3">
        {PRACTICE_KINDS.map((k) => (
          <button
            key={k.id}
            onClick={() => startPractice(k.id)}
            disabled={practiceCount[k.id] === 0}
            title={k.hint}
            className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-left hover:border-stone-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div className="text-sm font-medium">{k.id === "all" && deck !== null ? `Học cả Bộ ${deck}` : k.label}</div>
            <div className="text-xs text-stone-500">{practiceCount[k.id]} thẻ</div>
          </button>
        ))}
      </div>
    </div>
  );

  // ---------- Hết thẻ ----------
  if (!card) {
    const other = MODES.find((m) => m.id !== mode)!;
    return (
      <div className="mx-auto max-w-xl space-y-8">
        {modeSwitcher}
        {deckPicker}
        {knownBanner}
        <div className="space-y-4 py-10 text-center">
          <p className="font-serif text-2xl font-semibold">
            {practice
              ? total > 0
                ? "Xong lượt luyện thêm!"
                : "Không có thẻ nào để luyện"
              : total > 0
                ? "Xong phiên ôn!"
                : deck !== null
                  ? `Bộ ${deck} không còn thẻ cần ôn ở chế độ này`
                  : "Chưa có thẻ nào cần ôn ở chế độ này"}
          </p>
          {total > 0 && (
            <p className="text-stone-500">
              {practice ? "Luyện" : "Ôn"} {done} thẻ, trả lời đúng ngay {correct} lần.
            </p>
          )}
          {mode === "vi-en" && noMeaning > 0 && (
            <p className="text-sm text-stone-500">
              {noMeaning} thẻ chưa có nghĩa tiếng Việt nên chưa ôn được chiều này —{" "}
              <Link href="/cards" className="underline">
                bổ sung nghĩa
              </Link>
              .
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            {practice && dueCount[mode] > 0 && (
              <button
                onClick={() => startSession(mode, deck)}
                className="rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700"
              >
                Ôn thẻ đến hạn ({dueCount[mode]})
              </button>
            )}
            {dueCount[other.id] > 0 && (
              <button
                onClick={() => changeMode(other.id)}
                className="rounded-lg bg-stone-900 px-5 py-2.5 font-medium text-white hover:bg-stone-700"
              >
                Ôn tiếp {other.label} ({dueCount[other.id]})
              </button>
            )}
            <Link href="/" className="rounded-lg border border-stone-300 bg-white px-5 py-2.5 font-medium hover:bg-stone-100">
              Thêm từ mới
            </Link>
          </div>
        </div>
        {practicePicker}
      </div>
    );
  }

  const progress = total ? Math.min(100, (done / total) * 100) : 0;
  const verdict = outcome?.check?.verdict;

  return (
    <div className="mx-auto max-w-xl space-y-6">
      {modeSwitcher}
      {deckPicker}
      {knownBanner}

      {practice && (
        <div className="flex items-center justify-between rounded-xl bg-sky-50 px-4 py-2 text-sm text-sky-900">
          <span>
            <b>Luyện thêm:</b> {PRACTICE_KINDS.find((k) => k.id === practice)?.label.toLowerCase()} — không ảnh hưởng lịch
            ôn
          </span>
          <button onClick={() => startSession(mode, deck)} className="underline">
            Thoát
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex justify-between text-sm text-stone-500">
          <span>
            {practice ? "Đã nhớ" : "Đã ôn"} {done}/{total}
          </span>
          <span>Còn {queue.length} thẻ</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-200">
          <div className="h-full bg-emerald-700 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* ---------- Câu hỏi ---------- */}
      <div className="space-y-4 rounded-2xl border border-stone-200 bg-white p-8 shadow-sm">
        {mode === "en-vi" ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-serif text-4xl font-semibold">{card.lemma}</span>
              <SpeakButton word={card.lemma} audioUrl={card.audioUrl} />
            </div>
            {card.phonetic && <p className="text-stone-500">{card.phonetic}</p>}
            {hint && !outcome && (
              <p className="leading-relaxed text-stone-600">
                <Highlight sentence={card.context} word={card.surface} />
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-stone-500">Từ tiếng Anh nào có nghĩa:</p>
            <p className="font-serif text-3xl font-semibold text-emerald-900">{card.meaning}</p>
            {card.partOfSpeech && <p className="text-sm text-stone-500">{card.partOfSpeech}</p>}
            {hint && !outcome && (
              <div className="space-y-1 text-stone-600">
                <p className="font-mono text-lg tracking-wider">{letterHint(card.lemma)}</p>
                <p className="leading-relaxed">{blankWord(card.context, card.surface)}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ---------- Ô trả lời ---------- */}
      {!outcome ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-3"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={mode === "en-vi" ? "Gõ nghĩa tiếng Việt…" : "Gõ từ tiếng Anh…"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            lang={mode === "en-vi" ? "vi" : "en"}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-lg shadow-sm focus:border-stone-500 focus:outline-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex-1 rounded-xl bg-stone-900 py-3 font-medium text-white hover:bg-stone-700 disabled:opacity-40"
            >
              Kiểm tra <span className="text-sm opacity-60">(Enter)</span>
            </button>
            {!hint && (
              <button
                type="button"
                onClick={() => {
                  setHint(true);
                  inputRef.current?.focus();
                }}
                className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-700 hover:bg-stone-100"
              >
                {mode === "en-vi" ? "Xem câu ví dụ" : "Gợi ý"}
              </button>
            )}
            <button
              type="button"
              onClick={() => submit(true)}
              className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-stone-700 hover:bg-stone-100"
            >
              Không nhớ
            </button>
          </div>
        </form>
      ) : (
        /* ---------- Kết quả + đáp án ---------- */
        <div className="space-y-4">
          <div
            className={`rounded-xl px-4 py-3 ${
              outcome.gaveUp || !outcome.check
                ? "bg-stone-100 text-stone-700"
                : verdict === "correct"
                  ? "bg-emerald-50 text-emerald-900"
                  : verdict === "close"
                    ? "bg-amber-50 text-amber-900"
                    : "bg-rose-50 text-rose-900"
            }`}
          >
            <p className="font-medium">
              {outcome.gaveUp
                ? "Đáp án"
                : !outcome.check
                  ? "Thẻ chưa có nghĩa để chấm — tự so sánh rồi chấm điểm"
                  : verdict === "correct"
                    ? "✓ Chính xác"
                    : verdict === "close"
                      ? "≈ Gần đúng"
                      : "✗ Chưa đúng"}
            </p>
            {!outcome.gaveUp && (
              <p className="text-sm">
                Bạn gõ: <span className="font-medium">{outcome.answer}</span>
              </p>
            )}
            {mode === "en-vi" && verdict === "wrong" && !outcome.gaveUp && (
              <p className="mt-1 text-xs opacity-80">
                Nghĩa của bạn có thể vẫn đúng theo cách diễn đạt khác. Nếu vậy, cứ chấm lại bằng nút bên dưới.
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-2xl border border-stone-200 bg-white p-6">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="text-2xl font-semibold">{card.lemma}</span>
              {card.phonetic && <span className="text-stone-500">{card.phonetic}</span>}
              {card.partOfSpeech && <span className="rounded bg-stone-100 px-1.5 text-xs text-stone-600">{card.partOfSpeech}</span>}
              <SpeakButton word={card.lemma} audioUrl={card.audioUrl} />
            </div>
            <p className="text-xl font-medium text-emerald-800">
              {card.meaning ?? <em className="text-base font-normal text-stone-400">Chưa có nghĩa — sửa trong “Thẻ của tôi”</em>}
            </p>
            {card.definitionEn && <p className="text-sm italic text-stone-500">{card.definitionEn}</p>}
            <div className="flex justify-end">
              <button
                onClick={markKnown}
                title="Xoá thẻ này và thêm từ vào danh sách Từ đã biết"
                className="text-xs text-stone-500 underline hover:text-stone-900"
              >
                Từ này tôi đã biết, bỏ thẻ
              </button>
            </div>
            <div className="space-y-1 border-t border-stone-100 pt-3">
              <p className="leading-relaxed text-stone-700">
                <Highlight sentence={card.context} word={card.surface} />
              </p>
              {card.contextVi && <p className="text-sm leading-relaxed text-stone-500">{card.contextVi}</p>}
            </div>
          </div>

          {practice ? (
            <div className="grid grid-cols-2 gap-2">
              {[
                { remembered: false, label: "Chưa nhớ", sub: "Gặp lại cuối lượt · 1", style: "bg-rose-600 hover:bg-rose-700", ring: "ring-rose-300" },
                { remembered: true, label: "Nhớ rồi", sub: "Bỏ khỏi lượt · 2", style: "bg-emerald-700 hover:bg-emerald-800", ring: "ring-emerald-300" },
              ].map((b) => {
                const suggested = (outcome.check?.verdict === "correct") === b.remembered;
                return (
                  <button
                    key={b.label}
                    onClick={() => practiceNext(b.remembered)}
                    className={`rounded-xl py-3 text-white ${b.style} ${suggested ? `ring-4 ${b.ring}` : ""}`}
                  >
                    <div className="font-medium">{b.label}</div>
                    <div className="text-xs opacity-80">{b.sub}</div>
                  </button>
                );
              })}
            </div>
          ) : (
          <div className="grid grid-cols-4 gap-2">
            {GRADES.map((g, i) => {
              const suggested = outcome.check?.suggested === g.grade;
              return (
                <button
                  key={g.grade}
                  onClick={() => grade(g.grade)}
                  className={`rounded-xl py-3 text-white ${g.style} ${suggested ? `ring-4 ${g.ring}` : ""}`}
                >
                  <div className="font-medium">{g.label}</div>
                  <div className="text-xs opacity-80">
                    {formatInterval(review(srsFor(card, mode), g.grade).interval)} · {i + 1}
                  </div>
                </button>
              );
            })}
          </div>
          )}
          {outcome.check && !practice && (
            <p className="text-center text-xs text-stone-500">
              Gợi ý: <b>{GRADES[outcome.check.suggested].label}</b> — bấm Enter để chọn, hoặc phím 1–4
            </p>
          )}
        </div>
      )}

      {!practice && !outcome && (
        <details className="group pt-4">
          <summary className="cursor-pointer list-none text-center text-sm text-stone-500 hover:text-stone-800">
            Luyện thêm thẻ chưa đến hạn…
          </summary>
          <div className="pt-3">{practicePicker}</div>
        </details>
      )}
    </div>
  );
}
