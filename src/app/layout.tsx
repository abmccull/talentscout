import type { Metadata } from "next";
import { Caveat } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "TalentScout — Football Scout Career Simulator",
  description:
    "Football Manager, but you're the scout. Build your career from non-league to Champions League. Watch players, form opinions, stake your reputation. $29.99 on Steam.",
  openGraph: {
    title: "TalentScout — Football Scout Career Simulator",
    description: "Football Manager, but you're the scout.",
    type: "website",
  },
};

const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();

  return (
    <html lang="en" className={`dark ${caveat.variable}`}>
      <head>
        <meta
          http-equiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co; img-src 'self' data:; font-src 'self'"
        />
      </head>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
