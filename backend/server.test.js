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
      title: 'Intention hadith seed',
      collection_name: 'Sahih Seed',
      hadith_number: '1',
      grade: 'Sahih',
      translation_text: 'Actions are judged by intention.',
      verified_by_admin: true,
      approved_for_answers: true,
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
  buildIslamicSourceIndex({ root: sourceRoot, allowTestSources: true, write: true });

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
      PORT: String(port),
      MAX_CHAT_REQUEST_BYTES: '4096',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer(serverProcess);
});

after(() => {
  if (serverProcess) serverProcess.kill();
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
});

test('GET /api/sources returns only approved indexed sources', async () => {
  const response = await fetch(`${baseUrl}/api/sources`);
  const body = await response.json();

  assert.strictEqual(response.status, 200);
  assert(body.sources.some((source) => source.id === 'seed-hadith-approved'));
  assert(!body.sources.some((source) => source.id === 'seed-hadith-unapproved'));
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

test('/api/chat still answers direct approved Hadith matches without Ollama in fast mode', async () => {
  const { response, body } = await postJson('/api/chat', {
    message: 'remote intention',
    mode: 'hadith_mode',
    modelMode: 'fast',
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(body.errorState, null);
  assert.strictEqual(body.llmCalled, false);
  assert.strictEqual(body.resolvedModelMode, 'direct_source');
});
