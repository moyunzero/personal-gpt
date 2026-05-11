import type { Metadata } from "next";
import "./globals.css";


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
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
};

export default RootLayout;