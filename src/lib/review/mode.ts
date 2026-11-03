/** Hai chiều ôn tập, mỗi chiều một lịch SM-2 riêng (giống Anki tách thẻ xuôi / ngược). */
import { initialSrs, isDue } from "../srs/sm2";
import type { Card, SrsState } from "../types";

export type ReviewMode = "en-vi" | "vi-en";

export const MODES: { id: ReviewMode; label: string; hint: string }[] = [
  { id: "en-vi", label: "Anh → Việt", hint: "Thấy từ tiếng Anh, gõ nghĩa tiếng Việt" },
  { id: "vi-en", label: "Việt → Anh", hint: "Thấy nghĩa tiếng Việt, gõ từ tiếng Anh" },
];

export function srsFor(card: Card, mode: ReviewMode): SrsState {
  if (mode === "en-vi") return card.srs;
  // Chưa ôn chiều ngược lần nào: coi như thẻ mới, đến hạn từ lúc tạo
  return card.srsReverse ?? initialSrs(new Date(card.createdAt));
}

export function withSrs(card: Card, mode: ReviewMode, srs: SrsState): Card {
  return mode === "en-vi" ? { ...card, srs } : { ...card, srsReverse: srs };
}

/** Chiều Việt → Anh cần thẻ có nghĩa tiếng Việt để làm câu hỏi */
export function canReview(card: Card, mode: ReviewMode): boolean {
  return mode === "en-vi" || Boolean(card.meaning?.trim());
}

export function dueCards(cards: Card[], mode: ReviewMode, now = new Date()): Card[] {
  return cards
    .filter((c) => canReview(c, mode) && isDue(srsFor(c, mode), now))
    .sort((a, b) => srsFor(a, mode).dueAt.localeCompare(srsFor(b, mode).dueAt));
}

// ---------- Luyện thêm (không ảnh hưởng lịch ôn) ----------

export type PracticeKind = "today" | "hard" | "all";

export const PRACTICE_KINDS: { id: PracticeKind; label: string; hint: string }[] = [
  { id: "today", label: "Thẻ vừa ôn hôm nay", hint: "Làm lại cho chắc những thẻ bạn đã ôn hôm nay" },
  { id: "hard", label: "Thẻ hay quên / khó", hint: "Thẻ bị chấm Quên gần đây hoặc từng bị chấm Khó" },
  { id: "all", label: "Tất cả thẻ", hint: "Mọi thẻ, xáo trộn ngẫu nhiên" },
];

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Thẻ "khó": vừa bị Quên (đang học lại từ đầu) hoặc easeFactor đã bị hạ do chấm Khó */
export function isHard(srs: SrsState): boolean {
  return (srs.repetitions === 0 && Boolean(srs.lastReviewedAt)) || srs.easeFactor < 2.5;
}

export function practiceCards(cards: Card[], mode: ReviewMode, kind: PracticeKind, now = new Date()): Card[] {
  const list = cards.filter((c) => {
    if (!canReview(c, mode)) return false;
    const srs = srsFor(c, mode);
    if (kind === "today") return Boolean(srs.lastReviewedAt) && sameLocalDay(new Date(srs.lastReviewedAt!), now);
    if (kind === "hard") return isHard(srs);
    return true;
  });
  // Xáo trộn (Fisher–Yates) để không nhớ theo thứ tự
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
