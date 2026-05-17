const http = require('http');
const crypto = require('crypto');
const path = require('path');

if (process.env.NODE_ENV !== 'test' && process.env.ISLAMICGPT_SKIP_DOTENV !== '1') {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(__dirname, '.env') });
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
    dotenv.config();
  } catch (_) {}
}

const { callOllama, checkOllamaHealth } = require('./src/ollamaClient');
const { resolveModelMode, modelTimeoutMs } = require('./src/modelRouter');
const { retrieveApprovedSources, searchIslamicKnowledgeBase } = require('./src/retrieval');
const { formatSourceCards } = require('./src/sourceCards');
const { sanitizeSourcesForResponse } = require('./src/sourceResponseSanitizer');
const { validateIslamicCitations } = require('./src/citationValidation');
const { validateIslamicAnswerAgainstSources } = require('./src/answerValidator');
const { classifyQuestion } = require('./src/questionClassifier');
const {
  deleteSource,
  getHealthSummary,
  isSupabaseConfigured,
  listSources,
  searchSources,
  upsertSource,
} = require('./src/supabaseSourceDb');
const {
  addAdminSource,
  buildIslamicSourceIndex,
  deleteAdminSource,
  listAllSourceRecords,
  loadIngestWarnings,
  publicSourceCard,
  searchCompiledSources,
  updateAdminSource,
} = require('./src/sourceStore');

const REFUSAL_MESSAGE = 'I could not find enough reliable evidence in the approved sources.';
const TAFSIR_PREVIEW_MAX_CHARS = 1500;
const DEBUG_SOURCES = String(process.env.ISLAMICGPT_DEBUG_SOURCES || process.env.DEBUG_SOURCES || process.env.VITE_DEBUG_SOURCES || 'false').toLowerCase() === 'true';
const MAX_REQUEST_BYTES = Number(process.env.MAX_CHAT_REQUEST_BYTES || 64 * 1024);
const DEFAULT_MODE = 'islamic_search_mode';
const SUPPORTED_MODES = new Set([
  DEFAULT_MODE,
  'quran_mode',
  'hadith_mode',
  'tafsir_mode',
  'fiqh_mode',
  'aqidah_mode',
  'arabic_mode',
  'student_explanation_mode',
  'compare_opinions_mode',
  'explain_simply_mode',
]);

const isCasualChat = (q = '') => /^(hello|hi|hey|salam|assalamu alaikum|thanks|thank you|good morning|good evening|test|how are you\??)$/i.test(q.trim().toLowerCase());
const isAppHelp = (q = '') => /^(who are you\??|what can you do\??|how does this app work\??|how do i add sources\??|what modes do you have\??|why is the ai offline\??|what is source-first\??|how do i use settings\??|how do i search sources\??)$/i.test(q.trim().toLowerCase());
const classifyIslamicQuestion = (q = '') => /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|prayer|dua|aqidah|zakat|salah|ramadan|umrah|hajj|bukhari|muslim|تفسير|حديث|القران|القرآن|فقه|فتوى|صلاة|دعاء)/i.test(q);
const detectLanguage = (m = '') => /[\u0600-\u06FF]/.test(m) ? 'arabic' : /[a-zA-Z]/.test(m) ? 'english' : 'auto';
const fatwaRisk = (q = '') => /(divorce|marriage dispute|inheritance|contract|medical|oath|takfir|apostasy|legal|custody)/i.test(q);
const wantsExplanation = (q = '') => /(explain|why|how|detail|detailed|compare|analyze|meaning|lesson|benefit|شرح|لماذا|كيف|تفصيل|قارن|معنى)/i.test(q);
const wantsDirectEvidence = (q = '', mode = DEFAULT_MODE) => (
  /(give|show|share|find|quote).*(hadith|quran|ayah|verse)/i.test(q)
  || /^(hadith|quran|ayah|verse)\b/i.test(q.trim())
  || (['hadith_mode', 'quran_mode'].includes(mode) && q.trim().split(/\s+/).length <= 8 && !wantsExplanation(q))
);
const isSupportedMode = (mode) => SUPPORTED_MODES.has(mode);
const normalizeMode = (mode) => isSupportedMode(mode) ? mode : DEFAULT_MODE;
const ADMIN_TOKEN_TTL_SECONDS = Number(process.env.ADMIN_TOKEN_TTL_SECONDS || 60 * 60 * 12);

