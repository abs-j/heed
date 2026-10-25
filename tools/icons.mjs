#!/usr/bin/env node
// Draws the slop-meter mark (three rising bars: green, amber, red) on a dark rounded
// square and writes icons/16.png, 48.png, 128.png. No dependencies: a tiny PNG encoder.
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [23, 24, 27], BARS = [[61, 214, 140], [240, 180, 41], [255, 99, 105]];

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
const chunk = (type, data) => {
  const t = Buffer.from(type), len = Buffer.alloc(4), crc = Buffer.alloc(4);
  len.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};
function png(size, rgba) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
// signed distance to a rounded rect (centre cx,cy, half-size hw,hh, radius r)
const sdRound = (x, y, cx, cy, hw, hh, r) => {
  const qx = Math.abs(x - cx) - (hw - r), qy = Math.abs(y - cy) - (hh - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};

function draw(size) {
  const S = 4, N = size * S, px = Buffer.alloc(size * size * 4);
  // layout in unit square [0,1]
  const bars = [0, 1, 2].map((i) => { const h = [0.30, 0.50, 0.70][i], w = 0.17, x = 0.5 + (i - 1) * 0.24; return { cx: x, cy: 0.80 - h / 2, hw: w / 2, hh: h / 2, r: 0.045, col: BARS[i] }; });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const u = (x * S + sx + 0.5) / N, v = (y * S + sy + 0.5) / N;
      if (sdRound(u, v, 0.5, 0.5, 0.5, 0.5, 0.22) > 0) continue;
      let col = BG;
      for (const br of bars) if (sdRound(u, v, br.cx, br.cy, br.hw, br.hh, br.r) <= 0) col = br.col;
      r += col[0]; g += col[1]; b += col[2]; a += 1;
    }
    const o = (y * size + x) * 4, n = S * S;
    if (a) { px[o] = r / a; px[o + 1] = g / a; px[o + 2] = b / a; px[o + 3] = Math.round((a / n) * 255); }
  }
  return png(size, px);
}
mkdirSync("icons", { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`icons/${s}.png`, draw(s));
console.log("wrote icons/16.png, 48.png, 128.png");
