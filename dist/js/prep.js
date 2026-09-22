// Image clean-up before OCR. Pure functions on pixel arrays (no DOM), so they can be tested in Node.
// Goal: make photos with uneven light, shadows or a washed-out look easier to read.

/** RGBA bytes -> grayscale bytes. */
export function toGray(rgba, width, height) {
    const gray = new Uint8ClampedArray(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
      gray[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2];
    }
    return gray;
  }
  
  /**
   * Removes uneven lighting: divide each pixel by the local average brightness (a big box blur),
   * then stretch the contrast. Shadows and gradients flatten out; text stays dark on light.
   */
  export function flattenBackground(gray, width, height) {
    const w1 = width + 1;
    const integral = new Float64Array(w1 * (height + 1));
    for (let y = 1; y <= height; y++) {
      let rowSum = 0;
      for (let x = 1; x <= width; x++) {
        rowSum += gray[(y - 1) * width + (x - 1)];
        integral[y * w1 + x] = integral[(y - 1) * w1 + x] + rowSum;
      }
    }
    const r = Math.max(15, Math.round(Math.min(width, height) * 0.04));
    const out = new Uint8ClampedArray(gray.length);
    for (let y = 0; y < height; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(height, y + r + 1);
      for (let x = 0; x < width; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(width, x + r + 1);
        const sum = integral[y1 * w1 + x1] - integral[y0 * w1 + x1] - integral[y1 * w1 + x0] + integral[y0 * w1 + x0];
        const mean = sum / ((x1 - x0) * (y1 - y0));
        const v = Math.min(255, (gray[y * width + x] * 200) / Math.max(mean, 30));
        out[y * width + x] = v;
      }
    }
    return stretch(out);
  }
  
  /** Contrast stretch between the 1st and 99th percentile of brightness. */
  export function stretch(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let acc = 0, lo = 0, hi = 255;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.01) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.01) { hi = i; break; } }
    if (hi - lo < 40) return gray; // nearly blank image: leave as is
    const out = new Uint8ClampedArray(gray.length);
    const scale = 255 / (hi - lo);
    for (let i = 0; i < out.length; i++) out[i] = (gray[i] - lo) * scale;
    return out;
  }
  
  /** Target size: big photos shrink (speed), small ones grow a little (accuracy). */
  export function targetScale(width, height, max = 1800, min = 1200) {
    const longest = Math.max(width, height);
    if (longest > max) return max / longest;
    if (longest < min) return Math.min(2, 1500 / longest);
    return 1;
  }
  