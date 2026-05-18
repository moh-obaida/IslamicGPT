const { execSync } = require('child_process');

const SERVER_STARTED_AT = new Date();

const RUNTIME_FEATURES = {
  directQuranTemplate: true,
  directTafsirTemplate: true,
  tafsirPayloadSanitizer: true,
  noSourceGate: true,
  adminSourceManager: true,
  supabaseRetrieval: true,
};

function safeExec(command) {
  try {
    return execSync(command, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return null;
  }
}

function getGitCommit() {
  const envCommit = String(process.env.GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || '').trim();
  if (envCommit) return envCommit.length > 12 ? envCommit.slice(0, 12) : envCommit;
  return safeExec('git rev-parse --short HEAD') || 'unknown';
}

function getGitBranch() {
  const envBranch = String(process.env.GIT_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || '').trim();
  if (envBranch) return envBranch;
  return safeExec('git rev-parse --abbrev-ref HEAD') || 'unknown';
}

function getRuntimeInfo(extra = {}) {
  return {
    app: 'IslamicGPT',
    version: process.env.APP_VERSION || '0.2.0',
    env: process.env.NODE_ENV || 'development',
    commit: getGitCommit(),
    branch: getGitBranch(),
    started_at: SERVER_STARTED_AT.toISOString(),
    uptime_seconds: Math.floor((Date.now() - SERVER_STARTED_AT.getTime()) / 1000),
    node_version: process.version,
    ...extra,
    features: {
      ...RUNTIME_FEATURES,
      ...(extra.features || {}),
    },
  };
}

module.exports = {
  getGitCommit,
  getGitBranch,
  getRuntimeInfo,
};
