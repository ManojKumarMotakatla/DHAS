/**
 * DHAS — generate-icons.js
 * Run from your project root: node generate-icons.js
 * Creates frontend/icons/ folder with all required PWA icon sizes.
 * Requires: npm install canvas  (run once before executing)
 *
 * NOTE: Rename this file from generate_icons.json to generate_icons.js
 * then run: node generate_icons.js
 */

const { createCanvas } = require("canvas");
const fs   = require("fs");
const path = require("path");

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUT   = path.join(__dirname, "frontend", "icons");

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx    = canvas.getContext("2d");

  // ── Background: rounded rect with navy→blue gradient ─────
  const pad  = size * 0.08;
  const r    = size * 0.22;
  const s    = size - pad * 2;

  const grad = ctx.createLinearGradient(pad, pad, pad + s, pad + s);
  grad.addColorStop(0, "#112057");
  grad.addColorStop(1, "#2a6cf6");

  // Rounded rectangle background
  ctx.beginPath();
  ctx.moveTo(pad + r, pad);
  ctx.lineTo(pad + s - r, pad);
  ctx.quadraticCurveTo(pad + s, pad, pad + s, pad + r);
  ctx.lineTo(pad + s, pad + s - r);
  ctx.quadraticCurveTo(pad + s, pad + s, pad + s - r, pad + s);
  ctx.lineTo(pad + r, pad + s);
  ctx.quadraticCurveTo(pad, pad + s, pad, pad + s - r);
  ctx.lineTo(pad, pad + r);
  ctx.quadraticCurveTo(pad, pad, pad + r, pad);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Heart icon (white) ─────────────────────────────────
  const cx  = size / 2;
  const cy  = size / 2 + size * 0.03;
  const hw  = size * 0.26;

  ctx.save();
  ctx.fillStyle  = "#ffffff";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth  = 0;

  ctx.beginPath();
  ctx.moveTo(cx, cy + hw * 0.8);
  ctx.bezierCurveTo(
    cx - hw * 1.0, cy + hw * 0.3,
    cx - hw * 1.2, cy - hw * 0.5,
    cx - hw * 0.5, cy - hw * 0.5
  );
  ctx.bezierCurveTo(
    cx - hw * 0.1, cy - hw * 0.5,
    cx,             cy - hw * 0.1,
    cx,             cy - hw * 0.1
  );
  ctx.bezierCurveTo(
    cx,             cy - hw * 0.1,
    cx + hw * 0.1, cy - hw * 0.5,
    cx + hw * 0.5, cy - hw * 0.5
  );
  ctx.bezierCurveTo(
    cx + hw * 1.2, cy - hw * 0.5,
    cx + hw * 1.0, cy + hw * 0.3,
    cx,             cy + hw * 0.8
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ── Teal accent dot (top-right of heart) ──────────────
  ctx.beginPath();
  ctx.arc(cx + hw * 0.52, cy - hw * 0.52, size * 0.048, 0, Math.PI * 2);
  ctx.fillStyle = "#00c9b1";
  ctx.fill();

  return canvas.toBuffer("image/png");
}

SIZES.forEach(size => {
  const buffer = drawIcon(size);
  const file   = path.join(OUT, `icon-${size}.png`);
  fs.writeFileSync(file, buffer);
  console.log(`✅ Created icon-${size}.png`);
});

console.log(`\n🎉 All ${SIZES.length} icons saved to frontend/icons/`);
console.log("Run this once, then icons will work for PWA installation.\n");