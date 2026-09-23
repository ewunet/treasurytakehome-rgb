// Small, dependency-free text helpers used by the label checks.
// Everything here is pure (no browser APIs) so it can be unit tested in Node.

/** Lowercase, strip accents/punctuation. "Stone's Throw!" -> "stones" + "throw" (per word). */
export function normalizeWord(word) {
    return String(word ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]/g, '');
  }
  
  /** Split text into words, keeping the original spelling next to the normalized one. */
  export function splitWords(text) {
    return String(text ?? '')
      .split(/\s+/)
      .map((raw) => ({ raw, norm: normalizeWord(raw) }))
      .filter((w) => w.norm);
  }
  
  /** Classic edit distance (two-row DP). */
  export function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }
  
  /** 1 = identical, 0 = nothing in common. */
  export function similarity(a, b) {
    const longest = Math.max(a.length, b.length);
    return longest === 0 ? 1 : 1 - levenshtein(a, b) / longest;
  }
  
  /**
   * Find the stretch of `text` that looks most like `needle`.
   * Works on word windows and ignores spaces, so "OLD TOM" also matches "OLDTOM".
   * Returns { score (0..1), snippet (the label's own words) }.
   */
  export function findBest(needle, text) {
    const n = splitWords(needle);
    const h = splitWords(text);
    if (!n.length || !h.length) return { score: 0, snippet: '' };
    const target = n.map((w) => w.norm).join('');
    let best = { score: 0, snippet: '' };
    outer:
    for (let size = Math.max(1, n.length - 1); size <= n.length + 1; size++) {
      for (let i = 0; i + size <= h.length; i++) {
        const win = h.slice(i, i + size);
        const cand = win.map((w) => w.norm).join('');
        if (Math.abs(cand.length - target.length) / Math.max(cand.length, target.length) > 1 - best.score) continue;
        const score = similarity(target, cand);
        if (score > best.score) {
          best = { score, snippet: win.map((w) => w.raw).join(' ') };
          if (best.score >= 0.999) break outer;
        }
      }
    }
    return best;
  }
  
  /**
   * Word-by-word coverage: how many of the needle's words appear (roughly) anywhere in the text.
   * Good for long values like "Distilled by Old Tom Distillery, Bardstown, Kentucky" where the
   * label may break the line in odd places.
   */
  export function coverage(needle, text) {
    const n = splitWords(needle);
    const h = splitWords(text);
    if (!n.length) return { score: 1, missing: [] };
    const missing = [];
    let total = 0;
    for (const word of n) {
      let best = 0;
      for (const cand of h) {
        best = Math.max(best, similarity(word.norm, cand.norm));
        if (best >= 0.999) break;
      }
      if (best >= 0.8) total += best;
      else missing.push(word.raw.replace(/[,.;]+$/, ''));
    }
    return { score: total / n.length, missing };
  }
  
  /**
   * Word-level diff between the required text and what the label says.
   * Ops: eq (same), sub (changed word), del (word missing on label), ins (extra word on label).
   */
  export function diffWords(refWords, labelWords) {
    const a = refWords.map(normalizeWord);
    const b = labelWords.map(normalizeWord);
    const cost = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) cost[i][0] = i;
    for (let j = 1; j <= b.length; j++) cost[0][j] = j;
    const subCost = (i, j) => (a[i] === b[j] ? 0 : 1 - similarity(a[i], b[j]) * 0.5);
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        cost[i][j] = Math.min(
          cost[i - 1][j] + 1,
          cost[i][j - 1] + 1,
          cost[i - 1][j - 1] + subCost(i - 1, j - 1),
        );
      }
    }
    const ops = [];
    let i = a.length;
    let j = b.length;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && Math.abs(cost[i][j] - (cost[i - 1][j - 1] + subCost(i - 1, j - 1))) < 1e-9) {
        const same = a[i - 1] === b[j - 1];
        ops.push({ type: same ? 'eq' : 'sub', ref: refWords[i - 1], label: labelWords[j - 1], sim: similarity(a[i - 1], b[j - 1]), dist: levenshtein(a[i - 1], b[j - 1]) });
        i--; j--;
      } else if (i > 0 && Math.abs(cost[i][j] - (cost[i - 1][j] + 1)) < 1e-9) {
        ops.push({ type: 'del', ref: refWords[i - 1] });
        i--;
      } else {
        ops.push({ type: 'ins', label: labelWords[j - 1] });
        j--;
      }
    }
    return ops.reverse();
  }
  