import { startEngine, engineSize, analyzeLabel } from './engine.js';
import { checkLabel, STATUS_TEXT, OVERALL_TEXT } from './checks.js';
import { parseCsv, rowsToApplications, pairFilesWithApplications, toCsv } from './csv.js';

const $ = (sel, root = document) => root.querySelector(sel);
const GLYPH = { pass: '✓', review: '!', fail: '✕', na: '–', info: 'i' };

// Short descriptions shown in the "Load an example" menu.
const EXAMPLE_NOTES = {
  'old-tom-distillery.png': 'bourbon, everything matches',
  'stones-throw-ipa.png': 'beer, brand capitalized differently',
  'harbor-point-cabernet.png': 'wine, everything matches',
  'chateau-belmont.png': 'imported wine, accent differs',
  'silver-creek-rye.png': 'warning statement is wrong',
  'red-fox-vodka.png': 'alcohol content does not match',
  'pine-hollow-gin.png': 'warning heading is not bold',
  'maple-ridge-bourbon-photo.png': 'blurry, tilted photo with glare',
};

/** Tiny DOM helper. Uses textContent everywhere, so label text can never inject HTML. */
function el(tag, props = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) node.append(kid.nodeType ? kid : document.createTextNode(kid));
  return node;
}

const chip = (status, text) => el('span', { class: `chip ${status}` }, el('i', { 'aria-hidden': 'true' }, GLYPH[status]), text ?? STATUS_TEXT[status]);
const seconds = (ms) => (ms / 1000).toFixed(1);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// ---------------------------------------------------------------- engine status
const engineNote = $('#engine');
if (location.protocol === 'file:') {
  engineNote.textContent = 'Open this page from a web address (run "npm start"), not by double-clicking the file.';
  engineNote.className = 'engine error';
} else {
  startEngine().then(async () => {
    engineNote.textContent = 'Ready. Works offline. Nothing is uploaded.';
    engineNote.className = 'engine ready';
  }).catch((err) => {
    engineNote.textContent = err.message;
    engineNote.className = 'engine error';
  });
}

// ---------------------------------------------------------------- shared result view
function problemCount(result) {
  const all = [...result.fields, result.warning];
  return { fail: all.filter((r) => r.status === 'fail').length, review: all.filter((r) => r.status === 'review').length };
}

function bannerFor(result) {
  const { fail, review } = problemCount(result);
  const text = {
    pass: 'Every item checked matches the application.',
    review: `Nothing is clearly wrong, but ${plural(review, 'item needs', 'items need')} your eyes.`,
    fail: `${plural(fail, 'item does', 'items do')} not match the application${review ? `, and ${plural(review, 'more needs', 'more need')} a look` : ''}.`,
  }[result.status];
  return el('div', { class: `banner ${result.status}` },
    el('div', { class: 'big', 'aria-hidden': 'true' }, GLYPH[result.status]),
    el('div', {}, el('h3', {}, OVERALL_TEXT[result.status]), el('p', {}, text)));
}

function diffView(diff) {
  const box = el('div', { class: 'diff' });
  diff.forEach((d, i) => {
    if (i) box.append(' ');
    if (d.type === 'eq') box.append(d.label);
    else if (d.type === 'sub') box.append(el('mark', { class: 'sub', title: `Required: ${d.ref}` }, d.label));
    else if (d.type === 'ins') box.append(el('mark', { class: 'ins', title: 'Extra word' }, d.label));
    else box.append(el('del', { title: 'Missing from the label' }, d.ref));
  });
  return box;
}

function warningBox(w) {
  const box = el('div', { class: 'warning-box' },
    el('h4', {}, 'Government warning statement ', chip(w.status)));
  if (!w.parts.length) { box.append(el('p', {}, w.message)); return box; }
  box.append(el('ul', { class: 'parts' }, w.parts.map((p) => el('li', {}, chip(p.status, p.name), el('span', {}, p.message)))));
  if (w.status !== 'pass' && w.diff.length) {
    box.append(diffView(w.diff),
      el('p', { class: 'diff-key' }, 'Red: different or extra on the label. Yellow with dotted line: required word missing from the label.'));
  }
  return box;
}

