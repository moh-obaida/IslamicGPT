const { createClient } = require('@supabase/supabase-js');

let WebSocketTransport = null;
try {
  WebSocketTransport = require('ws');
} catch (_) {
  WebSocketTransport = null;
}
const { normalizeText } = require('./sourceStore');

const TABLE_NAME = 'islamic_sources';
const MAX_SEARCH_CANDIDATES = 500;
const MODE_TO_TYPE = {
  hadith_mode: 'hadith',
  quran_mode: 'quran',
  tafsir_mode: 'tafsir',
  scholar_mode: 'scholar',
  fiqh_mode: 'fiqh',
  aqidah_mode: 'aqidah',
  islamic_search_mode: 'all',
  student_explanation_mode: 'all',
  explain_simply_mode: 'all',
  compare_opinions_mode: 'all',
  arabic_mode: 'all',
};
const TYPE_ALIASES = {
  all: null,
  general: null,
  hadith: ['hadith', 'hadith_explanation'],
  quran: ['quran', 'quran_translation'],
  tafsir: ['tafsir'],
  fiqh: ['fiqh', 'fatwa', 'scholar_statement', 'book'],
  aqidah: ['aqidah', 'scholar_statement', 'book', 'educational_explanation'],
  scholars: ['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript', 'educational_explanation'],
  scholar: ['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript', 'educational_explanation'],
  fatwa: ['fatwa'],
  documents: ['approved_pdf', 'uploaded_document'],
};
const FILLER_WORDS = new Set([
  'a', 'an', 'about', 'actions', 'explain', 'explanation', 'find', 'for', 'give',
  'hadith', 'i', 'is', 'me', 'of', 'please', 'quote', 'show', 'tafsir', 'tell',
  'the', 'what', 'fatwa', 'scholar', 'ruling', 'book', 'source', 'sources',
  'تفسير', 'اشرح', 'شرح', 'فتوى', 'عالم', 'كتاب',
]);
const TERM_SYNONYMS = {
  intention: ['intention', 'intentions', 'niyyah', 'نية', 'نيات', 'الأعمال بالنيات'],
  intentions: ['intention', 'intentions', 'niyyah', 'نية', 'نيات', 'الأعمال بالنيات'],
  niyyah: ['niyyah', 'intention', 'intentions', 'نية', 'نيات', 'الأعمال بالنيات'],
  sincerity: ['sincerity', 'ikhlas', 'إخلاص'],
  actions: ['action', 'actions', 'deeds', 'الأعمال'],
  action: ['action', 'actions', 'deeds', 'الأعمال'],
  fatiha: ['al-fatihah', 'fatihah', 'الفاتحة'],
  fatihah: ['al-fatihah', 'fatiha', 'الفاتحة'],
  kursi: ['2:255', 'ayat al kursi', 'ayatul kursi', 'آية الكرسي'],
  baz: ['bin baz', 'ibn baz', 'ابن باز', 'بن باز'],
  uthaymeen: ['uthaymin', 'ibn uthaymeen', 'ibn uthaymin', 'ابن عثيمين'],
  uthaymin: ['uthaymeen', 'ibn uthaymeen', 'ibn uthaymin', 'ابن عثيمين'],
  taymiyyah: ['taymiyah', 'ibn taymiyyah', 'ibn taymiyah', 'ابن تيمية'],
  qayyim: ['ibn al qayyim', 'ibn al-qayyim', 'ابن القيم'],
  nawawi: ['al nawawi', 'al-nawawi', 'imam nawawi', 'النووي'],
  hajar: ['ibn hajar', 'ابن حجر'],
  الفاتحة: ['al-fatihah', '1'],
  البقرة: ['al-baqarah', '2'],
  الإخلاص: ['al-ikhlas', '112'],
  الاخلاص: ['al-ikhlas', '112'],
};

let cachedClient = null;

function safeErrorMessage(error) {
  return error && error.message ? error.message : 'Unknown Supabase error';
}

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isSupabaseConfigured() {
  return hasValue(process.env.SUPABASE_URL) && hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseClient() {
  if (!isSupabaseConfigured()) return null;
  if (cachedClient) return cachedClient;
  const clientOptions = {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'x-client-info': 'islamicgpt-backend',
      },
    },
  };

  if (WebSocketTransport) {
    clientOptions.realtime = { transport: WebSocketTransport };
  }

  cachedClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, clientOptions);
  return cachedClient;
}

function toTrimmedString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function toInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return Boolean(value);
}

function normalizeTopicTags(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => toTrimmedString(entry)).filter(Boolean))];
  }
  if (typeof value === 'string') {
    return [...new Set(value.split(/[;,|]/).map((entry) => toTrimmedString(entry)).filter(Boolean))];
  }
  return [];
}

function normalizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeSourceType(type) {
  const raw = String(type || '').trim().toLowerCase();
  const mapped = MODE_TO_TYPE[raw] || raw || 'all';
  return TYPE_ALIASES[mapped] ? mapped : mapped;
}

function sourceTypesForFilter(type) {
  const normalized = normalizeSourceType(type);
  return TYPE_ALIASES[normalized] || (normalized && normalized !== 'all' ? [normalized] : null);
}

function resolveHadithNumber(row) {
  return toTrimmedString(row.hadith_number)
    || toTrimmedString(row.hadith_number_global)
    || toTrimmedString(row.hadith_number_in_book)
    || toTrimmedString(row.hadith_number_in_chapter);
}

function resolveBookName(row) {
  return toTrimmedString(row.book_name)
    || toTrimmedString(row.book_name_en)
    || toTrimmedString(row.book_name_ar);
}

