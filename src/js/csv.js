import { CSV_ALIASES, guessBeverageType } from './rules.js';

/** Minimal CSV reader: quotes, escaped quotes, CRLF, BOM. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

const clean = (s) => String(s).trim().toLowerCase().replace(/[\s-]+/g, '_');

/** Turn CSV rows into application objects with our standard field names. */
export function rowsToApplications(rows) {
  if (rows.length < 2) return [];
  const header = rows[0].map(clean);
  const column = {};
  for (const [key, names] of Object.entries(CSV_ALIASES)) {
    const idx = header.findIndex((h) => names.includes(h));
    if (idx >= 0) column[key] = idx;
  }
  if (column.filename === undefined) {
    throw new Error('The spreadsheet needs a "filename" column so each row can be matched to a label image.');
  }
  return rows.slice(1).map((r) => {
    const get = (k) => (column[k] === undefined ? '' : (r[column[k]] ?? '').trim());
    return {
      filename: get('filename'),
      type: guessBeverageType(get('type')),
      brand: get('brand'),
      classType: get('classType'),
      abv: get('abv'),
      net: get('net'),
      producer: get('producer'),
      country: get('country'),
    };
  });
}

/** Image files and rows are paired by file name (with or without the extension, ignoring case). */
export function pairFilesWithApplications(files, apps) {
  const stem = (n) => n.trim().toLowerCase().replace(/\.[a-z0-9]+$/, '');
  const byName = new Map(apps.map((a) => [stem(a.filename), a]));
  const used = new Set();
  const pairs = files.map((file) => {
    const app = byName.get(stem(file.name)) || null;
    if (app) used.add(app);
    return { file, app };
  });
  const missingImages = apps.filter((a) => !used.has(a));
  return { pairs, missingImages };
}

export function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