/** Renders the full result for one label into `host`. Re-check re-runs the checks on edited text. */
function renderDetail(host, app, analysis) {
  const { result } = analysis;
  const table = el('table', { class: 'checks' },
    el('thead', {}, el('tr', {}, ['Item', 'Application says', 'Label shows', 'Result'].map((t) => el('th', { scope: 'col' }, t)))),
    el('tbody', {}, result.fields.map((f) => el('tr', {},
      el('td', { class: 'field' }, f.label),
      el('td', { class: `val${f.expected ? '' : ' none'}` }, f.expected || 'nothing entered'),
      el('td', { class: `val${f.found ? '' : ' none'}` }, f.found || 'nothing found'),
      el('td', {}, chip(f.status), el('span', { class: 'note' }, f.message))))));
  const textarea = el('textarea', { spellcheck: 'false', 'aria-label': 'Text read from the label' });
  textarea.value = analysis.text.trim();
  const reader = el('details', { class: 'reader' },
    el('summary', {}, 'Text the computer read from the picture'),
    el('p', {}, 'If a word was misread, fix it here and check again. The checks run again on your corrected text.'),
    textarea,
    el('div', { class: 'actions' }, el('button', {
      type: 'button', class: 'secondary',
      onclick: () => {
        analysis.text = textarea.value;
        analysis.result = checkLabel(app, analysis.text, analysis.boldInfo);
        renderDetail(host, app, analysis);
        $('details.reader', host).open = true;
      },
    }, 'Check again with my changes')));
  host.replaceChildren(bannerFor(result), table, warningBox(result.warning), reader);
}

// ---------------------------------------------------------------- tabs
const tabs = { one: [$('#tab-one'), $('#panel-one')], many: [$('#tab-many'), $('#panel-many')] };
for (const [name, [tab]] of Object.entries(tabs)) {
  tab.addEventListener('click', () => {
    for (const [n, [t, p]] of Object.entries(tabs)) {
      t.setAttribute('aria-selected', String(n === name));
      t.tabIndex = n === name ? 0 : -1;
      p.hidden = n !== name;
    }
  });
}

// drag & drop onto a label element with a hidden file input
function makeDroppable(zone, input) {
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault(); zone.classList.remove('over');
    if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; input.dispatchEvent(new Event('change')); }
  });
}

// ================================================================ ONE LABEL
const form = $('#one-form');
const oneResult = $('#one-result');
const one = { file: null, cache: null, previewUrl: null };

function setOneFile(file) {
  one.file = file; one.cache = null;
  if (one.previewUrl) URL.revokeObjectURL(one.previewUrl);
  one.previewUrl = file ? URL.createObjectURL(file) : null;
  const img = $('#one-preview');
  img.hidden = !file;
  if (file) img.src = one.previewUrl;
  $('#one-drop').classList.toggle('has-file', !!file);
  $('#one-drop-text').textContent = file ? `${file.name}. Choose a different picture if this is wrong.` : 'Choose a picture, or drag one here';
}
$('#one-file').addEventListener('change', (e) => setOneFile(e.target.files[0] || null));
makeDroppable($('#one-drop'), $('#one-file'));
form.addEventListener('reset', () => { setOneFile(null); oneResult.replaceChildren(); });

function readForm() {
  const v = Object.fromEntries(new FormData(form).entries());
  return { type: v.type, brand: v.brand.trim(), classType: v.classType.trim(), abv: v.abv.trim(), net: v.net.trim(), producer: v.producer.trim(), country: v.country.trim() };
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!one.file) { oneResult.replaceChildren(el('p', { class: 'problem', role: 'alert' }, 'Choose a label picture first (step 1).')); return; }
  const app = readForm();
  if (!app.brand && !app.classType && !app.abv && !app.net && !app.producer) {
    oneResult.replaceChildren(el('p', { class: 'problem', role: 'alert' }, 'Type in what the application says (step 2), so there is something to compare with.'));
    return;
  }
  const go = $('#one-go');
  go.disabled = true; go.textContent = 'Reading the label…';
  oneResult.replaceChildren();
  const t0 = performance.now();
  try {
    let analysis;
    if (one.cache && one.cache.file === one.file) {
      // Same picture, edited form: no need to read the picture again.
      analysis = { ...one.cache.analysis, result: checkLabel(app, one.cache.analysis.text, one.cache.analysis.boldInfo) };
    } else {
      analysis = await analyzeLabel(one.file, app);
      one.cache = { file: one.file, analysis };
    }
    const host = el('div', { class: 'result' });
    renderDetail(host, app, analysis);
    host.append(el('p', { class: 'timing' }, `Checked in ${seconds(performance.now() - t0)} seconds.`));
    oneResult.replaceChildren(host);
    host.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  } catch (err) {
    oneResult.replaceChildren(el('p', { class: 'problem', role: 'alert' }, `Could not check this label. ${err.message}`));
  } finally {
    go.disabled = false; go.textContent = 'Check this label';
  }
});