function resolveChapterName(row) {
  return toTrimmedString(row.chapter_name)
    || toTrimmedString(row.chapter_name_en)
    || toTrimmedString(row.chapter_name_ar)
    || toTrimmedString(row.chapter_intro_en)
    || toTrimmedString(row.chapter_intro_ar);
}

function buildDisplayTitle(row) {
  if (!row || typeof row !== 'object') return '';
  if (row.source_type === 'hadith' || row.source_type === 'hadith_explanation') {
    const collection = row.collection_name || row.collection_name_en || row.collection_name_ar || 'Hadith';
    const hadithNumber = resolveHadithNumber(row);
    return hadithNumber ? `${collection}, Hadith ${hadithNumber}` : (row.title || collection);
  }
  if (row.source_type === 'quran' || row.source_type === 'quran_translation') {
    const surah = toInteger(row.surah_number) || toInteger(row.surah);
    const ayah = toInteger(row.ayah_number) || toInteger(row.ayah);
    const surahNameEn = toTrimmedString(row.surah_name_en);
    if (surahNameEn && surah && ayah) return `${surahNameEn} ${surah}:${ayah}`;
    if (surah && ayah) return `Quran ${surah}:${ayah}`;
    return row.title || 'Quran source';
  }
  if (row.source_type === 'tafsir') {
    const surah = toInteger(row.surah_number) || toInteger(row.surah);
    const ayah = toInteger(row.ayah_number) || toInteger(row.ayah);
    const ayahRange = toTrimmedString(row.ayah_range);
    const tafsirBookName = toTrimmedString(row.tafsir_book_name)
      || toTrimmedString(row.tafsir_book_name_en)
      || toTrimmedString(row.tafsir_book_name_ar);
    if (tafsirBookName && surah && ayahRange) return `${tafsirBookName}, Tafsir of ${surah}:${ayahRange}`;
    if (tafsirBookName && surah && ayah) return `${tafsirBookName}, Tafsir of ${surah}:${ayah}`;
    return row.title || 'Tafsir source';
  }
  if (row.source_type === 'fatwa') {
    const scholarName = toTrimmedString(row.scholar_name_en) || toTrimmedString(row.scholar_name_ar) || toTrimmedString(row.scholar_name);
    const fatwaNumber = toTrimmedString(row.fatwa_number) || toTrimmedString(row.fatwa_reference) || toTrimmedString(row.reference_number);
    if (scholarName && fatwaNumber) return `${scholarName}, Fatwa ${fatwaNumber}`;
    if (toTrimmedString(row.title)) return toTrimmedString(row.title);
    return 'Fatwa source';
  }
  if (['scholar_statement', 'book', 'lecture', 'educational_explanation'].includes(row.source_type) || ['classical_book', 'book_excerpt'].includes(row.source_kind)) {
    const workTitle = toTrimmedString(row.work_title) || toTrimmedString(row.work_title_en) || toTrimmedString(row.work_title_ar);
    const pageNumber = toInteger(row.page_number);
    const scholarName = toTrimmedString(row.scholar_name_en) || toTrimmedString(row.scholar_name_ar) || toTrimmedString(row.scholar_name);
    if (workTitle && pageNumber) return `${workTitle}, p. ${pageNumber}`;
    if (workTitle) return workTitle;
    if (scholarName) return `${scholarName} source`;
    return 'Scholar source';
  }
  return row.display_title || row.title || row.collection_name || row.book_name || row.scholar_name || row.id || 'Approved source';
}

