"use client";

import { ScrollReveal } from "./ScrollReveal";
const blocks = [
  {
    headline: "Watch the match. See what others miss.",
    body: "Every match is a test. You\u2019re not watching to enjoy the game \u2014 you\u2019re watching to work. That centre-back who switches off for a second in the 73rd minute? You noticed. The 17-year-old winger whose first touch is a yard too heavy under pressure? You filed it away. Your notebook fills with observations no camera angle would catch.",
    screenshot: "/screenshots/match-viewer.webp",
    alt: "Match viewer showing live scouting observations",
  },
  {
    headline: "Form your opinion. Own it.",
    body: "There\u2019s no \u201ccorrect answer\u201d button. You watch, you think, you decide. Is this kid the real deal or a flat-track bully? Will that midfielder\u2019s passing range hold up two leagues higher? Your report goes to people who make multi-million pound decisions. If you\u2019re wrong, they\u2019ll remember.",
    screenshot: "/screenshots/report-writer.webp",
    alt: "Report writer where you form your scouting verdict",
  },
  {
    headline: "Build a reputation that opens doors.",
    body: "Start at tier 5 \u2014 non-league grounds, a bus pass, and a notebook. Prove yourself and the offers come. A Championship club wants you full-time. A Premier League manager trusts your judgment on a \u00a330M signing. By the time you\u2019re Chief Scout, you\u2019ll have a network of contacts, a team of analysts, and a legacy of players you found first.",
    screenshot: "/screenshots/career-progression.webp",
    alt: "Career progression from tier 5 to chief scout",
  },
];

export function CoreLoop() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-24">
      <div className="space-y-24 md:space-y-32">
        {blocks.map((block, i) => {
          const isReversed = i % 2 === 1;
          return (
            <div
              key={i}
              className={`flex flex-col items-center gap-10 md:flex-row md:gap-16 ${
                isReversed ? "md:flex-row-reverse" : ""
              }`}
            >
              <ScrollReveal
                direction={isReversed ? "right" : "left"}
                className="w-full md:w-1/2"
              >
                <h3 className="text-2xl font-bold text-white sm:text-3xl">
                  {block.headline}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-zinc-400">
                  {block.body}
                </p>
              </ScrollReveal>
              <ScrollReveal
                direction={isReversed ? "left" : "right"}
                delay={0.15}
                className="w-full md:w-1/2"
              >
                <img
                  src={block.screenshot}
                  alt={block.alt}
                  className="rounded-xl border border-zinc-800"
                  style={{ aspectRatio: "16/9", objectFit: "cover", width: "100%" }}
                />
              </ScrollReveal>
            </div>
          );
        })}
      </div>
    </section>
  );
}
