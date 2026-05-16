const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, before, after } = require('node:test');
const { classifyQuestion } = require('../backend/src/questionClassifier');
const { normalizeSourceRecord } = require('../backend/src/supabaseSourceDb');
const { normalizeTafsirApiDataset } = require('./tafsir-api-utils');

let tempRoot;
let datasetRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-tafsir-api-'));
  datasetRoot = path.join(tempRoot, 'tafsir-api');
  fs.mkdirSync(path.join(datasetRoot, 'tafsir', 'en-tafisr-ibn-kathir'), { recursive: true });
  fs.mkdirSync(path.join(datasetRoot, 'tafsir', 'en-tafisr-ibn-kathir', '1'), { recursive: true });
  fs.mkdirSync(path.join(datasetRoot, 'tafsir', 'en-al-jalalayn', '2'), { recursive: true });
  fs.writeFileSync(path.join(datasetRoot, 'tafsir', 'editions.json'), JSON.stringify([
    {
      slug: 'en-tafisr-ibn-kathir',
      name: 'Tafsir Ibn Kathir',
      author: 'Ibn Kathir',
      language: 'en',
      source: 'Quran.com',
    },
    {
      slug: 'en-al-jalalayn',
      name: 'Tafsir al-Jalalayn',
      author: 'Jalal ad-Din al-Mahalli and Jalal ad-Din as-Suyuti',
      language: 'en',
      source: 'Altafsir.com',
    },
  ], null, 2));
  fs.writeFileSync(path.join(datasetRoot, 'tafsir', 'en-tafisr-ibn-kathir', '1.json'), JSON.stringify([
    {
      ayah: 1,
      surah_name_en: 'Al-Fatihah',
      text: 'Ibn Kathir explains the opening verse of Al-Fatihah.',
    },
    {
      ayah: 1,
      surah_name_en: 'Al-Fatihah',
      text: 'Duplicate entry for testing duplicate normalized ids.',
    },
  ], null, 2));

  fs.writeFileSync(path.join(datasetRoot, 'tafsir', 'en-tafisr-ibn-kathir', '1', '1.json'), JSON.stringify({
    ayah: 1,
    surah_name_en: 'Al-Fatihah',
    text: 'Ibn Kathir explains the opening verse of Al-Fatihah.',
  }, null, 2));

  fs.writeFileSync(path.join(datasetRoot, 'tafsir', 'en-al-jalalayn', '2', '255.json'), JSON.stringify({
    ayah: 255,
    surah_name_en: 'Al-Baqarah',
    text: 'Al-Jalalayn explains Ayat al-Kursi.',
  }, null, 2));
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

test('Tafsir normalization preserves edition, author, language, surah, ayah, and explanation', () => {
  const analysis = normalizeTafsirApiDataset(datasetRoot, {});
  const row = analysis.rows.find((entry) => entry.id === 'tafsir-en-tafisr-ibn-kathir-1-1');

  assert(row);
  assert.strictEqual(row.source_type, 'tafsir');
  assert.strictEqual(row.collection_name, 'Tafsir');
  assert.strictEqual(row.tafsir_edition_slug, 'en-tafisr-ibn-kathir');
  assert.strictEqual(row.tafsir_book_name, 'Tafsir Ibn Kathir');
  assert.strictEqual(row.tafsir_author, 'Ibn Kathir');
  assert.strictEqual(row.tafsir_language, 'en');
  assert.strictEqual(row.surah, 1);
  assert.strictEqual(row.ayah, 1);
  assert.strictEqual(row.ayah_start, 1);
  assert.strictEqual(row.ayah_end, 1);
  assert.strictEqual(row.ayah_range, '1');
  assert.strictEqual(row.explanation_text, 'Ibn Kathir explains the opening verse of Al-Fatihah.');
  assert.strictEqual(row.original_source, 'Quran.com');
  assert.strictEqual(row.repo_license, 'MIT');
  assert.strictEqual(row.requires_attribution, true);
  assert.strictEqual(row.approved_for_answers, false);
  assert.strictEqual(row.verified_by_admin, false);
});

test('Tafsir display title uses book and Quran reference', () => {
  const normalized = normalizeSourceRecord({
    id: 'tafsir-en-tafisr-ibn-kathir-1-1',
    source_type: 'tafsir',
    tafsir_book_name: 'Tafsir Ibn Kathir',
    surah_number: 1,
    ayah_number: 1,
    ayah_range: '1',
    explanation_text: 'Ibn Kathir explains the opening verse.',
  });

  assert.strictEqual(normalized.display_title, 'Tafsir Ibn Kathir, Tafsir of 1:1');
  assert.strictEqual(normalized.source_title, 'Tafsir Ibn Kathir, Tafsir of 1:1');
});

