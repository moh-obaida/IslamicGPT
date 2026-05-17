process.env.NODE_ENV = 'test';
process.env.ISLAMICGPT_SKIP_DOTENV = '1';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const { before, after, test } = require('node:test');
const { buildIslamicSourceIndex } = require('./src/sourceStore');

let serverProcess;
let baseUrl;
let sourceRoot;
let mockOllamaServer;
let mockOllamaBaseUrl;

const ADMIN_EMAIL = 'owner@example.com';
const ADMIN_PASSWORD = 'correct-password';
const JWT_SECRET = 'test-secret-that-is-long-enough';
const LONG_TAFSIR_EXPLANATION = 'This tafsir explains the opening verse of Al-Fatihah. '.repeat(80);

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function readRequestBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => resolve(body));
  });
}

function waitForServer(child) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for server start')), 5000);
    child.stdout.on('data', (chunk) => {
      if (String(chunk).includes('IslamicGPT backend listening')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      reject(new Error(String(chunk)));
    });
    child.once('exit', (code) => reject(new Error(`Server exited before start with code ${code}`)));
  });
}

before(async () => {
  sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'islamicgpt-sources-'));
  for (const folder of ['quran', 'hadith', 'tafsir', 'scholars', 'fatwas', 'uploads', 'admin', 'indexes']) {
    fs.mkdirSync(path.join(sourceRoot, folder), { recursive: true });
  }
  fs.writeFileSync(path.join(sourceRoot, 'admin', 'sources.json'), '[]');
  fs.writeFileSync(path.join(sourceRoot, 'hadith', 'seed.json'), JSON.stringify([
    {
      id: 'seed-hadith-approved',
      source_type: 'hadith',
      title: 'Actions are judged by intention',
      collection_name: 'Sahih Seed',
      hadith_number: '1',
      grade: 'Sahih',
      arabic_text: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
      translation_text: 'Actions are judged by intention.',
      verified_by_admin: true,
      approved_for_answers: true,
      topic_tags: ['intention', 'niyyah'],
    },
    {
      id: 'seed-hadith-unapproved',
      source_type: 'hadith',
      title: 'Unapproved seed',
      collection_name: 'Sahih Seed',
      hadith_number: '2',
      translation_text: 'This should not be indexed.',
      verified_by_admin: true,
      approved_for_answers: false,
    },
  ], null, 2));
  fs.writeFileSync(path.join(sourceRoot, 'quran', 'seed.json'), JSON.stringify([
    {
      id: 'quran-1-1-mixed',
      source_type: 'quran',
      title: 'Tafsir of Quran 1:1 keyword match seed',
      collection_name: 'Quran',
      surah: 1,
      ayah: 1,
      surah_number: 1,
      ayah_number: 1,
      surah_name_en: 'Al-Fatihah',
      translation_text: 'In the name of Allah, the Entirely Merciful, the Especially Merciful.',
      translation_name: 'Saheeh International',
      verified_by_admin: true,
      approved_for_answers: true,
      topic_tags: ['tafsir', 'fatihah'],
    },
    {
      id: 'quran-2-255',
      source_type: 'quran',
      title: 'Al-Baqarah 2:255',
      collection_name: 'Quran',
      surah: 2,
      ayah: 255,
      surah_number: 2,
      ayah_number: 255,
      surah_name_ar: 'البقرة',
      surah_name_en: 'Al-Baqarah',
      arabic_text: 'الله لا إله إلا هو الحي القيوم',
      translation_text: 'Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence.',
      translator: 'Umm Muhammad',
      translation_name: 'Saheeh International',
      translation_source: 'Tanzil',
      license_status: 'CC-BY-SA-4.0',
      verified_by_admin: true,
      approved_for_answers: true,
      topic_tags: ['ayat al-kursi', 'kursi'],
    },
  ], null, 2));
  fs.writeFileSync(path.join(sourceRoot, 'fatwas', 'seed.json'), JSON.stringify([
    {
      id: 'scholar-sample-binbaz-dua-002',
      source_type: 'fatwa',
      title: 'شروط إجابة الدعاء',
      scholar_name: 'الشيخ عبد العزيز بن باز',
      scholar_slug: 'ibn-baz',
      work_type: 'fatwa',
      question_text: 'ما شروط إجابة الدعاء؟',
      answer_text: 'من شروط إجابة الدعاء الإخلاص لله، وأكل الحلال، وحضور القلب، وتحري أوقات الإجابة.',
      summary_text: 'ملخص المصدر: شروط إجابة الدعاء تشمل الإخلاص والحلال وحضور القلب.',
      fatwa_reference: 'Sample Ref SB-002',
      source_url: 'https://example.com/scholar/ibn-baz/dua-sample',
      topic_tags: ['fatwa', 'ibn baz', 'dua', 'supplication', 'ابن باز', 'الدعاء', 'اجابة الدعاء'],
      approved_for_answers: true,
      verified_by_admin: true,
      admin_review_status: 'sample_only',
      attribution_text: 'Curated sample record for pipeline testing.',
      license_status: 'sample_only_review_required',
      metadata: { sample: true },
    },
    {
      id: 'scholar-sample-binbaz-prayer-001',
      source_type: 'fatwa',
      title: 'حكم الاستماع إلى الأغاني',
      scholar_name: 'الشيخ عبد العزيز بن باز',
      scholar_slug: 'ibn-baz',
      work_type: 'fatwa',
      question_text: 'ما حكم الاستماع إلى الأغاني؟',
      answer_text: 'الاستماع إلى الأغاني لا يجوز، ويجب على المسلم أن يشتغل بما ينفعه من القرآن والذكر.',
      summary_text: 'ملخص المصدر: حكم الاستماع إلى الأغاني التحريم والتنبيه على سماع القرآن والذكر.',
      fatwa_reference: 'Sample Ref SB-001',
      source_url: 'https://example.com/scholar/ibn-baz/prayer-sample',
      topic_tags: ['fatwa', 'ibn baz', 'songs', 'music', 'listening', 'ابن باز', 'الاغاني', 'الاستماع'],
      approved_for_answers: true,
      verified_by_admin: true,
      admin_review_status: 'sample_only',
      attribution_text: 'Curated sample record for pipeline testing.',
      license_status: 'sample_only_review_required',
      metadata: { sample: true },
    },
  ], null, 2));
  fs.writeFileSync(path.join(sourceRoot, 'tafsir', 'seed.json'), JSON.stringify([
    {
      id: 'tafsir-en-tafisr-ibn-kathir-1-1',
      source_type: 'tafsir',
      title: 'Tafsir Ibn Kathir, Tafsir of 1:1',
      collection_name: 'Tafsir',
      surah: 1,
      ayah: 1,
      surah_number: 1,
      ayah_number: 1,
      ayah_start: 1,
      ayah_end: 1,
      ayah_range: '1',
      surah_name_en: 'Al-Fatihah',
      tafsir_edition_slug: 'en-tafisr-ibn-kathir',
      tafsir_book_name: 'Tafsir Ibn Kathir',
      tafsir_author: 'Ibn Kathir',
      tafsir_language: 'en',
      explanation_text: LONG_TAFSIR_EXPLANATION,
      original_source: 'Quran.com',
      verified_by_admin: true,
      approved_for_answers: true,
      topic_tags: ['fatihah', 'tafsir'],
    },
  ], null, 2));
  buildIslamicSourceIndex({ root: sourceRoot, allowTestSources: true, write: true });

  const ollamaPort = await getFreePort();
  mockOllamaBaseUrl = `http://127.0.0.1:${ollamaPort}`;
  mockOllamaServer = http.createServer(async (req, res) => {
    if (req.url === '/api/tags' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ models: [{ name: 'mock-local-model' }] }));
      return;
    }

    if (req.url === '/api/generate' && req.method === 'POST') {
      const payload = JSON.parse(await readRequestBody(req) || '{}');
      const prompt = String(payload.prompt || '');
      let responseText = 'I can only answer from approved sources.';

      if (/Explain the hadith about intention simply/i.test(prompt)) {
        responseText = 'The approved source explains that actions are judged by intention. In Sahih Seed, Hadith 1, the source meaning is: "Actions are judged by intention." This shows that deeds are evaluated according to the intention behind them.';
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ response: responseText }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  await new Promise((resolve) => mockOllamaServer.listen(ollamaPort, resolve));

  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['backend/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
      JWT_SECRET,
      NODE_ENV: 'test',
      ISLAMICGPT_SKIP_DOTENV: '1',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ISLAMIC_SOURCES_ROOT: sourceRoot,
      OLLAMA_BASE_URL: mockOllamaBaseUrl,
      PORT: String(port),
      MAX_CHAT_REQUEST_BYTES: '4096',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer(serverProcess);
});

