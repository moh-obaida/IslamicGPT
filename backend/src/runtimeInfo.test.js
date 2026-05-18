const assert = require('assert');
const { test, after } = require('node:test');
const { getGitCommit, getGitBranch, getRuntimeInfo } = require('./runtimeInfo');

const originalCommit = process.env.GIT_COMMIT;
const originalBranch = process.env.GIT_BRANCH;

after(() => {
  if (originalCommit === undefined) delete process.env.GIT_COMMIT;
  else process.env.GIT_COMMIT = originalCommit;
  if (originalBranch === undefined) delete process.env.GIT_BRANCH;
  else process.env.GIT_BRANCH = originalBranch;
});

test('runtime info prefers env commit and branch overrides', () => {
  process.env.GIT_COMMIT = 'abc123def4567890';
  process.env.GIT_BRANCH = 'cursor/test-branch';
  assert.strictEqual(getGitCommit(), 'abc123def456');
  assert.strictEqual(getGitBranch(), 'cursor/test-branch');
  const info = getRuntimeInfo();
  assert.strictEqual(info.commit, 'abc123def456');
  assert.strictEqual(info.branch, 'cursor/test-branch');
  assert.strictEqual(info.version, '0.2.0');
});

test('runtime info falls back safely when git metadata is unavailable', () => {
  delete process.env.GIT_COMMIT;
  delete process.env.GIT_BRANCH;
  const info = getRuntimeInfo();
  assert.strictEqual(typeof info.commit, 'string');
  assert.strictEqual(typeof info.branch, 'string');
  assert.ok(info.commit.length > 0);
  assert.ok(info.branch.length > 0);
});
