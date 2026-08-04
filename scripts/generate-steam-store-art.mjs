import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(process.cwd());
const argumentsByName = Object.fromEntries(
  process.argv.slice(2).map((argument) => {
    const separator = argument.indexOf("=");
    return separator > 0
      ? [argument.slice(0, separator), argument.slice(separator + 1)]
      : [argument, "true"];
  }),
);
const wideSourceArgument = argumentsByName["--wide-source"] ?? "";
const portraitSourceArgument = argumentsByName["--portrait-source"] ?? "";
if (!wideSourceArgument || !portraitSourceArgument) {
  throw new Error("Provide --wide-source=<png> and --portrait-source=<png>");
}
if (!isAbsolute(wideSourceArgument) || !isAbsolute(portraitSourceArgument)) {
  throw new Error("Steam store art source paths must be absolute files");
}
const wideSource = resolve(wideSourceArgument);
const portraitSource = resolve(portraitSourceArgument);

const expectedSourceHashes = new Map([
  [wideSource, "ad833fdbcc9a818b79cf3640f76a9523f08b72fda5d725224d2d2a656c88464f"],
  [portraitSource, "c80b36440e09917e8085804a9628eda17d18de3c0c6a7284de26bf69c64d5735"],
]);

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

for (const [sourcePath, expectedHash] of expectedSourceHashes) {
  const actualHash = await sha256(sourcePath);
  if (actualHash !== expectedHash) {
    throw new Error(`Steam store art source hash mismatch for ${sourcePath}: ${actualHash}`);
  }
}

const outputDirectory = resolve(root, "public/images/steam");
await mkdir(outputDirectory, { recursive: true });

