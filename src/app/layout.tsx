import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentScout — Football Scout Career Simulator",
  description: "Experience football from the scout's perspective. Watch players, form opinions, stake your reputation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
