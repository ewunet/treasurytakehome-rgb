// The label checks. Input: what the application says + the text read from the label image.
// Output: one row per field with a status of pass / review / fail (plus na / info).
import { findBest, coverage, splitWords, normalizeWord, diffWords } from './text.js';
import { BEVERAGES, WARNING_TEXT } from './rules.js';

/** Below this similarity we call it a mismatch; between this and identical we ask a human. */
export const REVIEW_AT = 0.8;

const RANK = { pass: 0, na: 0, info: 0, review: 1, fail: 2 };
export const worst = (statuses) => statuses.reduce((a, s) => (RANK[s] > RANK[a] ? s : a), 'pass');

const row = (key, label, expected, found, status, message, extra = {}) => ({ key, label, expected, found, status, message, ...extra });
const clip = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const lineAround = (text, index) => {
  const start = text.lastIndexOf('\n', index) + 1;
  const end = text.indexOf('\n', index);
  return clip(text.slice(start, end < 0 ? undefined : end).trim());
};

// ---------- Text fields (brand, class/type, producer, country) ----------
function textField(key, label, expected, text, { required = true, loose = false, naMessage } = {}) {
  const exp = (expected || '').trim();
  if (!exp) {
    return required
      ? row(key, label, '', '', 'review', 'Nothing was entered for this on the application.')
      : row(key, label, '', '', 'na', naMessage || 'Not checked (left blank on the application).');
  }
  const best = findBest(exp, text);
  let score = best.score;
  let found = best.snippet;
  let missing = [];
  if (loose) {
    const cov = coverage(exp, text);
    missing = cov.missing;
    if (cov.score > score) { score = cov.score; found = cov.score >= 0.999 ? 'All words found on the label' : best.snippet; }
  }
  if (score >= 0.999) {
    const same = found.trim() === exp;
    return row(key, label, exp, found, 'pass', same || !best.snippet ? 'Matches.' : 'Matches. Only capitalization or punctuation differs.');
  }
  if (score >= REVIEW_AT) {
    const extra = missing.length ? ` Could not find: ${missing.join(', ')}.` : '';
    return row(key, label, exp, found, 'review', `Very close, but not identical. Check the spelling.${extra}`);
  }
  // Multi-word field where most words were found but a few were not: probably glare or blur hiding a word.
  if (loose && missing.length && score >= 0.6) {
    return row(key, label, exp, found, 'review', `Could not read all of it. Missing: ${missing.join(', ')}. Check the label by eye.`);
  }
  if (score < 0.5) return row(key, label, exp, '', 'fail', 'Not found on the label.');
  return row(key, label, exp, found, 'fail', `Does not match.${missing.length ? ` Could not find: ${missing.join(', ')}.` : ''}`);
}

// ---------- Alcohol content ----------
export function parseAbv(value) {
  const t = String(value || '');
  const num = (x) => parseFloat(x.replace(',', '.'));
  const pct = t.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (pct) return { abv: num(pct[1]) };
  const proof = t.match(/(\d+(?:[.,]\d+)?)\s*proof/i);
  if (proof) return { abv: num(proof[1]) / 2 };
  const bare = t.trim().match(/^(\d+(?:[.,]\d+)?)$/);
  return bare ? { abv: num(bare[1]) } : null;
}

function labelAbv(text) {
  const num = (x) => parseFloat(x.replace(',', '.'));
  const pcts = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*%/g)].map((m) => ({ abv: num(m[1]), line: lineAround(text, m.index) }));
  const proofs = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*proof/gi)].map((m) => ({ proof: num(m[1]), line: lineAround(text, m.index) }));
  return { pcts, proofs };
}

