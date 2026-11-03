/**
 * Bản 1: lưu thẻ, từ đã biết và cài đặt ngay trong trình duyệt (localStorage).
 * Bản 2: viết storage/supabase.ts với cùng các hàm rồi đổi chỗ import.
 */
import { DEFAULT_LEVEL, LEVELS, type Level } from "../nlp/data/common-words";
import { resolveWordInfo } from "../lookup/resolve";
import { assignDecks, normalizeDecks } from "../review/decks";
import type { ReviewMode } from "../review/mode";
import { initialSrs } from "../srs/sm2";
import type { Card, LookupResult, WordCandidate } from "../types";

const CARDS_KEY = "learningEL.cards";
const KNOWN_KEY = "learningEL.knownWords";
const LEVEL_KEY = "learningEL.level";
const MODE_KEY = "learningEL.reviewMode";
// Tăng số này khi cần xếp lại toàn bộ bộ thẻ một lần (v2: sửa lỗi bộ thẻ bị xáo lúc mới ra tính năng)
const DECKS_VERSION = 2;
const DECKS_VERSION_KEY = "learningEL.decksVersion";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Sự kiện báo dữ liệu đã đổi, để thanh menu cập nhật số thẻ đến hạn. */
export const CHANGE_EVENT = "learningEL:changed";

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Trình duyệt chặn storage (chế độ ẩn danh...) -> bỏ qua
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

// ---------- Thẻ ----------

export function getCards(): Card[] {
  let cards = read<Card[]>(CARDS_KEY, []);
  let changed = false;
  if (read<number>(DECKS_VERSION_KEY, 0) < DECKS_VERSION) {
    // Xếp lại toàn bộ theo thứ tự thêm thẻ (thứ tự trong mảng), mỗi bộ 10 thẻ
    cards = cards.map((c) => ({ ...c, deck: undefined }));
    write(DECKS_VERSION_KEY, DECKS_VERSION);
    changed = true;
  }
  // Thẻ chưa có bộ, hoặc số bộ bị hổng (đã xoá hết một bộ): sắp xếp lại
  const normalized = normalizeDecks(cards);
  if (changed || normalized.some((c, i) => c.deck !== cards[i].deck)) {
    write(CARDS_KEY, normalized);
  }
  return normalized;
}

/**
 * Lưu thay đổi của một thẻ. GỘP với bản đang lưu thay vì ghi đè cả thẻ:
 * nếu trang đang giữ một bản cũ thiếu trường (vd. chưa có số bộ), trường đó không bị mất.
 */
export function saveCard(card: Card): void {
  write(
    CARDS_KEY,
    getCards().map((c) => (c.id === card.id ? { ...c, ...card, deck: card.deck ?? c.deck } : c)),
  );
}

export function deleteCard(id: string): void {
  write(CARDS_KEY, getCards().filter((c) => c.id !== id));
}

export interface NewCardInput {
  candidate: WordCandidate;
  lookup?: LookupResult;
  meaning?: string; // nghĩa người dùng tự sửa (ưu tiên hơn lookup)
  contextVi?: string; // bản dịch câu gốc
}

/** Tạo thẻ mới; bỏ qua lemma đã có thẻ. Trả về số thẻ mới. */
export function addCards(inputs: NewCardInput[]): number {
  const cards = getCards();
  const existing = new Set(cards.map((c) => c.lemma));
  const now = new Date();
  const fresh: Card[] = inputs
    .filter(({ candidate }) => !existing.has(candidate.lemma))
    .map(({ candidate: c, lookup, meaning, contextVi }) => ({
      ...resolveWordInfo(lookup, c.surface, c.context), // từ loại + định nghĩa theo câu
      id: crypto.randomUUID(),
      lemma: c.lemma,
      surface: c.surface,
      context: c.context,
      contextVi,
      meaning: meaning?.trim() || lookup?.meaning,
      phonetic: lookup?.phonetic,
      audioUrl: lookup?.audioUrl,
      createdAt: now.toISOString(),
      srs: initialSrs(now),
    }));
  write(CARDS_KEY, assignDecks([...cards, ...fresh]));
  return fresh.length;
}

/** Chuyển thẻ sang "Từ đã biết": xoá thẻ, thêm từ vào danh sách đã biết. Trả về thẻ để hoàn tác. */
export function markCardKnown(id: string): Card | undefined {
  const card = getCards().find((c) => c.id === id);
  if (!card) return undefined;
  deleteCard(id);
  addKnownWords([card.lemma]);
  return card;
}

/** Hoàn tác markCardKnown: trả thẻ về (giữ nguyên bộ và lịch ôn), bỏ khỏi danh sách đã biết. */
export function restoreCard(card: Card): void {
  const cards = getCards();
  if (!cards.some((c) => c.id === card.id)) write(CARDS_KEY, [...cards, card]);
  removeKnownWord(card.lemma);
}

// ---------- Từ đã biết ----------

export function getKnownWords(): Set<string> {
  return new Set(read<string[]>(KNOWN_KEY, []));
}

export function addKnownWords(lemmas: string[]): void {
  const set = getKnownWords();
  lemmas.forEach((l) => set.add(l));
  write(KNOWN_KEY, [...set]);
}

export function removeKnownWord(lemma: string): void {
  const set = getKnownWords();
  set.delete(lemma);
  write(KNOWN_KEY, [...set]);
}

// ---------- Trình độ ----------

export function getLevel(): Level {
  const lv = read<string>(LEVEL_KEY, DEFAULT_LEVEL);
  return lv in LEVELS ? (lv as Level) : DEFAULT_LEVEL;
}

export function setLevel(level: Level): void {
  write(LEVEL_KEY, level);
}

// ---------- Chế độ ôn ----------

export function getReviewMode(): ReviewMode {
  return read<string>(MODE_KEY, "en-vi") === "vi-en" ? "vi-en" : "en-vi";
}

export function setReviewMode(mode: ReviewMode): void {
  write(MODE_KEY, mode);
}

// ---------- Sao lưu ----------

export interface Backup {
  version: 1;
  exportedAt: string;
  cards: Card[];
  knownWords: string[];
  level: Level;
}

export function exportData(): Backup {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: getCards(),
    knownWords: [...getKnownWords()],
    level: getLevel(),
  };
}

/** Gộp dữ liệu sao lưu vào dữ liệu hiện có (thẻ trùng lemma giữ bản hiện có). */
export function importData(data: Backup): { cards: number; knownWords: number } {
  if (data?.version !== 1 || !Array.isArray(data.cards)) {
    throw new Error("File sao lưu không hợp lệ");
  }
  const cards = getCards();
  const existing = new Set(cards.map((c) => c.lemma));
  const added = data.cards
    .filter((c) => c?.lemma && c.srs && !existing.has(c.lemma))
    .map((c) => ({ ...c, deck: undefined })); // xếp lại bộ theo dữ liệu hiện có
  write(CARDS_KEY, assignDecks([...cards, ...added]));
  const before = getKnownWords().size;
  addKnownWords(data.knownWords ?? []);
  return { cards: added.length, knownWords: getKnownWords().size - before };
}