function buildSourceContext(sources) {
  return sources.map((source, index) => [
    `APPROVED SOURCE ${index + 1}`,
    `ID: ${source.id || ''}`,
    `TYPE: ${source.source_type || ''}`,
    `TITLE: ${source.title || source.source_title || ''}`,
    `COLLECTION: ${source.collection_name || ''}`,
    `BOOK: ${source.book_name || ''}`,
    `CHAPTER: ${source.chapter_name || ''}`,
    `HADITH NUMBER: ${source.hadith_number || ''}`,
    `QURAN REF: ${(source.surah_number || source.surah) && (source.ayah_number || source.ayah) ? `${source.surah_number || source.surah}:${source.ayah_number || source.ayah}` : ''}`,
    `TAFSIR EDITION: ${source.tafsir_edition_slug || ''}`,
    `TAFSIR BOOK: ${source.tafsir_book_name || ''}`,
    `TAFSIR AUTHOR: ${source.tafsir_author || ''}`,
    `SCHOLAR: ${source.scholar_name_en || source.scholar_name_ar || source.scholar_name || ''}`,
    `SCHOLAR SLUG: ${source.scholar_slug || ''}`,
    `WORK: ${source.work_title || source.work_title_en || source.work_title_ar || ''}`,
    `SOURCE KIND: ${source.source_kind || ''}`,
    `WORK TYPE: ${source.work_type || ''}`,
    `CHAPTER: ${source.chapter_title || source.chapter_name || ''}`,
    `SECTION: ${source.section_title || ''}`,
    `FATWA NUMBER: ${source.fatwa_number || source.fatwa_reference || ''}`,
    `QUESTION:\n${source.question_text || ''}`,
    `ANSWER:\n${source.answer_text || ''}`,
    `ARABIC TEXT:\n${source.arabic_text || ''}`,
    `TRANSLATION:\n${source.translation_text || ''}`,
    `EXPLANATION:\n${source.explanation_text || ''}`,
    `SUMMARY:\n${source.summary_text || source.summary || ''}`,
    `QUOTE:\n${source.quote_text || ''}`,
    `TAGS: ${Array.isArray(source.topic_tags) ? source.topic_tags.join(', ') : ''}`,
  ].join('\n')).join('\n\n');
}

function buildPrompt({ question, classification, sources }) {
  const sourceContext = buildSourceContext(sources);
  const personalRulingRule = classification.requiresScholarWarning
    ? 'If the question asks for a personal religious ruling, give only general information and advise consulting a qualified scholar.'
    : 'Keep the answer clear, cautious, and source-grounded.';

  return `You are IslamicGPT.\n\nYou may answer ONLY using the approved sources provided below.\n\nRules:\n1. Do not use memory for Islamic facts.\n2. Do not add any Quran verse, hadith, scholar name, book name, ruling, or reference unless it appears in the approved sources.\n3. Do not complete missing hadith text from memory.\n4. Do not invent hadith numbers.\n5. Do not invent Quran references.\n6. Do not invent scholarly opinions.\n7. If the approved sources are insufficient, say exactly:\n"${REFUSAL_MESSAGE}"\n8. ${personalRulingRule}\n9. Mention source names only if they appear in the approved source list.\n10. Do not include unsupported citations.\n11. Do not claim certainty beyond the provided sources.\n12. Keep the answer concise and source-grounded.\n\nApproved sources:\n${sourceContext}\n\nUser question:\n${question}\n\nAnswer:`;
}

function cleanAnswerText(value) {
  let next = value;
  if (next && typeof next === 'object') next = next.answer || next.message || next.response || JSON.stringify(next);
  if (typeof next !== 'string') return String(next || '').trim();

  let text = next.trim();
  if (text.startsWith('```')) text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();

  if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
    try {
      const parsed = JSON.parse(text);
      return cleanAnswerText(parsed);
    } catch (_) {}
  }

  return text;
}

function scholarConsultationNote() {
  return 'Note: This is general information from approved sources, not a personal fatwa. Please consult a qualified scholar for your specific situation.';
}

function appendScholarNote(answer, classification) {
  const safeAnswer = cleanAnswerText(answer) || REFUSAL_MESSAGE;
  if (!classification.requiresScholarWarning) return safeAnswer;
  if (safeAnswer.includes(scholarConsultationNote())) return safeAnswer;
  return `${safeAnswer}\n\n${scholarConsultationNote()}`;
}

function scholarReference(source) {
  return [
    source.work_title || source.work_title_en || source.work_title_ar,
    source.fatwa_number || source.fatwa_reference ? `Fatwa ${source.fatwa_number || source.fatwa_reference}` : '',
    source.page_number ? `p. ${source.page_number}` : '',
    source.page_range ? `pp. ${source.page_range}` : '',
    source.source_url || '',
  ].filter(Boolean).join(' / ');
}

function sourceWarnings(sources, classification, extraWarnings = []) {
  const warnings = [
    ...extraWarnings,
    ...sources
      .filter((source) => source.source_type === 'hadith' && String(source.grade || '').toLowerCase().includes('weak'))
      .map(() => 'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.'),
  ];

  if (classification.requiresScholarWarning) warnings.push(scholarConsultationNote());
  return [...new Set(warnings)];
}