// ---- examples
let examples = [];
async function loadExamples() {
  try {
    const res = await fetch('samples/batch.csv');
    if (!res.ok) throw new Error();
    examples = rowsToApplications(parseCsv(await res.text()));
    const select = $('#example');
    examples.forEach((a, i) => select.append(el('option', { value: i }, `${a.brand}: ${EXAMPLE_NOTES[a.filename] || 'sample label'}`)));
  } catch { $('.example').hidden = true; }
}
$('#example').addEventListener('change', async (e) => {
  const a = examples[Number(e.target.value)];
  e.target.value = '';
  if (!a) return;
  const blob = await (await fetch(`samples/${a.filename}`)).blob();
  setOneFile(new File([blob], a.filename, { type: blob.type || 'image/png' }));
  form.elements.type.value = a.type;
  for (const k of ['brand', 'classType', 'abv', 'net', 'producer', 'country']) form.elements[k].value = a[k];
  form.requestSubmit();
});
loadExamples();

// ================================================================ MANY LABELS
const many = { files: [], apps: null, rows: [], running: false, stop: false, filter: 'all' };
const manyResult = $('#many-result');

function refreshManyButton() {
  $('#many-go').disabled = !(many.files.length && many.apps && !many.running);
}
function showManyProblem(msg) { const p = $('#many-problem'); p.hidden = !msg; p.textContent = msg || ''; }

function setManyFiles(files) {
  many.files = Array.from(files).filter((f) => f.type.startsWith('image/'));
  $('#many-files-text').textContent = many.files.length ? `${plural(many.files.length, 'picture', 'pictures')} chosen. Choose again to change them.` : 'Choose pictures, or drag them here';
  $('#many-drop').classList.toggle('has-file', many.files.length > 0);
  showManyProblem('');
  refreshManyButton();
}
async function setManyCsv(file) {
  many.apps = null;
  try {
    const apps = rowsToApplications(parseCsv(await file.text()));
    if (!apps.length) throw new Error('The spreadsheet has no rows below the header line.');
    many.apps = apps;
    $('#many-csv-text').textContent = `${file.name}: ${plural(apps.length, 'row', 'rows')}. Choose again to change it.`;
    showManyProblem('');
  } catch (err) {
    $('#many-csv-text').textContent = 'Choose the spreadsheet (.csv), or drag it here';
    showManyProblem(err.message);
  }
  $('#csv-drop').classList.toggle('has-file', !!many.apps);
  refreshManyButton();
}
$('#many-files').addEventListener('change', (e) => setManyFiles(e.target.files));
$('#many-csv').addEventListener('change', (e) => e.target.files[0] && setManyCsv(e.target.files[0]));
makeDroppable($('#many-drop'), $('#many-files'));
makeDroppable($('#csv-drop'), $('#many-csv'));

$('#template-link').addEventListener('click', (e) => {
  e.preventDefault();
  const csv = toCsv([
    ['filename', 'beverage_type', 'brand_name', 'class_type', 'alcohol_content', 'net_contents', 'bottler', 'country_of_origin'],
    ['old-tom.png', 'spirits', 'Old Tom Distillery', 'Kentucky Straight Bourbon Whiskey', '45% Alc./Vol. (90 Proof)', '750 mL', 'Old Tom Distillery, Bardstown, Kentucky', ''],
  ]);
  const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'label-applications-template.csv' });
  a.click(); URL.revokeObjectURL(a.href);
});

