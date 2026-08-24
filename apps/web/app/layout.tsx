import type { Metadata } from "next";
import { Instrument_Serif, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";

/**
 * 字体：Instrument Serif（展示）+ Outfit（UI）对齐 design/chat-ui-mock-v1；
 * JetBrains Mono 用于代码块。
 */
const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
  display: "swap",
});

const sans = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jet",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Personal-Emotion-GPT",
  description: "The place to go for all your personal and emotion questions",
};

const RootLayout = ({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) => {
  return (
    <html
      lang="zh-CN"
      className={`${serif.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
};

export default RootLayout;
