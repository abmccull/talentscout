import type { Metadata } from "next";
import localFont from "next/font/local";
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

const caveat = localFont({
  src: "./fonts/Caveat-Variable.ttf",
  weight: "400 700",
  style: "normal",
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
        {/* Howler releases streamed audio with an inline silent WAV. Keep
            media data URLs aligned with Electron's policy. */}
        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self' file: data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' file:; style-src 'self' 'unsafe-inline' file:; connect-src 'self' file: https://*.supabase.co https: wss:; img-src 'self' file: data: blob:; font-src 'self' file: data:; media-src 'self' file: data: blob:"
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
