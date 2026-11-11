// Renders the app mark SVGs in assets/source/ to PNGs.
//   node scripts/render-assets.mjs --preview   writes only into assets/source/preview/
//   node scripts/render-assets.mjs             writes the real files in assets/images/
// Colors come from src/theme.ts: background #1A1A1A, surface #262626.
import sharp from 'sharp';
import { Buffer } from 'node:buffer';
import { mkdirSync } from 'node:fs';
import process from 'node:process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (name) => join(root, 'assets', 'source', `${name}.svg`);
const previewDir = join(root, 'assets', 'source', 'preview');
const imagesDir = join(root, 'assets', 'images');
const preview = process.argv.includes('--preview');

const BACKGROUND = '#1A1A1A';
const SURFACE = '#262626';

// density keeps the vector crisp when the SVG is rasterized at its target size.
// Decision B: sizes up to SMALL_MAX use the simpler "-small" variant (two lines, bigger
// checks, four larger teeth). The notification icon is always the simple design and the
// splash is always the full one, so neither has a "-small" file.
const SMALL_MAX = 96;
const HAS_SMALL = new Set(['icon', 'adaptive-foreground', 'adaptive-monochrome']);
const render = (name, size) =>
  sharp(src(HAS_SMALL.has(name) && size <= SMALL_MAX ? `${name}-small` : name), { density: (72 * size) / 1024 * 4 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

const solid = (size, color) =>
  sharp({ create: { width: size, height: size, channels: 4, background: color } })
    .png()
    .toBuffer();

const onDark = async (buf, size) =>
  sharp(await solid(size, BACKGROUND)).composite([{ input: buf }]).png().toBuffer();

// Android masks the 108 dp canvas to roughly a 72 dp circle or a rounded square.
const maskSvg = (size, shape) => {
  const d = size * (72 / 108);
  const c = size / 2;
  const s =
    shape === 'circle'
      ? `<circle cx="${c}" cy="${c}" r="${d / 2}" fill="#fff"/>`
      : `<rect x="${c - d / 2}" y="${c - d / 2}" width="${d}" height="${d}" rx="${d * 0.28}" fill="#fff"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${s}</svg>`);
};

const masked = async (layers, size, shape) =>
  sharp(await layers)
    .composite([{ input: maskSvg(size, shape), blend: 'dest-in' }])
    .png()
    .toBuffer();

const adaptive = async (size) =>
  sharp(await render('adaptive-background', size))
    .composite([{ input: await render('adaptive-foreground', size) }])
    .png()
    .toBuffer();

const write = async (dir, file, buf) => {
  mkdirSync(dir, { recursive: true });
  await sharp(buf).toFile(join(dir, file));
  console.log('wrote', join(dir, file));
};

const runPreview = async () => {
  const tiles = {};
  // Preview mode writes only sheet.png; the tiles stay in memory.
  const out = async (file, buf) => {
    tiles[file] = buf;
  };

  for (const s of [512, 192, 96, 48]) await out(`icon-${s}.png`, await render('icon', s));

  for (const s of [432, 108, 96, 48]) {
    const base = await adaptive(s);
    await out(`adaptive-circle-${s}.png`, await masked(base, s, 'circle'));
    await out(`adaptive-rounded-${s}.png`, await masked(base, s, 'rounded'));
    // Monochrome: the OS tints it; shown here white on the dark background, circle masked.
    const mono = await onDark(await render('adaptive-monochrome', s), s);
    await out(`monochrome-${s}.png`, await masked(mono, s, 'circle'));
  }

  await out('splash-288.png', await onDark(await render('splash', 288), 288));

  for (const s of [96, 48]) {
    await out(`notification-dark-${s}.png`, await onDark(await render('notification', s), s));
  }

  // Contact sheet: rows of previews on the surface color (slightly lighter than the
  // icon background so the icon edges stay visible), with a gap between them.
  const gap = 24;
  const rows = [
    // The 48 px row, set apart by rules above and below.
    'rule',
    ['icon-48.png', 'adaptive-circle-48.png', 'adaptive-rounded-48.png', 'monochrome-48.png', 'notification-dark-48.png'],
    'rule',
    ['icon-512.png', 'icon-192.png', 'splash-288.png'],
    ['icon-96.png', 'adaptive-circle-96.png', 'adaptive-rounded-96.png', 'monochrome-96.png', 'notification-dark-96.png'],
    ['adaptive-circle-432.png', 'adaptive-rounded-432.png', 'monochrome-432.png'],
    ['adaptive-circle-108.png', 'adaptive-rounded-108.png', 'monochrome-108.png'],
  ];
  const sizeOf = async (f) => (await sharp(tiles[f]).metadata()).width;
  const layout = [];
  const rules = [];
  let y = gap;
  let width = 0;
  for (const row of rows) {
    if (row === 'rule') {
      rules.push(y);
      y += 4 + gap;
      continue;
    }
    let x = gap;
    let h = 0;
    for (const f of row) {
      const s = await sizeOf(f);
      layout.push({ input: tiles[f], left: x, top: y });
      x += s + gap;
      h = Math.max(h, s);
    }
    width = Math.max(width, x);
    y += h + gap;
  }
  const ruleBuf = await solid(1, '#9CA3AF'); // theme textSecondary
  for (const ry of rules) {
    layout.push({ input: await sharp(ruleBuf).resize(width - gap, 4).png().toBuffer(), left: gap / 2, top: ry });
  }
  const sheet = await sharp({
    create: { width, height: y, channels: 4, background: SURFACE },
  })
    .composite(layout)
    .png()
    .toBuffer();
  await write(previewDir, 'sheet.png', sheet);
};

const runReal = async () => {
  await write(imagesDir, 'icon.png', await sharp(await render('icon', 1024)).flatten({ background: BACKGROUND }).png().toBuffer());
  await write(imagesDir, 'android-icon-foreground.png', await render('adaptive-foreground', 432));
  await write(imagesDir, 'android-icon-background.png', await render('adaptive-background', 432));
  await write(imagesDir, 'android-icon-monochrome.png', await render('adaptive-monochrome', 432));
  await write(imagesDir, 'splash-icon.png', await render('splash', 288));
  await write(imagesDir, 'notification-icon.png', await render('notification', 96));
};

await (preview ? runPreview() : runReal());
