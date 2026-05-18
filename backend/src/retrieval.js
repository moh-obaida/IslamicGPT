const { loadIndexSources, normalizeText } = require('./sourceStore');
const { searchSources, quranReferenceFromQuery } = require('./supabaseSourceDb');

const SEARCH_FILLER_WORDS = new Set([
  'a', 'about', 'an', 'explain', 'explanation', 'give', 'hadith', 'i', 'if',
  'is', 'me', 'my', 'of', 'please', 'show', 'source', 'tafsir', 'the', 'what',
  'fatwa', 'scholar', 'scholars', 'ruling', 'rulings', 'book', 'books',
  'تفسير', 'اشرح', 'شرح', 'فتوى', 'فتاوى', 'قول', 'كتاب', 'كتب',
]);
const SOURCE_TYPE_MAP = {
  all: null,
  hadith: ['hadith', 'hadith_explanation'],
  quran: ['quran', 'quran_translation'],
  tafsir: ['tafsir'],
  fiqh: ['quran', 'hadith', 'hadith_explanation', 'scholar_statement', 'fatwa', 'book'],
  aqidah: ['quran', 'hadith', 'hadith_explanation', 'scholar_statement', 'book', 'educational_explanation'],
  fatwa: ['fatwa'],
  scholar: ['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript', 'educational_explanation'],
};

function allowedTypesForSourceType(sourceType) {
  const normalized = String(sourceType || 'all').toLowerCase();
  return SOURCE_TYPE_MAP[normalized] || null;
}

