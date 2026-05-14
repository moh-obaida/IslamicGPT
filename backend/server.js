const http = require('http');
const crypto = require('crypto');
const { callOllama } = require('./src/ollamaClient');
const { resolveModelMode, modelTimeoutMs } = require('./src/modelRouter');
const { searchIslamicKnowledgeBase } = require('./src/retrieval');
const { formatSourceCards } = require('./src/sourceCards');
const { validateIslamicCitations } = require('./src/citationValidation');
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
]);

const isCasualChat = (q = '') => /^(hello|hi|hey|salam|assalamu alaikum|thanks|thank you|good morning|good evening|test|how are you\??)$/i.test(q.trim().toLowerCase());
const isAppHelp = (q = '') => /^(who are you\??|what can you do\??|how does this app work\??|how do i add sources\??|what modes do you have\??|why is the ai offline\??|what is source-first\??|how do i use settings\??|how do i search sources\??)$/i.test(q.trim().toLowerCase());
const classifyIslamicQuestion = (q = '') => /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|prayer|dua|aqidah|zakat|salah|ramadan|umrah|hajj|bukhari|muslim|تفسير|حديث|القران|القرآن|فقه|فتوى|صلاة|دعاء)/i.test(q);
const detectLanguage = (m = '') => /[\u0600-\u06FF]/.test(m) ? 'arabic' : /[a-zA-Z]/.test(m) ? 'english' : 'auto';
const fatwaRisk = (q = '') => /(divorce|marriage dispute|inheritance|contract|medical|oath|takfir|apostasy|legal|custody)/i.test(q);
const wantsExplanation = (q = '') => /(explain|why|how|detail|detailed|compare|analyze|meaning|lesson|benefit|شرح|لماذا|كيف|تفصيل|قارن|معنى)/i.test(q);
const isSupportedMode = (mode) => SUPPORTED_MODES.has(mode);
const normalizeMode = (mode) => isSupportedMode(mode) ? mode : DEFAULT_MODE;
const ADMIN_TOKEN_TTL_SECONDS = Number(process.env.ADMIN_TOKEN_TTL_SECONDS || 60 * 60 * 12);

function buildPrompt({ question, mode, language, sources }) {
  const context = sources.map((s) => `SOURCE ID: ${s.id}\nTYPE:${s.source_type}\nSURAH:${s.surah_name_en || ''}\nSURAH NUMBER:${s.surah_number || ''}\nAYAH:${s.ayah_number || s.ayah_range || ''}\nCOLLECTION:${s.collection_name || ''}\nHADITH NUMBER:${s.hadith_number || (s.hadith_number_unavailable ? 'Hadith number not available in this source.' : '')}\nSCHOLAR:${s.scholar_name || ''}\nREFERENCE:${s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.local_reference || s.url || ''}\nARABIC:${s.arabic_text || ''}\nTRANSLATION:${s.translation_text || ''}`).join('\n\n');
  return `SYSTEM:\nYou are IslamicGPT, a reliable Islamic knowledge assistant. Use only approved source context. If insufficient, return exactly: ${REFUSAL_MESSAGE}\n\nUSER QUESTION:\n${question}\nMODE:${mode}\nLANGUAGE:${language}\n\nAPPROVED SOURCE CONTEXT:\n${context}\n\nREQUIRED ANSWER FORMAT: Answer / Evidence from Quran / Evidence from Hadith / Scholarly Explanation / Explanation / Confidence`;
}

function noSourceResponse(mode, modelMode) {
  return {
    answer: REFUSAL_MESSAGE,
    mode,
    modelMode,
    resolvedModelMode: null,
    modelUsed: null,
    modelSelectionReason: 'No approved sources found.',
    isIslamicQuestion: true,
    confidence: 'not_enough_evidence',
    sources: [],
    sourceCards: [],
    warnings: [],
    errorState: 'no_sources_found',
    llmCalled: false,
    validation: { passed: false, attempts: 0, issues: ['no_sources_found'] },
    loadingStagesCompleted: ['classified_question', 'searched_approved_sources'],
  };
}

