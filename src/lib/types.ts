/** Mức tự chấm khi ôn: 0 = Quên, 1 = Khó, 2 = Được, 3 = Dễ */
export type Grade = 0 | 1 | 2 | 3;

/** Trạng thái lặp lại ngắt quãng của một thẻ */
export interface SrsState {
  repetitions: number; // số lần nhớ đúng liên tiếp
  interval: number; // khoảng cách đến lần ôn kế tiếp (ngày)
  easeFactor: number; // độ "dễ" của thẻ, tối thiểu 1.3
  dueAt: string; // ISO, thời điểm đến hạn ôn
  lastReviewedAt?: string;
}

export interface Card {
  id: string;
  lemma: string; // dạng gốc: "run"
  surface: string; // dạng xuất hiện trong văn bản: "running"
  context: string; // câu gốc chứa từ
  meaning?: string; // nghĩa tiếng Việt (theo ngữ cảnh nếu có AI)
  phonetic?: string; // phiên âm IPA
  partOfSpeech?: string; // noun, verb...
  definitionEn?: string; // định nghĩa tiếng Anh
  audioUrl?: string; // file phát âm, nếu từ điển có
  createdAt: string;
  srs: SrsState;
}

/** Một từ ứng viên lọc ra từ đoạn văn */
export interface WordCandidate {
  lemma: string;
  surface: string;
  context: string;
  frequencyRank: number | null; // null = không nằm trong danh sách tần suất
  count: number; // số lần xuất hiện trong đoạn văn
}

/** Kết quả tra một từ, trả về từ /api/lookup */
export interface LookupResult {
  lemma: string;
  meaning?: string;
  phonetic?: string;
  partOfSpeech?: string;
  definitionEn?: string;
  audioUrl?: string;
  source: "ai" | "dictionary" | "none";
  /** false = một nguồn bị lỗi, kết quả thiếu -> không cache để lần sau tra lại */
  complete?: boolean;
}

export interface LookupRequestItem {
  lemma: string;
  surface: string;
  context: string;
}
