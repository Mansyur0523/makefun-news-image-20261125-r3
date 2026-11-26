// main.ts — news-image-20261125 round 3 entry runner.
// Copies repo/entry.png to $MAKEFUN_OUTPUT_DIR/entry.png (default /output)
// after validating the PNG. No network, no timestamp, no randomness.
// The entry image lives next to this file; the output directory must be
// absolute (or it is resolved under "/") and must never be inside this repo.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_DIR = resolve(dirname(fileURLToPath(import.meta.url)));
const SRC = resolve(REPO_DIR, "entry.png");

const CRC_TABLE: number[] = (() => {
  const t: number[] = new Array<number>(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function fail(msg: string): never {
  console.error("main.ts: " + msg);
  process.exit(1);
}

function validatePNG(b: Buffer): void {
  if (b.length < 8 || b[0] !== 137 || b[1] !== 80 || b[2] !== 78 || b[3] !== 71 || b[4] !== 13 || b[5] !== 10 || b[6] !== 26 || b[7] !== 10) {
    fail("entry.png: bad PNG magic");
  }
  if (b.length > 1024 * 1024) fail("entry.png: over 1 MiB");
  let off = 8;
  let sawIHDR = false;
  let sawIEND = false;
  while (off + 8 <= b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString("ascii", off + 4, off + 8);
    if (off + 12 + len > b.length) fail("entry.png: truncated chunk " + type);
    const data = b.subarray(off + 8, off + 8 + len);
    const want = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
    const got = b.readUInt32BE(off + 8 + len);
    if (want !== got) fail("entry.png: bad CRC in " + type);
    if (type === "IHDR") {
      sawIHDR = true;
      const w = data.readUInt32BE(0);
      const h = data.readUInt32BE(4);
      if (w > 1024 || h > 1024 || w < 1 || h < 1) fail("entry.png: bad size " + w + "x" + h);
      if (data[8] !== 8 || data[9] !== 2) fail("entry.png: expected 8-bit RGB");
    }
    if (type === "IEND") { sawIEND = true; break; }
    off += 12 + len;
  }
  if (!sawIHDR) fail("entry.png: missing IHDR");
  if (!sawIEND) fail("entry.png: missing IEND");
}

function main(): void {
  if (!existsSync(SRC)) fail("entry.png missing in repo");
  const raw = process.env.MAKEFUN_OUTPUT_DIR || "/output";
  const outDir = raw.startsWith("/") ? resolve(raw) : resolve("/", raw);
  const out = resolve(outDir, "entry.png");
  if (out === SRC || out.startsWith(REPO_DIR + sep) || outDir === REPO_DIR || outDir.startsWith(REPO_DIR + sep)) {
    fail("refusing to write output inside the repo");
  }
  const bytes = readFileSync(SRC);
  validatePNG(bytes);
  mkdirSync(outDir, { recursive: true });
  copyFileSync(SRC, out);
  const hash = createHash("sha256").update(bytes).digest("hex");
  console.log("OK entry.png " + bytes.length + " bytes sha256=" + hash + " -> " + out);
}

main();