after(() => {
  if (serverProcess) serverProcess.kill();
  if (mockOllamaServer) mockOllamaServer.close();
  if (sourceRoot) fs.rmSync(sourceRoot, { recursive: true, force: true });
});

async function postJson(pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function putJson(pathname, body, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

async function adminToken() {
  const { response, body } = await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.strictEqual(response.status, 200);
  return body.token;
}

test('POST /api/chat rejects invalid JSON with a 400 response', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{',
  });
  const body = await response.json();

  assert.strictEqual(response.status, 400);
  assert.strictEqual(body.errorState, 'invalid_json');
});

test('POST /api/chat rejects oversized requests before parsing', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'x'.repeat(5000), mode: 'islamic_search_mode' }),
  });
  const body = await response.json();

  assert.strictEqual(response.status, 413);
  assert.strictEqual(body.errorState, 'request_too_large');
});

test('unknown mode names do not bypass non-Islamic request filtering', async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'what is the weather', mode: 'custom_mode' }),
  });
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.isIslamicQuestion, false);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.confidence, 'normal_chat');
});

test('GET /api/sources returns only approved indexed sources', async () => {
  const response = await fetch(`${baseUrl}/api/sources`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert(body.sources.some((source) => source.id === 'seed-hadith-approved'));
  assert(!body.sources.some((source) => source.id === 'seed-hadith-unapproved'));
  assert.strictEqual(body.sourceBackend, 'local');
});

test('GET /health and /api/health expose local fallback supabase status', async () => {
  const healthResponse = await fetch(`${baseUrl}/health`);
  const healthBody = await healthResponse.json();
  const apiHealthResponse = await fetch(`${baseUrl}/api/health`);
  const apiHealthBody = await apiHealthResponse.json();

  assert.strictEqual(healthResponse.status, 200);
  assert.strictEqual(apiHealthResponse.status, 200);
  assert.strictEqual(healthBody.services.backend.status, 'online');
  assert.strictEqual(healthBody.services.local_ai.status, 'online');
  assert.strictEqual(healthBody.services.source_mode, 'local_fallback');
  assert.strictEqual(healthBody.services.supabase.configured, false);
  assert.strictEqual(apiHealthBody.services.source_mode, 'local_fallback');
  assert.strictEqual(healthBody.runtime.app, 'IslamicGPT');
  assert.strictEqual(typeof healthBody.runtime.commit, 'string');
  assert.strictEqual(typeof healthBody.runtime.branch, 'string');
  assert.strictEqual(typeof healthBody.runtime.started_at, 'string');
});

test('GET /api/version returns safe runtime details and feature capabilities', async () => {
  const response = await fetch(`${baseUrl}/api/version`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.app, 'IslamicGPT');
  assert.strictEqual(typeof body.started_at, 'string');
  assert.strictEqual(typeof body.uptime_seconds, 'number');
  assert(body.uptime_seconds >= 0);
  assert.strictEqual(typeof body.commit, 'string');
  assert.strictEqual(typeof body.branch, 'string');
  assert.strictEqual(body.features.directTafsirTemplate, true);
  assert.strictEqual(body.features.tafsirPayloadSanitizer, true);
  assert.strictEqual(body.features.noSourceGate, true);
});

test('admin login rejects wrong password', async () => {
  const { response, body } = await postJson('/api/admin/login', { email: ADMIN_EMAIL, password: 'wrong' });

  assert.strictEqual(response.status, 401);
  assert.strictEqual(body.errorState, 'invalid_admin_credentials');
});

test('admin source endpoints reject missing token', async () => {
  const response = await fetch(`${baseUrl}/api/admin/sources`);
  const body = await response.json();

  assert.strictEqual(response.status, 401);
  assert.strictEqual(body.errorState, 'admin_auth_required');
});

test('adding hadith without number rejects unless hadith_number_unavailable=true', async () => {
  const token = await adminToken();
  const headers = { Authorization: `Bearer ${token}` };

  const rejected = await postJson('/api/admin/sources', {
    id: 'admin-invalid-hadith',
    source_type: 'hadith',
    collection_name: 'Admin Hadith',
    translation_text: 'Invalid because no number is supplied.',
  }, headers);
  assert.strictEqual(rejected.response.status, 400);
  assert(rejected.body.errors.some((error) => error.includes('hadith_number')));

  const accepted = await postJson('/api/admin/sources', {
    id: 'admin-valid-unavailable-hadith',
    source_type: 'hadith',
    title: 'Remote intention unavailable number',
    collection_name: 'Admin Hadith',
    hadith_number_unavailable: true,
    translation_text: 'Remote intention source text.',
  }, headers);
  assert.strictEqual(accepted.response.status, 201);
  assert.strictEqual(accepted.body.source.verified_by_admin, false);
  assert.strictEqual(accepted.body.source.approved_for_answers, false);
});

test('approved source appears after reindex and unapproved source stays out', async () => {
  const token = await adminToken();
  const headers = { Authorization: `Bearer ${token}` };

  let reindex = await postJson('/api/admin/sources/reindex', {}, headers);
  assert.strictEqual(reindex.response.status, 200);

  let publicSearch = await fetch(`${baseUrl}/api/sources/search?q=remote&type=hadith`);
  let publicBody = await publicSearch.json();
  assert(!publicBody.sources.some((source) => source.id === 'admin-valid-unavailable-hadith'));

  const updated = await putJson('/api/admin/sources/admin-valid-unavailable-hadith', {
    source_type: 'hadith',
    title: 'Remote intention unavailable number',
    collection_name: 'Admin Hadith',
    hadith_number_unavailable: true,
    translation_text: 'Remote intention source text.',
    verified_by_admin: true,
    approved_for_answers: true,
  }, headers);
  assert.strictEqual(updated.response.status, 200);

  reindex = await postJson('/api/admin/sources/reindex', {}, headers);
  assert.strictEqual(reindex.response.status, 200);
  assert(reindex.body.total_indexed >= 2);

  publicSearch = await fetch(`${baseUrl}/api/sources/search?q=remote&type=hadith`);
  publicBody = await publicSearch.json();
  assert(publicBody.sources.some((source) => source.id === 'admin-valid-unavailable-hadith'));
});

test('admin search-test returns matches without calling Ollama', async () => {
  const token = await adminToken();
  const { response, body } = await postJson('/api/admin/sources/search-test', {
    q: 'remote intention',
    mode: 'hadith_mode',
  }, { Authorization: `Bearer ${token}` });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert(body.matches.some((source) => source.id === 'admin-valid-unavailable-hadith'));
});

test('/api/chat still answers direct approved Hadith lookups without Ollama in fast mode', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Give me a hadith about intention',
    mode: 'hadith_mode',
    modelMode: 'fast',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.errorState, null);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
});

