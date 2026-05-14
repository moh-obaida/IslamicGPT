const assert = require('assert');
const { spawn } = require('child_process');
const http = require('http');
const { before, after, test } = require('node:test');

let serverProcess;
let baseUrl;

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
  const port = await getFreePort();
  baseUrl = `http://127.0.0.1:${port}`;
  serverProcess = spawn(process.execPath, ['backend/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      MAX_CHAT_REQUEST_BYTES: '80',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await waitForServer(serverProcess);
});

after(() => {
  if (serverProcess) serverProcess.kill();
});

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
    body: JSON.stringify({ message: 'x'.repeat(100), mode: 'islamic_search_mode' }),
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
