import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentScout — Football Scout Career Simulator",
  description:
    "Experience football from the scout's perspective. Watch players, form opinions, stake your reputation.",
};

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${caveat.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
