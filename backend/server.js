const http = require('http');
const { callOllama } = require('./src/ollamaClient');
const { resolveModelMode, modelTimeoutMs } = require('./src/modelRouter');
const { searchIslamicKnowledgeBase } = require('./src/retrieval');
const { formatSourceCards } = require('./src/sourceCards');
const { validateIslamicCitations } = require('./src/citationValidation');

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

const classifyIslamicQuestion = (q = '') => /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|prayer|dua|aqidah|zakat|salah|ramadan|umrah|hajj|bukhari|muslim|تفسير|حديث|القران|القرآن|فقه|فتوى|صلاة|دعاء)/i.test(q);
const detectLanguage = (m = '') => /[\u0600-\u06FF]/.test(m) ? 'arabic' : /[a-zA-Z]/.test(m) ? 'english' : 'auto';
const fatwaRisk = (q = '') => /(divorce|marriage dispute|inheritance|contract|medical|oath|takfir|apostasy|legal|custody)/i.test(q);
const wantsExplanation = (q = '') => /(explain|why|how|detail|detailed|compare|analyze|meaning|lesson|benefit|شرح|لماذا|كيف|تفصيل|قارن|معنى)/i.test(q);
const isSupportedMode = (mode) => SUPPORTED_MODES.has(mode);
const normalizeMode = (mode) => isSupportedMode(mode) ? mode : DEFAULT_MODE;

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

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.url !== '/api/chat' || req.method !== 'POST') return send(res, 404, { error: 'Not found' });

  const declaredLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    req.resume();
    return send(res, 413, {
      answer: 'Request is too large. Please shorten the message and try again.',
      errorState: 'request_too_large',
    });
  }

  let body = '';
  let receivedBytes = 0;
  let requestTooLarge = false;
  req.on('data', (c) => {
    if (requestTooLarge) return;
    receivedBytes += c.length;
    if (receivedBytes > MAX_REQUEST_BYTES) {
      requestTooLarge = true;
      body = '';
      send(res, 413, {
        answer: 'Request is too large. Please shorten the message and try again.',
        errorState: 'request_too_large',
      });
      return;
    }
    body += c;
  });
  req.on('end', async () => {
    if (requestTooLarge) return;

    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      return send(res, 400, {
        answer: 'Request body must be valid JSON.',
        errorState: 'invalid_json',
      });
    }

    try {
      const question = String(payload.message || '').trim();
      const requestedMode = payload.mode || DEFAULT_MODE;
      const mode = normalizeMode(requestedMode);
      const modelMode = payload.modelMode || process.env.DEFAULT_MODEL_MODE || 'auto';
      const language = payload.language && payload.language !== 'auto' ? payload.language : detectLanguage(question);
      const loading = ['classified_question'];

      const isIslamicQuestion = classifyIslamicQuestion(question) || isSupportedMode(requestedMode);
      if (!isIslamicQuestion) {
        return send(res, 200, {
          answer: 'IslamicGPT is focused on Islamic knowledge from approved sources.',
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
  });
  req.on('error', (error) => {
    if (requestTooLarge || res.headersSent) return;
    console.error('Request stream error:', error);
    return send(res, 400, {
      answer: 'Request could not be read. Please try again.',
      errorState: 'request_read_failed',
    });
  });
}).listen(Number(process.env.PORT || 3001), () => {
  console.log(`IslamicGPT backend listening on http://localhost:${Number(process.env.PORT || 3001)}`);
});