function sanitizeSearchQuery(message) {
  const cleaned = String(message || '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => !/[A-Za-z]/.test(token) || (token.length > 2 && !SEARCH_FILLER_WORDS.has(token.toLowerCase())))
    .join(' ')
    .trim();
  return cleaned || String(message || '').trim();
}

function localSearchText(source) {
  return normalizeText([
    source.id,
    source.source_type,
    source.source_kind,
    source.work_type,
    source.title,
    source.source_title,
    source.tafsir_edition_slug,
    source.tafsir_book_name,
    source.tafsir_book_name_ar,
    source.tafsir_book_name_en,
    source.tafsir_author,
    source.tafsir_author_ar,
    source.tafsir_author_en,
    source.tafsir_language,
    source.collection_name,
    source.book_name,
    source.chapter_name,
    source.surah_name_en,
    source.surah_name_ar,
    source.surah_number || source.surah,
    source.ayah_number || source.ayah,
    source.ayah_start,
    source.ayah_end,
    source.ayah_range,
    (source.surah_number || source.surah) && (source.ayah_number || source.ayah)
      ? `${source.surah_number || source.surah}:${source.ayah_number || source.ayah}`
      : '',
    source.translator,
    source.translation_name,
    source.translation_text,
    source.explanation_text,
    source.arabic_text,
    source.summary,
    source.scholar_name,
    source.scholar_slug,
    source.scholar_name_ar,
    source.scholar_name_en,
    source.scholar_full_name,
    source.madhhab,
    source.creed_school,
    source.work_slug,
    source.work_title,
    source.work_title_ar,
    source.work_title_en,
    source.work_author,
    source.work_language,
    source.collection_title,
    source.website_name,
    source.chapter_title,
    source.section_title,
    source.question_text,
    source.answer_text,
    source.summary_text,
    source.quote_text,
    source.reference_number,
    source.fatwa_number,
    source.question_number,
    source.source_url,
    source.local_reference,
    ...(Array.isArray(source.topic_tags) ? source.topic_tags : []),
  ].filter(Boolean).join(' '));
}

function tokenVariants(token) {
  const variants = new Set([token]);
  if (/^[a-z]+$/i.test(token) && token.endsWith('s') && token.length > 4) variants.add(token.slice(0, -1));
  return [...variants];
}

function localSourceScore(source, message) {
  const quranRef = quranReferenceFromQuery(message);
  if (quranRef && ['quran', 'quran_translation', 'tafsir'].includes(source.source_type)) {
    const [surahNumber, ayahNumber] = quranRef.split(':').map((part) => Number.parseInt(part, 10));
    const recordSurah = Number.parseInt(source.surah_number || source.surah, 10);
    const recordAyah = Number.parseInt(source.ayah_number || source.ayah, 10);
    const ayahStart = Number.parseInt(source.ayah_start || recordAyah, 10);
    const ayahEnd = Number.parseInt(source.ayah_end || ayahStart, 10);
    const exactMatch = recordSurah === surahNumber && recordAyah === ayahNumber;
    const rangeMatch = source.source_type === 'tafsir'
      && recordSurah === surahNumber
      && ayahStart
      && ayahEnd
      && ayahNumber >= ayahStart
      && ayahNumber <= ayahEnd;
    return exactMatch || rangeMatch ? 120 : 0;
  }

  const query = normalizeText(sanitizeSearchQuery(message));
  const queryTokens = query.split(' ').filter(Boolean);
  if (!queryTokens.length) return 0;
  const meaningfulTokens = queryTokens.filter((token) => !SEARCH_FILLER_WORDS.has(token.toLowerCase()));
  if (!meaningfulTokens.length) return 0;

  const text = localSearchText(source);
  const sourceTokens = new Set(text.split(' ').filter(Boolean));
  let score = text.includes(query) ? 12 : 0;
  let matchedTokens = 0;

  meaningfulTokens.forEach((token) => {
    const variants = tokenVariants(token);
    if (variants.some((variant) => sourceTokens.has(variant))) {
      score += 4;
      matchedTokens += 1;
    } else if (variants.some((variant) => text.includes(` ${variant} `) || text.startsWith(`${variant} `) || text.endsWith(` ${variant}`))) {
      score += 2;
      matchedTokens += 1;
    }
  });

  if (['fatwa', 'scholar', 'scholar_statement', 'book', 'lecture', 'educational_explanation', 'video_transcript'].includes(source.source_type)) {
    const coverage = matchedTokens / meaningfulTokens.length;
    if (coverage < 0.6) return 0;
  }

  return score;
}

function searchLocalApprovedSources(message, sourceType = 'all', limit = 8) {
  const allowTestSources = String(process.env.ALLOW_TEST_SOURCES || 'false').toLowerCase() === 'true';
  const debug = {
    query: message,
    normalizedQuery: normalizeText(sanitizeSearchQuery(message)),
    totalSearched: 0,
    matchedApproved: 0,
    rejected: [],
    sourceType,
    openWebDisabled: true,
  };
  const all = loadIndexSources();
  debug.totalSearched = all.length;

  const allowed = allowedTypesForSourceType(sourceType);
  const approved = all.filter((source) => {
    if (source.is_test_record && !allowTestSources) {
      debug.rejected.push(`${source.id}: test record blocked`);
      return false;
    }
    if (!source.verified_by_admin || !source.approved_for_answers) {
      debug.rejected.push(`${source.id}: not approved`);
      return false;
    }
    if ((source.source_type === 'uploaded_document' || source.source_type === 'approved_pdf') && source.upload_status !== 'approved') {
      debug.rejected.push(`${source.id}: upload not approved`);
      return false;
    }
    if (allowed && !allowed.includes(source.source_type)) {
      debug.rejected.push(`${source.id}: source type excluded`);
      return false;
    }
    return true;
  });

  const matches = approved
    .map((source) => ({ source, score: localSourceScore(source, message) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.source);

  debug.matchedApproved = matches.length;
  debug.matchedSourceIds = matches.map((match) => match.id);
  return { matches, debug };
}

async function retrieveApprovedSources({ message, sourceType = 'all', limit = 8 } = {}) {
  const local = searchLocalApprovedSources(message, sourceType, limit);
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
  const warnings = [];
  const errors = [];

  try {
    const supabase = await searchSources({
      q: message,
      type: sourceType,
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
      const verifiedFirst = supabase.records.filter((record) => record.verified_by_admin === true);
      const sources = (verifiedFirst.length ? verifiedFirst : supabase.records).slice(0, limit);
      debug.matchedApproved = sources.length;
      debug.matchedSourceIds = sources.map((record) => record.id);
      debug.sourceBackend = 'supabase';
      return {
        sources,
        sourceBackend: 'supabase',
        errors,
        warnings,
        debug,
      };
    }

    if (supabase.ok && !supabase.records.length) warnings.push('Supabase returned no approved matches, using local fallback.');
    if (!supabase.ok && supabase.error) {
      errors.push(supabase.error);
      warnings.push('Supabase lookup failed, using local fallback.');
    }
  } catch (error) {
    errors.push(error.message);
    warnings.push('Supabase lookup failed, using local fallback.');
    debug.supabase = {
      configured: true,
      ok: false,
      matchedSourceIds: [],
      error: error.message,
    };
  }

  return {
    sources: local.matches,
    sourceBackend: local.matches.length ? 'local' : 'none',
    errors,
    warnings,
    debug,
  };
}

async function searchIslamicKnowledgeBase(question, mode, options = {}) {
  const limit = Number(options.limit) || 8;
  const modeToSourceType = {
    quran_mode: 'quran',
    hadith_mode: 'hadith',
    tafsir_mode: 'tafsir',
    scholar_mode: 'scholar',
    fiqh_mode: 'fiqh',
    aqidah_mode: 'aqidah',
    compare_opinions_mode: 'all',
    student_explanation_mode: 'all',
    explain_simply_mode: 'all',
    islamic_search_mode: 'all',
    arabic_mode: 'all',
  };
  const result = await retrieveApprovedSources({
    message: question,
    sourceType: modeToSourceType[mode] || 'all',
    limit,
  });
  return {
    matches: result.sources,
    debug: result.debug,
    sourceBackend: result.sourceBackend,
    warnings: result.warnings,
    errors: result.errors,
  };
}

module.exports = {
  allowedTypesForSourceType,
  retrieveApprovedSources,
  searchIslamicKnowledgeBase,
  searchLocalApprovedSources,
};
