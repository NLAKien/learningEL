import { describe, expect, it } from "vitest";
import { assignDecks, groupDecks } from "./decks";
import type { Card } from "../types";

const mk = (n: number, deck?: number) => ({ id: String(n), lemma: "w" + n, deck }) as unknown as Card;

describe("assignDecks", () => {
  it("chia 23 thẻ cũ thành 10 + 10 + 3", () => {
    const out = assignDecks(Array.from({ length: 23 }, (_, i) => mk(i)));
    expect(groupDecks(out).map((d) => d.cards.length)).toEqual([10, 10, 3]);
  });
  it("thẻ mới điền tiếp vào bộ cuối chưa đủ", () => {
    const old = assignDecks(Array.from({ length: 13 }, (_, i) => mk(i)));
    const out = assignDecks([...old, ...Array.from({ length: 9 }, (_, i) => mk(100 + i))]);
    expect(groupDecks(out).map((d) => [d.id, d.cards.length])).toEqual([[1, 10], [2, 10], [3, 2]]);
  });
  it("xoá thẻ không làm thẻ khác đổi bộ", () => {
    const decks = assignDecks(Array.from({ length: 15 }, (_, i) => mk(i)));
    const after = assignDecks(decks.filter((c) => c.id !== "3"));
    expect(after.find((c) => c.id === "12")?.deck).toBe(2);
    expect(groupDecks(after).map((d) => d.cards.length)).toEqual([9, 5]);
  });
});