test('/api/chat blocks Islamic answers when no approved source exists', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Give me a hadith about xyzabcunknown',
    mode: 'hadith_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.confidence, 'no_approved_source_found');
  assert.strictEqual(body.hallucinationGuard.status, 'blocked');
  assert.strictEqual(body.hallucinationGuard.method, 'no_source_gate');
  assert.strictEqual(body.sourceCards.length, 0);
  assert.strictEqual(body.answer.includes('I could not find enough approved source evidence to answer this safely.'), true);
  assert.strictEqual(body.answer.includes('Try asking with a specific reference'), true);
});

test('/api/chat uses template answers for direct source lookup', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Give me a hadith about intention',
    mode: 'hadith_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.confidence, 'source_backed');
  assert.strictEqual(body.hallucinationGuard.status, 'passed');
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert.strictEqual(body.sourceCards.length > 0, true);
  assert.strictEqual(body.answer.includes('### Actions are judged by intention'), true);
  assert.strictEqual(body.answer.includes('**Source:**\nSahih Seed, Hadith 1'), true);
  assert.strictEqual(body.answer.includes('**Meaning:**'), false);
  assert.strictEqual(body.answer.includes('Title:'), false);
  assert.strictEqual(body.answer.includes('Arabic: إِن'), false);
});

