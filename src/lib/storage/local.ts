/**
 * Bản 1: lưu thẻ, từ đã biết và cài đặt ngay trong trình duyệt (localStorage).
 * Bản 2: viết storage/supabase.ts với cùng các hàm rồi đổi chỗ import.
 */
import { DEFAULT_LEVEL, LEVELS, type Level } from "../nlp/data/common-words";
import { initialSrs } from "../srs/sm2";
import type { Card, LookupResult, WordCandidate } from "../types";

const CARDS_KEY = "learningEL.cards";
const KNOWN_KEY = "learningEL.knownWords";
const LEVEL_KEY = "learningEL.level";

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
  return read<Card[]>(CARDS_KEY, []);
}

export function saveCard(card: Card): void {
  write(CARDS_KEY, getCards().map((c) => (c.id === card.id ? card : c)));
}

export function deleteCard(id: string): void {
  write(CARDS_KEY, getCards().filter((c) => c.id !== id));
}

export interface NewCardInput {
  candidate: WordCandidate;
  lookup?: LookupResult;
  meaning?: string; // nghĩa người dùng tự sửa (ưu tiên hơn lookup)
}

/** Tạo thẻ mới; bỏ qua lemma đã có thẻ. Trả về số thẻ mới. */
export function addCards(inputs: NewCardInput[]): number {
  const cards = getCards();
  const existing = new Set(cards.map((c) => c.lemma));
  const now = new Date();
  const fresh: Card[] = inputs
    .filter(({ candidate }) => !existing.has(candidate.lemma))
    .map(({ candidate: c, lookup, meaning }) => ({
      id: crypto.randomUUID(),
      lemma: c.lemma,
      surface: c.surface,
      context: c.context,
      meaning: meaning?.trim() || lookup?.meaning,
      phonetic: lookup?.phonetic,
      partOfSpeech: lookup?.partOfSpeech,
      definitionEn: lookup?.definitionEn,
      audioUrl: lookup?.audioUrl,
      createdAt: now.toISOString(),
      srs: initialSrs(now),
    }));
  write(CARDS_KEY, [...cards, ...fresh]);
  return fresh.length;
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
  const added = data.cards.filter((c) => c?.lemma && c.srs && !existing.has(c.lemma));
  write(CARDS_KEY, [...cards, ...added]);
  const before = getKnownWords().size;
  addKnownWords(data.knownWords ?? []);
  return { cards: added.length, knownWords: getKnownWords().size - before };
}