function normalizeSourceRecord(row) {
  if (!row || typeof row !== 'object') return null;

  const displayTitle = buildDisplayTitle(row);
  const hadithNumber = resolveHadithNumber(row);
  const title = toTrimmedString(row.title) || displayTitle;
  const sourceUrl = toTrimmedString(row.source_url);
  const fatwaReference = toTrimmedString(row.fatwa_reference) || toTrimmedString(row.fatwa_number) || toTrimmedString(row.reference_number);
  const bookName = resolveBookName(row);
  const chapterName = resolveChapterName(row);

  const surah = toInteger(row.surah_number) || toInteger(row.surah);
  const ayah = toInteger(row.ayah_number) || toInteger(row.ayah);

  return {
    id: toTrimmedString(row.id),
    source_type: toTrimmedString(row.source_type) || 'unknown',
    type: toTrimmedString(row.source_type) || 'unknown',
    title,
    display_title: displayTitle,
    source_title: displayTitle,
    source_kind: toTrimmedString(row.source_kind),
    work_type: toTrimmedString(row.work_type),
    collection_slug: toTrimmedString(row.collection_slug),
    collection_name: toTrimmedString(row.collection_name) || toTrimmedString(row.collection_name_en) || toTrimmedString(row.collection_name_ar),
    collection_name_ar: toTrimmedString(row.collection_name_ar),
    collection_name_en: toTrimmedString(row.collection_name_en),
    collection_author_ar: toTrimmedString(row.collection_author_ar),
    collection_author_en: toTrimmedString(row.collection_author_en),
    book_id: toInteger(row.book_id),
    book_number: toTrimmedString(row.book_number),
    book_name: bookName,
    book_name_ar: toTrimmedString(row.book_name_ar),
    book_name_en: toTrimmedString(row.book_name_en),
    chapter_id: toInteger(row.chapter_id),
    chapter_number: toTrimmedString(row.chapter_number),
    chapter_name: chapterName,
    chapter_name_ar: toTrimmedString(row.chapter_name_ar),
    chapter_name_en: toTrimmedString(row.chapter_name_en),
    chapter_intro_ar: toTrimmedString(row.chapter_intro_ar),
    chapter_intro_en: toTrimmedString(row.chapter_intro_en),
    hadith_number: hadithNumber,
    hadith_number_global: toTrimmedString(row.hadith_number_global) || hadithNumber,
    hadith_number_in_book: toTrimmedString(row.hadith_number_in_book),
    hadith_number_in_chapter: toTrimmedString(row.hadith_number_in_chapter),
    surah,
    ayah,
    surah_number: toInteger(row.surah_number) || surah,
    ayah_number: toInteger(row.ayah_number) || ayah,
    ayah_start: toInteger(row.ayah_start),
    ayah_end: toInteger(row.ayah_end),
    ayah_range: toTrimmedString(row.ayah_range),
    ayah_global_number: toInteger(row.ayah_global_number),
    surah_name_ar: toTrimmedString(row.surah_name_ar),
    surah_name_en: toTrimmedString(row.surah_name_en),
    tafsir_edition_slug: toTrimmedString(row.tafsir_edition_slug),
    tafsir_book_name: toTrimmedString(row.tafsir_book_name),
    tafsir_book_name_ar: toTrimmedString(row.tafsir_book_name_ar),
    tafsir_book_name_en: toTrimmedString(row.tafsir_book_name_en),
    tafsir_author: toTrimmedString(row.tafsir_author),
    tafsir_author_ar: toTrimmedString(row.tafsir_author_ar),
    tafsir_author_en: toTrimmedString(row.tafsir_author_en),
    tafsir_language: toTrimmedString(row.tafsir_language),
    juz: toInteger(row.juz),
    hizb: toTrimmedString(row.hizb),
    page_number: toInteger(row.page_number),
    revelation_place: toTrimmedString(row.revelation_place),
    arabic_text: toTrimmedString(row.arabic_text),
    english_narrator: toTrimmedString(row.english_narrator),
    translation_text: toTrimmedString(row.translation_text),
    explanation_text: toTrimmedString(row.explanation_text),
    scholar_name: toTrimmedString(row.scholar_name),
    scholar_slug: toTrimmedString(row.scholar_slug),
    scholar_name_ar: toTrimmedString(row.scholar_name_ar),
    scholar_name_en: toTrimmedString(row.scholar_name_en),
    scholar_full_name: toTrimmedString(row.scholar_full_name),
    scholar_death_year: toInteger(row.scholar_death_year),
    madhhab: toTrimmedString(row.madhhab),
    creed_school: toTrimmedString(row.creed_school),
    work_slug: toTrimmedString(row.work_slug),
    work_title: toTrimmedString(row.work_title),
    work_title_ar: toTrimmedString(row.work_title_ar),
    work_title_en: toTrimmedString(row.work_title_en),
    work_author: toTrimmedString(row.work_author),
    work_language: toTrimmedString(row.work_language),
    collection_title: toTrimmedString(row.collection_title),
    website_name: toTrimmedString(row.website_name),
    volume: toTrimmedString(row.volume),
    page_range: toTrimmedString(row.page_range),
    chapter_title: toTrimmedString(row.chapter_title),
    section_title: toTrimmedString(row.section_title),
    fatwa_reference: fatwaReference,
    fatwa_number: fatwaReference,
    reference_number: fatwaReference,
    question_number: toTrimmedString(row.question_number),
    lecture_title: toTrimmedString(row.lecture_title),
    lecture_date: toTrimmedString(row.lecture_date),
    timestamp_start: toTrimmedString(row.timestamp_start),
    timestamp_end: toTrimmedString(row.timestamp_end),
    question_text: toTrimmedString(row.question_text),
    answer_text: toTrimmedString(row.answer_text),
    summary_text: toTrimmedString(row.summary_text),
    quote_text: toTrimmedString(row.quote_text),
    language: toTrimmedString(row.language),
    grade: toTrimmedString(row.grade),
    translator: toTrimmedString(row.translator),
    translation_name: toTrimmedString(row.translation_name),
    translation_language: toTrimmedString(row.translation_language),
    translation_source: toTrimmedString(row.translation_source),
    translation_source_url: toTrimmedString(row.translation_source_url),
    quran_text_style: toTrimmedString(row.quran_text_style),
    quran_arabic_source: toTrimmedString(row.quran_arabic_source),
    quran_edition: toTrimmedString(row.quran_edition),
    repo_license: toTrimmedString(row.repo_license),
    license_status: toTrimmedString(row.license_status),
    attribution_text: toTrimmedString(row.attribution_text),
    attribution_url: toTrimmedString(row.attribution_url),
    requires_attribution: toBoolean(row.requires_attribution, false),
    requires_sharealike_review: toBoolean(row.requires_sharealike_review, false),
    publisher: toTrimmedString(row.publisher),
    edition: toTrimmedString(row.edition),
    dataset_name: toTrimmedString(row.dataset_name),
    dataset_version: toTrimmedString(row.dataset_version),
    dataset_url: toTrimmedString(row.dataset_url),
    original_source: toTrimmedString(row.original_source),
    source_usage_notes: toTrimmedString(row.source_usage_notes),
    admin_review_status: toTrimmedString(row.admin_review_status),
    review_notes: toTrimmedString(row.review_notes),
    reviewed_by: toTrimmedString(row.reviewed_by),
    reviewed_at: row.reviewed_at || null,
    import_batch_id: toTrimmedString(row.import_batch_id),
    topic_tags: normalizeTopicTags(row.topic_tags),
    approved_for_answers: toBoolean(row.approved_for_answers, true),
    verified_by_admin: toBoolean(row.verified_by_admin, false),
    admin_managed: toBoolean(row.admin_managed, false),
    source_url: sourceUrl,
    url: sourceUrl,
    metadata: normalizeMetadata(row.metadata),
    score: typeof row.score === 'number' ? row.score : undefined,
    rank: typeof row.rank === 'number' ? row.rank : typeof row.score === 'number' ? row.score : undefined,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeQuery(query) {
  const cleaned = String(query || '')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/[A-Za-z]/.test(token) || !FILLER_WORDS.has(token.toLowerCase()))
    .map((token) => (/[A-Za-z]/.test(token) ? token.toLowerCase() : token));

  return {
    raw: String(query || ''),
    cleaned: normalizeText(cleaned),
    tokens,
  };
}

function expandTerms(tokens) {
  const expanded = new Set();
  tokens.forEach((token) => {
    expanded.add(token);
    if (/^[a-z]+$/i.test(token) && token.endsWith('s') && token.length > 4) expanded.add(token.slice(0, -1));
    (TERM_SYNONYMS[token] || []).forEach((synonym) => expanded.add(synonym));
  });
  return [...expanded].filter(Boolean);
}


function normalizeArabicText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[ً-ْٰ]/g, '')
    .replace(/[آأإٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[^؀-ۿ\sa-z0-9-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDirectSurahNameLookup(question) {
  const raw = String(question || '').trim();
  if (!raw) return null;
  const ascii = raw.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const arabic = normalizeArabicText(raw);
  const surahPrefix = '(?:surah|surat|sura)';
  const candidates = [
    {
      surahNumber: 1,
      ayahNumber: 1,
      matchers: [new RegExp(`\\b${surahPrefix}\\s+(?:al[-\\s]?)?fatihah\\b`, 'i'), new RegExp(`\\b${surahPrefix}\\s+fatiha\\b`, 'i'), /الفاتحه/],
    },
    {
      surahNumber: 112,
      ayahNumber: 1,
      matchers: [new RegExp(`\\b${surahPrefix}\\s+(?:al[-\\s]?)?ikhlas\\b`, 'i'), new RegExp(`\\b${surahPrefix}\\s+ikhlas\\b`, 'i'), /الاخلاص/],
    },
    {
      surahNumber: 113,
      ayahNumber: 1,
      matchers: [new RegExp(`\\b${surahPrefix}\\s+(?:al[-\\s]?)?falaq\\b`, 'i'), new RegExp(`\\b${surahPrefix}\\s+falaq\\b`, 'i'), /الفلق/],
    },
    {
      surahNumber: 114,
      ayahNumber: 1,
      matchers: [new RegExp(`\\b${surahPrefix}\\s+(?:an[-\\s]?)?nas\\b`, 'i'), new RegExp(`\\b${surahPrefix}\\s+nas\\b`, 'i'), /الناس/],
    },
    {
      surahNumber: 12,
      ayahNumber: 1,
      matchers: [new RegExp(`\\b${surahPrefix}\\s+(?:al[-\\s]?)?yusuf\\b`, 'i'), new RegExp(`\\b${surahPrefix}\\s+yusuf\\b`, 'i'), /سورة\s+يوسف/],
    },
  ];
  for (const candidate of candidates) {
    if (candidate.matchers.some((pattern) => pattern.test(ascii) || pattern.test(arabic))) {
      return { surahNumber: candidate.surahNumber, ayahNumber: candidate.ayahNumber, reason: 'surah_name_lookup' };
    }
  }
  return null;
}
function normalizedQueryText(value) {
  return normalizeText(String(value || '').replace(/[^\p{L}\p{N}:/\s-]+/gu, ' ').replace(/\s+/g, ' ').trim());
}

function quranReferenceFromQuery(query) {
  const queryText = typeof query === 'string'
    ? query
    : String(query?.raw || query?.cleaned || query?.text || '');
  const text = normalizedQueryText(queryText);
  const direct = text.match(/(?:quran|surah|aya|ayah|verse|آية|اية|ايه|الآية|الاية)?\s*(\d{1,3})\s*[:/-]\s*(\d{1,3})/i);
  if (direct) return `${Number.parseInt(direct[1], 10)}:${Number.parseInt(direct[2], 10)}`;
  if (/(ayat\s+al\s+kursi|ayatul\s+kursi|آية\s+الكرسي|ايه\s+الكرسي|kursi)/i.test(text)) return '2:255';
  const surahLookup = detectDirectSurahNameLookup(queryText);
  if (surahLookup) return `${surahLookup.surahNumber}:${surahLookup.ayahNumber}`;
  return null;
}

function expandQuranQueryTerms(normalizedQuery) {
  const expanded = new Set(expandTerms(normalizedQuery.tokens));
  const text = normalizedQueryText(normalizedQuery.raw || normalizedQuery.cleaned);
  const phraseSynonyms = [
    { pattern: /\bfatihah?\b|\bfatiha\b|الفاتحة|الفاتحه/i, terms: ['al-fatihah', 'fatihah', 'fatiha', 'الفاتحة', 'الفاتحه', '1'] },
    { pattern: /\bbaqarah\b|\bal\s+baqarah\b|البقرة/i, terms: ['al-baqarah', 'baqarah', 'البقرة', '2'] },
    { pattern: /\b(?:ayat\s+al\s+kursi|ayatul\s+kursi|kursi)\b|آية\s+الكرسي|ايه\s+الكرسي/i, terms: ['2:255', 'ayat al kursi', 'ayatul kursi', 'آية الكرسي', 'ايه الكرسي', 'kursi'] },
    { pattern: /\b(?:surah\s+)?(?:al[-\s]?)?ikhlas\b|الإخلاص|الاخلاص/i, terms: ['al-ikhlas', 'al ikhlas', 'ikhlas', 'الإخلاص', 'الاخلاص', '112'] },
  ];
  phraseSynonyms.forEach(({ pattern, terms }) => {
    if (pattern.test(text)) terms.forEach((term) => expanded.add(term));
  });
  const ref = quranReferenceFromQuery(normalizedQuery);
  if (ref) {
    expanded.add(ref);
    expanded.add(`quran-${ref.replace(':', '-')}`);
  }
  return [...expanded].filter(Boolean);
}

function searchableText(record) {
  const metadata = normalizeMetadata(record.metadata);
  return normalizeText([
    record.id,
    record.source_type,
    record.source_kind,
    record.work_type,
    record.title,
    record.display_title,
    record.collection_slug,
    record.collection_name,
    record.collection_name_ar,
    record.collection_name_en,
    record.collection_author_ar,
    record.collection_author_en,
    record.book_name,
    record.book_name_ar,
    record.book_name_en,
    record.chapter_name,
    record.chapter_name_ar,
    record.chapter_name_en,
    record.chapter_intro_ar,
    record.chapter_intro_en,
    record.hadith_number,
    record.hadith_number_global,
    record.hadith_number_in_book,
    record.hadith_number_in_chapter,
    record.surah,
    record.ayah,
    record.surah_number,
    record.ayah_number,
    record.ayah_start,
    record.ayah_end,
    record.ayah_range,
    record.ayah_global_number,
    record.surah_name_ar,
    record.surah_name_en,
    record.tafsir_edition_slug,
    record.tafsir_book_name,
    record.tafsir_book_name_ar,
    record.tafsir_book_name_en,
    record.tafsir_author,
    record.tafsir_author_ar,
    record.tafsir_author_en,
    record.tafsir_language,
    record.translator,
    record.translation_name,
    record.arabic_text,
    record.translation_text,
    record.explanation_text,
    record.english_narrator,
    record.scholar_name,
    record.scholar_slug,
    record.scholar_name_ar,
    record.scholar_name_en,
    record.scholar_full_name,
    record.work_slug,
    record.work_title,
    record.work_title_ar,
    record.work_title_en,
    record.work_author,
    record.work_language,
    record.collection_title,
    record.website_name,
    record.volume,
    record.page_range,
    record.chapter_title,
    record.section_title,
    record.fatwa_reference,
    record.fatwa_number,
    record.question_number,
    record.lecture_title,
    record.question_text,
    record.answer_text,
    record.summary_text,
    record.quote_text,
    record.language,
    record.source_url,
    record.dataset_name,
    record.original_source,
    ...(record.topic_tags || []),
    ...Object.values(metadata).map((value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')),
  ].filter(Boolean).join(' '));
}

function sourceScore(record, normalizedQuery) {
  if (!normalizedQuery.cleaned) return 0;

  const genericTerms = new Set([
    'a', 'an', 'about', 'give', 'show', 'share', 'find', 'quote', 'tell',
    'me', 'i', 'please', 'source', 'sources', 'hadith', 'quran', 'ayah',
    'verse', 'tafsir', 'explain', 'explanation', 'islamic', 'islam', 'the',
    'of', 'for', 'with', 'fatwa', 'scholar', 'scholars', 'ruling', 'rulings',
    'book', 'books', 'statement', 'statements', 'lecture', 'lectures',
    'تفسير', 'اشرح', 'شرح', 'فتوى', 'فتاوى', 'قول', 'كتاب', 'كتب', 'عالم'
  ]);

  const quranRef = quranReferenceFromQuery(normalizedQuery);
  if (quranRef && ['quran', 'quran_translation', 'tafsir'].includes(record.source_type)) {
    const [surahNumber, ayahNumber] = quranRef.split(':').map((part) => Number.parseInt(part, 10));
    const recordSurah = toInteger(record.surah_number) || toInteger(record.surah);
    const recordAyah = toInteger(record.ayah_number) || toInteger(record.ayah);
    const ayahStart = toInteger(record.ayah_start) || recordAyah;
    const ayahEnd = toInteger(record.ayah_end) || ayahStart;
    const exactMatch = recordSurah === surahNumber && recordAyah === ayahNumber;
    const rangeMatch = record.source_type === 'tafsir' && recordSurah === surahNumber && ayahStart && ayahEnd && ayahNumber >= ayahStart && ayahNumber <= ayahEnd;
    return exactMatch || rangeMatch ? 120 : 0;
  }

  const expandedTerms = expandQuranQueryTerms(normalizedQuery);
  const meaningfulTerms = expandedTerms
    .map((term) => String(term || '').trim())
    .filter(Boolean)
    .filter((term) => !genericTerms.has(term.toLowerCase()))
    .filter((term) => term.length > 1 || /\d/.test(term));

  // Do not guess if the user only asked generic things like "give me a hadith".
  if (!meaningfulTerms.length) return 0;

  const metadata = normalizeMetadata(record.metadata);
  const topicTags = normalizeTopicTags(record.topic_tags);
  const topicTagSet = new Set(topicTags.map((tag) => normalizeText(tag)));

  const haystack = normalizeText([
    record.id,
    record.title,
    record.source_kind,
    record.work_type,
    record.collection_name,
    record.collection_name_ar,
    record.collection_name_en,
    record.book_name,
    record.book_name_ar,
    record.book_name_en,
    record.chapter_name,
    record.chapter_name_ar,
    record.chapter_name_en,
    record.hadith_number,
    record.hadith_number_global,
    record.hadith_number_in_book,
    record.surah,
    record.ayah,
    record.surah_number,
    record.ayah_number,
    record.ayah_start,
    record.ayah_end,
    record.ayah_range,
    record.ayah_global_number,
    record.surah_name_ar,
    record.surah_name_en,
    record.tafsir_edition_slug,
    record.tafsir_book_name,
    record.tafsir_book_name_ar,
    record.tafsir_book_name_en,
    record.tafsir_author,
    record.tafsir_author_ar,
    record.tafsir_author_en,
    record.tafsir_language,
    (record.surah_number || record.surah) && (record.ayah_number || record.ayah)
      ? `${record.surah_number || record.surah}:${record.ayah_number || record.ayah}`
      : '',
    record.translator,
    record.translation_name,
    record.arabic_text,
    record.translation_text,
    record.explanation_text,
    record.english_narrator,
    record.scholar_name,
    record.scholar_slug,
    record.scholar_name_ar,
    record.scholar_name_en,
    record.scholar_full_name,
    record.madhhab,
    record.creed_school,
    record.work_slug,
    record.work_title,
    record.work_title_ar,
    record.work_title_en,
    record.work_author,
    record.work_language,
    record.collection_title,
    record.website_name,
    record.volume,
    record.page_number,
    record.page_range,
    record.chapter_title,
    record.section_title,
    record.fatwa_reference,
    record.fatwa_number,
    record.question_number,
    record.lecture_title,
    record.lecture_date,
    record.timestamp_start,
    record.timestamp_end,
    record.question_text,
    record.answer_text,
    record.summary_text,
    record.quote_text,
    record.language,
    record.source_url,
    ...topicTags,
    ...Object.values(metadata).map((value) => (
      typeof value === 'string' || typeof value === 'number' ? String(value) : ''
    )),
  ].filter(Boolean).join(' '));

  function rootOf(term) {
    return normalizeText(term)
      .replace(/(ions|ion|ing|ed|s)$/i, '')
      .trim();
  }

  function termMatches(term) {
    const lower = normalizeText(term);
    if (!lower) return false;

    if (haystack.includes(lower)) return true;
    if (topicTagSet.has(lower)) return true;

    const root = rootOf(lower);
    if (root.length >= 5 && haystack.includes(root)) return true;

    return false;
  }

  // Important hallucination guard:
  // At least one real topic term must match the source content.
  const matchedTerms = meaningfulTerms.filter(termMatches);
  if (!matchedTerms.length) return 0;

  let score = 0;

  if (haystack.includes(normalizedQuery.cleaned)) score += 24;

  matchedTerms.forEach((term) => {
    const lower = normalizeText(term);
    if (topicTagSet.has(lower)) score += 12;
    if (normalizeText(String(record.title || '')).includes(lower)) score += 8;
    if (normalizeText(String(record.translation_text || '')).includes(lower)) score += 6;
    if (normalizeText(String(record.explanation_text || '')).includes(lower)) score += 6;
    if (haystack.includes(lower)) score += 4;
  });

  if (record.verified_by_admin) score += 2;
  if (record.admin_managed) score += 1;

  return score;
}

function applyCommonFilters(query, { approvedOnly = true, type } = {}) {
  let next = query;
  if (approvedOnly) next = next.eq('approved_for_answers', true);

  const typeFilters = sourceTypesForFilter(type);
  if (typeFilters && typeFilters.length === 1) next = next.eq('source_type', typeFilters[0]);
  else if (typeFilters && typeFilters.length > 1) next = next.in('source_type', typeFilters);

  return next;
}

async function searchSources({ q, type, limit = 8, approvedOnly = true } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, configured: false, records: [], count: 0, error: 'Supabase not configured' };
  }

  try {
    const client = getSupabaseClient();
    const normalizedQuery = normalizeQuery(q);

    if (!normalizedQuery.cleaned) {
      return listSources({ type, limit, offset: 0, approvedOnly });
    }

    const candidateLimit = Math.min(Math.max(Number(limit) * 25, 100), MAX_SEARCH_CANDIDATES);
    let query = client.from(TABLE_NAME).select('*');
    query = applyCommonFilters(query, { approvedOnly, type });
    query = query
      .order('verified_by_admin', { ascending: false })
      .order('admin_managed', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(candidateLimit);

    const { data, error } = await query;
    if (error) throw error;

    const ranked = (data || [])
      .map(normalizeSourceRecord)
      .filter(Boolean)
      .map((record) => ({ ...record, score: sourceScore(record, normalizedQuery) }))
      .filter((record) => record.score > 0)
      .sort((a, b) => b.score - a.score || Number(b.verified_by_admin) - Number(a.verified_by_admin) || String(a.id).localeCompare(String(b.id)))
      .slice(0, Number(limit) || 8);

    return {
      ok: true,
      configured: true,
      records: ranked,
      count: ranked.length,
      source: 'supabase',
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      records: [],
      count: 0,
      source: 'supabase',
      error: safeErrorMessage(error),
    };
  }
}

async function listSources({ type, limit = 50, offset = 0, approvedOnly = false } = {}) {
  if (!isSupabaseConfigured()) {
    return { ok: false, configured: false, records: [], count: 0, error: 'Supabase not configured' };
  }

  try {
    const client = getSupabaseClient();
    let query = client.from(TABLE_NAME).select('*');
    query = applyCommonFilters(query, { approvedOnly, type });
    query = query
      .order('verified_by_admin', { ascending: false })
      .order('admin_managed', { ascending: false })
      .order('updated_at', { ascending: false })
      .range(Number(offset) || 0, (Number(offset) || 0) + Math.max((Number(limit) || 50) - 1, 0));

    const { data, error } = await query;
    if (error) throw error;

    const records = (data || []).map(normalizeSourceRecord).filter(Boolean);
    return {
      ok: true,
      configured: true,
      records,
      count: records.length,
      source: 'supabase',
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      records: [],
      count: 0,
      source: 'supabase',
      error: safeErrorMessage(error),
    };
  }
}

async function getSourceById(id) {
  if (!isSupabaseConfigured()) {
    return { ok: false, configured: false, record: null, error: 'Supabase not configured' };
  }

  try {
    const client = getSupabaseClient();
    const { data, error } = await client.from(TABLE_NAME).select('*').eq('id', String(id)).maybeSingle();
    if (error) throw error;
    return {
      ok: true,
      configured: true,
      record: normalizeSourceRecord(data),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      record: null,
      error: safeErrorMessage(error),
    };
  }
}

function toDatabaseRow(record) {
  const surah = toInteger(record.surah || record.surah_number);
  const ayah = toInteger(record.ayah || record.ayah_number);
  const row = {
    id: toTrimmedString(record.id),
    source_type: toTrimmedString(record.source_type || record.type),
    source_kind: toTrimmedString(record.source_kind),
    work_type: toTrimmedString(record.work_type),
    title: toTrimmedString(record.title || record.display_title || record.source_title),
    collection_slug: toTrimmedString(record.collection_slug),
    collection_name: toTrimmedString(record.collection_name),
    collection_name_ar: toTrimmedString(record.collection_name_ar),
    collection_name_en: toTrimmedString(record.collection_name_en),
    collection_author_ar: toTrimmedString(record.collection_author_ar),
    collection_author_en: toTrimmedString(record.collection_author_en),
    book_id: toInteger(record.book_id),
    book_number: toTrimmedString(record.book_number),
    book_name: toTrimmedString(record.book_name),
    book_name_ar: toTrimmedString(record.book_name_ar),
    book_name_en: toTrimmedString(record.book_name_en),
    chapter_id: toInteger(record.chapter_id),
    chapter_number: toTrimmedString(record.chapter_number),
    chapter_name: toTrimmedString(record.chapter_name),
    chapter_name_ar: toTrimmedString(record.chapter_name_ar),
    chapter_name_en: toTrimmedString(record.chapter_name_en),
    chapter_intro_ar: toTrimmedString(record.chapter_intro_ar),
    chapter_intro_en: toTrimmedString(record.chapter_intro_en),
    hadith_number: toTrimmedString(record.hadith_number),
    hadith_number_global: toTrimmedString(record.hadith_number_global),
    hadith_number_in_book: toTrimmedString(record.hadith_number_in_book),
    hadith_number_in_chapter: toTrimmedString(record.hadith_number_in_chapter),
    surah,
    ayah,
    surah_number: toInteger(record.surah_number) || surah,
    ayah_number: toInteger(record.ayah_number) || ayah,
    ayah_start: toInteger(record.ayah_start),
    ayah_end: toInteger(record.ayah_end),
    ayah_range: toTrimmedString(record.ayah_range),
    ayah_global_number: toInteger(record.ayah_global_number),
    surah_name_ar: toTrimmedString(record.surah_name_ar),
    surah_name_en: toTrimmedString(record.surah_name_en),
    tafsir_edition_slug: toTrimmedString(record.tafsir_edition_slug),
    tafsir_book_name: toTrimmedString(record.tafsir_book_name),
    tafsir_book_name_ar: toTrimmedString(record.tafsir_book_name_ar),
    tafsir_book_name_en: toTrimmedString(record.tafsir_book_name_en),
    tafsir_author: toTrimmedString(record.tafsir_author),
    tafsir_author_ar: toTrimmedString(record.tafsir_author_ar),
    tafsir_author_en: toTrimmedString(record.tafsir_author_en),
    tafsir_language: toTrimmedString(record.tafsir_language),
    juz: toInteger(record.juz),
    hizb: toTrimmedString(record.hizb),
    page_number: toInteger(record.page_number),
    revelation_place: toTrimmedString(record.revelation_place),
    arabic_text: toTrimmedString(record.arabic_text),
    translation_text: toTrimmedString(record.translation_text),
    explanation_text: toTrimmedString(record.explanation_text),
    english_narrator: toTrimmedString(record.english_narrator),
    scholar_name: toTrimmedString(record.scholar_name),
    scholar_slug: toTrimmedString(record.scholar_slug),
    scholar_name_ar: toTrimmedString(record.scholar_name_ar),
    scholar_name_en: toTrimmedString(record.scholar_name_en),
    scholar_full_name: toTrimmedString(record.scholar_full_name),
    scholar_death_year: toInteger(record.scholar_death_year),
    madhhab: toTrimmedString(record.madhhab),
    creed_school: toTrimmedString(record.creed_school),
    work_slug: toTrimmedString(record.work_slug),
    work_title: toTrimmedString(record.work_title),
    work_title_ar: toTrimmedString(record.work_title_ar),
    work_title_en: toTrimmedString(record.work_title_en),
    work_author: toTrimmedString(record.work_author),
    work_language: toTrimmedString(record.work_language),
    collection_title: toTrimmedString(record.collection_title),
    website_name: toTrimmedString(record.website_name),
    volume: toTrimmedString(record.volume),
    page_range: toTrimmedString(record.page_range),
    chapter_title: toTrimmedString(record.chapter_title),
    section_title: toTrimmedString(record.section_title),
    fatwa_reference: toTrimmedString(record.fatwa_reference || record.fatwa_number || record.reference_number),
    fatwa_number: toTrimmedString(record.fatwa_number || record.fatwa_reference || record.reference_number),
    question_number: toTrimmedString(record.question_number),
    lecture_title: toTrimmedString(record.lecture_title),
    lecture_date: toTrimmedString(record.lecture_date),
    timestamp_start: toTrimmedString(record.timestamp_start),
    timestamp_end: toTrimmedString(record.timestamp_end),
    question_text: toTrimmedString(record.question_text),
    answer_text: toTrimmedString(record.answer_text),
    summary_text: toTrimmedString(record.summary_text),
    quote_text: toTrimmedString(record.quote_text),
    language: toTrimmedString(record.language),
    grade: toTrimmedString(record.grade),
    translator: toTrimmedString(record.translator),
    translation_name: toTrimmedString(record.translation_name),
    translation_language: toTrimmedString(record.translation_language),
    translation_source: toTrimmedString(record.translation_source),
    translation_source_url: toTrimmedString(record.translation_source_url),
    quran_text_style: toTrimmedString(record.quran_text_style),
    quran_arabic_source: toTrimmedString(record.quran_arabic_source),
    quran_edition: toTrimmedString(record.quran_edition),
    repo_license: toTrimmedString(record.repo_license),
    license_status: toTrimmedString(record.license_status),
    attribution_text: toTrimmedString(record.attribution_text),
    attribution_url: toTrimmedString(record.attribution_url),
    requires_attribution: toBoolean(record.requires_attribution, false),
    requires_sharealike_review: toBoolean(record.requires_sharealike_review, false),
    publisher: toTrimmedString(record.publisher),
    edition: toTrimmedString(record.edition),
    dataset_name: toTrimmedString(record.dataset_name),
    dataset_version: toTrimmedString(record.dataset_version),
    dataset_url: toTrimmedString(record.dataset_url),
    original_source: toTrimmedString(record.original_source),
    source_usage_notes: toTrimmedString(record.source_usage_notes),
    admin_review_status: toTrimmedString(record.admin_review_status),
    review_notes: toTrimmedString(record.review_notes),
    reviewed_by: toTrimmedString(record.reviewed_by),
    reviewed_at: record.reviewed_at || null,
    import_batch_id: toTrimmedString(record.import_batch_id),
    topic_tags: normalizeTopicTags(record.topic_tags),
    approved_for_answers: toBoolean(record.approved_for_answers, false),
    verified_by_admin: toBoolean(record.verified_by_admin, false),
    admin_managed: toBoolean(record.admin_managed, false),
    source_url: toTrimmedString(record.source_url || record.url),
    metadata: normalizeMetadata(record.metadata),
    updated_at: new Date().toISOString(),
  };

  if (record.created_at) row.created_at = record.created_at;
  return row;
}

async function upsertSource(record) {
  if (!isSupabaseConfigured()) {
    return { ok: false, configured: false, record: null, error: 'Supabase not configured' };
  }

  try {
    const client = getSupabaseClient();
    const row = toDatabaseRow(record || {});
    if (!row.id || !row.source_type) {
      return { ok: false, configured: true, record: null, error: 'id and source_type are required' };
    }

    const { data, error } = await client
      .from(TABLE_NAME)
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) throw error;
    return {
      ok: true,
      configured: true,
      record: normalizeSourceRecord(data),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      record: null,
      error: safeErrorMessage(error),
    };
  }
}

async function deleteSource(id) {
  if (!isSupabaseConfigured()) {
    return { ok: false, configured: false, deleted: false, error: 'Supabase not configured' };
  }

  try {
    const existing = await getSourceById(id);
    if (!existing.ok) return { ok: false, configured: true, deleted: false, error: existing.error };
    if (!existing.record) return { ok: false, configured: true, deleted: false, error: 'Source not found' };

    const client = getSupabaseClient();
    if (existing.record.admin_managed) {
      const { error } = await client.from(TABLE_NAME).delete().eq('id', String(id));
      if (error) throw error;
      return { ok: true, configured: true, deleted: true, hardDeleted: true, error: null };
    }

    const updated = await upsertSource({
      ...existing.record,
      approved_for_answers: false,
    });
    if (!updated.ok) return { ok: false, configured: true, deleted: false, error: updated.error };
    return { ok: true, configured: true, deleted: true, hardDeleted: false, record: updated.record, error: null };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      deleted: false,
      error: safeErrorMessage(error),
    };
  }
}

async function countSources() {
  if (!isSupabaseConfigured()) {
    return { configured: false, total: 0, approved: 0, verified: 0, byType: {}, error: 'Supabase not configured' };
  }

  try {
    const client = getSupabaseClient();
    const [totalResult, approvedResult, verifiedResult, typesResult] = await Promise.all([
      client.from(TABLE_NAME).select('id', { count: 'exact', head: true }),
      client.from(TABLE_NAME).select('id', { count: 'exact', head: true }).eq('approved_for_answers', true),
      client.from(TABLE_NAME).select('id', { count: 'exact', head: true }).eq('verified_by_admin', true),
      client.from(TABLE_NAME).select('source_type').limit(10000),
    ]);

    if (totalResult.error) throw totalResult.error;
    if (approvedResult.error) throw approvedResult.error;
    if (verifiedResult.error) throw verifiedResult.error;
    if (typesResult.error) throw typesResult.error;

    const byType = {};
    (typesResult.data || []).forEach((row) => {
      const type = toTrimmedString(row.source_type) || 'unknown';
      byType[type] = (byType[type] || 0) + 1;
    });

    return {
      configured: true,
      total: totalResult.count || 0,
      approved: approvedResult.count || 0,
      verified: verifiedResult.count || 0,
      byType,
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      total: 0,
      approved: 0,
      verified: 0,
      byType: {},
      error: safeErrorMessage(error),
    };
  }
}

async function getHealthSummary() {
  if (!isSupabaseConfigured()) {
    return {
      configured: false,
      status: 'not_configured',
      count: 0,
      approved: 0,
      verified: 0,
      byType: {},
      error: 'Supabase not configured',
    };
  }

  const counts = await countSources();
  if (counts.error) {
    return {
      configured: true,
      status: 'error',
      count: 0,
      approved: 0,
      verified: 0,
      byType: {},
      error: counts.error,
    };
  }

  return {
    configured: true,
    status: 'ready',
    count: counts.total,
    approved: counts.approved,
    verified: counts.verified,
    byType: counts.byType,
    error: null,
  };
}

module.exports = {
  TABLE_NAME,
  countSources,
  deleteSource,
  getHealthSummary,
  getSourceById,
  getSupabaseClient,
  isSupabaseConfigured,
  listSources,
  normalizeSourceRecord,
  quranReferenceFromQuery,
  searchSources,
  toDatabaseRow,
  upsertSource,
};
