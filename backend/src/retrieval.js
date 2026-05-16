const { loadIndexSources, normalizeText, sourceScore } = require('./sourceStore');
const { searchSources } = require('./supabaseSourceDb');

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

function searchLocalIslamicKnowledgeBase(question, mode, limit = 8) {
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

  const matches = approved.map((s) => ({ s, sc: sourceScore(s, question) })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc).slice(0, limit).map((x) => x.s);
  debug.matchedApproved = matches.length;
  debug.matchedSourceIds = matches.map((m) => m.id);

  return { matches, debug };
}

async function searchIslamicKnowledgeBase(question, mode, options = {}) {
  const limit = Number(options.limit) || 8;
  const local = searchLocalIslamicKnowledgeBase(question, mode, limit);
  const debug = {
    ...local.debug,
    sourceBackend: local.matches.length ? 'local' : 'none',
    local: {
      matchedSourceIds: local.matches.map((match) => match.id),
      matchedApproved: local.matches.length,
    },
    supabase: {
      configured: false,
      ok: false,
      matchedSourceIds: [],
      error: null,
    },
  };

  try {
    const supabase = await searchSources({
      q: question,
      type: mode,
      limit,
      approvedOnly: true,
    });

    debug.supabase = {
      configured: supabase.configured === true,
      ok: supabase.ok === true,
      matchedSourceIds: (supabase.records || []).map((record) => record.id),
      error: supabase.error || null,
    };

    if (supabase.ok && supabase.records.length) {
      debug.matchedApproved = supabase.records.length;
      debug.matchedSourceIds = supabase.records.map((record) => record.id);
      debug.sourceBackend = 'supabase';
      return {
        matches: supabase.records,
        debug,
        sourceBackend: 'supabase',
      };
    }
  } catch (error) {
    debug.supabase = {
      configured: true,
      ok: false,
      matchedSourceIds: [],
      error: error.message,
    };
  }

  return {
    matches: local.matches,
    debug,
    sourceBackend: local.matches.length ? 'local' : 'none',
  };
}

module.exports = {
  modeAllowedTypes,
  searchIslamicKnowledgeBase,
  searchLocalIslamicKnowledgeBase,
};
