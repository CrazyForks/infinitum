import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const CANDIDATE_PATHS = [
  join(process.cwd(), "public", "brand-mark-512.png"),
  join(process.cwd(), "public", "brand-mark-128.png"),
  join(process.cwd(), "public", "brand-mark.svg"),
];

let cachedDataUrl: string | null = null;

function readFirstAvailable(): Buffer {
  for (const p of CANDIDATE_PATHS) {
    if (existsSync(p)) {
      return readFileSync(p);
    }
  }
  throw new Error(
    "No brand mark asset found. Run `node scripts/build-brand-mark.mjs` to generate PNGs.",
  );
}

function detectMime(buf: Buffer): string {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buf.length >= 3 && buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "<?xml") {
    return "image/svg+xml";
  }
  return "application/octet-stream";
}

export function getBrandMarkDataUrl(): string {
  if (cachedDataUrl) {
    return cachedDataUrl;
  }
  const buf = readFirstAvailable();
  const mime = detectMime(buf);
  cachedDataUrl = `data:${mime};base64,${buf.toString("base64")}`;
  return cachedDataUrl;
}