$('#many-sample').addEventListener('click', async () => {
  showManyProblem('');
  try {
    const csvText = await (await fetch('samples/batch.csv')).text();
    const apps = rowsToApplications(parseCsv(csvText));
    const files = await Promise.all(apps.map(async (a) => {
      const blob = await (await fetch(`samples/${a.filename}`)).blob();
      return new File([blob], a.filename, { type: blob.type || 'image/png' });
    }));
    many.apps = apps;
    $('#many-csv-text').textContent = `Sample spreadsheet: ${plural(apps.length, 'row', 'rows')}`;
    $('#csv-drop').classList.add('has-file');
    setManyFiles(files);
    runBatch();
  } catch { showManyProblem('Could not load the sample files.'); }
});

$('#many-stop').addEventListener('click', () => { many.stop = true; $('#many-stop').disabled = true; });
$('#many-go').addEventListener('click', runBatch);

const rowStatus = (r) => (r.analysis ? r.analysis.result.status : null);

async function runBatch() {
  if (many.running) return;
  const { pairs, missingImages } = pairFilesWithApplications(many.files, many.apps);
  many.rows = pairs.map((p) => ({ ...p, state: p.app ? 'queued' : 'nodata', analysis: null, open: false, detail: null, error: '' }));
  many.missingImages = missingImages;
  many.running = true; many.stop = false; many.filter = 'all'; many.elapsed = 0;
  refreshManyButton();
  $('#many-stop').hidden = false; $('#many-stop').disabled = false;
  buildBatchView();

  const todo = many.rows.filter((r) => r.state === 'queued');
  const started = performance.now();
  let lanes = 3;
  try { lanes = await engineSize(); } catch (err) { showManyProblem(err.message); many.running = false; refreshManyButton(); return; }
  let next = 0;
  const lane = async () => {
    while (!many.stop && next < todo.length) {
      const row = todo[next++];
      row.state = 'working'; scheduleBatchUpdate();
      try { row.analysis = await analyzeLabel(row.file, row.app); row.state = 'done'; }
      catch (err) { row.state = 'error'; row.error = err.message; }
      scheduleBatchUpdate();
    }
  };
  await Promise.all(Array.from({ length: lanes }, lane));
  many.running = false;
  many.elapsed = performance.now() - started;
  $('#many-stop').hidden = true;
  refreshManyButton();
  updateBatchView(true);
}

// ---- batch view
let view = null;
let updateQueued = false;
function scheduleBatchUpdate() {
  if (updateQueued) return;
  updateQueued = true;
  setTimeout(() => { updateQueued = false; updateBatchView(); }, 250);
}

function buildBatchView() {
  view = {
    progressText: el('strong'), bar: el('div'), tally: el('div', { class: 'tally' }), filters: el('div', { class: 'filters' }),
    body: el('tbody'), notes: el('div'),
  };
  const progress = el('div', { class: 'progress' }, view.progressText, el('div', { class: 'bar', 'aria-hidden': 'true' }, view.bar));
  const table = el('table', { class: 'batch' },
    el('thead', {}, el('tr', {}, ['Picture', 'Brand', 'Result', 'What to look at'].map((t) => el('th', { scope: 'col' }, t)))), view.body);
  manyResult.replaceChildren(el('div', { class: 'result' }, progress, view.tally, view.notes, view.filters, table));
  updateBatchView();
}

function issuesText(r) {
  const all = [...r.analysis.result.fields, r.analysis.result.warning].filter((f) => f.status === 'fail' || f.status === 'review');
  return all.map((f) => f.label).join(', ') || 'Nothing';
}

