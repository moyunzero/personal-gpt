import type { Metadata } from "next";
import { EB_Garamond, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * 字体策略（参照 DESIGN.md › typography）：
 * - 品牌指定 Copernicus / StyreneB 为专有授权字体，无法公开自托管，
 *   按 DESIGN.md "Note on Font Substitutes" 用 EB Garamond / Inter 作开源替代。
 * - JetBrains Mono 用于代码块（与 DESIGN.md typography.code 一致）。
 * - 三个字体均以 CSS 变量注入 :root，globals.css 通过 var(--font-*) 读取。
 */
const serif = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-serif",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
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