function resolveIslamicConfidence({ sources, classification, validationFailed = false }) {
  if (validationFailed) return 'validation_failed';
  if (classification.isSensitive) return 'needs_scholar_review';
  if (sources.some((source) => source.verified_by_admin !== true)) return 'limited_source';
  return 'source_backed';
}

function noSourceResponse({ mode, modelMode, classification, sourceBackend = 'none', warnings = [] }) {
  const friendlyRefusal = [
    'I could not find enough approved source evidence to answer this safely.',
    '',
    'Try asking with a specific reference, such as:',
    '- Quran 2:255',
    '- Sahih al-Bukhari Hadith 1',
    '- Tafsir of Surah Al-Fatihah 1:1',
  ].join('\n');
  return {
    answer: appendScholarNote(friendlyRefusal, classification),
    mode,
    modelMode,
    resolvedModelMode: null,
    modelUsed: null,
    modelSelectionReason: 'No approved sources found.',
    isIslamicQuestion: true,
    confidence: 'no_approved_source_found',
    sources: [],
    sourceCards: [],
    warnings: sourceWarnings([], classification, warnings),
    errorState: 'no_sources_found',
    llmCalled: false,
    sourceBackend,
    hallucinationGuard: {
      status: 'blocked',
      method: 'no_source_gate',
      reason: 'no_approved_sources_found',
      unsupportedClaims: [],
    },
    validation: { passed: false, attempts: 0, issues: ['no_sources_found'] },
    loadingStagesCompleted: ['classified_question', 'searched_approved_sources'],
  };
}

function buildTemplateAnswer(source) {
  if (['hadith', 'hadith_explanation'].includes(source.source_type)) {
    const ref = `${source.collection_name || 'Hadith source'}${source.hadith_number ? `, Hadith ${source.hadith_number}` : ''}`;
    const heading = source.title ? `### ${source.title}` : '### Hadith';
    const quoteText = source.translation_text || source.meaning_text || source.explanation_text || 'Translation text is not available in the approved source record.';
    const meaningCandidate = source.explanation_text || source.meaning_text || '';
    const shouldShowMeaning = Boolean(
      meaningCandidate
      && meaningCandidate.trim()
      && meaningCandidate.trim() !== String(source.translation_text || '').trim()
    );
    return [
      heading,
      '',
      'The Prophet ﷺ said:',
      '',
      `> ${quoteText}`,
      '',
      source.arabic_text ? '**Arabic:**' : null,
      source.arabic_text || null,
      '',
      shouldShowMeaning ? '**Meaning:**' : null,
      shouldShowMeaning ? meaningCandidate : null,
      shouldShowMeaning ? '' : null,
      source.grade ? `**Grade:** ${source.grade}` : null,
      source.grade ? '' : null,
      '**Source:**',
      ref,
    ].filter(Boolean).join('\n');
  }

  if (source.source_type === 'tafsir') {
    const ref = `${source.surah_number || source.surah || '?'}:${source.ayah_range || source.ayah_number || source.ayah || '?'}`;
    const tafsirBookName = source.tafsir_book_name || source.tafsir_book_name_en || source.tafsir_book_name_ar || source.title || 'Tafsir source';
    const previewSource = source.explanation_text || source.translation_text || 'Explanation text is not available in the approved source record.';
    const preview = String(previewSource).slice(0, TAFSIR_PREVIEW_MAX_CHARS).trim();
    const previewSuffix = String(previewSource).length > preview.length ? '…' : '';
    return [
      `A relevant Tafsir source is ${tafsirBookName}, Tafsir of ${ref}.`,
      '',
      'Explanation:',
      `${preview}${previewSuffix}`,
      '',
      'Source:',
      `${tafsirBookName}, Tafsir of ${ref}`,
      '',
      'Reference:',
      `Quran ${ref}`,
      '',
      'Edition:',
      source.tafsir_edition_slug || 'Unknown edition',
      '',
      'Note:',
      'This is a source-backed Tafsir excerpt. Review the source card for full text and attribution.',
    ].filter(Boolean).join('\n');
  }

  if (['quran', 'quran_translation'].includes(source.source_type)) {
    const ref = `${source.surah_number || source.surah || '?'}:${source.ayah_number || source.ayah || source.ayah_range || '?'}`;
    const verseLabel = source.surah_name_en ? `${source.surah_name_en} ${ref}` : ref;
    const translationCredit = source.translation_name || source.translator || '';
    return [
      '### Quran verse',
      '',
      `**Surah:** ${verseLabel}`,
      '',
      source.translation_text ? `> ${source.translation_text}` : null,
      source.translation_text ? '' : null,
      source.arabic_text ? '**Arabic:**' : null,
      source.arabic_text || null,
      '',
      '**Source:**',
      `Quran ${ref}`,
      translationCredit ? '' : null,
      translationCredit ? `Translation: ${translationCredit}` : null,
    ].filter(Boolean).join('\n');
  }

  if (['fatwa', 'scholar_statement', 'book', 'lecture', 'educational_explanation'].includes(source.source_type)) {
    const scholarName = source.scholar_name_en || source.scholar_name_ar || source.scholar_name || '';
    return [
      'I found an approved scholar/fatwa source.',
      '',
      'Title:',
      source.title || source.source_title || 'Scholar source',
      '',
      scholarName ? 'Scholar:' : null,
      scholarName || null,
      '',
      source.question_text ? 'Question:' : null,
      source.question_text || null,
      '',
      'Answer:',
      source.answer_text || source.translation_text || source.arabic_text || source.summary_text || source.explanation_text || source.quote_text || 'Text is not available in the approved source record.',
      '',
      'Reference:',
      scholarReference(source) || source.source_title || source.title || source.id || 'Approved source',
      '',
      'Note:',
      'If this is a personal religious ruling, consult a qualified scholar for your specific situation.',
    ].filter(Boolean).join('\n');
  }

  const sourceTitle = source.source_title || source.title || source.collection_name || source.scholar_name || source.id || 'Approved source';
  return [
    'I found an approved source related to this topic.',
    '',
    sourceTitle,
    '',
    source.translation_text || source.arabic_text || source.summary || 'Text is not available in the approved source record.',
    '',
    'Source:',
    sourceTitle,
  ].filter(Boolean).join('\n');
}