function directSourceResponse({ source, mode, modelMode, sourceCards, loading }) {
  let answer = '';

  if (source.source_type === 'hadith') {
    const ref = `${source.collection_name || 'Hadith source'}${source.hadith_number ? `, Hadith ${source.hadith_number}` : ''}`;
    answer = [
      'Answer:',
      source.translation_text || source.arabic_text || 'The approved source text is available in the source card.',
      '',
      'Evidence from Hadith:',
      `${ref}.`,
      source.arabic_text ? `Arabic: ${source.arabic_text}` : '',
      source.grade ? `Grade: ${source.grade}.` : '',
      '',
      'Explanation:',
      'This is a direct source-based answer from the approved Islamic source database.',
      '',
      'Confidence: High',
    ].filter(Boolean).join('\n');
  } else if (source.source_type === 'quran') {
    const ayah = source.ayah_number || source.ayah_range || '';
    const ref = `${source.surah_name_en || 'Quran'}${source.surah_number ? ` ${source.surah_number}` : ''}${ayah ? `:${ayah}` : ''}`;
    answer = [
      'Answer:',
      source.translation_text || source.arabic_text || 'The approved Quran text is available in the source card.',
      '',
      'Evidence from Quran:',
      `${ref}.`,
      source.arabic_text ? `Arabic: ${source.arabic_text}` : '',
      '',
      'Explanation:',
      'This is a direct source-based answer from the approved Quran source database.',
      '',
      'Confidence: High',
    ].filter(Boolean).join('\n');
  } else {
    return null;
  }

  return {
    answer,
    mode,
    modelMode,
    resolvedModelMode: 'direct_source',
    modelUsed: null,
    modelSelectionReason: 'Direct Quran/Hadith match answered without local model for speed.',
    isIslamicQuestion: true,
    confidence: 'high',
    sources: [source],
    sourceCards,
    warnings: [],
    errorState: null,
    llmCalled: false,
    validation: { passed: true, attempts: 0, issues: [] },
    loadingStagesCompleted: [...loading, 'built_source_context', 'validated_citations', 'prepared_answer'],
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400',
  });
  res.end(JSON.stringify(data));
}

