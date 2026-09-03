// Generates the PWA / home-screen icon set (PNG) from public/logo.svg.
// Run with: bun run icons
//   -> public/icon-192.png       (Android/Chrome PWA)
//   -> public/icon-512.png       (Android/Chrome PWA)
//   -> public/icon-maskable.png  (maskable, safe-zone 512)
//   -> public/apple-touch-icon.png (iOS home screen, 180)
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const src = path.join(root, "public", "logo.svg");
const svg = await readFile(src);

await mkdir(path.join(root, "public"), { recursive: true });

const sizes = [
  { file: "icon-192.png", size: 192 },
  { file: "icon-512.png", size: 512 },
  { file: "icon-maskable.png", size: 512, maskable: true },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size, maskable } of sizes) {
  let image = sharp(svg, { density: 96 }).resize(size, size);
  if (maskable) {
    // Expand the tile to a full-bleed square so OS mask shapes (circle, squircle)
    // don't clip the logo. The 256-viewBox artwork is centered with ~48px padding.
    image = sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: { r: 35, g: 35, b: 35, alpha: 1 },
      },
    }).composite([{ input: await image.png().toBuffer() }]);
  }
  const out = path.join(root, "public", file);
  await image.png().toFile(out);
  console.log("wrote", path.relative(root, out));
}