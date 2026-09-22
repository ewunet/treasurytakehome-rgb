// Bold detection. OCR gives us text but not font weight, so we measure stroke thickness:
// for each word we look at the length of the dark horizontal runs (which mostly cross the
// vertical stems of letters) and compare "GOVERNMENT WARNING:" with the sentences after it.
// Bold type has visibly thicker stems at the same font size.
import { normalizeWord, similarity } from './text.js';

/** Otsu threshold for a 256-bin histogram. */
export function otsu(hist, total) {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; threshold = t; }
  }
  return threshold;
}

/** Collect the lengths of dark horizontal runs inside each box. */
export function inkRuns(gray, width, boxes) {
  const runs = [];
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor(b.x0)), x1 = Math.min(width, Math.ceil(b.x1));
    const y0 = Math.max(0, Math.floor(b.y0)), y1 = Math.ceil(b.y1);
    if (x1 - x0 < 2 || y1 - y0 < 2) continue;
    const hist = new Uint32Array(256);
    let total = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { hist[gray[y * width + x]]++; total++; }
    const thr = otsu(hist, total);
    for (let y = y0; y < y1; y++) {
      let run = 0;
      for (let x = x0; x < x1; x++) {
        if (gray[y * width + x] <= thr) run++;
        else if (run) { runs.push(run); run = 0; }
      }
      if (run) runs.push(run);
    }
  }
  return runs;
}

/** Average stem thickness in pixels (drops the longest quarter of runs: crossbars, curves). */
export function meanStroke(gray, width, boxes) {
  const runs = inkRuns(gray, width, boxes).sort((a, b) => a - b);
  if (runs.length < 20) return 0;
  const kept = runs.slice(0, Math.max(1, Math.floor(runs.length * 0.75)));
  return kept.reduce((s, v) => s + v, 0) / kept.length;
}

const near = (a, b) => similarity(normalizeWord(a), b) >= 0.75;

/**
 * words: [{ text, bbox: {x0,y0,x1,y1} }] in reading order (from OCR), gray: Uint8 pixels.
 * Returns { verdict: 'bold' | 'not-bold' | 'unknown', ratio, headingStroke, bodyStroke }.
 */
export function warningBoldInfo(gray, width, words) {
  const unknown = { verdict: 'unknown', ratio: null, headingStroke: null, bodyStroke: null };
  const i = words.findIndex((w, k) => near(w.text, 'government') && words[k + 1] && near(words[k + 1].text, 'warning'));
  if (i < 0) return unknown;
  const heading = [words[i], words[i + 1]];
  const headH = Math.max(...heading.map((w) => w.bbox.y1 - w.bbox.y0));
  // Body words: the next ~40 words that are roughly the same text height as the heading.
  const body = words.slice(i + 2, i + 45).filter((w) => {
    const h = w.bbox.y1 - w.bbox.y0;
    return h >= headH * 0.55 && h <= headH * 1.6 && w.text.replace(/[^a-z]/gi, '').length >= 3;
  });
  if (body.length < 8) return unknown;
  const headingStroke = meanStroke(gray, width, heading.map((w) => w.bbox));
  const bodyStroke = meanStroke(gray, width, body.map((w) => w.bbox));
  if (!headingStroke || !bodyStroke || bodyStroke < 1.2) return { ...unknown, headingStroke, bodyStroke };
  // Regular text has thin stems compared with its height. If the stems are fat, the photo is blurry
  // (blur smears thin and thick strokes toward the same width) or the whole paragraph is bold.
  const heights = body.map((w) => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const stemToHeight = bodyStroke / heights[Math.floor(heights.length / 2)];
  if (stemToHeight > MAX_BODY_STEM) return { ...unknown, headingStroke, bodyStroke, stemToHeight };
  const ratio = headingStroke / bodyStroke;
  const verdict = ratio >= BOLD_RATIO ? 'bold' : ratio <= REGULAR_RATIO ? 'not-bold' : 'unknown';
  return { verdict, ratio, headingStroke, bodyStroke, stemToHeight };
}

// Tuned on rendered samples (see tests/stroke.test.mjs). In between = "can't tell" -> human review.
export const BOLD_RATIO = 1.3;
export const REGULAR_RATIO = 1.15;
export const MAX_BODY_STEM = 0.16;
