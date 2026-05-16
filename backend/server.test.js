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
      verified_by_admin: false,
      approved_for_answers: false,
    },
  ], null, 2));
  fs.writeFileSync(path.join(sourceRoot, 'quran', 'seed.json'), JSON.stringify([
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
      explanation_text: 'This tafsir explains the opening verse of Al-Fatihah.',
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
  assert.strictEqual(body.answer.includes('I could not find enough reliable evidence in the approved sources.'), true);
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
  assert.strictEqual(body.answer.includes('A relevant hadith is found in Sahih Seed, Hadith 1.'), true);
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
  assert.strictEqual(body.answer.includes('A relevant Quran verse is Al-Baqarah 2:255.'), true);
  assert.strictEqual(body.answer.includes('Translation:\nSaheeh International'), true);
  assert.strictEqual(body.sourceCards[0].metadata.translation_source, 'Tanzil');
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
  assert.strictEqual(body.answer.includes('A relevant tafsir source is Tafsir Ibn Kathir, explaining Quran 1:1.'), true);
  assert.strictEqual(body.answer.includes('Original source:\nQuran.com'), true);
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
