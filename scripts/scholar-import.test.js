const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, before, after } = require('node:test');
const { classifyQuestion } = require('../backend/src/questionClassifier');
const { normalizeSourceRecord } = require('../backend/src/supabaseSourceDb');
const { normalizeScholarDataset, normalizeScholarRecord } = require('./scholar-json-utils');

let tempRoot;
let datasetRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-scholar-json-'));
  datasetRoot = path.join(tempRoot, 'scholars');
  fs.mkdirSync(datasetRoot, { recursive: true });
  fs.writeFileSync(path.join(datasetRoot, 'curated.json'), JSON.stringify([
    {
      source_type: 'fatwa',
      source_kind: 'official_website_fatwa',
      work_type: 'fatwa',
      scholar_slug: 'bin-baz',
      scholar_name_ar: 'عبد العزيز بن باز',
      scholar_name_en: 'Abd al-Aziz ibn Baz',
      title: 'Prayer question 001',
      fatwa_number: '123',
      question_text: 'What is the ruling on prayer?',
      answer_text: 'The approved answer text.',
      language: 'ar',
      source_url: 'https://example.com/fatwa/123',
      dataset_name: 'curated-binbaz',
      license_status: 'source-usage-needs-review',
    },
    {
      source_kind: 'classical_book',
      work_type: 'book',
      scholar_slug: 'ibn-al-qayyim',
      scholar_name_en: 'Ibn al-Qayyim',
      work_slug: 'madarij-al-salikin',
      work_title: 'Madarij al-Salikin',
      work_title_ar: 'مدارج السالكين',
      work_title_en: 'Madarij al-Salikin',
      chapter_title: 'Sincerity',
      section_title: 'Ikhlas',
      volume: '1',
      page_number: 20,
      page_range: '20-21',
      publisher: 'Example Publisher',
      edition: 'Example Edition',
      arabic_text: 'نص عربي',
      translation_text: 'Translation text.',
      source_url: 'https://example.com/book/page-20',
      original_source: 'printed edition',
    },
  ], null, 2));
});

after(() => {
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
});

function runNodeScript(script, args = [], extraEnv = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ...extraEnv,
    },
    encoding: 'utf8',
  });
}

test('Scholar normalization preserves scholar, work, fatwa, book, license, and review fields', () => {
  const analysis = normalizeScholarDataset(datasetRoot, {});
  const fatwa = analysis.rows.find((row) => row.source_type === 'fatwa');
  const book = analysis.rows.find((row) => row.source_type === 'book');

  assert(fatwa);
  assert.strictEqual(fatwa.source_kind, 'official_website_fatwa');
  assert.strictEqual(fatwa.work_type, 'fatwa');
  assert.strictEqual(fatwa.scholar_slug, 'bin-baz');
  assert.strictEqual(fatwa.scholar_name_en, 'Abd al-Aziz ibn Baz');
  assert.strictEqual(fatwa.fatwa_number, '123');
  assert.strictEqual(fatwa.question_text, 'What is the ruling on prayer?');
  assert.strictEqual(fatwa.answer_text, 'The approved answer text.');
  assert.strictEqual(fatwa.approved_for_answers, false);
  assert.strictEqual(fatwa.verified_by_admin, false);
  assert.strictEqual(fatwa.metadata.importer_version, 'scholar-json-v1');
  assert.strictEqual(fatwa.metadata.adapter, 'generic-curated-json');
  assert.strictEqual(fatwa.metadata.source_family, 'scholar');

  assert(book);
  assert.strictEqual(book.source_kind, 'classical_book');
  assert.strictEqual(book.work_type, 'book');
  assert.strictEqual(book.work_title_ar, 'مدارج السالكين');
  assert.strictEqual(book.work_title_en, 'Madarij al-Salikin');
  assert.strictEqual(book.chapter_title, 'Sincerity');
  assert.strictEqual(book.section_title, 'Ikhlas');
  assert.strictEqual(book.volume, '1');
  assert.strictEqual(book.page_number, 20);
  assert.strictEqual(book.page_range, '20-21');
  assert.strictEqual(book.publisher, 'Example Publisher');
  assert.strictEqual(book.edition, 'Example Edition');
});

test('Scholar display title works for book and scholar statement sources', () => {
  const book = normalizeSourceRecord({
    id: 'book-ibn-al-qayyim-madarij-page-20',
    source_type: 'book',
    scholar_name_en: 'Ibn al-Qayyim',
    work_title: 'Madarij al-Salikin',
    page_number: 20,
    arabic_text: 'نص عربي',
  });
  const statement = normalizeSourceRecord({
    id: 'scholar-nawawi-note',
    source_type: 'scholar_statement',
    scholar_name_en: 'Imam al-Nawawi',
    quote_text: 'A curated quote.',
  });

  assert.strictEqual(book.display_title, 'Madarij al-Salikin, p. 20');
  assert.strictEqual(statement.display_title, 'Imam al-Nawawi source');
});

