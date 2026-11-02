/** Phát âm: ưu tiên file audio của từ điển, không có thì dùng giọng đọc của trình duyệt. */
export function speak(word: string, audioUrl?: string) {
  if (audioUrl) {
    new Audio(audioUrl).play().catch(() => speakTts(word));
    return;
  }
  speakTts(word);
}

function speakTts(word: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(word);
  u.lang = "en-US";
  u.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
