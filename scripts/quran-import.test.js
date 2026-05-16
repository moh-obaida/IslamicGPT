const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, before, after } = require('node:test');
const { classifyQuestion } = require('../backend/src/questionClassifier');
const { normalizeSourceRecord } = require('../backend/src/supabaseSourceDb');
const { normalizeQuranDataset } = require('./quran-json-utils');

let tempRoot;
let datasetRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-quran-json-'));
  datasetRoot = path.join(tempRoot, 'quran-json');
  fs.mkdirSync(path.join(datasetRoot, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(datasetRoot, 'dist', 'quran.json'), JSON.stringify([
    {
      id: 1,
      name: 'الفاتحة',
      transliteration: 'Al-Fatihah',
      type: 'meccan',
      verses: [
        { id: 1, text: 'بسم الله الرحمن الرحيم' },
      ],
    },
    {
      id: 2,
      name: 'البقرة',
      transliteration: 'Al-Baqarah',
      type: 'medinan',
      verses: [
        { id: 255, text: 'الله لا إله إلا هو الحي القيوم' },
      ],
    },
  ], null, 2));
  fs.writeFileSync(path.join(datasetRoot, 'dist', 'quran_en.json'), JSON.stringify([
    {
      id: 1,
      name: 'Al-Fatihah',
      transliteration: 'Al-Fatihah',
      verses: [
        { id: 1, text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.' },
      ],
    },
    {
      id: 2,
      name: 'Al-Baqarah',
      transliteration: 'Al-Baqarah',
      verses: [
        { id: 255, text: 'Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.' },
      ],
    },
  ], null, 2));
  fs.mkdirSync(path.join(datasetRoot, 'dist', 'verses', '1'), { recursive: true });
  fs.writeFileSync(path.join(datasetRoot, 'dist', 'verses', '1', '1.json'), JSON.stringify({
    surah: 1,
    ayah: 1,
    text: 'بسم الله الرحمن الرحيم',
    translation: '奉至仁至慈的真主之名',
    translations: {
      en: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
      zh: '奉至仁至慈的真主之名',
    },
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

test('Quran normalization preserves required fields and license metadata', () => {
  const analysis = normalizeQuranDataset(datasetRoot, { approve: true });
  const row = analysis.rows.find((entry) => entry.id === 'quran-1-1');

  assert(row);
  assert.strictEqual(row.source_type, 'quran');
  assert.strictEqual(row.collection_name, 'Quran');
  assert.strictEqual(row.surah, 1);
  assert.strictEqual(row.ayah, 1);
  assert.strictEqual(row.surah_number, 1);
  assert.strictEqual(row.ayah_number, 1);
  assert.strictEqual(row.surah_name_ar, 'الفاتحة');
  assert.strictEqual(row.surah_name_en, 'Al-Fatihah');
  assert.strictEqual(row.translator, 'Umm Muhammad');
  assert.strictEqual(row.translation_name, 'Saheeh International');
  assert.strictEqual(row.translation_source, 'Tanzil');
  assert.strictEqual(row.license_status, 'CC-BY-SA-4.0');
  assert.strictEqual(row.requires_attribution, true);
  assert.strictEqual(row.requires_sharealike_review, true);
  assert.strictEqual(row.approved_for_answers, true);
  assert.strictEqual(row.verified_by_admin, false);
  assert.strictEqual(row.translation_text, 'In the name of Allah, the Entirely Merciful, the Especially Merciful.');
});

test('Quran normalization prefers translations.en over non-English generic translation fields', () => {
  const analysis = normalizeQuranDataset(datasetRoot, {});
  const row = analysis.rows.find((entry) => entry.id === 'quran-1-1');

  assert(row);
  assert.strictEqual(row.translation_language, 'en');
  assert.strictEqual(row.translation_text, 'In the name of Allah, the Entirely Merciful, the Especially Merciful.');
  assert(!analysis.warnings.some((warning) => warning.includes('quran-1-1: translation_text does not appear to match requested translation_language=en.')));
});

test('Quran display title uses surah name and verse reference', () => {
  const normalized = normalizeSourceRecord({
    id: 'quran-2-255',
    source_type: 'quran',
    surah_number: 2,
    ayah_number: 255,
    surah_name_en: 'Al-Baqarah',
    arabic_text: 'الله لا إله إلا هو الحي القيوم',
    translation_text: 'Allah - there is no deity except Him.',
  });

  assert.strictEqual(normalized.display_title, 'Al-Baqarah 2:255');
  assert.strictEqual(normalized.source_title, 'Al-Baqarah 2:255');
});

test('quran_mode maps to Quran source type', () => {
  const classified = classifyQuestion('Give me an ayah about patience', 'quran_mode');
  assert.strictEqual(classified.sourceType, 'quran');
  assert.strictEqual(classified.intent, 'direct_source_lookup');
});

test('direct Quran lookup intent is detected', () => {
  assert.strictEqual(classifyQuestion('Quran 2:255', 'islamic_search_mode').intent, 'direct_source_lookup');
  assert.strictEqual(classifyQuestion('Give me Ayat al-Kursi', 'islamic_search_mode').intent, 'direct_source_lookup');
  assert.strictEqual(classifyQuestion('اشرح آية الكرسي', 'islamic_search_mode').intent, 'explanation');
});

test('Quran analyzer runs without Supabase env', () => {
  const result = runNodeScript('scripts/analyze-quran-json-dataset.js', [datasetRoot]);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Dataset detected: risan\/quran-json/);
  assert.match(result.stdout, /Total surahs: 2/);
  assert.match(result.stdout, /Total ayahs: 2/);
  assert.match(result.stdout, /Sample normalized Quran row/);
  assert.match(result.stdout, /CC-BY-SA-4\.0/);
  assert.match(result.stdout, /Translation language: en/);
});

test('Quran importer dry-run runs without Supabase env', () => {
  const result = runNodeScript('scripts/import-quran-json-to-supabase.js', [datasetRoot, '--dry-run', '--limit=10']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /Rows prepared: 2/);
  assert.match(result.stdout, /Dry-run only\. No Supabase writes performed/);
});

test('Quran importer execute mode requires Supabase env', () => {
  const result = runNodeScript('scripts/import-quran-json-to-supabase.js', [datasetRoot, '--execute', '--approve', '--limit=1']);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Supabase is not configured/);
});

test('Quran importer uses stable quran-{surah}-{ayah} IDs', () => {
  const analysis = normalizeQuranDataset(datasetRoot, {});
  assert(analysis.rows.some((row) => row.id === 'quran-1-1'));
  assert(analysis.rows.some((row) => row.id === 'quran-2-255'));
});



test('Quran normalization uses chapter-local verse.number and preserves global verse id', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-quran-json-global-'));
  const localDatasetRoot = path.join(root, 'quran-json');
  fs.mkdirSync(path.join(localDatasetRoot, 'dist', 'verses'), { recursive: true });
  fs.writeFileSync(path.join(localDatasetRoot, 'dist', 'verses', '255.json'), JSON.stringify({
    id: 255,
    number: 248,
    chapter: { id: 2, transliteration: 'Al-Baqarah', name: 'البقرة' },
    text: 'وَقَالَ لَهُمۡ نَبِيُّهُمۡ...',
    translations: { en: 'And their prophet said to them...' },
  }, null, 2));

  try {
    const analysis = normalizeQuranDataset(localDatasetRoot, {});
    const row = analysis.rows.find((entry) => entry.id === 'quran-2-248');
    assert(row);
    assert.strictEqual(row.surah_number, 2);
    assert.strictEqual(row.ayah_number, 248);
    assert.strictEqual(row.ayah_global_number, 255);
    assert.strictEqual(row.title, 'Al-Baqarah 2:248');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Quran normalization keeps Ayat al-Kursi id as quran-2-255 when chapter-local number is 255', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-quran-json-kursi-'));
  const localDatasetRoot = path.join(root, 'quran-json');
  fs.mkdirSync(path.join(localDatasetRoot, 'dist', 'verses'), { recursive: true });
  fs.writeFileSync(path.join(localDatasetRoot, 'dist', 'verses', '262.json'), JSON.stringify({
    id: 262,
    number: 255,
    chapter: { id: 2, transliteration: 'Al-Baqarah', name: 'البقرة' },
    text: 'اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ...',
    translations: { en: 'Allah - there is no deity except Him...' },
  }, null, 2));

  try {
    const analysis = normalizeQuranDataset(localDatasetRoot, {});
    assert(analysis.rows.some((entry) => entry.id === 'quran-2-255'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Quran analyzer warns when requested English translation is unavailable', () => {
  const warningRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-quran-json-warning-'));
  const warningDatasetRoot = path.join(warningRoot, 'quran-json');
  fs.mkdirSync(path.join(warningDatasetRoot, 'dist', 'verses', '3'), { recursive: true });
  fs.writeFileSync(path.join(warningDatasetRoot, 'dist', 'verses', '3', '1.json'), JSON.stringify({
    surah: 3,
    ayah: 1,
    text: 'الم',
    translation: '这是错误的中文翻译',
  }, null, 2));

  try {
    const analysis = normalizeQuranDataset(warningDatasetRoot, {});
    const row = analysis.rows.find((entry) => entry.id === 'quran-3-1');

    assert(row);
    assert.strictEqual(row.translation_text, null);
    assert(analysis.warnings.some((warning) => warning.includes('quran-3-1: no English translation available; left translation_text null.')));
  } finally {
    fs.rmSync(warningRoot, { recursive: true, force: true });
  }
});

test('Quran import pipeline does not require frontend changes', () => {
  const importer = fs.readFileSync(path.join(process.cwd(), 'scripts', 'import-quran-json-to-supabase.js'), 'utf8');
  const analyzer = fs.readFileSync(path.join(process.cwd(), 'scripts', 'analyze-quran-json-dataset.js'), 'utf8');
  assert(fs.existsSync(path.join(process.cwd(), 'frontend', 'index.html')));
  assert(!importer.includes('frontend/index.html'));
  assert(!analyzer.includes('frontend/index.html'));
});
