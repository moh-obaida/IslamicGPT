const http = require('http');
const fs = require('fs');
const path = require('path');

const REFUSAL_MESSAGE = 'I could not find enough reliable evidence in the approved sources.';
const DEBUG_SOURCES = String(process.env.VITE_DEBUG_SOURCES || 'false').toLowerCase() === 'true';

function normalizeArabic(input = '') {
  return input
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEnglish(input = '') {
  return input.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeText(input = '') {
  return `${normalizeArabic(String(input))} ${normalizeEnglish(String(input))}`.trim();
}

function classifyIslamicQuestion(question) {
  return /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|dua|aqidah|zakat|salah|ramadan|umrah|hajj|bukhari|muslim|tirmidhi|abu dawud|nasai|ibn majah|قران|حديث|تفسير|فتوى|عقيدة|فقه)/i.test(question || '');
}

function validateIslamicCitations(answer, sources) {
  const mentionsAllahOrQuran = /allah says|quran|surah|ayah|قال الله|الايه|آية/i.test(answer);
  const mentionsProphetOrHadith = /the prophet ﷺ said|the prophet said|hadith|قال الرسول/i.test(answer);
  const mentionsScholar = /(ibn baz|ibn uthaymeen|al-albani|al-fawzan|mohammad othman al-khamees|scholar|fatwa|ابن باز|ابن عثيمين)/i.test(answer);

  const hasQuranCitation = sources.some((s) => s.source_type === 'quran' && s.surah_number && (s.ayah_number || s.ayah_range));
  const hasHadithCitation = sources.some((s) => s.source_type === 'hadith' && s.collection_name && (s.hadith_number || s.hadith_number_unavailable === true));
  const hasScholarCitation = sources.some((s) => ['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript'].includes(s.source_type) && s.scholar_name && (s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.local_reference || s.url));

  if (mentionsAllahOrQuran && !hasQuranCitation) return false;
  if (mentionsProphetOrHadith && !hasHadithCitation) return false;
  if (mentionsScholar && !hasScholarCitation) return false;
  return true;
}

function loadIndexSources() {
  const compiledPath = path.join(__dirname, '..', 'data', 'islamic-sources', 'indexes', 'compiled-sources.json');
  const seedPath = path.join(__dirname, '..', 'data', 'islamic-sources', 'indexes', 'seed-sources.json');
  if (fs.existsSync(compiledPath)) return JSON.parse(fs.readFileSync(compiledPath, 'utf8')).records || [];
  if (fs.existsSync(seedPath)) return JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  return [];
}

function modeAllowedTypes(mode, question) {
  const qScholar = /(ibn|scholar|fatwa|khamees|baz|uthaymeen|عالم|فتوى)/i.test(question || '');
  const map = {
    quran_mode: ['quran', 'quran_translation', 'tafsir'],
    hadith_mode: ['hadith', 'hadith_explanation'],
    tafsir_mode: ['quran', 'quran_translation', 'tafsir'],
    fiqh_mode: ['quran', 'hadith', 'hadith_explanation', 'scholar_statement', 'fatwa', 'book'],
    aqidah_mode: ['quran', 'hadith', 'hadith_explanation', 'scholar_statement', 'book', 'educational_explanation'],
    arabic_mode: null,
    student_explanation_mode: ['quran', 'hadith', 'tafsir', 'educational_explanation'],
    compare_opinions_mode: ['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript'],
    islamic_search_mode: null,
  };
  if (qScholar && mode !== 'quran_mode' && mode !== 'hadith_mode') return ['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript'];
  return map[mode] || null;
}

function weightedScore(source, normalizedTokens) {
  const fields = {
    strong: [source.title, source.source_name, source.topic, source.scholar_name, source.collection_name, source.book_name],
    medium: [source.translation_text, source.arabic_text, source.summary, source.source_title],
    weak: [JSON.stringify(source)],
  };
  const normalized = {
    strong: normalizeText(fields.strong.filter(Boolean).join(' ')),
    medium: normalizeText(fields.medium.filter(Boolean).join(' ')),
    weak: normalizeText(fields.weak.filter(Boolean).join(' ')),
  };

  let score = 0;
  normalizedTokens.forEach((t) => {
    if (!t) return;
    if (normalized.strong.includes(t)) score += 5;
    if (normalized.medium.includes(t)) score += 3;
    if (normalized.weak.includes(t)) score += 1;
  });
  return score;
}

function searchIslamicKnowledgeBase(question, mode) {
  const debug = { query: question, normalizedQuery: normalizeText(question), totalSearched: 0, matchedApproved: 0, rejected: [], modeFilter: mode, citationValidation: null };
  const all = loadIndexSources();
  debug.totalSearched = all.length;

  const allowed = modeAllowedTypes(mode, question);
  const approved = all.filter((s) => {
    if (!s.verified_by_admin || !s.approved_for_answers) { debug.rejected.push(`${s.id}: not approved/verified`); return false; }
    if ((s.source_type === 'uploaded_document' || s.source_type === 'approved_pdf') && s.upload_status !== 'approved') { debug.rejected.push(`${s.id}: upload not approved`); return false; }
    if (allowed && !allowed.includes(s.source_type)) { debug.rejected.push(`${s.id}: mode filter excluded ${s.source_type}`); return false; }
    return true;
  });

  const tokens = normalizeText(question).split(' ').filter(Boolean);
  const scored = approved.map((s) => ({ source: s, score: weightedScore(s, tokens) })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
  debug.matchedApproved = scored.length;

  return { matches: scored.map((s) => s.source), debug };
}

function formatSourceCards(sources) {
  return sources.map((s) => {
    if (s.source_type === 'quran') {
      return { type: 'quran', badge: 'Quran', surahName: s.surah_name_en || s.surah_name_ar, surahNumber: s.surah_number, ayah: s.ayah_number || s.ayah_range, arabic: s.arabic_text, translation: s.translation_text, usedFor: 'Islamic evidence', copyCitation: `${s.surah_name_en || s.surah_name_ar} (${s.surah_number}:${s.ayah_number || s.ayah_range})` };
    }
    if (s.source_type === 'hadith') {
      const weak = String(s.grade || '').toLowerCase().includes('weak');
      return { type: 'hadith', badge: 'Hadith', collection: s.collection_name, bookChapter: [s.book_name, s.chapter_name].filter(Boolean).join(' / '), hadithNumber: s.hadith_number || 'Hadith number not available in this source.', grade: s.grade, arabic: s.arabic_text, translation: s.translation_text, usedFor: 'Islamic evidence', weakWarning: weak ? 'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.' : null, copyCitation: `${s.collection_name} #${s.hadith_number || 'N/A'}` };
    }
    if (['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript'].includes(s.source_type)) {
      return { type: 'scholar', badge: 'Scholar / Fatwa / Explanation', scholar: s.scholar_name, sourceTitle: s.source_title || s.title, reference: s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.url || s.local_reference, quoteOrSummary: s.original_text || s.summary, usedFor: 'Scholarly explanation', copyCitation: `${s.scholar_name || 'Scholar'} - ${s.source_title || s.title || ''}` };
    }
    return { type: 'document', badge: 'Approved Document', documentTitle: s.document_title || s.title, fileName: s.file_name, pageNumber: s.page_number, section: s.section_title, approvalStatus: s.upload_status || (s.approved_for_answers ? 'approved' : 'not_approved'), usedFor: 'Approved supporting document', copyCitation: `${s.document_title || s.title || 'Document'}${s.page_number ? ` p.${s.page_number}` : ''}` };
  });
}

function buildResponse({ answer, mode, isIslamicQuestion, confidence, sources, sourceCards, warnings, errorState, loadingStagesCompleted, debug }) {
  const payload = { answer, mode, isIslamicQuestion, confidence, sources, sourceCards, warnings, errorState, loadingStagesCompleted };
  if (DEBUG_SOURCES) payload.debug = debug;
  return payload;
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const question = parsed.message || '';
        const mode = parsed.mode || 'islamic_search_mode';
        const isIslamicQuestion = classifyIslamicQuestion(question) || String(mode).endsWith('_mode');

        if (!isIslamicQuestion) {
          return send(res, 200, buildResponse({ answer: `IslamicGPT general response mode: ${question}`, mode, isIslamicQuestion, confidence: 'medium', sources: [], sourceCards: [], warnings: [], errorState: null, loadingStagesCompleted: ['Preparing answer'] }));
        }

        const loading = ['Searching approved Islamic sources', 'Checking Quran and hadith references', 'Validating citations', 'Preparing answer'];
        const { matches, debug } = searchIslamicKnowledgeBase(question, mode);
        if (!matches.length) {
          return send(res, 200, buildResponse({ answer: REFUSAL_MESSAGE, mode, isIslamicQuestion, confidence: 'not_enough_evidence', sources: [], sourceCards: [], warnings: [], errorState: 'no_sources_found', loadingStagesCompleted: loading, debug }));
        }

        const warnings = [];
        matches.forEach((m) => {
          if (m.source_type === 'hadith' && String(m.grade || '').toLowerCase().includes('weak')) warnings.push('This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.');
        });

        const answer = `Based on the retrieved source evidence, here is a response to your question.`;
        const citationValid = validateIslamicCitations(answer, matches);
        debug.citationValidation = citationValid;
        if (!citationValid) {
          return send(res, 200, buildResponse({ answer: REFUSAL_MESSAGE, mode, isIslamicQuestion, confidence: 'not_enough_evidence', sources: [], sourceCards: [], warnings, errorState: 'citation_validation_failed', loadingStagesCompleted: loading, debug }));
        }

        return send(res, 200, buildResponse({ answer, mode, isIslamicQuestion, confidence: matches.length > 2 ? 'high' : 'medium', sources: matches, sourceCards: formatSourceCards(matches), warnings, errorState: null, loadingStagesCompleted: loading, debug }));
      } catch (e) {
        return send(res, 500, buildResponse({ answer: 'IslamicGPT could not complete the answer because the source check failed. Please try again or check the source database.', mode: 'islamic_search_mode', isIslamicQuestion: true, confidence: 'not_enough_evidence', sources: [], sourceCards: [], warnings: [], errorState: 'backend_unavailable', loadingStagesCompleted: [] }));
      }
    });
    return;
  }
  send(res, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => console.log(`IslamicGPT backend listening on http://localhost:${port}`));