function titleOverlay(width, height, options = {}) {
  const {
    titleSize = Math.round(width * 0.105),
    x = Math.round(width * 0.06),
    y = Math.round(height * 0.72),
    anchor = "start",
    subtitle = true,
    earlyAccess = true,
    gradient = true,
  } = options;
  const subtitleSize = Math.max(10, Math.round(titleSize * 0.25));
  const earlyAccessSize = Math.max(9, Math.round(titleSize * 0.21));
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#06100f" stop-opacity="0"/>
          <stop offset="1" stop-color="#06100f" stop-opacity="0.92"/>
        </linearGradient>
      </defs>
      ${gradient ? `<rect width="${width}" height="${height}" fill="url(#shade)"/>` : ""}
      <g font-family="Arial Narrow, DejaVu Sans, sans-serif" font-weight="900"
         text-anchor="${anchor}" paint-order="stroke" stroke="#071210" stroke-width="${Math.max(2, Math.round(titleSize * 0.08))}" stroke-linejoin="round">
        <text x="${x}" y="${y}" font-size="${titleSize}" letter-spacing="${Math.max(1, Math.round(titleSize * 0.035))}">
          <tspan fill="#f2f6f3">TALENT</tspan><tspan fill="#36e18d">SCOUT</tspan>
        </text>
      </g>
      ${subtitle ? `<text x="${x}" y="${y + Math.round(titleSize * 0.48)}"
        font-family="Arial, DejaVu Sans, sans-serif" font-size="${subtitleSize}"
        font-weight="700" letter-spacing="${Math.max(1, Math.round(subtitleSize * 0.12))}"
        text-anchor="${anchor}" fill="#d7e1dc">THE FOOTBALL SCOUTING SIMULATION</text>` : ""}
      ${earlyAccess ? `<g transform="translate(${anchor === "middle" ? x - Math.round(titleSize * 1.25) : x},${y - Math.round(titleSize * 1.22)})">
        <rect width="${Math.round(titleSize * 2.5)}" height="${Math.round(earlyAccessSize * 1.8)}" rx="${Math.round(earlyAccessSize * 0.35)}" fill="#18b86a"/>
        <text x="${Math.round(titleSize * 1.25)}" y="${Math.round(earlyAccessSize * 1.28)}"
          font-family="Arial, DejaVu Sans, sans-serif" font-size="${earlyAccessSize}"
          font-weight="900" letter-spacing="${Math.max(1, Math.round(earlyAccessSize * 0.14))}"
          text-anchor="middle" fill="#04100b">EARLY ACCESS</text>
      </g>` : ""}
    </svg>
  `);
}

async function background(source, width, height, options = {}) {
  const { position = "centre", darken = 0 } = options;
  let pipeline = sharp(source).resize(width, height, { fit: "cover", position });
  if (darken > 0) pipeline = pipeline.modulate({ brightness: 1 - darken });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

async function writeArtwork(source, outputName, width, height, options = {}) {
  const base = await background(source, width, height, options);
  const overlays = options.overlay ? [{ input: options.overlay }] : [];
  await sharp(base)
    .composite(overlays)
    .png({ compressionLevel: 9 })
    .toFile(resolve(outputDirectory, outputName));
}

await writeArtwork(wideSource, "steam-store-hero-v2.png", 3840, 1240, {
  position: "centre",
  darken: 0.06,
});
await writeArtwork(wideSource, "steam-library-hero.png", 3840, 1240, {
  position: "centre",
  darken: 0.12,
});
await writeArtwork(wideSource, "steam-page-background.png", 1438, 810, {
  position: "centre",
  darken: 0.32,
});
await writeArtwork(wideSource, "steam-main-capsule.png", 616, 353, {
  position: "centre",
  overlay: titleOverlay(616, 353, { titleSize: 64, x: 34, y: 252 }),
});
await writeArtwork(wideSource, "steam-header-capsule.png", 460, 215, {
  position: "centre",
  overlay: titleOverlay(460, 215, {
    titleSize: 47,
    x: 24,
    y: 158,
    subtitle: false,
  }),
});
await writeArtwork(wideSource, "steam-small-capsule.png", 231, 87, {
  position: "centre",
  darken: 0.08,
  overlay: titleOverlay(231, 87, {
    titleSize: 27,
    x: 116,
    y: 57,
    anchor: "middle",
    subtitle: false,
    earlyAccess: false,
  }),
});
await writeArtwork(portraitSource, "steam-library-capsule-v2.png", 600, 900, {
  position: "centre",
  overlay: titleOverlay(600, 900, {
    titleSize: 74,
    x: 300,
    y: 230,
    anchor: "middle",
    subtitle: true,
    earlyAccess: true,
    gradient: false,
  }),
});

const logo = Buffer.from(`
  <svg width="1280" height="720" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(640,330)" text-anchor="middle">
      <text x="0" y="0" font-family="Arial Narrow, DejaVu Sans, sans-serif"
        font-size="176" font-weight="900" letter-spacing="8"
        paint-order="stroke" stroke="#071210" stroke-opacity="0.7" stroke-width="12" stroke-linejoin="round">
        <tspan fill="#f2f6f3">TALENT</tspan><tspan fill="#36e18d">SCOUT</tspan>
      </text>
      <rect x="-470" y="48" width="940" height="8" rx="4" fill="#24d982"/>
      <text x="0" y="112" font-family="Arial, DejaVu Sans, sans-serif"
        font-size="34" font-weight="700" letter-spacing="8" fill="#e5eee9">
        THE FOOTBALL SCOUTING SIMULATION
      </text>
    </g>
  </svg>
`);
await sharp({
  create: {
    width: 1280,
    height: 720,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: logo }])
  .png({ compressionLevel: 9 })
  .toFile(resolve(outputDirectory, "steam-logo-transparent.png"));

const expectedOutputHashes = {
  "steam-header-capsule.png": "da4d5b8748b3ae7a829d9160b3d766e2251902a2d446fa403a95052b251a47c9",
  "steam-library-capsule-v2.png": "bbde5295b7f6d699147047c01b402947d74242211d0929a6f334657a381a4dbd",
  "steam-library-hero.png": "725640c40a097befd5c20f590b82ca322c27a1d01979a935d0243f3a6fb7ec81",
  "steam-logo-transparent.png": "03ccb8565872b501f74ee10e8d4829d9bf36a9b9753955f0d25038d98dde1791",
  "steam-main-capsule.png": "d5e680537beca9927dc5eff2b19003b793f0e65be90bd9f4d15bab973d86d774",
  "steam-page-background.png": "05ea5db649485bf75b94027903000131534afd6b326d812af832682be92c6684",
  "steam-small-capsule.png": "278b776f5eb775a42512840d04b6c4b0cd5afeb73bea333b5d79e77b02430f01",
  "steam-store-hero-v2.png": "7b7f78cc0d2d4e0303a588a6a1aa45c2fe3a3c376aac0beeb9c09e4486ec8347",
};

for (const [fileName, expectedHash] of Object.entries(expectedOutputHashes)) {
  const actualHash = await sha256(resolve(outputDirectory, fileName));
  if (actualHash !== expectedHash) {
    throw new Error(`Steam store art output hash mismatch for ${fileName}: ${actualHash}`);
  }
}

console.info("STEAM_STORE_ART_GENERATED 8");
