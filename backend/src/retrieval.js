const { loadIndexSources, normalizeText, sourceScore } = require('./sourceStore');

function modeAllowedTypes(mode) {
  return {
    quran_mode: ['quran', 'quran_translation', 'tafsir'],
    hadith_mode: ['hadith', 'hadith_explanation'],
    tafsir_mode: ['quran', 'quran_translation', 'tafsir'],
    fiqh_mode: ['quran', 'hadith', 'hadith_explanation', 'scholar_statement', 'fatwa', 'book'],
    aqidah_mode: ['quran', 'hadith', 'hadith_explanation', 'scholar_statement', 'book', 'educational_explanation'],
    arabic_mode: null,
    student_explanation_mode: ['quran', 'hadith', 'tafsir', 'educational_explanation'],
    compare_opinions_mode: ['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript'],
    islamic_search_mode: null,
  }[mode] || null;
}

function searchIslamicKnowledgeBase(question, mode) {
  const allowTestSources = String(process.env.ALLOW_TEST_SOURCES || 'false').toLowerCase() === 'true';
  const debug = { query: question, normalizedQuery: normalizeText(question), totalSearched: 0, matchedApproved: 0, rejected: [], modeFilter: mode, openWebDisabled: true };
  const all = loadIndexSources();
  debug.totalSearched = all.length;

  const allowed = modeAllowedTypes(mode);
  const approved = all.filter((s) => {
    if (s.is_test_record && !allowTestSources) { debug.rejected.push(`${s.id}: test record blocked`); return false; }
    if (!s.verified_by_admin || !s.approved_for_answers) { debug.rejected.push(`${s.id}: not approved`); return false; }
    if ((s.source_type === 'uploaded_document' || s.source_type === 'approved_pdf') && s.upload_status !== 'approved') { debug.rejected.push(`${s.id}: upload not approved`); return false; }
    if (allowed && !allowed.includes(s.source_type)) { debug.rejected.push(`${s.id}: mode excluded`); return false; }
    return true;
  });

  const matches = approved.map((s) => ({ s, sc: sourceScore(s, question) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, 8).map((x) => x.s);
  debug.matchedApproved = matches.length;
  debug.matchedSourceIds = matches.map((m) => m.id);

  return { matches, debug };
}

module.exports = { searchIslamicKnowledgeBase };