test('tafsir_mode maps to Tafsir source type', () => {
  const classified = classifyQuestion('Tafsir Ibn Kathir 1:1', 'tafsir_mode');
  assert.strictEqual(classified.sourceType, 'tafsir');
});

test('Tafsir lookup and explanation intent are detected', () => {
  assert.strictEqual(classifyQuestion('Show tafsir of Al-Fatihah', 'islamic_search_mode').intent, 'direct_source_lookup');
  assert.strictEqual(classifyQuestion('Tafsir Ibn Kathir 1:1', 'islamic_search_mode').intent, 'direct_source_lookup');
  assert.strictEqual(classifyQuestion('tafsir of 2:255', 'islamic_search_mode').intent, 'explanation');
  assert.strictEqual(classifyQuestion('explain ayah 2:255', 'islamic_search_mode').sourceType, 'tafsir');
  assert.strictEqual(classifyQuestion('تفسير آية الكرسي', 'islamic_search_mode').sourceType, 'tafsir');
});

test('Tafsir analyzer runs without Supabase env', () => {
  const result = runNodeScript('scripts/analyze-tafsir-api-dataset.js', [datasetRoot]);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dataset detected: spa5k\/tafsir_api/);
  assert.match(result.stdout, /Editions detected: 2/);
  assert.match(result.stdout, /Total tafsir rows: 2/);
  assert.match(result.stdout, /Sample normalized Tafsir row/);
  assert.match(result.stdout, /MIT-repo-content-source-needs-review/);
  assert.match(result.stdout, /Original source info: (Quran\.com|Altafsir\.com)/);
});

test('Tafsir importer dry-run runs without Supabase env', () => {
  const result = runNodeScript('scripts/import-tafsir-api-to-supabase.js', [datasetRoot, '--dry-run', '--editions=en-tafisr-ibn-kathir', '--limit=10']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /Rows prepared: 1/);
  assert.match(result.stdout, /Duplicate mirror rows skipped: 1/);
  assert.match(result.stdout, /Dry-run only\. No Supabase writes performed/);
});

test('Tafsir importer execute mode requires Supabase env', () => {
  const result = runNodeScript('scripts/import-tafsir-api-to-supabase.js', [datasetRoot, '--execute', '--editions=en-tafisr-ibn-kathir', '--limit=1']);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Supabase is not configured/);
});

test('Tafsir importer uses stable tafsir-{edition_slug}-{surah}-{ayah} IDs', () => {
  const analysis = normalizeTafsirApiDataset(datasetRoot, {});
  assert(analysis.rows.some((row) => row.id === 'tafsir-en-tafisr-ibn-kathir-1-1'));
  assert(analysis.rows.some((row) => row.id === 'tafsir-en-al-jalalayn-2-255'));
});

test('Tafsir normalization treats aggregate/ayah mirrors as expected duplicates', () => {
  const analysis = normalizeTafsirApiDataset(datasetRoot, {});
  const duplicateRows = analysis.rows.filter((row) => row.id === 'tafsir-en-tafisr-ibn-kathir-1-1');
  assert.strictEqual(duplicateRows.length, 1);
  assert.strictEqual(analysis.duplicateMirrorRowsSkipped, 1);
  assert.strictEqual(duplicateRows[0].metadata.original_file, 'tafsir/en-tafisr-ibn-kathir/1.json');
  assert(!analysis.warnings.some((warning) => warning.includes('tafsir/en-tafisr-ibn-kathir/1/1.json')));
});

test('Tafsir normalization still warns for unexpected duplicates', () => {
  const analysis = normalizeTafsirApiDataset(datasetRoot, {});
  assert(analysis.warnings.some((warning) => warning.includes('Duplicate tafsir id "tafsir-en-tafisr-ibn-kathir-1-1"')));
});

test('Tafsir importer dry-run does not produce duplicate IDs', () => {
  const result = runNodeScript('scripts/import-tafsir-api-to-supabase.js', [datasetRoot, '--dry-run', '--editions=en-tafisr-ibn-kathir', '--limit=10']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Rows prepared: 1/);
  assert.match(result.stdout, /Duplicate mirror rows skipped: 1/);
  assert.doesNotMatch(result.stdout, /tafsir\/en-tafisr-ibn-kathir\/1\/1\.json/);
});

test('Tafsir import pipeline does not require frontend changes', () => {
  const importer = fs.readFileSync(path.join(process.cwd(), 'scripts', 'import-tafsir-api-to-supabase.js'), 'utf8');
  const analyzer = fs.readFileSync(path.join(process.cwd(), 'scripts', 'analyze-tafsir-api-dataset.js'), 'utf8');
  assert(fs.existsSync(path.join(process.cwd(), 'frontend', 'index.html')));
  assert(!importer.includes('frontend/index.html'));
  assert(!analyzer.includes('frontend/index.html'));
});
