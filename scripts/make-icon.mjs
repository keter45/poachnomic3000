// Gera build/icon.png (1024×1024) — um radar roxo sobre fundo escuro — sem dependências externas.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const S = 1024;
const SS = 3; // supersampling para bordas suaves
const bg = [20, 23, 30];
const accent = [167, 139, 250];
const accentDim = [109, 84, 196];

// distância com sinal até um quadrado de cantos arredondados (negativa = dentro)
function roundedRect(x, y, half, r) {
  const qx = Math.abs(x) - half + r;
  const qy = Math.abs(y) - half + r;
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function sample(px, py) {
  // coordenadas centradas, em unidades de 0..1024
  const x = px - S / 2;
  const y = py - S / 2;
  if (roundedRect(x, y, S * 0.44, S * 0.2) > 0) return null; // fora do ícone
  const d = Math.hypot(x, y);
  const ang = Math.atan2(y, x);
  const ring = (radius, w) => Math.abs(d - radius) < w;

  // camadas de cima para baixo: alvo, anéis, cruz, centro, varredura, fundo
  if (Math.hypot(x - 150, y + 150) < 34) return accent; // alvo encontrado
  if (ring(330, 14) || ring(215, 10) || ring(100, 8)) return accent;
  if (d < 22) return accent;
  if ((Math.abs(x) < 6 || Math.abs(y) < 6) && d < 345) return accentDim;
  // varredura do radar: cunha que some ao longo do ângulo
  const sweepStart = -Math.PI / 2;
  let delta = ang - sweepStart;
  while (delta < 0) delta += Math.PI * 2;
  if (d < 330 && delta < 1.1) {
    const t = 1 - delta / 1.1;
    const mix = (a, b) => Math.round(a + (b - a) * t * 0.55);
    return [mix(bg[0], accentDim[0]), mix(bg[1], accentDim[1]), mix(bg[2], accentDim[2])];
  }
  return bg;
}

const pixels = Buffer.alloc(S * S * 4);
for (let y = 0; y < S; y++) {
  for (let x = 0; x < S; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const c = sample(x + (sx + 0.5) / SS, y + (sy + 0.5) / SS);
        if (!c) continue;
        r += c[0]; g += c[1]; b += c[2]; a += 1;
      }
    }
    const i = (y * S + x) * 4;
    const n = SS * SS;
    pixels[i] = a ? Math.round(r / a) : 0;
    pixels[i + 1] = a ? Math.round(g / a) : 0;
    pixels[i + 2] = a ? Math.round(b / a) : 0;
    pixels[i + 3] = Math.round((a / n) * 255);
  }
}

// --- PNG ---
const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0);
ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA
const raw = Buffer.alloc((S * 4 + 1) * S);
for (let y = 0; y < S; y++) pixels.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = path.join(process.cwd(), "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log(`✓ ${out} (${(png.length / 1024).toFixed(0)} KB)`);
