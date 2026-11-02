"use client";

import { speak } from "@/lib/speech";

export function SpeakButton({ word, audioUrl, className = "" }: { word: string; audioUrl?: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        speak(word, audioUrl);
      }}
      title={`Nghe phát âm "${word}"`}
      aria-label={`Nghe phát âm ${word}`}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-stone-500 hover:bg-stone-200 hover:text-stone-900 ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
        <path d="M11 5 6 9H2v6h4l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
      </svg>
    </button>
  );
}
