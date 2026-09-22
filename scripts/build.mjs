// Builds ./dist: the app files + samples + the OCR engine files (self-hosted, so the app never
// needs to reach the internet). Run with: npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const skipVendor = process.argv.includes('--skip-vendor');

fs.rmSync(dist, { recursive: true, force: true });
fs.cpSync(path.join(root, 'src'), dist, { recursive: true });
fs.mkdirSync(path.join(dist, 'samples'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'samples'))) {
  if (/\.(png|csv)$/.test(f)) fs.copyFileSync(path.join(root, 'samples', f), path.join(dist, 'samples', f));
}

if (!skipVendor) {
  const find = (...candidates) => {
    const hit = candidates.find((p) => fs.existsSync(path.join(root, p)));
    if (!hit) {
      console.error(`Missing ${candidates[0]}. Run "npm install" first.`);
      process.exit(1);
    }
    return path.join(root, hit);
  };
  const vendor = path.join(dist, 'vendor');
  fs.mkdirSync(path.join(vendor, 'core'), { recursive: true });
  fs.mkdirSync(path.join(vendor, 'lang'), { recursive: true });

  fs.copyFileSync(find('node_modules/tesseract.js/dist/tesseract.min.js'), path.join(vendor, 'tesseract.min.js'));
  fs.copyFileSync(find('node_modules/tesseract.js/dist/worker.min.js'), path.join(vendor, 'worker.min.js'));

  const coreDir = find('node_modules/tesseract.js-core/package.json', 'node_modules/tesseract.js/node_modules/tesseract.js-core/package.json');
  const coreRoot = path.dirname(coreDir);
  for (const f of fs.readdirSync(coreRoot)) {
    if (f.startsWith('tesseract-core')) fs.copyFileSync(path.join(coreRoot, f), path.join(vendor, 'core', f));
  }

  const lang = find('node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz');
  fs.copyFileSync(lang, path.join(vendor, 'lang', 'eng.traineddata.gz'));
}
console.log(`Built ${path.relative(process.cwd(), dist) || 'dist'}${skipVendor ? ' (without OCR engine files)' : ''}`);