test('Fatwa display title works', () => {
  const normalized = normalizeSourceRecord({
    id: 'fatwa-bin-baz-123',
    source_type: 'fatwa',
    scholar_name_en: 'Abd al-Aziz ibn Baz',
    fatwa_number: '123',
    question_text: 'Question text',
    answer_text: 'Answer text',
  });

  assert.strictEqual(normalized.display_title, 'Abd al-Aziz ibn Baz, Fatwa 123');
});

test('Scholar and fatwa intent is detected', () => {
  assert.strictEqual(classifyQuestion('What did Ibn Baz say about prayer?', 'islamic_search_mode').intent, 'explanation');
  assert.strictEqual(classifyQuestion('fatwa by Ibn Uthaymeen on fasting', 'islamic_search_mode').intent, 'direct_source_lookup');
  assert.strictEqual(classifyQuestion('Ibn Taymiyyah on tawheed', 'islamic_search_mode').sourceType, 'aqidah');
  assert.strictEqual(classifyQuestion('Ibn al-Qayyim on sincerity', 'islamic_search_mode').sourceType, 'scholar');
  assert.strictEqual(classifyQuestion('فتوى ابن باز', 'islamic_search_mode').intent, 'direct_source_lookup');
  assert.strictEqual(classifyQuestion('شرح النووي', 'islamic_search_mode').intent, 'explanation');
});

test('Scholar analyzer runs without Supabase env', () => {
  const result = runNodeScript('scripts/analyze-scholar-json-dataset.js', [datasetRoot]);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dataset detected: generic-curated-scholar-json/);
  assert.match(result.stdout, /Total records: 2/);
  assert.match(result.stdout, /Scholars detected/);
  assert.match(result.stdout, /Source kinds detected/);
  assert.match(result.stdout, /Sample normalized row/);
});

test('Scholar importer dry-run runs without Supabase env', () => {
  const result = runNodeScript('scripts/import-scholar-json-to-supabase.js', [datasetRoot, '--dry-run', '--limit=10']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /Rows prepared: 2/);
  assert.match(result.stdout, /Dry-run only\. No Supabase writes performed/);
});

test('Scholar importer execute mode requires Supabase env', () => {
  const result = runNodeScript('scripts/import-scholar-json-to-supabase.js', [datasetRoot, '--execute', '--limit=1']);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Supabase is not configured/);
});

test('Scholar importer uses stable IDs and does not use random IDs', () => {
  const row = normalizeScholarRecord({
    source_kind: 'classical_book',
    work_type: 'book',
    scholar_slug: 'ibn-taymiyyah',
    work_title: 'Majmu Fatawa',
    volume: '1',
    page_number: 20,
    arabic_text: 'Text',
    source_url: 'https://example.com/book',
  }, { index: 0 });

  assert.strictEqual(row.id, 'book-ibn-taymiyyah-majmu-fatawa-page-20');
  assert(!/[0-9a-f]{8}-[0-9a-f]{4}/i.test(row.id));
});

test('Scholar importer default approval is false', () => {
  const row = normalizeScholarRecord({
    source_type: 'fatwa',
    scholar_slug: 'bin-baz',
    title: 'Approval default',
    answer_text: 'Answer',
    scholar_name_en: 'Abd al-Aziz ibn Baz',
  }, {});
  assert.strictEqual(row.approved_for_answers, false);
});

test('Scholar importer default verification is false', () => {
  const row = normalizeScholarRecord({
    source_type: 'book',
    work_title: 'Book default',
    arabic_text: 'Text',
    source_url: 'https://example.com/book',
  }, {});
  assert.strictEqual(row.verified_by_admin, false);
});

test('Scholar import pipeline does not require frontend changes', () => {
  const importer = fs.readFileSync(path.join(process.cwd(), 'scripts', 'import-scholar-json-to-supabase.js'), 'utf8');
  const analyzer = fs.readFileSync(path.join(process.cwd(), 'scripts', 'analyze-scholar-json-dataset.js'), 'utf8');
  assert(fs.existsSync(path.join(process.cwd(), 'frontend', 'index.html')));
  assert(!importer.includes('frontend/index.html'));
  assert(!analyzer.includes('frontend/index.html'));
});