function publicSourcesResponse(url) {
  const q = url.searchParams.get('q') || '';
  const type = url.searchParams.get('type') || 'all';
  const result = searchCompiledSources({ q, type, limit: 200 });
  return {
    generated_at: result.generated_at,
    total: result.records.length,
    sources: result.records.map(publicSourceCard),
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

function allAdminSourceRecords() {
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
  };
}

function sendSourceMutationResult(res, result, successStatus = 200) {
  if (!result.ok) {
    return send(res, result.status || 400, { errors: result.errors, errorState: 'source_validation_failed' });
  }
  return send(res, successStatus, { source: result.source });
}

async function handleAdminSources(req, res, url) {
  if (!requireAdmin(req, res)) return;

  const pathname = url.pathname;
  const sourceIdMatch = /^\/api\/admin\/sources\/([^/]+)$/.exec(pathname);

  try {
    if (pathname === '/api/admin/sources' && req.method === 'GET') {
      return send(res, 200, allAdminSourceRecords());
    }

    if (pathname === '/api/admin/sources' && req.method === 'POST') {
      const payload = await readJsonBody(req, res);
      if (!payload) return;
      return sendSourceMutationResult(res, addAdminSource(payload), 201);
    }

    if (sourceIdMatch && req.method === 'PUT') {
      const payload = await readJsonBody(req, res);
      if (!payload) return;
      return sendSourceMutationResult(res, updateAdminSource(decodeURIComponent(sourceIdMatch[1]), payload));
    }

    if (sourceIdMatch && req.method === 'DELETE') {
      const result = deleteAdminSource(decodeURIComponent(sourceIdMatch[1]));
      if (!result.ok) return send(res, result.status || 400, { errors: result.errors, errorState: 'source_delete_failed' });
      return send(res, 200, { ok: true });
    }

    if (pathname === '/api/admin/sources/reindex' && req.method === 'POST') {
      const result = buildIslamicSourceIndex({ write: true });
      return send(res, 200, {
        total_indexed: result.total_indexed,
        warnings: result.warnings,
        rejected_count: result.rejected_count,
      });
    }

    if (pathname === '/api/admin/sources/search-test' && req.method === 'POST') {
      const payload = await readJsonBody(req, res);
      if (!payload) return;
      const { matches, debug } = searchIslamicKnowledgeBase(String(payload.q || payload.query || ''), normalizeMode(payload.mode || DEFAULT_MODE));
      return send(res, 200, {
        matches,
        debug,
        llmCalled: false,
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

    if (isCasualChat(question)) {
      loading.push('prepared_answer');
      return send(res, 200, {
        answer: "Wa Alaikum Assalam! How can I help you today with Islamic research or app usage?",
        mode,
        modelMode,
        resolvedModelMode: 'casual_chat',
        isIslamicQuestion: false,
        confidence: 'high',
        sources: [],
        sourceCards: [],
        loadingStagesCompleted: loading,
      });
    }

    if (isAppHelp(question)) {
      loading.push('prepared_answer');
      return send(res, 200, {
        answer: "I am IslamicGPT, a source-first Islamic AI assistant. I only provide religious answers if I can find evidence in my approved database of Quran, Hadith, and scholarly works. You can search sources directly in the Sources tab or ask me questions here.",
        mode,
        modelMode,
        resolvedModelMode: 'app_help',
        isIslamicQuestion: false,
        confidence: 'high',
        sources: [],
        sourceCards: [],
        loadingStagesCompleted: loading,
      });
    }

    const isIslamicQuestion = classifyIslamicQuestion(question) || isSupportedMode(requestedMode);
    if (!isIslamicQuestion) {
      return send(res, 200, {
        answer: 'IslamicGPT is focused on Islamic knowledge from approved sources. For non-religious questions, I may not be the best assistant.',
        mode,
        modelMode,
        resolvedModelMode: null,
        modelUsed: null,
        modelSelectionReason: 'Non-Islamic request.',
        isIslamicQuestion: false,
        confidence: 'not_enough_evidence',
        sources: [],
        sourceCards: [],
        warnings: [],
        errorState: null,
        llmCalled: false,
        validation: { passed: true, attempts: 0, issues: [] },
        loadingStagesCompleted: loading,
      });
    }

    const { matches, debug } = searchIslamicKnowledgeBase(question, mode);
    loading.push('searched_approved_sources');
    if (!matches.length) {
      const out = noSourceResponse(mode, modelMode);
      if (DEBUG_SOURCES || payload.debug) out.debug = debug;
      return send(res, 200, out);
    }

    const sourceCards = formatSourceCards(matches);
    const directMatch = matches.find((m) => ['hadith', 'quran'].includes(m.source_type));
    if (directMatch && !wantsExplanation(question) && String(modelMode).toLowerCase() === 'fast') {
      const direct = directSourceResponse({ source: directMatch, mode, modelMode, sourceCards, loading });
      if (direct) {
        if (DEBUG_SOURCES || payload.debug) direct.debug = { ...debug, llmCalled: false, directSourceAnswer: true, openWebDisabled: true };
        return send(res, 200, direct);
      }
    }

    const selection = resolveModelMode({
      requestedModelMode: modelMode,
      islamicMode: mode,
      message: question,
      sourceCount: matches.length,
      fatwaRisk: fatwaRisk(question),
    });

    loading.push('built_source_context');
    const prompt = buildPrompt({ question, mode, language, sources: matches });

    const first = await callOllama({ model: selection.model, prompt, timeout: modelTimeoutMs(selection.resolvedModelMode) });
    loading.push('called_local_model');
    if (!first.ok) {
      return send(res, 503, {
        answer: 'IslamicGPT could not reach the local AI model. Please check that Ollama is running.',
        mode,
        modelMode,
        resolvedModelMode: selection.resolvedModelMode,
        modelUsed: selection.model,
        modelSelectionReason: selection.reason,
        isIslamicQuestion: true,
        confidence: 'not_enough_evidence',
        sources: [],
        sourceCards: [],
        warnings: [],
        errorState: first.error,
        llmCalled: true,
        validation: { passed: false, attempts: 1, issues: [first.error] },
        loadingStagesCompleted: loading,
      });
    }

    let answer = first.text;
    let attempts = 1;
    let validation = validateIslamicCitations(answer, matches);

    if (!validation.passed && selection.resolvedModelMode !== 'fast') {
      const repairPrompt = `${prompt}\n\nYour previous answer included unsupported or invalid citations. Rewrite the answer using only the provided source IDs. If you cannot, return exactly: ${REFUSAL_MESSAGE}`;
      const second = await callOllama({ model: selection.model, prompt: repairPrompt, timeout: modelTimeoutMs(selection.resolvedModelMode) });
      attempts = 2;
      if (second.ok) {
        answer = second.text;
        validation = validateIslamicCitations(answer, matches);
      }
    }

    loading.push('validated_citations');
    if (!validation.passed) {
      return send(res, 200, {
        answer: REFUSAL_MESSAGE,
        mode,
        modelMode,
        resolvedModelMode: selection.resolvedModelMode,
        modelUsed: selection.model,
        modelSelectionReason: selection.reason,
        isIslamicQuestion: true,
        confidence: 'not_enough_evidence',
        sources: [],
        sourceCards: [],
        warnings: [],
        errorState: 'citation_validation_failed',
        llmCalled: true,
        validation: { passed: false, attempts, issues: validation.issues },
        loadingStagesCompleted: [...loading, 'prepared_answer'],
      });
    }

    const warnings = matches
      .filter((m) => m.source_type === 'hadith' && String(m.grade || '').toLowerCase().includes('weak'))
      .map(() => 'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.');

    const out = {
      answer,
      mode,
      modelMode,
      resolvedModelMode: selection.resolvedModelMode,
      modelUsed: selection.model,
      modelSelectionReason: selection.reason,
      isIslamicQuestion: true,
      confidence: matches.length > 2 ? 'high' : 'medium',
      sources: matches,
      sourceCards,
      warnings,
      errorState: null,
      llmCalled: true,
      validation: { passed: true, attempts, issues: [] },
      loadingStagesCompleted: [...loading, 'prepared_answer'],
    };

    if (DEBUG_SOURCES || payload.debug) {
      out.debug = {
        ...debug,
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

  if (url.pathname === '/health' && req.method === 'GET') {
    return send(res, 200, { ok: true, timestamp: Date.now() });
  }

  if (url.pathname === '/api/sources' && req.method === 'GET') {
    return send(res, 200, publicSourcesResponse(url));
  }

  if (url.pathname === '/api/sources/search' && req.method === 'GET') {
    return send(res, 200, publicSourcesResponse(url));
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
}).listen(Number(process.env.PORT || 3001), () => {
  console.log(`IslamicGPT backend listening on http://localhost:${Number(process.env.PORT || 3001)}`);
});