test('/api/chat uses template answers for direct Quran lookups without Ollama', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Give me Ayat al-Kursi',
    mode: 'quran_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.confidence, 'source_backed');
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert.strictEqual(body.answer.includes('### Quran verse'), true);
  assert.strictEqual(body.answer.includes('**Source:**\nQuran 2:255'), true);
  assert.strictEqual(body.answer.includes('Translation: Saheeh International'), true);
  assert.strictEqual(body.sourceCards[0].metadata.translation_source, 'Tanzil');
});

test('/api/chat uses template answers for Quran Aya references without Ollama', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Quran Aya 2:255',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.confidence, 'source_backed');
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert.strictEqual(body.answer.includes('### Quran verse'), true);
  assert.strictEqual(body.answer.includes('**Source:**\nQuran 2:255'), true);
});

test('/api/chat uses template answers for direct Tafsir lookups without Ollama', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Show tafsir of Al-Fatihah',
    mode: 'tafsir_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert.strictEqual(body.answer.includes('A relevant Tafsir source is Tafsir Ibn Kathir, Tafsir of 1:1.'), true);
  assert.strictEqual(body.answer.includes('Reference:\nQuran 1:1'), true);
  assert.strictEqual(body.answer.includes('Edition:\nen-tafisr-ibn-kathir'), true);
  assert.strictEqual(body.answer.includes('This is a source-backed Tafsir excerpt.'), true);
});

