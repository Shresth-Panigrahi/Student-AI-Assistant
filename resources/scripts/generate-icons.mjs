import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', '..');
const sourcePath = path.join(rootDir, 'webapp', 'src', 'assets', 'logo.png');
const iconsDir = path.join(rootDir, 'resources', 'icons');

const pngSizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];

function background() {
  return { r: 7, g: 10, b: 18, alpha: 1 };
}

async function paddedSquare(size) {
  return sharp(sourcePath)
    .resize(size, size, {
      fit: 'contain',
      background: background()
    })
    .png()
    .toBuffer();
}

async function writePng(filePath, size) {
  await writeFile(filePath, await paddedSquare(size));
}

async function main() {
  await rm(iconsDir, { recursive: true, force: true });
  await mkdir(iconsDir, { recursive: true });

  for (const size of pngSizes) {
    await writePng(path.join(iconsDir, `${size}x${size}.png`), size);
  }

  await writePng(path.join(iconsDir, 'icon.png'), 1024);

  const icoBuffer = await pngToIco(
    [16, 24, 32, 48, 64, 128, 256].map((size) => path.join(iconsDir, `${size}x${size}.png`))
  );
  await writeFile(path.join(iconsDir, 'icon.ico'), icoBuffer);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
