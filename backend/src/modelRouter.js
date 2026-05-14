function resolveModelMode({ requestedModelMode, islamicMode, message, sourceCount, fatwaRisk }) {
  const requested = requestedModelMode || process.env.DEFAULT_MODEL_MODE || 'auto';
  const normalized = ({ deep: 'strong', balanced: 'auto' }[requested] || requested);
  const fastModel = process.env.OLLAMA_FAST_MODEL || 'llama3.1:8b';
  const strongModel = process.env.OLLAMA_STRONG_MODEL || 'qwen2.5:14b';

  if (normalized === 'fast') {
    return { requestedModelMode: requested, resolvedModelMode: 'fast', model: fastModel, reason: 'User selected fast mode.' };
  }
  if (normalized === 'strong') {
    return { requestedModelMode: requested, resolvedModelMode: 'strong', model: strongModel, reason: 'User selected strong mode.' };
  }

  const needsStrong =
    fatwaRisk ||
    ['fiqh_mode', 'tafsir_mode', 'compare_opinions_mode'].includes(islamicMode) ||
    sourceCount > 2 ||
    /(deep|detailed|compare|analyze|explain fully|worksheet|quiz|تفصيل|مقارنة|تحليل)/i.test(message || '');

  return {
    requestedModelMode: requested,
    resolvedModelMode: needsStrong ? 'strong' : 'fast',
    model: needsStrong ? strongModel : fastModel,
    reason: needsStrong ? 'Auto routing chose strong model for complex/deep request.' : 'Auto routing chose fast model for simple request.',
  };
}

function modelTimeoutMs(resolvedModelMode) {
  return resolvedModelMode === 'strong' ? 90000 : 30000;
}

module.exports = { resolveModelMode, modelTimeoutMs };
