"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isDue } from "@/lib/srs/sm2";
import { CHANGE_EVENT, getCards } from "@/lib/storage/local";

const LINKS = [
  { href: "/", label: "Thêm từ" },
  { href: "/review", label: "Ôn tập" },
  { href: "/cards", label: "Thẻ của tôi" },
];

export function Nav() {
  const pathname = usePathname();
  const [due, setDue] = useState(0);

  useEffect(() => {
    const refresh = () => setDue(getCards().filter((c) => isDue(c.srs)).length);
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh); // tab khác thay đổi
    const timer = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/90 backdrop-blur">
      <nav className="mx-auto flex max-w-3xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-4 font-serif text-lg font-semibold tracking-tight">
          learning<span className="text-emerald-700">EL</span>
        </Link>
        {LINKS.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3 py-1.5 text-sm ${
                active ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-200"
              }`}
            >
              {l.label}
              {l.href === "/review" && due > 0 && (
                <span
                  className={`ml-1.5 rounded-full px-1.5 text-xs ${
                    active ? "bg-white/20" : "bg-emerald-700 text-white"
                  }`}
                >
                  {due}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