function isDirectTafsirLookup(question = '') {
  const text = String(question || '').trim().toLowerCase();
  return [
    /\btafsir\s+of\s+(?:quran\s*)?\d{1,3}\s*[:/-]\s*\d{1,3}\b/i,
    /\btafsir\s+\d{1,3}\s*[:/-]\s*\d{1,3}\b/i,
    /\bexplain\s+tafsir\s+of\s+\d{1,3}\s*[:/-]\s*\d{1,3}\b/i,
    /\bibn\s+kathir\s+tafsir\s+of\s+\d{1,3}\s*[:/-]\s*\d{1,3}\b/i,
    /\btafsir\s+of\s+al[-\s]?fatihah\b/i,
  ].some((pattern) => pattern.test(text));
}

function templateSourceResponse({ sources, mode, modelMode, classification, sourceBackend, loading, warnings = [] }) {
  const sanitizedSources = sanitizeSourcesForResponse(sources);
  const answer = appendScholarNote(buildTemplateAnswer(sources[0]), classification);
  return {
    answer,
    mode,
    modelMode,
    resolvedModelMode: 'template_answer',
    modelUsed: null,
    modelSelectionReason: 'Direct source lookup answered from approved source fields without model generation.',
    isIslamicQuestion: true,
    confidence: ['quran', 'quran_translation'].includes(sources[0]?.source_type)
      ? 'source_backed'
      : resolveIslamicConfidence({ sources, classification }),
    sources: sanitizedSources,
    sourceCards: formatSourceCards(sanitizedSources),
    warnings: sourceWarnings(sources, classification, warnings),
    errorState: null,
    llmCalled: false,
    sourceBackend,
    hallucinationGuard: {
      status: 'passed',
      method: 'template_answer',
    },
    validation: { passed: true, attempts: 0, issues: [] },
    loadingStagesCompleted: [...loading, 'built_source_context', 'validated_citations', 'prepared_answer'],
  };
}

function modelBlockedResponse({ mode, modelMode, classification, sourceBackend, loading, sources, warnings = [], reason, unsupportedClaims = [] }) {
  const sanitizedSources = sanitizeSourcesForResponse(sources);
  return {
    answer: appendScholarNote('I found approved sources, but I could not safely generate an answer without risking unsupported claims.', classification),
    mode,
    modelMode,
    resolvedModelMode: 'blocked_after_validation',
    modelUsed: null,
    modelSelectionReason: 'Model answer was blocked by hallucination guardrails.',
    isIslamicQuestion: true,
    confidence: 'validation_failed',
    sources: sanitizedSources,
    sourceCards: formatSourceCards(sanitizedSources),
    warnings: sourceWarnings(sources, classification, warnings),
    errorState: 'answer_validation_failed',
    llmCalled: true,
    sourceBackend,
    hallucinationGuard: {
      status: 'blocked',
      method: 'model_with_validation',
      reason,
      unsupportedClaims,
    },
    validation: { passed: false, attempts: 1, issues: unsupportedClaims },
    loadingStagesCompleted: [...loading, 'prepared_answer'],
  };
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signAdminToken(email) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({ sub: email, admin: true, iat: now, exp: now + ADMIN_TOKEN_TTL_SECONDS }));
  const body = `${header}.${payload}`;
  const signature = crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyAdminToken(token) {
  if (!process.env.JWT_SECRET || !token) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;

  const body = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET).update(body).digest('base64url');
  const actual = parts[2];
  if (expected.length !== actual.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.admin === true && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function requestAuthToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1] : '';
}

