import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const svgPath = join(root, "public", "brand-mark.svg");
const svg = readFileSync(svgPath);

const targets = [
  { out: "public/brand-mark-128.png", size: 128 },
  { out: "public/brand-mark-512.png", size: 512 },
];

for (const t of targets) {
  const buf = await sharp(svg).resize(t.size, t.size).png().toBuffer();
  writeFileSync(join(root, t.out), buf);
  console.log(`wrote ${t.out} (${t.size}x${t.size}, ${buf.length} bytes)`);
}
