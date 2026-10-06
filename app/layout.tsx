import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MoguMatch | みんなで決める、今日のごはん",
  description: "リンクで集まって、スワイプで選ぶ。みんなの食べたいが見つかる学習用Webアプリ。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