function requireAdmin(req, res) {
  if (verifyAdminToken(requestAuthToken(req))) return true;
  send(res, 401, { error: 'Unauthorized', errorState: 'admin_auth_required' });
  return false;
}

function readJsonBody(req, res) {
  return new Promise((resolve) => {
    const declaredLength = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
      req.resume();
      send(res, 413, {
        answer: 'Request is too large. Please shorten the message and try again.',
        errorState: 'request_too_large',
      });
      resolve(null);
      return;
    }

    let body = '';
    let receivedBytes = 0;
    let requestTooLarge = false;
    req.on('data', (chunk) => {
      if (requestTooLarge) return;
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_REQUEST_BYTES) {
        requestTooLarge = true;
        body = '';
        send(res, 413, {
          answer: 'Request is too large. Please shorten the message and try again.',
          errorState: 'request_too_large',
        });
        resolve(null);
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (requestTooLarge) return;
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        send(res, 400, {
          answer: 'Request body must be valid JSON.',
          errorState: 'invalid_json',
        });
        resolve(null);
      }
    });
    req.on('error', (error) => {
      if (requestTooLarge || res.headersSent) return;
      console.error('Request stream error:', error);
      send(res, 400, {
        answer: 'Request could not be read. Please try again.',
        errorState: 'request_read_failed',
      });
      resolve(null);
    });
  });
}

function send(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  });
  res.end(JSON.stringify(data));
}

function localSourcesResponse(url) {
  const q = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || 'all';
  const limit = Number(url.searchParams.get('limit') || 200);
  const result = searchCompiledSources({ q, type, limit });
  return {
    generated_at: result.generated_at || new Date().toISOString(),
    total: result.records.length,
    sources: sanitizeSourcesForResponse(result.records.map(publicSourceCard)),
    warnings: loadIngestWarnings(),
    sourceBackend: 'local',
  };
}

async function publicSourcesResponse(url) {
  const q = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || 'all';
  const limit = Number(url.searchParams.get('limit') || 200);

  if (!isSupabaseConfigured()) return localSourcesResponse(url);

  try {
    const supabaseResult = q
      ? await searchSources({ q, type, limit, approvedOnly: true })
      : await listSources({ type, limit, offset: 0, approvedOnly: true });

    if (supabaseResult.ok && supabaseResult.records.length) {
      return {
        generated_at: new Date().toISOString(),
        total: supabaseResult.records.length,
        sources: sanitizeSourcesForResponse(supabaseResult.records.map(publicSourceCard)),
        warnings: [],
        sourceBackend: 'supabase',
      };
    }
  } catch (error) {
    console.error('Supabase public source lookup failed:', error.message);
  }

  return localSourcesResponse(url);
}

async function buildHealthPayload() {
  const [ollama, supabase, sources] = await Promise.all([
    checkOllamaHealth(),
    getHealthSummary(),
    Promise.resolve(listAllSourceRecords({ includeSourceMeta: false })),
  ]);

  return {
    ok: true,
    timestamp: Date.now(),
    version: '0.2.0',
    services: {
      backend: { status: 'online' },
      local_ai: { status: ollama.ok ? 'online' : 'offline', details: ollama.error || null },
      rag: { status: sources.records.length > 0 ? 'ready' : 'empty', count: sources.records.length },
      supabase: {
        status: supabase.status,
        configured: supabase.configured,
        count: supabase.count,
        approved: supabase.approved,
        verified: supabase.verified,
        byType: supabase.byType,
        error: supabase.error,
      },
      source_mode: supabase.configured && supabase.status === 'ready' ? 'supabase' : 'local_fallback',
    },
  };
}

function handleAdminLogin(payload, res) {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD || !process.env.JWT_SECRET) {
    return send(res, 503, { error: 'Admin login is not configured.', errorState: 'admin_not_configured' });
  }

  const email = String(payload.email || '');
  const password = String(payload.password || '');
  if (email !== process.env.ADMIN_EMAIL || password !== process.env.ADMIN_PASSWORD) {
    return send(res, 401, { error: 'Invalid admin credentials.', errorState: 'invalid_admin_credentials' });
  }

  return send(res, 200, { token: signAdminToken(email), admin: true });
}

async function allAdminSourceRecords() {
  if (isSupabaseConfigured()) {
    const supabase = await listSources({ limit: 500, offset: 0, approvedOnly: false });
    if (supabase.ok) {
      return {
        sources: supabase.records,
        warnings: loadIngestWarnings(),
        sourceBackend: 'supabase',
      };
    }
  }

  const { records, warnings } = listAllSourceRecords({ includeSourceMeta: true });
  return {
    sources: records.map((record) => {
      const { _source_file, ...source } = record;
      return {
        ...source,
        admin_managed: source._source_folder === 'admin',
      };
    }),
    warnings,
    sourceBackend: 'local',
  };
}

