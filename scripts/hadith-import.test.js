const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { test, before, after } = require('node:test');

let tempRoot;
let datasetRoot;

before(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-hadith-json-'));
  datasetRoot = path.join(tempRoot, 'db', 'by_chapter', 'bukhari');
  fs.mkdirSync(datasetRoot, { recursive: true });
  fs.writeFileSync(path.join(datasetRoot, 'chapter-1.json'), JSON.stringify({
    metadata: {
      length: 1,
      arabic: {
        title: 'صحيح البخاري',
        author: 'الإمام محمد بن إسماعيل البخاري',
        introduction: 'كتاب بدء الوحى',
      },
      english: {
        title: 'Sahih al-Bukhari',
        author: 'Imam Muhammad ibn Ismail al-Bukhari',
        introduction: 'Revelation',
      },
    },
    hadiths: [
      {
        id: 1,
        idInBook: 1,
        chapterId: 1,
        bookId: 1,
        arabic: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
        english: {
          narrator: "Narrated 'Umar bin Al-Khattab:",
          text: 'Actions are judged by intentions.',
        },
      },
    ],
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

test('hadith dataset analyzer works without Supabase env', () => {
  const result = runNodeScript('scripts/analyze-hadith-json-dataset.js', [datasetRoot]);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Collection slug: bukhari/);
  assert.match(result.stdout, /Sahih al-Bukhari/);
  assert.match(result.stdout, /Sample normalized row/);
});

test('hadith importer dry-run is safe by default without Supabase env', () => {
  const result = runNodeScript('scripts/import-hadith-json-to-supabase.js', [datasetRoot, '--collections=bukhari', '--limit=10']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /Dry-run only\. No Supabase writes performed/);
  assert.match(result.stdout, /Counts by collection: \{"bukhari":1\}/);
});

test('hadith importer execute mode requires Supabase env before writing', () => {
  const result = runNodeScript('scripts/import-hadith-json-to-supabase.js', [datasetRoot, '--execute', '--collections=bukhari', '--limit=10']);
  assert.notStrictEqual(result.status, 0);
  assert.match(result.stderr + result.stdout, /Supabase is not configured/);
});
