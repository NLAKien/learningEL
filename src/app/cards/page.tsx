"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SpeakButton } from "@/components/SpeakButton";
import { formatDue } from "@/lib/format";
import { lookupWords } from "@/lib/lookup/client";
import { isDue } from "@/lib/srs/sm2";
import {
  type Backup,
  deleteCard,
  exportData,
  getCards,
  getKnownWords,
  importData,
  removeKnownWord,
  saveCard,
} from "@/lib/storage/local";
import type { Card } from "@/lib/types";

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [known, setKnown] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function reload() {
    setCards(getCards());
    setKnown([...getKnownWords()].sort());
  }
  useEffect(reload, []);

  const stats = useMemo(
    () => ({
      total: cards.length,
      due: cards.filter((c) => isDue(c.srs)).length,
      mature: cards.filter((c) => c.srs.interval >= 21).length, // nhớ >= 3 tuần
      noMeaning: cards.filter((c) => !c.meaning).length,
    }),
    [cards],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return cards
      .filter((c) => !q || c.lemma.includes(q) || c.meaning?.toLowerCase().includes(q))
      .sort((a, b) => a.srs.dueAt.localeCompare(b.srs.dueAt));
  }, [cards, query]);

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
        partOfSpeech: c.partOfSpeech ?? r.partOfSpeech,
        definitionEn: c.definitionEn ?? r.definitionEn,
        audioUrl: c.audioUrl ?? r.audioUrl,
      });
      if (r.meaning) filled++;
    }
    setBusy(false);
    setNotice(`Đã bổ sung nghĩa cho ${filled}/${targets.length} thẻ.`);
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
        {[
          { label: "Tổng số thẻ", value: stats.total },
          { label: "Đến hạn ôn", value: stats.due },
          { label: "Đã nhớ lâu", value: stats.mature, hint: "khoảng ôn ≥ 3 tuần" },
          { label: "Từ đã biết", value: known.length },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-stone-200 bg-white p-4" title={s.hint}>
            <div className="text-2xl font-semibold">{s.value}</div>
            <div className="text-sm text-stone-500">{s.label}</div>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm từ hoặc nghĩa…"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 focus:border-stone-500 focus:outline-none"
          />
          {stats.noMeaning > 0 && (
            <button
              onClick={fillMissing}
              disabled={busy}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm hover:bg-stone-100 disabled:opacity-50"
            >
              {busy ? "Đang tra…" : `Tra nghĩa cho ${stats.noMeaning} thẻ thiếu`}
            </button>
          )}
        </div>
        {notice && <p className="text-sm text-emerald-800">{notice}</p>}

        {shown.length === 0 ? (
          <p className="py-8 text-center text-stone-500">{cards.length ? "Không có thẻ khớp." : "Chưa có thẻ nào."}</p>
        ) : (
          <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-white">
            {shown.map((c) => (
              <li key={c.id} className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2">
                    <span className="font-semibold">{c.lemma}</span>
                    {c.phonetic && <span className="text-sm text-stone-500">{c.phonetic}</span>}
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
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-xs ${isDue(c.srs) ? "font-medium text-emerald-700" : "text-stone-400"}`}>
                    {formatDue(c.srs.dueAt)}
                  </span>
                  <button onClick={() => remove(c)} className="text-xs text-stone-400 hover:text-rose-600">
                    Xoá
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {known.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-lg font-semibold">Từ đã biết</h2>
          <p className="text-sm text-stone-500">Những từ này sẽ không hiện khi lọc. Bấm × nếu muốn học lại.</p>
          <div className="flex flex-wrap gap-1.5">
            {known.map((w) => (
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
        </section>
      )}

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