function abvField(app, text, bev) {
  const label = 'Alcohol content';
  const exp = (app.abv || '').trim();
  const { pcts, proofs } = labelAbv(text);
  if (!exp) {
    if (bev.abv === 'optional') return row('abv', label, '', '', 'na', 'Optional for this type of beverage and left blank on the application.');
    if (app.type === 'wine' && /table wine|light wine/i.test(text)) {
      return row('abv', label, '', 'Table wine / light wine', 'na', 'A "table wine" or "light wine" statement can replace the number for 7–14% wine.');
    }
    return row('abv', label, '', '', 'review', 'Nothing was entered for this on the application.');
  }
  const want = parseAbv(exp);
  if (!want) return row('abv', label, exp, '', 'review', 'Could not read a percentage from the application entry. Enter it like "45%".');
  const seen = [...pcts.map((p) => ({ abv: p.abv, line: p.line })), ...proofs.map((p) => ({ abv: p.proof / 2, line: p.line }))];
  const hit = seen.find((s) => Math.abs(s.abv - want.abv) <= 0.051);
  if (!hit) {
    if (!seen.length) return row('abv', label, exp, '', 'fail', 'No alcohol percentage found on the label.');
    return row('abv', label, exp, seen[0].line, 'fail', `Label shows ${seen[0].abv}% but the application says ${want.abv}%.`);
  }
  // Spirits: if both percent and proof are printed, proof should be exactly twice the percent.
  if (pcts.length && proofs.length && Math.abs(proofs[0].proof - pcts[0].abv * 2) > 0.11) {
    return row('abv', label, exp, hit.line, 'review', `Percent (${pcts[0].abv}%) and proof (${proofs[0].proof}) on the label do not agree. Proof should be twice the percent.`);
  }
  if (app.type === 'beer' && /\bABV\b/.test(text)) {
    return row('abv', label, exp, hit.line, 'review', 'The number matches, but "ABV" is not an allowed abbreviation on malt beverage labels. Use "Alc./Vol.".');
  }
  return row('abv', label, exp, hit.line, 'pass', 'Matches.');
}

// ---------- Net contents ----------
const ML = { ml: 1, mi: 1, m1: 1, cl: 10, l: 1000, lt: 1000, liter: 1000, liters: 1000, litre: 1000, litres: 1000,
  floz: 29.5735, fluidounce: 29.5735, fluidounces: 29.5735, oz: 29.5735, pint: 473.176, pints: 473.176, pt: 473.176,
  quart: 946.353, quarts: 946.353, qt: 946.353, gallon: 3785.41, gallons: 3785.41, gal: 3785.41 };
const METRIC = new Set(['ml', 'mi', 'm1', 'cl', 'l', 'lt', 'liter', 'liters', 'litre', 'litres']);
const NET_RE = /(\d+(?:[.,]\d+)?)\s*(ml|mi|m1|cl|litres?|liters?|lt|l|fl\.?\s*oz\.?|fluid\s+ounces?|oz\.?|pints?|pt\.?|quarts?|qt\.?|gallons?|gal\.?)(?![a-z])/gi;

export function parseNet(text) {
  return [...String(text || '').matchAll(NET_RE)].map((m) => {
    const unit = m[2].toLowerCase().replace(/[.\s]/g, '');
    return { ml: parseFloat(m[1].replace(',', '.')) * ML[unit], metric: METRIC.has(unit), line: lineAround(text, m.index), raw: m[0].trim() };
  }).filter((x) => Number.isFinite(x.ml));
}

function netField(app, text, bev) {
  const label = 'Net contents';
  const exp = (app.net || '').trim();
  if (!exp) return row('net', label, '', '', 'review', 'Nothing was entered for this on the application.');
  const want = parseNet(exp);
  if (!want.length) return row('net', label, exp, '', 'review', 'Could not read a volume from the application entry. Enter it like "750 mL".');
  const seen = parseNet(text);
  if (!seen.length) return row('net', label, exp, '', 'fail', 'No net contents found on the label.');
  const same = (a, b) => Math.abs(a - b) <= Math.max(1.5, a * 0.01);
  const hit = seen.find((s) => want.some((w) => same(w.ml, s.ml)));
  if (!hit) return row('net', label, exp, seen[0].line, 'fail', `Label shows ${seen[0].raw} but the application says ${want[0].raw}.`);
  if (bev.units === 'us' && seen.every((s) => s.metric)) {
    return row('net', label, exp, hit.line, 'review', 'The volume matches, but malt beverages must show U.S. measures (such as fl. oz. or pints). Metric alone is not enough.');
  }
  return row('net', label, exp, hit.line, 'pass', 'Matches.');
}

// ---------- Government warning ----------
const ref = WARNING_TEXT.split(/\s+/);

/**
 * boldInfo comes from the image analysis: { verdict: 'bold' | 'not-bold' | 'unknown' }.
 */
