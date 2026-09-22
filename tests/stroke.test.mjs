import test from 'node:test';
import assert from 'node:assert/strict';
import { meanStroke, warningBoldInfo } from '../src/js/stroke.js';

// Synthetic "text": rows of vertical stems of a given width on a white page.
function page(width, height, blocks) {
  const gray = new Uint8Array(width * height).fill(255);
  for (const { x0, y0, w, stem, gap = 8, count } of blocks) {
    for (let k = 0; k < count; k++) for (let y = y0; y < y0 + 20; y++) for (let x = 0; x < stem; x++) gray[y * width + x0 + k * (stem + gap) + x] = 20;
    void w;
  }
  return gray;
}

test('thicker stems measure thicker', () => {
  const gray = page(400, 60, [{ x0: 10, y0: 5, stem: 2, count: 12 }, { x0: 10, y0: 35, stem: 4, count: 12 }]);
  const thin = meanStroke(gray, 400, [{ x0: 5, y0: 0, x1: 200, y1: 30 }]);
  const thick = meanStroke(gray, 400, [{ x0: 5, y0: 30, x1: 200, y1: 60 }]);
  assert.ok(Math.abs(thin - 2) < 0.2 && Math.abs(thick - 4) < 0.2, `${thin} ${thick}`);
});

function paragraph(headingStem) {
  const width = 900, gray = page(width, 200, [{ x0: 10, y0: 10, stem: headingStem, count: 14, gap: 6 }, { x0: 10, y0: 60, stem: 2, count: 60, gap: 6 }]);
  const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });
  const words = [
    { text: 'GOVERNMENT', bbox: box(10, 10, 100, 30) }, { text: 'WARNING:', bbox: box(105, 10, 190, 30) },
    ...Array.from({ length: 12 }, (_, i) => ({ text: 'alcoholic', bbox: box(10 + i * 60, 60, 60 + i * 60, 80) })),
  ];
  return warningBoldInfo(gray, width, words);
}

test('warning heading: bold vs regular', () => {
  assert.equal(paragraph(4).verdict, 'bold');
  assert.equal(paragraph(2).verdict, 'not-bold');
});

test('no warning found -> unknown, never a guess', () => {
  assert.equal(warningBoldInfo(new Uint8Array(100), 10, [{ text: 'hello', bbox: { x0: 0, y0: 0, x1: 5, y1: 5 } }]).verdict, 'unknown');
});