test('/api/chat answers direct Tafsir reference queries with deterministic preview without Ollama', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Tafsir of Quran 1:1',
    mode: 'islamic_search_mode',
    modelMode: 'balanced',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.answer.includes('Tafsir Ibn Kathir'), true);
  assert.strictEqual(body.answer.includes('Quran 1:1'), true);
  assert.strictEqual(body.answer.includes('Explanation:'), true);
  assert.strictEqual(body.answer.includes(LONG_TAFSIR_EXPLANATION), false);
  assert.strictEqual(body.answer.includes('…'), true);
  assert.strictEqual(body.sources[0].source_type, 'tafsir');
  assert.strictEqual(body.sources[0].explanation_text.length <= 1502, true);
  assert.strictEqual(body.sources[0].full_text_length > body.sources[0].explanation_text.length, true);
  assert.strictEqual(body.sources[0].has_full_text, true);
  assert.strictEqual(body.sources[0].metadata?.original_record?.text, undefined);
  assert.strictEqual(typeof body.sources[0].metadata?.original_record_text_length, 'number');
});

test('/api/chat prefers Tafsir template source when mixed matches include non-Tafsir first', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Tafsir of Quran 1:1',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.answer.startsWith('A relevant Tafsir source is Tafsir Ibn Kathir, Tafsir of 1:1.'), true);
  assert.strictEqual(body.sources[0].source_type, 'tafsir');
});

test('/api/sources/search returns capped Tafsir payload previews', async () => {
  const response = await fetch(`${baseUrl}/api/sources/search?q=Tafsir%20of%20Quran%201:1&type=tafsir`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.sources.length > 0, true);
  assert.strictEqual(body.sources[0].source_type, 'tafsir');
  assert.strictEqual(body.sources[0].explanation_text.length <= 1502, true);
  assert.strictEqual(body.sources[0].full_text_length > body.sources[0].explanation_text.length, true);
  assert.strictEqual(body.sources[0].has_full_text, true);
  assert.strictEqual(body.sources[0].metadata?.original_record?.text, undefined);
});

test('/api/sources/search keeps hadith payload behavior unchanged', async () => {
  const response = await fetch(`${baseUrl}/api/sources/search?q=intention&type=hadith`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.sources.length > 0, true);
  assert.strictEqual(body.sources[0].source_type, 'hadith');
  assert.strictEqual(typeof body.sources[0].translation_text, 'string');
  assert.strictEqual(body.sources[0].full_text_length, undefined);
});

test('/api/chat uses model with validation for explanations', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Explain the hadith about intention simply',
    mode: 'hadith_mode',
    modelMode: 'balanced',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, true);
  assert.strictEqual(body.confidence, 'source_backed');
  assert.strictEqual(body.hallucinationGuard.status, 'passed');
  assert.strictEqual(body.hallucinationGuard.method, 'model_with_validation');
  assert.strictEqual(body.sourceCards.length > 0, true);
  assert.strictEqual(body.answer.includes('Actions are judged by intention.'), true);
});

test('/api/chat adds scholar note to sensitive no-source questions', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Is my prayer valid if I forgot something xyzabc?',
    mode: 'fiqh_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.confidence, 'no_approved_source_found');
  assert.strictEqual(body.hallucinationGuard.status, 'blocked');
  assert.strictEqual(body.answer.includes('Please consult a qualified scholar'), true);
});


