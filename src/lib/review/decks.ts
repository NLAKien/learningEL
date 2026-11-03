/**
 * Bộ thẻ: mỗi bộ 10 thẻ, xếp theo thứ tự thêm vào. Số bộ được LƯU vào thẻ (card.deck)
 * nên xoá một thẻ không làm các thẻ khác nhảy bộ; thẻ mới luôn điền tiếp vào bộ cuối.
 */
import type { Card } from "../types";

export const DECK_SIZE = 10;

/** Gán số bộ cho các thẻ chưa có (thẻ cũ, thẻ mới tạo, thẻ nhập từ file). Hàm thuần. */
export function assignDecks(cards: Card[]): Card[] {
  let current = Math.max(0, ...cards.map((c) => c.deck ?? 0));
  let filled = cards.filter((c) => c.deck === current && current > 0).length;
  if (current === 0) {
    current = 1;
    filled = 0;
  }
  return cards.map((c) => {
    if (c.deck) return c;
    if (filled >= DECK_SIZE) {
      current++;
      filled = 0;
    }
    filled++;
    return { ...c, deck: current };
  });
}

export interface Deck {
  id: number;
  cards: Card[];
}

/** Nhóm thẻ theo bộ, bộ nhỏ trước */
export function groupDecks(cards: Card[]): Deck[] {
  const map = new Map<number, Card[]>();
  for (const c of cards) {
    const id = c.deck ?? 0;
    map.set(id, [...(map.get(id) ?? []), c]);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([id, list]) => ({ id, cards: list }));
}

/**
 * Đánh số lại các bộ cho liền mạch từ 1 (vd. sau khi xoá hết thẻ của Bộ 2: Bộ 3 -> Bộ 2).
 * Thẻ vẫn ở cùng nhóm, chỉ đổi số.
 */
export function compactDecks(cards: Card[]): Card[] {
  const ids = [...new Set(cards.map((c) => c.deck ?? 0))].filter(Boolean).sort((a, b) => a - b);
  if (ids.every((id, i) => id === i + 1)) return cards;
  const renumber = new Map(ids.map((id, i) => [id, i + 1]));
  return cards.map((c) => (c.deck ? { ...c, deck: renumber.get(c.deck) } : c));
}

/** Gán bộ cho thẻ chưa có rồi đánh số lại cho liền mạch */
export function normalizeDecks(cards: Card[]): Card[] {
  return compactDecks(assignDecks(cards));
}