function updateBatchView(final = false) {
  if (!view) return;
  const rows = many.rows;
  const done = rows.filter((r) => r.state === 'done' || r.state === 'error').length;
  const total = rows.filter((r) => r.state !== 'nodata').length;
  view.bar.style.width = `${total ? (done / total) * 100 : 0}%`;
  view.progressText.textContent = many.running
    ? `Checked ${done} of ${total}…`
    : `${many.stop ? 'Stopped. ' : ''}Checked ${done} of ${total}${many.elapsed ? ` in ${seconds(many.elapsed)} seconds` : ''}.`;

  const count = (s) => rows.filter((r) => rowStatus(r) === s).length;
  const skipped = rows.filter((r) => r.state === 'nodata' || r.state === 'error').length;
  view.tally.replaceChildren(...[
    chip('pass', `${count('pass')} match`), chip('review', `${count('review')} need a look`), chip('fail', `${count('fail')} with problems`),
    skipped ? chip('na', `${skipped} not checked`) : null,
    el('button', { type: 'button', class: 'secondary', onclick: downloadResults, disabled: !done }, 'Download results (.csv)'),
  ].filter(Boolean));

  const notes = [];
  if (many.missingImages?.length) notes.push(el('p', { class: 'problem' }, `${plural(many.missingImages.length, 'row in the spreadsheet has', 'rows in the spreadsheet have')} no matching picture: ${many.missingImages.slice(0, 5).map((a) => a.filename).join(', ')}${many.missingImages.length > 5 ? '…' : ''}`));
  view.notes.replaceChildren(...notes);

  const filters = [['all', 'All'], ['fail', 'Problems'], ['review', 'Need a look'], ['pass', 'Match']];
  view.filters.replaceChildren(el('span', {}, 'Show:'), ...filters.map(([key, text]) => el('button', {
    type: 'button', class: 'small-btn', 'aria-pressed': String(many.filter === key),
    onclick: () => { many.filter = key; updateBatchView(); },
  }, text)));

  const visible = rows.filter((r) => many.filter === 'all' || rowStatus(r) === many.filter);
  const trs = [];
  visible.forEach((r) => {
    const status = rowStatus(r);
    const resultCell = r.state === 'done' ? chip(status)
      : r.state === 'error' ? chip('fail', 'Could not read')
      : r.state === 'nodata' ? chip('na', 'No spreadsheet row')
      : chip('info', r.state === 'working' ? 'Reading…' : 'Waiting');
    const toggle = () => { r.open = !r.open; updateBatchView(); };
    const tr = el('tr', {
      class: 'item', tabindex: r.state === 'done' ? '0' : null, 'aria-expanded': r.state === 'done' ? String(r.open) : null,
      onclick: () => r.state === 'done' && toggle(),
      onkeydown: (e) => { if ((e.key === 'Enter' || e.key === ' ') && r.state === 'done') { e.preventDefault(); toggle(); } },
    },
      el('td', { class: 'file' }, r.file.name),
      el('td', {}, r.app ? r.app.brand : ''),
      el('td', {}, resultCell),
      el('td', {}, r.state === 'done' ? [issuesText(r), el('span', { class: 'more' }, r.open ? 'Hide details' : 'Show details')]
        : r.state === 'error' ? r.error : r.state === 'nodata' ? 'Add a row with this file name to the spreadsheet.' : ''));
    trs.push(tr);
    if (r.open && r.state === 'done') {
      if (!r.detail) {
        r.detail = el('div', { class: 'result' });
        renderDetail(r.detail, r.app, r.analysis);
        r.detail.append(el('img', { class: 'thumb', alt: `Picture of ${r.file.name}`, src: URL.createObjectURL(r.file) }));
      }
      trs.push(el('tr', {}, el('td', { class: 'detail', colspan: '4' }, r.detail)));
    }
  });
  view.body.replaceChildren(...trs);
  if (final && !visible.length) view.body.replaceChildren(el('tr', {}, el('td', { colspan: '4' }, 'Nothing to show here.')));
}

function downloadResults() {
  const header = ['filename', 'result', 'brand_name', 'items_to_look_at', 'details'];
  const lines = many.rows.map((r) => {
    if (r.state !== 'done') return [r.file.name, r.state === 'nodata' ? 'not checked: no spreadsheet row' : r.state === 'error' ? 'not checked: could not read' : 'not checked', r.app?.brand || '', '', r.error || ''];
    const res = r.analysis.result;
    const details = [...res.fields, res.warning].filter((f) => f.status === 'fail' || f.status === 'review').map((f) => `${f.label}: ${f.message}`).join(' | ');
    const verdict = { pass: 'match', review: 'needs a look', fail: 'problems found' }[res.status];
    return [r.file.name, verdict, r.app.brand, issuesText(r), details];
  });
  const a = el('a', { href: URL.createObjectURL(new Blob([toCsv([header, ...lines])], { type: 'text/csv' })), download: 'label-check-results.csv' });
  a.click(); URL.revokeObjectURL(a.href);
}
