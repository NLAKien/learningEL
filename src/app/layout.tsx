import type { Metadata } from "next";
import { Be_Vietnam_Pro, Lora } from "next/font/google";
import { Nav } from "@/components/Nav";
import "./globals.css";

// Font có đủ ký tự tiếng Việt (font hệ thống như Georgia bị vỡ dấu: "tiê´ng")
const sans = Be_Vietnam_Pro({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});
const serif = Lora({
  subsets: ["latin", "vietnamese"],
  variable: "--font-heading",
});

export const metadata: Metadata = {
  title: "learningEL",
  description: "Học từ vựng tiếng Anh từ chính những gì bạn đọc",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={`${sans.variable} ${serif.variable}`}>
      <body>
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