export function checkWarning(text, boldInfo = { verdict: 'unknown' }) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const isNear = (w, target) => normalizeWord(w) === target || findBest(target, w).score >= 0.8;
  const start = words.findIndex((w, i) => words[i + 1] && isNear(w, 'government') && isNear(words[i + 1], 'warning'));
  if (start < 0) {
    return { key: 'warning', label: 'Government warning', status: 'fail', message: 'No government warning statement found on the label.', found: '', parts: [], diff: [] };
  }
  const cand = words.slice(start, start + ref.length + 6);
  let diff = diffWords(ref, cand);
  while (diff.length && diff[diff.length - 1].type === 'ins') diff.pop(); // extra label text after the statement
  const bad = diff.filter((d) => d.type !== 'eq');
  const parts = [];

  // 1. Wording
  if (!bad.length) parts.push({ name: 'Wording', status: 'pass', message: 'Word for word.' });
  else {
    const slips = bad.every((d) => d.type === 'sub' && (d.dist <= 1 || d.sim >= 0.6)); // one wrong letter: likely a misread
    const list = bad.slice(0, 4).map((d) => (d.type === 'sub' ? `"${d.label}" instead of "${d.ref}"` : d.type === 'del' ? `missing "${d.ref}"` : `extra "${d.label}"`)).join('; ');
    parts.push(slips
      ? { name: 'Wording', status: 'review', message: `Nearly identical. This may be a misread of a blurry word: ${list}.` }
      : { name: 'Wording', status: 'fail', message: `Does not match the required text: ${list}${bad.length > 4 ? '…' : ''}.` });
  }

  // 2. Capital letters in the heading
  const h1 = cand[0].replace(/[^A-Za-z]/g, '');
  const h2 = cand[1].replace(/[^A-Za-z]/g, '');
  if (h1 === 'GOVERNMENT' && h2 === 'WARNING') {
    parts.push(cand[1].endsWith(':')
      ? { name: 'Capital letters', status: 'pass', message: '"GOVERNMENT WARNING:" is in all capitals.' }
      : { name: 'Capital letters', status: 'review', message: 'All capitals, but the colon after WARNING was not detected.' });
  } else {
    parts.push({ name: 'Capital letters', status: 'fail', message: `The heading must be "GOVERNMENT WARNING:" in all capitals. The label shows "${cand[0]} ${cand[1]}".` });
  }

  // 3. Bold heading
  if (boldInfo.verdict === 'bold') parts.push({ name: 'Bold heading', status: 'pass', message: 'The heading looks bolder than the rest of the statement.' });
  else if (boldInfo.verdict === 'not-bold') parts.push({ name: 'Bold heading', status: 'fail', message: 'The heading does not look bolder than the rest of the statement.' });
  else parts.push({ name: 'Bold heading', status: 'review', message: 'Could not tell if the heading is bold (image too small or blurry). Check by eye.' });

  const status = worst(parts.map((p) => p.status));
  const message = status === 'pass' ? 'Correct wording, capital letters and bold heading.' : parts.filter((p) => p.status !== 'pass').map((p) => p.message).join(' ');
  return { key: 'warning', label: 'Government warning', status, message, found: cand.slice(0, ref.length).join(' '), parts, diff };
}

// ---------- Put it together ----------
export function checkLabel(app, text, boldInfo) {
  const bev = BEVERAGES[app.type] || BEVERAGES.spirits;
  const fields = [
    textField('brand', 'Brand name', app.brand, text),
    textField('classType', 'Class / type', app.classType, text, { loose: true }),
    abvField(app, text, bev),
    netField(app, text, bev),
    textField('producer', 'Bottler name and address', app.producer, text, { loose: true }),
    textField('country', 'Country of origin', app.country, text, { required: false, loose: true, naMessage: 'Not checked. Leave blank for U.S.-made products; fill in for imports.' }),
  ];
  if (app.type === 'wine') {
    const has = /sulfites?/i.test(text);
    fields.push(row('sulfites', 'Sulfite statement', '', has ? 'Contains sulfites' : '', 'info',
      has ? 'A sulfite statement is on the label.' : 'No sulfite statement seen. It is only required if the wine has 10 ppm or more sulfur dioxide.'));
  }
  const warning = checkWarning(text, boldInfo);
  const status = worst([...fields.map((f) => f.status), warning.status]);
  return { status, fields, warning };
}

/** Used to decide which OCR attempt is better: fewer problems wins. */
export function score(result) {
  return [...result.fields, result.warning].reduce((s, r) => s + (r.status === 'pass' ? 2 : r.status === 'review' ? 1 : 0), 0);
}

export const STATUS_TEXT = { pass: 'Matches', review: 'Take a look', fail: 'Does not match', na: 'Not checked', info: 'Note' };
export const OVERALL_TEXT = {
  pass: 'Everything matches',
  review: 'Needs a quick look',
  fail: 'Problems found',
};
