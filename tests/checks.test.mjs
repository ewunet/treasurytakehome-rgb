import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { checkLabel, checkWarning, parseAbv, parseNet } from '../src/js/checks.js';
import { WARNING_TEXT } from '../src/js/rules.js';
import { parseCsv, rowsToApplications, pairFilesWithApplications } from '../src/js/csv.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BOLD = { verdict: 'bold' };
const status = (result, key) => [...result.fields, result.warning].find((f) => f.key === key).status;

const labelText = (extra = '') => `OLD TOM DISTILLERY
Kentucky Straight Bourbon Whiskey
45% Alc./Vol. (90 Proof)
750 mL
Distilled and bottled by Old Tom Distillery, Bardstown, Kentucky
${WARNING_TEXT}
${extra}`;
const spirits = { type: 'spirits', brand: 'Old Tom Distillery', classType: 'Kentucky Straight Bourbon Whiskey', abv: '45% Alc./Vol. (90 Proof)', net: '750 mL', producer: 'Old Tom Distillery, Bardstown, Kentucky', country: '' };

test('a clean label passes everything', () => {
  const r = checkLabel(spirits, labelText(), BOLD);
  assert.equal(r.status, 'pass');
});

test('brand: capitalization and apostrophes are not a mismatch (STONE\'S THROW case)', () => {
  const r = checkLabel({ ...spirits, brand: "Stone's Throw" }, labelText().replace('OLD TOM DISTILLERY', "STONE'S THROW"), BOLD);
  assert.equal(status(r, 'brand'), 'pass');
  assert.match(r.fields[0].message, /capitalization/);
});

test('brand: a different name fails, a one-letter slip asks for review', () => {
  assert.equal(status(checkLabel({ ...spirits, brand: 'Silver Creek' }, labelText(), BOLD), 'brand'), 'fail');
  assert.equal(status(checkLabel({ ...spirits, brand: 'Old Tom Distilery' }, labelText(), BOLD), 'brand'), 'review');
});

test('alcohol content: number must agree; proof is accepted; proof/percent conflict is flagged', () => {
  assert.equal(status(checkLabel({ ...spirits, abv: '40%' }, labelText(), BOLD), 'abv'), 'fail');
  assert.equal(status(checkLabel({ ...spirits, abv: '90 proof' }, labelText(), BOLD), 'abv'), 'pass');
  assert.equal(status(checkLabel(spirits, labelText().replace('90 Proof', '80 Proof'), BOLD), 'abv'), 'review');
  assert.equal(status(checkLabel({ ...spirits, abv: '45.0' }, labelText(), BOLD), 'abv'), 'pass');
});

test('alcohol content is optional for beer, but "ABV" wording is flagged', () => {
  const beer = { ...spirits, type: 'beer', abv: '' };
  assert.equal(status(checkLabel(beer, labelText(), BOLD), 'abv'), 'na');
  const abbrev = checkLabel({ ...beer, abv: '5%' }, 'Some IPA 5% ABV 12 fl. oz.', BOLD);
  assert.equal(status(abbrev, 'abv'), 'review');
});

test('net contents: units are converted, and beer needs U.S. measures', () => {
  assert.equal(parseNet('1 pint (473 mL)').length, 2);
  assert.equal(status(checkLabel({ ...spirits, net: '75 cL' }, labelText(), BOLD), 'net'), 'pass');
  assert.equal(status(checkLabel({ ...spirits, net: '1 L' }, labelText(), BOLD), 'net'), 'fail');
  const beer = { ...spirits, type: 'beer', net: '12 fl. oz.' };
  assert.equal(status(checkLabel(beer, 'Brew 12 FL OZ (355 mL)', BOLD), 'net'), 'pass');
  assert.equal(status(checkLabel({ ...beer, net: '355 mL' }, 'Brew 355 mL', BOLD), 'net'), 'review');
});

test('country of origin is only checked when the application lists one', () => {
  assert.equal(status(checkLabel(spirits, labelText(), BOLD), 'country'), 'na');
  assert.equal(status(checkLabel({ ...spirits, country: 'France' }, labelText('Product of France'), BOLD), 'country'), 'pass');
  assert.equal(status(checkLabel({ ...spirits, country: 'France' }, labelText(), BOLD), 'country'), 'fail');
});

test('warning: exact wording passes; changed word fails; missing statement fails', () => {
  assert.equal(checkWarning(WARNING_TEXT, BOLD).status, 'pass');
  assert.equal(checkWarning(WARNING_TEXT.replace('may cause', 'can cause'), BOLD).status, 'fail');
  assert.equal(checkWarning('Just some label text', BOLD).status, 'fail');
});

test('warning: heading must be ALL CAPS and bold', () => {
  const title = WARNING_TEXT.replace('GOVERNMENT WARNING:', 'Government Warning:');
  const w = checkWarning(title, BOLD);
  assert.equal(w.status, 'fail');
  assert.equal(w.parts.find((p) => p.name === 'Capital letters').status, 'fail');
  assert.equal(checkWarning(WARNING_TEXT, { verdict: 'not-bold' }).status, 'fail');
  assert.equal(checkWarning(WARNING_TEXT, { verdict: 'unknown' }).status, 'review');
});

test('warning: a single misread letter is "take a look", not an automatic rejection', () => {
  const w = checkWarning(WARNING_TEXT.replace('pregnancy', 'pregnancv'), BOLD);
  assert.equal(w.status, 'review');
});

test('sample labels read by real Tesseract give the expected verdicts', () => {
  const apps = rowsToApplications(parseCsv(fs.readFileSync(path.join(here, '../samples/batch.csv'), 'utf8')));
  // bold verdicts measured from the images by src/js/stroke.js
  const bold = { 'silver-creek-rye': 'not-bold', 'pine-hollow-gin': 'not-bold', 'maple-ridge-bourbon-photo': 'unknown' };
  const expected = { 'old-tom-distillery': 'pass', 'stones-throw-ipa': 'pass', 'harbor-point-cabernet': 'pass', 'chateau-belmont': 'pass',
    'silver-creek-rye': 'fail', 'red-fox-vodka': 'fail', 'pine-hollow-gin': 'fail', 'maple-ridge-bourbon-photo': 'review' };
  for (const app of apps) {
    const name = app.filename.replace('.png', '');
    const text = fs.readFileSync(path.join(here, 'fixtures', `${name}.txt`), 'utf8');
    const r = checkLabel(app, text, { verdict: bold[name] || 'bold' });
    assert.equal(r.status, expected[name], name);
  }
});

test('csv: quotes, aliases and file matching', () => {
  const rows = parseCsv('File,Brand,ABV,Type\r\n"a.png","Stone, ""Throw""",5%,beer\r\nb.png,X,40%,\r\n');
  const apps = rowsToApplications(rows);
  assert.equal(apps[0].brand, 'Stone, "Throw"');
  assert.equal(apps[0].type, 'beer');
  const { pairs, missingImages } = pairFilesWithApplications([{ name: 'A.PNG' }, { name: 'c.png' }], apps);
  assert.equal(pairs[0].app.brand, 'Stone, "Throw"');
  assert.equal(pairs[1].app, null);
  assert.equal(missingImages.length, 1);
  assert.throws(() => rowsToApplications(parseCsv('brand\nx')), /filename/);
});

test('parseAbv understands percent, proof and bare numbers', () => {
  assert.equal(parseAbv('45% Alc./Vol. (90 Proof)').abv, 45);
  assert.equal(parseAbv('80 proof').abv, 40);
  assert.equal(parseAbv('12,5').abv, 12.5);
  assert.equal(parseAbv('strong'), null);
});
