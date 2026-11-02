import { describe, expect, it } from "vitest";
import { initialSrs, isDue, MIN_EASE, review } from "./sm2";

const t0 = new Date("2026-01-01T00:00:00Z");

describe("SM-2", () => {
  it("thẻ mới đến hạn ngay", () => {
    expect(isDue(initialSrs(t0), t0)).toBe(true);
  });

  it("nhớ đúng liên tiếp: 1 -> 6 -> 15 ngày", () => {
    let s = review(initialSrs(t0), 2, t0);
    expect(s.interval).toBe(1);
    s = review(s, 2, t0);
    expect(s.interval).toBe(6);
    s = review(s, 2, t0);
    expect(s.interval).toBe(15); // 6 * 2.5
    expect(s.dueAt).toBe("2026-01-16T00:00:00.000Z");
  });

  it("quên thì quay về 1 ngày, không đổi easeFactor", () => {
    let s = review(initialSrs(t0), 2, t0);
    s = review(s, 2, t0);
    const before = s.easeFactor;
    s = review(s, 0, t0);
    expect(s.repetitions).toBe(0);
    expect(s.interval).toBe(1);
    expect(s.easeFactor).toBe(before);
  });

  it("Dễ tăng, Khó giảm easeFactor", () => {
    expect(review(initialSrs(t0), 3, t0).easeFactor).toBeCloseTo(2.6);
    expect(review(initialSrs(t0), 1, t0).easeFactor).toBeCloseTo(2.36);
  });

  it("easeFactor không xuống dưới 1.3", () => {
    let s = initialSrs(t0);
    for (let i = 0; i < 20; i++) s = review(s, 1, t0);
    expect(s.easeFactor).toBe(MIN_EASE);
  });
});
