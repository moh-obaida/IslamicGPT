const TAFSIR_RESPONSE_PREVIEW_MAX_CHARS = 1500;

function buildPreview(text, maxChars = TAFSIR_RESPONSE_PREVIEW_MAX_CHARS) {
  const full = String(text || '');
  const preview = full.slice(0, maxChars).trim();
  const truncated = full.length > preview.length;
  return {
    full,
    preview: `${preview}${truncated ? '…' : ''}`,
    truncated,
    fullLength: full.length,
  };
}

function sanitizeTafsirMetadata(metadata = {}, fullTextLength = 0) {
  const originalRecord = metadata && typeof metadata.original_record === 'object'
    ? { ...metadata.original_record }
    : null;

  if (originalRecord && Object.prototype.hasOwnProperty.call(originalRecord, 'text')) {
    delete originalRecord.text;
  }

  return {
    ...metadata,
    ...(originalRecord ? { original_record: originalRecord } : {}),
    original_record_text_length: fullTextLength,
  };
}

function sanitizeSourceForResponse(source = {}) {
  if (source.source_type !== 'tafsir') return source;

  const candidateText = source.explanation_text || source.translation_text || '';
  const preview = buildPreview(candidateText);

  return {
    ...source,
    explanation_text: preview.preview,
    explanation_preview: preview.preview,
    explanation_text_truncated: preview.truncated,
    full_text_length: preview.fullLength,
    has_full_text: preview.fullLength > 0,
    metadata: sanitizeTafsirMetadata(source.metadata || {}, preview.fullLength),
  };
}

function sanitizeSourcesForResponse(sources = []) {
  return Array.isArray(sources) ? sources.map(sanitizeSourceForResponse) : [];
}

module.exports = {
  TAFSIR_RESPONSE_PREVIEW_MAX_CHARS,
  sanitizeSourceForResponse,
  sanitizeSourcesForResponse,
};
