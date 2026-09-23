// Runs OCR in the browser (Tesseract.js, self-hosted, no network calls) and ties it to the checks.
import { toGray, stretch, flattenBackground, targetScale } from './prep.js';
import { warningBoldInfo } from './stroke.js';
import { checkLabel, score } from './checks.js';



const url = (path) => new URL(path, document.baseURI).href;

// Per-stage timing totals (ms), for finding slow steps. Read with getStageTimings() in the console.
const stageTimings = {};
function record(stage, value) {
  const t = (stageTimings[stage] ||= { count: 0, total: 0 });
  t.count++; t.total += value;
}
export function getStageTimings() {
  return Object.fromEntries(Object.entries(stageTimings).map(([k, t]) => [k, { count: t.count, avg: +(t.total / t.count).toFixed(1) }]));
}
export function resetStageTimings() { for (const k of Object.keys(stageTimings)) delete stageTimings[k]; }

/** Hands out workers one at a time so several labels can be read in parallel. */
class Pool {
  constructor(workers) { this.free = [...workers]; this.waiting = []; this.size = workers.length; }
  acquire() { return this.free.length ? Promise.resolve(this.free.pop()) : new Promise((r) => this.waiting.push(r)); }
  release(w) { const next = this.waiting.shift(); if (next) next(w); else this.free.push(w); }
  async run(fn) { const w = await this.acquire(); try { return await fn(w); } finally { this.release(w); } }
}

let poolPromise = null;

/** Start the OCR workers. Safe to call more than once. */
export function startEngine() {
  if (poolPromise) return poolPromise;
  if (typeof Tesseract === 'undefined') {
    poolPromise = Promise.reject(new Error('The reading engine files are missing. Run "npm run build" and reload.'));
    return poolPromise;
  }
  const count = Math.min(3, Math.max(1, (navigator.hardwareConcurrency || 4) - 1));
  poolPromise = Promise.all(Array.from({ length: count }, async () => {
    const worker = await Tesseract.createWorker('eng', 1, {
      workerPath: url('vendor/worker.min.js'),
      corePath: url('vendor/core'),
      langPath: url('vendor/lang'),
      workerBlobURL: false,
    });
    await worker.setParameters({ user_defined_dpi: '300', preserve_interword_spaces: '1', tessedit_pageseg_mode: '3' });
    return worker;
  })).then((workers) => new Pool(workers));
  return poolPromise;
}

export const engineSize = async () => (await startEngine()).size;

/** Decode the picture and resize it (big photos shrink for speed, small ones grow for accuracy). */
export async function prepareImage(file) {
  const bitmap = await createImageBitmap(file).catch(() => { throw new Error('This file could not be opened as a picture.'); });
  const scale = targetScale(bitmap.width, bitmap.height);
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return { width, height, gray: toGray(ctx.getImageData(0, 0, width, height).data, width, height) };
}

/** Turns grayscale pixels back into a canvas that the OCR engine can read. */
function grayToCanvas(gray, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) { image.data[p] = image.data[p + 1] = image.data[p + 2] = gray[i]; image.data[p + 3] = 255; }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

// Two ways of cleaning up the picture. Plain contrast stretch first (fast, safest for sharp images).
// If the result is not clean, try again after evening out shadows and uneven light, which rescues
// photos taken under bad lighting but can hurt small, blurry text, so it is the second choice.
const VARIANTS = [
  (gray) => stretch(gray),
  (gray, width, height) => flattenBackground(gray, width, height),
];

const flattenWords = (data) => (data.blocks || []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words)));

async function recognize(pool, canvas) {
  return pool.run(async (worker) => {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const words = (data.words && data.words.length ? data.words : flattenWords(data)).map((w) => ({ text: w.text, bbox: w.bbox }));
    return { text: data.text || '', words };
  });
}
/**
 * Read one label and check it against its application.
 * Stops at the first clean pass; otherwise keeps the attempt with the fewest problems.
 */
export async function analyzeLabel(file, app) {
  const totalStart = performance.now();
  const pool = await startEngine();

  const prepStart = performance.now();
  const prepared = await prepareImage(file);
  record('prepare', performance.now() - prepStart);

  let best = null;
  let variantsRun = 0;
  for (const clean of VARIANTS) {
    variantsRun++;

    const cleanStart = performance.now();
    const gray = clean(prepared.gray, prepared.width, prepared.height);
    record('clean', performance.now() - cleanStart);

    const recognizeStart = performance.now();
    const ocr = await recognize(pool, grayToCanvas(gray, prepared.width, prepared.height));
    record('recognize', performance.now() - recognizeStart);

    const boldStart = performance.now();
    const boldInfo = warningBoldInfo(gray, prepared.width, ocr.words);
    record('boldInfo', performance.now() - boldStart);

    const attempt = { text: ocr.text, boldInfo, result: checkLabel(app, ocr.text, boldInfo) };
    if (!best || score(attempt.result) > score(best.result)) best = attempt;
    if (best.result.status === 'pass') break;
  }

  record('variantsPerImage', variantsRun);
  record('total', performance.now() - totalStart);
  return best;
}
