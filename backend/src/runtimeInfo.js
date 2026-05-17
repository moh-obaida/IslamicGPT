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
    return 'unknown';
  }
}

function getGitCommit() {
  return safeExec('git rev-parse --short HEAD');
}

function getGitBranch() {
  return safeExec('git rev-parse --abbrev-ref HEAD');
}

function getRuntimeInfo(extra = {}) {
  return {
    app: 'IslamicGPT',
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
