const http = require('http');
const { callOllama } = require('./src/ollamaClient');
const { resolveModelMode, modelTimeoutMs } = require('./src/modelRouter');
const { searchIslamicKnowledgeBase } = require('./src/retrieval');
const { formatSourceCards } = require('./src/sourceCards');
const { validateIslamicCitations } = require('./src/citationValidation');

const REFUSAL_MESSAGE = 'I could not find enough reliable evidence in the approved sources.';
const DEBUG_SOURCES = String(process.env.VITE_DEBUG_SOURCES || 'false').toLowerCase() === 'true';

const classifyIslamicQuestion = (q = '') => /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|dua|aqidah|zakat|salah|ramadan|umrah|hajj|bukhari|muslim|تفسير|حديث|القران|القرآن|فقه|فتوى)/i.test(q);
const detectLanguage = (m = '') => /[\u0600-\u06FF]/.test(m) ? 'arabic' : /[a-zA-Z]/.test(m) ? 'english' : 'auto';
const fatwaRisk = (q = '') => /(divorce|marriage dispute|inheritance|contract|medical|oath|takfir|apostasy|legal|custody)/i.test(q);

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

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  if (req.url !== '/api/chat' || req.method !== 'POST') return send(res, 404, { error: 'Not found' });

  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', async () => {
    try {
      const payload = JSON.parse(body || '{}');
      const question = payload.message || '';
      const mode = payload.mode || 'islamic_search_mode';
      const modelMode = payload.modelMode || process.env.DEFAULT_MODEL_MODE || 'auto';
      const language = payload.language && payload.language !== 'auto' ? payload.language : detectLanguage(question);
      const loading = ['classified_question'];

      const isIslamicQuestion = classifyIslamicQuestion(question) || String(mode).endsWith('_mode');
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

      const selection = resolveModelMode({
        requestedModelMode: modelMode,
        islamicMode: mode,
        message: question,
        sourceCount: matches.length,
        fatwaRisk: fatwaRisk(question),
      });

      const sourceCards = formatSourceCards(matches);
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

      if (!validation.passed) {
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
    } catch {
      return send(res, 500, {
        answer: 'IslamicGPT could not complete the answer because the source check failed. Please try again or check the source database.',
        errorState: 'backend_unavailable',
      });
    }
  });
}).listen(Number(process.env.PORT || 3001), () => {
  console.log(`IslamicGPT backend listening on http://localhost:${Number(process.env.PORT || 3001)}`);
});
