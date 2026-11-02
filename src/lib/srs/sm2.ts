import type { Grade, SrsState } from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;

/**
 * SM-2 gốc dùng thang chất lượng 0–5. App dùng 4 nút nên ánh xạ:
 * Quên -> 1, Khó -> 3, Được -> 4, Dễ -> 5.
 */
const QUALITY: Record<Grade, number> = { 0: 1, 1: 3, 2: 4, 3: 5 };

export function initialSrs(now: Date = new Date()): SrsState {
  return {
    repetitions: 0,
    interval: 0,
    easeFactor: START_EASE,
    dueAt: now.toISOString(),
  };
}

/** Tính trạng thái mới sau một lần ôn (hàm thuần, không đổi state cũ). */
export function review(state: SrsState, grade: Grade, now: Date = new Date()): SrsState {
  const q = QUALITY[grade];
  let { repetitions, interval, easeFactor } = state;

  if (q < 3) {
    // Quên: học lại từ đầu, giữ nguyên easeFactor (đúng như SM-2 gốc)
    repetitions = 0;
    interval = 1;
  } else {
    repetitions += 1;
    if (repetitions === 1) interval = 1;
    else if (repetitions === 2) interval = 6;
    else interval = Math.round(interval * easeFactor);

    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    easeFactor = Math.max(MIN_EASE, Math.round(easeFactor * 100) / 100);
  }

  return {
    repetitions,
    interval,
    easeFactor,
    dueAt: new Date(now.getTime() + interval * DAY_MS).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}

export function isDue(state: SrsState, now: Date = new Date()): boolean {
  return new Date(state.dueAt).getTime() <= now.getTime();
}
