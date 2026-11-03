"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { formatDue } from "@/lib/format";
import { lookupWords } from "@/lib/lookup/client";
import { resolveWordInfo } from "@/lib/lookup/resolve";
import { groupDecks } from "@/lib/review/decks";
import { canReview, srsFor } from "@/lib/review/mode";
import { isDue } from "@/lib/srs/sm2";
import {
  type Backup,
  deleteCard,
  exportData,
  getCards,
  addKnownWords,
  getKnownWords,
  importData,
  markCardKnown,
  removeKnownWord,
  restoreCard,
  saveCard,
} from "@/lib/storage/local";
import type { Card } from "@/lib/types";

type View = "all" | "due" | "mature" | "known";

/** Đến hạn ở ít nhất một chiều ôn */
function dueAnyWay(c: Card): boolean {
  return isDue(c.srs) || (canReview(c, "vi-en") && isDue(srsFor(c, "vi-en")));
}
const isMature = (c: Card) => c.srs.interval >= 21; // nhớ >= 3 tuần

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [view, setView] = useState<View>("all");
  const [lastKnown, setLastKnown] = useState<Card | null>(null); // để hoàn tác "Đã biết"
  const [newKnown, setNewKnown] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    setCards(getCards());
    setKnown([...getKnownWords()].sort());
  }
  useEffect(reload, []);

  const stats = useMemo(
    () => ({
      total: cards.length,
      due: cards.filter(dueAnyWay).length,
      mature: cards.filter(isMature).length,
      noMeaning: cards.filter((c) => !c.meaning).length,
    }),
    [cards],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!q || c.lemma.includes(q) || c.meaning?.toLowerCase().includes(q)) &&
        (view === "due" ? dueAnyWay(c) : view === "mature" ? isMature(c) : true),
    );
  }, [cards, query, view]);
  const shownDecks = useMemo(() => groupDecks(shown), [shown]);
  const allDecks = useMemo(() => groupDecks(cards), [cards]);
  const shownKnown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return known.filter((w) => !q || w.includes(q));
  }, [known, query]);

  function markKnown(card: Card) {
    markCardKnown(card.id);
    setLastKnown(card);
    setNotice("");
    reload();
  }

  function undoKnown() {
    if (!lastKnown) return;
    restoreCard(lastKnown);
    setLastKnown(null);
    reload();
  }

  function addKnownManually() {
    const words = newKnown
      .split(/[,\n]/)
      .map((w) => w.trim().toLowerCase())
      .filter((w) => /^[a-z][a-z' -]*$/.test(w));
    if (!words.length) return;
    addKnownWords(words);
    setNewKnown("");
    reload();
  }

  function saveEdit() {
    if (!editing) return;
    const card = cards.find((c) => c.id === editing.id);
    if (card) saveCard({ ...card, meaning: editing.value.trim() || undefined });
    setEditing(null);
    reload();
  }

  function remove(card: Card) {
    if (!confirm(`Xoá thẻ "${card.lemma}"?`)) return;
    deleteCard(card.id);
    reload();
  }

  async function fillMissing() {
    const targets = cards.filter((c) => !c.meaning);
    if (!targets.length) return;
    setBusy(true);
    const { results } = await lookupWords(targets.map((c) => ({ lemma: c.lemma, surface: c.surface, context: c.context })));
    let filled = 0;
    for (const c of targets) {
      const r = results.get(c.lemma);
      if (!r || r.source === "none") continue;
      saveCard({
        ...c,
        meaning: r.meaning ?? c.meaning,
        phonetic: c.phonetic ?? r.phonetic,
        ...resolveWordInfo(r, c.surface, c.context),
        audioUrl: c.audioUrl ?? r.audioUrl,
      });
      if (r.meaning) filled++;
    }
    setBusy(false);
    setNotice(`Đã bổ sung nghĩa cho ${filled}/${targets.length} thẻ.`);
    reload();
  }

  /** Tra lại từ điển cho mọi thẻ để chọn từ loại + định nghĩa theo câu gốc (không đụng tới nghĩa đã có) */
  async function refreshPos() {
    if (!cards.length) return;
    setBusy(true);
    const { results } = await lookupWords(cards.map((c) => ({ lemma: c.lemma, surface: c.surface, context: c.context })));
    let changed = 0;
    for (const c of cards) {
      const r = results.get(c.lemma);
      if (!r || r.source === "none") continue;
      const info = resolveWordInfo(r, c.surface, c.context);
      if (!info.partOfSpeech) continue;
      if (info.partOfSpeech !== c.partOfSpeech) changed++;
      saveCard({
        ...c,
        partOfSpeech: info.partOfSpeech,
        definitionEn: info.definitionEn ?? c.definitionEn,
        phonetic: c.phonetic ?? r.phonetic,
      });
    }
    setBusy(false);
    setNotice(`Đã cập nhật từ loại: ${changed} thẻ được sửa.`);
    reload();
  }

  function download() {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `learningEL-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function upload(file: File) {
    try {
      const data = JSON.parse(await file.text()) as Backup;
      const r = importData(data);
      setNotice(`Đã nhập ${r.cards} thẻ và ${r.knownWords} từ đã biết.`);
      reload();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Không đọc được file");
    }
  }

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { id: "all", label: "Tổng số thẻ", value: stats.total },
            { id: "due", label: "Đến hạn ôn", value: stats.due, hint: "Đến hạn ở ít nhất một chiều ôn" },
            { id: "mature", label: "Đã nhớ lâu", value: stats.mature, hint: "Khoảng ôn ≥ 3 tuần" },
            { id: "known", label: "Từ đã biết", value: known.length },
          ] as { id: View; label: string; value: number; hint?: string }[]
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setView(t.id)}
            title={t.hint}
            aria-pressed={view === t.id}
            className={`rounded-xl border p-4 text-left transition ${
              view === t.id
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-200 bg-white hover:border-stone-400"
            }`}
          >
            <div className="text-2xl font-semibold">{t.value}</div>
            <div className={`text-sm ${view === t.id ? "text-white/70" : "text-stone-500"}`}>{t.label}</div>
          </button>
        ))}
      </section>

      {lastKnown && (
        <div className="flex items-center justify-between rounded-xl bg-stone-100 px-4 py-2 text-sm text-stone-700">
          <span>
            Đã chuyển <b>{lastKnown.lemma}</b> sang Từ đã biết.
          </span>
          <button onClick={undoKnown} className="underline">
            Hoàn tác
          </button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "known" ? "Tìm trong từ đã biết…" : "Tìm từ hoặc nghĩa…"}
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 focus:border-stone-500 focus:outline-none"
          />
          {view !== "known" && stats.noMeaning > 0 && (
            <button
              onClick={fillMissing}
              disabled={busy}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 disabled:opacity-50"
            >
              {busy ? "Đang tra…" : `Tra nghĩa cho ${stats.noMeaning} thẻ thiếu`}
            </button>
          )}
          {view !== "known" && cards.length > 0 && (
            <button
              onClick={refreshPos}
              disabled={busy}
              title="Chọn lại từ loại và định nghĩa tiếng Anh theo câu gốc của từng thẻ"
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 disabled:opacity-50"
            >
              {busy ? "Đang tra…" : "Cập nhật từ loại"}
            </button>
          )}
        </div>
        {notice && <p className="text-sm text-emerald-800">{notice}</p>}

        {view === "known" ? (
          /* ---------- Từ đã biết ---------- */
          <div className="space-y-3">
            <p className="text-sm text-stone-500">
              Những từ này không hiện khi lọc từ mới. Bấm × nếu muốn học lại (từ sẽ được đề xuất lại ở lần dán sau).
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                addKnownManually();
              }}
              className="flex gap-2"
            >
              <input
                value={newKnown}
                onChange={(e) => setNewKnown(e.target.value)}
                placeholder="Thêm từ đã biết, cách nhau bằng dấu phẩy…"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!newKnown.trim()}
                className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white disabled:opacity-40"
              >
                Thêm
              </button>
            </form>
            {shownKnown.length === 0 ? (
              <p className="py-8 text-center text-stone-500">
                {known.length ? "Không có từ khớp." : "Chưa có từ nào. Bấm “Đã biết” ở một thẻ, hoặc thêm ở ô trên."}
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {shownKnown.map((w) => (
                  <span key={w} className="inline-flex items-center gap-1 rounded-full bg-stone-200 py-0.5 pl-2.5 pr-1 text-sm">
                    {w}
                    <button
                      onClick={() => {
                        removeKnownWord(w);
                        reload();
                      }}
                      className="rounded-full px-1 text-stone-500 hover:bg-stone-300 hover:text-stone-900"
                      aria-label={`Bỏ ${w} khỏi danh sách đã biết`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-stone-500">
            {!cards.length
              ? "Chưa có thẻ nào."
              : query
                ? "Không có thẻ khớp."
                : view === "due"
                  ? "Không có thẻ nào đến hạn. Giỏi lắm!"
                  : "Chưa có thẻ nào nhớ được ≥ 3 tuần — cứ ôn đều đặn nhé."}
          </p>
        ) : (
          /* ---------- Thẻ, nhóm theo bộ ---------- */
          <div className="space-y-6">
            {shownDecks.map((d) => {
              const full = allDecks.find((x) => x.id === d.id)?.cards ?? d.cards;
              const dueInDeck = full.filter(dueAnyWay).length;
              return (
                <div key={d.id} className="space-y-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="font-serif text-lg font-semibold">
                      Bộ {d.id}{" "}
                      <span className="text-sm font-normal text-stone-500">
                        · {full.length} thẻ{dueInDeck ? ` · ${dueInDeck} đến hạn` : ""}
                      </span>
                    </h2>
                    <Link href={`/review?deck=${d.id}`} className="text-sm font-medium text-emerald-800 hover:underline">
                      Học bộ này →
                    </Link>
                  </div>
                  <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
                    {d.cards.map((c) => (
                      <li key={c.id} className="flex items-start gap-3 p-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2">
                            <span className="font-semibold">{c.lemma}</span>
                            {c.phonetic && <span className="text-sm text-stone-500">{c.phonetic}</span>}
                            {c.partOfSpeech && (
                              <span className="rounded bg-stone-100 px-1.5 text-xs text-stone-600">{c.partOfSpeech}</span>
                            )}
                            <SpeakButton word={c.lemma} audioUrl={c.audioUrl} />
                          </div>
                          {editing?.id === c.id ? (
                            <input
                              autoFocus
                              value={editing.value}
                              onChange={(e) => setEditing({ id: c.id, value: e.target.value })}
                              onBlur={saveEdit}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="mt-1 w-full rounded-md border border-stone-400 px-2 py-1 focus:outline-none"
                            />
                          ) : (
                            <button
                              onClick={() => setEditing({ id: c.id, value: c.meaning ?? "" })}
                              className="mt-0.5 block text-left text-stone-700 hover:underline"
                              title="Bấm để sửa nghĩa"
                            >
                              {c.meaning ?? <em className="text-stone-400">Chưa có nghĩa — bấm để thêm</em>}
                            </button>
                          )}
                          <p className="mt-1 truncate text-sm text-stone-400" title={c.context}>
                            {c.context}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                          <span
                            className={isDue(c.srs) ? "font-medium text-emerald-700" : "text-stone-400"}
                            title="Lịch ôn chiều Anh → Việt"
                          >
                            A→V: {formatDue(c.srs.dueAt)}
                          </span>
                          {canReview(c, "vi-en") && (
                            <span
                              className={isDue(srsFor(c, "vi-en")) ? "font-medium text-emerald-700" : "text-stone-400"}
                              title="Lịch ôn chiều Việt → Anh"
                            >
                              V→A: {formatDue(srsFor(c, "vi-en").dueAt)}
                            </span>
                          )}
                          <div className="mt-1 flex gap-3">
                            <button
                              onClick={() => markKnown(c)}
                              title="Xoá thẻ và thêm từ vào Từ đã biết"
                              className="text-stone-500 hover:text-emerald-700"
                            >
                              Đã biết
                            </button>
                            <button onClick={() => remove(c)} className="text-stone-400 hover:text-rose-600">
                              Xoá
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2 border-t border-stone-200 pt-6">
        <h2 className="font-serif text-lg font-semibold">Sao lưu</h2>
        <p className="text-sm text-stone-500">
          Dữ liệu đang lưu trong trình duyệt này. Xoá dữ liệu trình duyệt là mất — nên tải bản sao lưu định kỳ.
        </p>
        <div className="flex gap-2">
          <button onClick={download} className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100">
            Tải file sao lưu
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100"
          >
            Nhập từ file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
              e.target.value = "";
            }}
          />
        </div>
      </section>
    </div>
  );
}