test('/api/sources/search returns scholar sample with source metadata', async () => {
  const response = await fetch(`${baseUrl}/api/sources/search?q=Ibn%20Baz%20prayer&type=scholar`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.sources.length > 0, true);
  assert(['scholar', 'fatwa'].includes(body.sources[0].source_type));
  assert.strictEqual(body.sources[0].scholar_name, 'الشيخ عبد العزيز بن باز');
  assert.strictEqual(typeof body.sources[0].fatwa_reference, 'string');
  assert.strictEqual(typeof body.sources[0].source_url, 'string');
});

test('/api/chat answers direct scholar lookup with deterministic template and no LLM call', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Ibn Baz fatwa about songs',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert(['scholar', 'fatwa'].includes(body.sources[0].source_type));
  assert.strictEqual(body.answer.includes('الشيخ عبد العزيز بن باز'), true);
  assert.strictEqual(body.answer.includes('source-backed excerpt') || body.answer.includes('هذا مقتطف موثق'), true);
  assert.strictEqual(body.answer.includes('not a personalized fatwa') || body.answer.includes('ليس فتوى شخصية'), true);
});

test('/api/chat answers Arabic direct Bin Baz lookup with deterministic template and no LLM call', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'ما شروط إجابة الدعاء عند ابن باز؟',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert(['scholar', 'fatwa'].includes(body.sources[0].source_type));
  assert.strictEqual(body.answer.includes('وجدت مصدرًا معتمدًا'), true);
  assert.strictEqual(body.answer.includes('العنوان:'), true);
  assert.strictEqual(body.answer.includes('العالم:'), true);
  assert.strictEqual(body.answer.includes('مقتطف من الجواب:'), true);
  assert.strictEqual(body.answer.includes('المرجع:'), true);
  assert.strictEqual(body.answer.includes('تنبيه:'), true);
  assert.strictEqual(body.answer.includes('Title:'), false);
  assert.strictEqual(body.answer.includes('Answer excerpt:'), false);
  assert.strictEqual(body.answer.includes('This is a source-backed excerpt'), false);
});

test('/api/chat answers Arabic direct fatwa wording with deterministic template and no LLM call', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'ما حكم الاستماع إلى الأغاني عند ابن باز؟',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert(['scholar', 'fatwa'].includes(body.sources[0].source_type));
  assert.strictEqual(body.answer.includes('وجدت مصدرًا معتمدًا'), true);
  assert.strictEqual(body.answer.includes('العنوان:'), true);
  assert.strictEqual(body.answer.includes('العالم:'), true);
  assert.strictEqual(body.answer.includes('مقتطف من الجواب:'), true);
  assert.strictEqual(body.answer.includes('المرجع:'), true);
  assert.strictEqual(body.answer.includes('تنبيه:'), true);
});

test('/api/chat keeps English direct scholar lookup template labels', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Ibn Baz fatwa about songs',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'template_answer');
  assert.strictEqual(body.answer.includes('Title:'), true);
  assert.strictEqual(body.answer.includes('Scholar:'), true);
  assert.strictEqual(body.answer.includes('Answer excerpt:'), true);
  assert.strictEqual(body.answer.includes('Reference:'), true);
  assert.strictEqual(body.answer.includes('العنوان:'), false);
  assert.strictEqual(body.answer.includes('مقتطف من الجواب:'), false);
});

test('/api/chat blocks unknown scholar fatwa lookup safely', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'Bin Baz fatwa about a made up topic xyz',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'no_source_gate');
  assert.strictEqual(body.confidence, 'no_approved_source_found');
});

test('/api/chat blocks unknown Arabic scholar fatwa lookup safely', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'ما حكم موضوع غير موجود عند ابن باز؟',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.hallucinationGuard.method, 'no_source_gate');
  assert.strictEqual(body.confidence, 'no_approved_source_found');
});


test('/api/chat keeps hello as normal chat without source requirements', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'hello',
    mode: 'islamic_search_mode',
    modelMode: 'quick',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.isIslamicQuestion, false);
  assert.strictEqual(body.confidence, 'normal_chat');
  assert.strictEqual(body.hallucinationGuard.status, 'not_required');
  assert.strictEqual(body.llmCalled, false);
});