function sendSourceMutationResult(res, result, successStatus = 200) {
  if (!result.ok) {
    return send(res, result.status || 400, {
      errors: result.errors || (result.error ? [result.error] : ['Source mutation failed.']),
      errorState: 'source_validation_failed',
    });
  }
  return send(res, successStatus, {
    source: result.source || result.record,
    sourceBackend: result.configured ? 'supabase' : 'local',
  });
}

function normalizeSupabaseAdminPayload(payload, id) {
  return {
    ...(payload || {}),
    id: String(id || payload?.id || `admin-${Date.now()}`).trim(),
    source_type: String(payload?.source_type || payload?.type || '').trim(),
    admin_managed: payload?.admin_managed !== false,
    approved_for_answers: payload?.approved_for_answers === true,
    verified_by_admin: payload?.verified_by_admin === true,
  };
}

async function handleAdminSources(req, res, url) {
  if (!requireAdmin(req, res)) return;

  const pathname = url.pathname;
  const sourceIdMatch = /^\/api\/admin\/sources\/([^/]+)$/.exec(pathname);

  try {
    if (pathname === '/api/admin/sources' && req.method === 'GET') {
      return send(res, 200, await allAdminSourceRecords());
    }

    if (pathname === '/api/admin/sources' && req.method === 'POST') {
      const payload = await readJsonBody(req, res);
      if (!payload) return;
      if (isSupabaseConfigured()) {
        return sendSourceMutationResult(res, await upsertSource(normalizeSupabaseAdminPayload(payload)), 201);
      }
      return sendSourceMutationResult(res, addAdminSource(payload), 201);
    }

    if (sourceIdMatch && req.method === 'PUT') {
      const payload = await readJsonBody(req, res);
      if (!payload) return;
      if (isSupabaseConfigured()) {
        return sendSourceMutationResult(res, await upsertSource(normalizeSupabaseAdminPayload(payload, decodeURIComponent(sourceIdMatch[1]))));
      }
      return sendSourceMutationResult(res, updateAdminSource(decodeURIComponent(sourceIdMatch[1]), payload));
    }

    if (sourceIdMatch && req.method === 'DELETE') {
      const result = isSupabaseConfigured()
        ? await deleteSource(decodeURIComponent(sourceIdMatch[1]))
        : deleteAdminSource(decodeURIComponent(sourceIdMatch[1]));
      if (!result.ok) return send(res, result.status || 400, { errors: result.errors || (result.error ? [result.error] : []), errorState: 'source_delete_failed' });
      return send(res, 200, { ok: true, sourceBackend: isSupabaseConfigured() ? 'supabase' : 'local' });
    }

    if (pathname === '/api/admin/sources/reindex' && req.method === 'POST') {
      const result = buildIslamicSourceIndex({ write: true });
      const supabase = await getHealthSummary();
      return send(res, 200, {
        total_indexed: result.total_indexed,
        warnings: result.warnings,
        rejected_count: result.rejected_count,
        supabase,
      });
    }

    if (pathname === '/api/admin/sources/search-test' && req.method === 'POST') {
      const payload = await readJsonBody(req, res);
      if (!payload) return;
      const { matches, debug, sourceBackend } = await searchIslamicKnowledgeBase(String(payload.q || payload.query || ''), normalizeMode(payload.mode || DEFAULT_MODE));
      return send(res, 200, {
        matches,
        debug,
        llmCalled: false,
        sourceBackend,
      });
    }

    if (pathname === '/api/admin/sources/warnings' && req.method === 'GET') {
      return send(res, 200, { warnings: loadIngestWarnings() });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Admin source API error:', error);
    return send(res, 500, { error: 'Admin source request failed.', errorState: 'admin_source_error' });
  }
}

async function handleChat(payload, res) {
  try {
    const question = String(payload.message || '').trim();
    const requestedMode = payload.mode || DEFAULT_MODE;
    const mode = normalizeMode(requestedMode);
    const modelMode = payload.modelMode || process.env.DEFAULT_MODEL_MODE || 'auto';
    const language = payload.language && payload.language !== 'auto' ? payload.language : detectLanguage(question);
    const loading = ['classified_question'];
    const classification = classifyQuestion(question, mode);

    if (isCasualChat(question)) {
      loading.push('prepared_answer');
      return send(res, 200, {
        answer: 'Wa Alaikum Assalam! How can I help you today with Islamic research or app usage?',
        mode,
        modelMode,
        resolvedModelMode: 'casual_chat',
        modelUsed: null,
        modelSelectionReason: 'Handled as casual chat.',
        isIslamicQuestion: false,
        confidence: 'normal_chat',
        sources: [],
        sourceCards: [],
        warnings: [],
        llmCalled: false,
        hallucinationGuard: {
          status: 'not_required',
          method: 'normal_chat',
        },
        loadingStagesCompleted: loading,
      });
    }

    if (isAppHelp(question)) {
      loading.push('prepared_answer');
      return send(res, 200, {
        answer: 'I am IslamicGPT, a source-first Islamic AI assistant. I only provide religious answers if I can find evidence in my approved database of Quran, Hadith, and scholarly works. You can search sources directly in the Sources tab or ask me questions here.',
        mode,
        modelMode,
        resolvedModelMode: 'app_help',
        modelUsed: null,
        modelSelectionReason: 'Handled as app help.',
        isIslamicQuestion: false,
        confidence: 'normal_chat',
        sources: [],
        sourceCards: [],
        warnings: [],
        llmCalled: false,
        hallucinationGuard: {
          status: 'not_required',
          method: 'normal_chat',
        },
        loadingStagesCompleted: loading,
      });
    }

    if (!classification.isIslamic) {
      loading.push('prepared_answer');
      return send(res, 200, {
        answer: 'I can help with general conversation, but I am optimized for Islamic research and source-backed Islamic answers.',
        mode,
        modelMode,
        resolvedModelMode: 'normal_chat',
        modelUsed: null,
        modelSelectionReason: 'Non-Islamic request did not require approved sources.',
        isIslamicQuestion: false,
        confidence: 'normal_chat',
        sources: [],
        sourceCards: [],
        warnings: [],
        llmCalled: false,
        hallucinationGuard: {
          status: 'not_required',
          method: 'normal_chat',
        },
        loadingStagesCompleted: loading,
      });
    }

    const retrieval = await retrieveApprovedSources({
      message: question,
      sourceType: classification.sourceType,
      limit: 8,
    });
    const sources = retrieval.sources || [];
    const sanitizedSources = sanitizeSourcesForResponse(sources);
    loading.push('searched_approved_sources');

    if (!sources.length) {
      const out = noSourceResponse({
        mode,
        modelMode,
        classification,
        sourceBackend: retrieval.sourceBackend,
        warnings: retrieval.warnings,
      });
      if (DEBUG_SOURCES || payload.debug) out.debug = { ...retrieval.debug, classification, retrievalErrors: retrieval.errors };
      return send(res, 200, out);
    }

    const tafsirSources = sources.filter((source) => source.source_type === 'tafsir');
    const directTafsirLookup = isDirectTafsirLookup(question) && tafsirSources.length > 0;
    if (classification.intent === 'direct_source_lookup' || directTafsirLookup) {
      const out = templateSourceResponse({
        sources: directTafsirLookup ? tafsirSources : sources,
        mode,
        modelMode,
        classification,
        sourceBackend: retrieval.sourceBackend,
        loading,
        warnings: retrieval.warnings,
      });
      if (DEBUG_SOURCES || payload.debug) out.debug = { ...retrieval.debug, classification, llmCalled: false, directSourceAnswer: true, openWebDisabled: true };
      return send(res, 200, out);
    }

    const selection = resolveModelMode({
      requestedModelMode: modelMode,
      islamicMode: mode,
      message: question,
      sourceCount: sources.length,
      fatwaRisk: classification.isSensitive,
    });

    loading.push('built_source_context');
    const prompt = buildPrompt({ question, classification, sources });
    const first = await callOllama({ model: selection.model, prompt, timeout: modelTimeoutMs(selection.resolvedModelMode) });
    loading.push('called_local_model');

    if (!first.ok) {
      const warnings = sourceWarnings(sources, classification, retrieval.warnings);
      return send(res, 200, {
        answer: appendScholarNote('I found approved sources, but I could not reach the local AI model to safely explain them. Please review the source cards directly.', classification),
        mode,
        modelMode,
        resolvedModelMode: selection.resolvedModelMode,
        modelUsed: selection.model,
        modelSelectionReason: selection.reason,
        isIslamicQuestion: true,
        confidence: resolveIslamicConfidence({ sources, classification }),
        sources: sanitizedSources,
        sourceCards: formatSourceCards(sanitizedSources),
        warnings,
        errorState: first.error,
        llmCalled: true,
        sourceBackend: retrieval.sourceBackend,
        hallucinationGuard: {
          status: 'blocked',
          method: 'model_with_validation',
          reason: first.error,
          unsupportedClaims: [],
        },
        validation: { passed: false, attempts: 1, issues: [first.error] },
        loadingStagesCompleted: [...loading, 'prepared_answer'],
      });
    }

    let answer = cleanAnswerText(first.text);
    let attempts = 1;
    let citationValidation = validateIslamicCitations(answer, sources);
    let answerValidation = validateIslamicAnswerAgainstSources(answer, sources);

    if ((!citationValidation.passed || !answerValidation.ok) && selection.resolvedModelMode !== 'fast') {
      const repairPrompt = `${prompt}

Your previous answer risked unsupported claims. Rewrite the answer using only the approved source details above. If you cannot do that safely, return exactly: "${REFUSAL_MESSAGE}"`;
      const second = await callOllama({ model: selection.model, prompt: repairPrompt, timeout: modelTimeoutMs(selection.resolvedModelMode) });
      attempts = 2;
      if (second.ok) {
        answer = cleanAnswerText(second.text);
        citationValidation = validateIslamicCitations(answer, sources);
        answerValidation = validateIslamicAnswerAgainstSources(answer, sources);
      }
    }

    if (classification.isSensitive && /(your|my).{0,24}(prayer|fast|divorce|marriage|business).{0,24}(is valid|is invalid|is halal|is haram|definitely|certainly)/i.test(answer)) {
      answerValidation = {
        ok: false,
        reason: 'personalized_ruling_detected',
        unsupportedClaims: [...(answerValidation.unsupportedClaims || []), 'The answer attempted to issue a personalized ruling with unjustified certainty.'],
      };
    }

    loading.push('validated_citations');
    if (!citationValidation.passed || !answerValidation.ok) {
      const blocked = modelBlockedResponse({
        mode,
        modelMode,
        classification,
        sourceBackend: retrieval.sourceBackend,
        loading,
        sources,
        warnings: retrieval.warnings,
        reason: answerValidation.reason || 'citation_validation_failed',
        unsupportedClaims: [...citationValidation.issues, ...(answerValidation.unsupportedClaims || [])],
      });
      blocked.validation = {
        passed: false,
        attempts,
        issues: [...citationValidation.issues, ...(answerValidation.unsupportedClaims || [])],
      };
      if (DEBUG_SOURCES || payload.debug) blocked.debug = { ...retrieval.debug, classification, validation: blocked.validation, llmCalled: true };
      return send(res, 200, blocked);
    }

    const out = {
      answer: appendScholarNote(answer || REFUSAL_MESSAGE, classification),
      mode,
      modelMode,
      resolvedModelMode: selection.resolvedModelMode,
      modelUsed: selection.model,
      modelSelectionReason: selection.reason,
      isIslamicQuestion: true,
      confidence: resolveIslamicConfidence({ sources, classification }),
      sources: sanitizedSources,
      sourceCards: formatSourceCards(sanitizedSources),
      warnings: sourceWarnings(sources, classification, retrieval.warnings),
      errorState: null,
      llmCalled: true,
      sourceBackend: retrieval.sourceBackend,
      hallucinationGuard: {
        status: 'passed',
        method: 'model_with_validation',
      },
      validation: { passed: true, attempts, issues: [] },
      loadingStagesCompleted: [...loading, 'prepared_answer'],
    };

    if (DEBUG_SOURCES || payload.debug) {
      out.debug = {
        ...retrieval.debug,
        classification,
        requestedModelMode: modelMode,
        resolvedModelMode: selection.resolvedModelMode,
        modelUsed: selection.model,
        modelSelectionReason: selection.reason,
        llmCalled: true,
        validation: out.validation,
        openWebDisabled: true,
      };
    }

    return send(res, 200, out);
  } catch (error) {
    console.error('Unhandled /api/chat error:', error);
    return send(res, 500, {
      answer: 'IslamicGPT could not complete the answer because the source check failed. Please try again or check the source database.',
      errorState: 'backend_unavailable',
    });
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'OPTIONS') return send(res, 204, {});

  if ((url.pathname === '/health' || url.pathname === '/api/health') && req.method === 'GET') {
    return send(res, 200, await buildHealthPayload());
  }

  if (url.pathname === '/api/local-ai/health' && req.method === 'GET') {
    const ollama = await checkOllamaHealth();
    return send(res, 200, ollama);
  }

  if (url.pathname === '/api/rag/status' && req.method === 'GET') {
    const sources = listAllSourceRecords({ includeSourceMeta: false });
    return send(res, 200, {
      status: sources.records.length > 0 ? 'ready' : 'empty',
      count: sources.records.length,
      warnings: sources.warnings
    });
  }

  if (url.pathname === '/api/sources' && req.method === 'GET') {
    return send(res, 200, await publicSourcesResponse(url));
  }

  if (url.pathname === '/api/sources/search' && req.method === 'GET') {
    return send(res, 200, await publicSourcesResponse(url));
  }

  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    const payload = await readJsonBody(req, res);
    if (!payload) return;
    return handleAdminLogin(payload, res);
  }

  if (url.pathname.startsWith('/api/admin/sources')) {
    return handleAdminSources(req, res, url);
  }

  if (url.pathname !== '/api/chat' || req.method !== 'POST') return send(res, 404, { error: 'Not found' });

  const payload = await readJsonBody(req, res);
  if (!payload) return;
  return handleChat(payload, res);
}).listen(Number(process.env.PORT || 3001), '0.0.0.0', () => {
  console.log(`IslamicGPT backend listening on http://localhost:${Number(process.env.PORT || 3001)}`);
});
