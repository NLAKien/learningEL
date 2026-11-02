function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** In đậm từ cần học trong câu gốc */
export function Highlight({ sentence, word }: { sentence: string; word: string }) {
  const parts = sentence.split(new RegExp(`(\\b${escapeRegExp(word)}\\b)`, "i"));
  return (
    <>
      {parts.map((p, i) =>
        p.toLowerCase() === word.toLowerCase() ? (
          <mark key={i} className="rounded bg-amber-100 px-0.5 font-semibold text-stone-900">
            {p}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
