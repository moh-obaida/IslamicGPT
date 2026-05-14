const http = require('http');
const fs = require('fs');
const path = require('path');

const REFUSAL_MESSAGE = 'I could not find enough reliable evidence in the approved sources.';

function classifyIslamicQuestion(question) {
  return /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|dua|aqidah|zakat|salah|ramadan|umrah|hajj|bukhari|muslim|tirmidhi|abu dawud|nasai|ibn majah)/i.test(question || '');
}

function detectPersonalFatwaRisk(question) {
  return /(divorce|marriage dispute|inheritance|contract|medical|oath|takfir|apostasy|legal|custody)/i.test(question || '');
}

function validateIslamicCitations(answer, sources) {
  const mentionsAllahOrQuran = /allah says|quran|surah|ayah/i.test(answer);
  const mentionsProphetOrHadith = /the prophet ﷺ said|the prophet said|hadith/i.test(answer);
  const mentionsScholar = /(ibn baz|ibn uthaymeen|al-albani|al-fawzan|mohammad othman al-khamees|scholar|fatwa)/i.test(answer);

  const hasQuranCitation = sources.some((s) => s.source_type === 'quran' && s.surah_number && (s.ayah_number || s.ayah_range));
  const hasHadithCitation = sources.some((s) => s.source_type === 'hadith' && s.collection_name && (s.hadith_number || s.hadith_number === 'Hadith number not available in this source.'));
  const hasScholarCitation = sources.some((s) => ['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript'].includes(s.source_type) && s.scholar_name && (s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.local_reference || s.url));

  if (mentionsAllahOrQuran && !hasQuranCitation) return false;
  if (mentionsProphetOrHadith && !hasHadithCitation) return false;
  if (mentionsScholar && !hasScholarCitation) return false;
  return true;
}

function loadApprovedSources() {
  const seedPath = path.join(__dirname, '..', 'data', 'islamic-sources', 'indexes', 'seed-sources.json');
  const uploadsPath = path.join(__dirname, '..', 'data', 'islamic-sources', 'uploads', 'pending-review.json');
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  const uploads = JSON.parse(fs.readFileSync(uploadsPath, 'utf8'));
  const approvedUploads = uploads.filter((u) => u.verified_by_admin && u.approved_for_answers && u.upload_status === 'approved');
  return [...seed, ...approvedUploads];
}

function searchIslamicKnowledgeBase(question, mode) {
  const q = (question || '').toLowerCase();
  const pool = loadApprovedSources().filter((s) => s.verified_by_admin && s.approved_for_answers);
  const modeMap = {
    quran_mode: ['quran', 'quran_translation', 'tafsir'],
    hadith_mode: ['hadith', 'hadith_explanation'],
    tafsir_mode: ['quran', 'quran_translation', 'tafsir'],
    fiqh_mode: ['quran', 'hadith', 'fatwa', 'scholar_statement'],
    aqidah_mode: ['quran', 'hadith', 'scholar_statement', 'book'],
    student_explanation_mode: ['quran', 'hadith', 'tafsir', 'educational_explanation'],
    arabic_mode: null,
    compare_opinions_mode: ['fatwa', 'scholar_statement', 'book', 'lecture', 'video_transcript'],
    islamic_search_mode: null,
  };
  const allowed = modeMap[mode] || null;
  return pool.filter((s) => (!allowed || allowed.includes(s.source_type)) && JSON.stringify(s).toLowerCase().includes(q));
}

function formatSources(sources) {
  return sources.sort((a, b) => a.reliability_level - b.reliability_level);
}

function buildIslamicAnswerContext(question, sources) {
  return [
    'You are IslamicGPT.',
    'You may answer ONLY from approved retrieved sources.',
    `User question: ${question}`,
    ...sources.map((s) => JSON.stringify(s)),
  ].join('\n');
}

function refuseUnsupportedAnswer() { return REFUSAL_MESSAGE; }

function generateIslamicAnswer(question, sources) {
  if (!sources.length) return { answer: REFUSAL_MESSAGE, blockedByValidation: false };
  const warning = detectPersonalFatwaRisk(question)
    ? ' This may require a qualified scholar who can review the full details. I can provide general information from approved sources, but I cannot issue a personal fatwa.'
    : '';

  const answer = `Based on the retrieved source,${warning}\n${buildIslamicAnswerContext(question, sources).slice(0, 220)}...`;
  if (!validateIslamicCitations(answer, sources)) return { answer: refuseUnsupportedAnswer(), blockedByValidation: true };
  return { answer, blockedByValidation: false };
}

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const question = parsed.message || '';
        const mode = parsed.mode || 'islamic_search_mode';

        const isIslamicMode = String(mode || '').endsWith('_mode');
        const isIslamicQuestion = classifyIslamicQuestion(question) || isIslamicMode;
        if (!isIslamicQuestion) {
          return send(res, 200, {
            answer: `IslamicGPT general response mode: ${question}`,
            sources: [],
            mode,
            loadingStages: ['Preparing answer'],
          });
        }

        const loadingStages = ['Searching approved Islamic sources', 'Checking Quran and hadith references', 'Validating citations', 'Preparing answer'];
        const retrieved = formatSources(searchIslamicKnowledgeBase(question, mode));
        if (!retrieved.length) {
          return send(res, 200, {
            answer: REFUSAL_MESSAGE,
            sources: [],
            mode,
            loadingStages,
            errorState: 'no_sources_found',
          });
        }

        const generated = generateIslamicAnswer(question, retrieved);
        return send(res, 200, {
          answer: generated.answer,
          sources: retrieved,
          mode,
          loadingStages,
          errorState: generated.blockedByValidation ? 'citation_validation_failed' : null,
        });
      } catch (e) {
        return send(res, 500, {
          answer: 'IslamicGPT could not complete the answer because the source check failed. Please try again or check the source database.',
          errorState: 'backend_unavailable',
          detail: e.message,
        });
      }
    });
    return;
  }

  send(res, 404, { error: 'Not found' });
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => console.log(`IslamicGPT backend listening on http://localhost:${port}`));
