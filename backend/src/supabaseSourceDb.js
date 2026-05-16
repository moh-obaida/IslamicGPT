const { createClient } = require('@supabase/supabase-js');
const { normalizeText } = require('./sourceStore');

const TABLE_NAME = 'islamic_sources';
const MAX_SEARCH_CANDIDATES = 500;
const MODE_TO_TYPE = {
  hadith_mode: 'hadith',
  quran_mode: 'quran',
  tafsir_mode: 'tafsir',
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
  'a', 'an', 'about', 'actions', 'find', 'for', 'give', 'hadith', 'i', 'is', 'me',
  'of', 'please', 'quote', 'show', 'tell', 'the', 'what',
]);
const TERM_SYNONYMS = {
  intention: ['intention', 'intentions', 'niyyah', 'نية', 'نيات', 'الأعمال بالنيات'],
  intentions: ['intention', 'intentions', 'niyyah', 'نية', 'نيات', 'الأعمال بالنيات'],
  niyyah: ['niyyah', 'intention', 'intentions', 'نية', 'نيات', 'الأعمال بالنيات'],
  sincerity: ['sincerity', 'ikhlas', 'إخلاص'],
  actions: ['action', 'actions', 'deeds', 'الأعمال'],
  action: ['action', 'actions', 'deeds', 'الأعمال'],
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
  cachedClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'x-client-info': 'islamicgpt-backend',
      },
    },
  });
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
  if (row.source_type === 'quran' || row.source_type === 'quran_translation' || row.source_type === 'tafsir') {
    const surah = toInteger(row.surah);
    const ayah = toInteger(row.ayah);
    if (surah && ayah) return `Quran ${surah}:${ayah}`;
    return row.title || `Surah ${surah || '?'}`;
  }
  return row.display_title || row.title || row.collection_name || row.book_name || row.scholar_name || row.id || 'Approved source';
}

function normalizeSourceRecord(row) {
  if (!row || typeof row !== 'object') return null;

  const displayTitle = buildDisplayTitle(row);
  const hadithNumber = resolveHadithNumber(row);
  const title = toTrimmedString(row.title) || displayTitle;
  const sourceUrl = toTrimmedString(row.source_url);
  const fatwaReference = toTrimmedString(row.fatwa_reference);
  const bookName = resolveBookName(row);
  const chapterName = resolveChapterName(row);

  return {
    id: toTrimmedString(row.id),
    source_type: toTrimmedString(row.source_type) || 'unknown',
    type: toTrimmedString(row.source_type) || 'unknown',
    title,
    display_title: displayTitle,
    source_title: displayTitle,
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
    surah: toInteger(row.surah),
    ayah: toInteger(row.ayah),
    surah_number: toInteger(row.surah),
    ayah_number: toInteger(row.ayah),
    arabic_text: toTrimmedString(row.arabic_text),
    english_narrator: toTrimmedString(row.english_narrator),
    translation_text: toTrimmedString(row.translation_text),
    scholar_name: toTrimmedString(row.scholar_name),
    fatwa_reference: fatwaReference,
    fatwa_number: fatwaReference,
    reference_number: fatwaReference,
    grade: toTrimmedString(row.grade),
    translator: toTrimmedString(row.translator),
    dataset_name: toTrimmedString(row.dataset_name),
    dataset_version: toTrimmedString(row.dataset_version),
    original_source: toTrimmedString(row.original_source),
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

function searchableText(record) {
  const metadata = normalizeMetadata(record.metadata);
  return normalizeText([
    record.id,
    record.source_type,
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
    record.arabic_text,
    record.translation_text,
    record.english_narrator,
    record.scholar_name,
    record.fatwa_reference,
    record.source_url,
    record.dataset_name,
    record.original_source,
    ...(record.topic_tags || []),
    ...Object.values(metadata).map((value) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '')),
  ].filter(Boolean).join(' '));
}

function sourceScore(record, normalizedQuery) {
  if (!normalizedQuery.cleaned) return 0;

  const expandedTerms = expandTerms(normalizedQuery.tokens);
  const haystack = searchableText(record);
  const topicTagSet = new Set((record.topic_tags || []).map((tag) => String(tag).toLowerCase()));

  let score = 0;
  if (haystack.includes(normalizedQuery.cleaned)) score += 24;
  if (normalizeText(String(record.title || '')).includes(normalizedQuery.cleaned)) score += 10;

  expandedTerms.forEach((term) => {
    const lower = normalizeText(term);
    if (haystack.includes(lower)) score += 4;
    if (normalizeText(String(record.title || '')).includes(lower)) score += 6;
    if (normalizeText(String(record.translation_text || '')).includes(lower)) score += 5;
    if (normalizeText(String(record.collection_name || '')).includes(lower)) score += 3;
    if (topicTagSet.has(String(term).toLowerCase())) score += 8;
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
  const row = {
    id: toTrimmedString(record.id),
    source_type: toTrimmedString(record.source_type || record.type),
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
    surah: toInteger(record.surah || record.surah_number),
    ayah: toInteger(record.ayah || record.ayah_number),
    arabic_text: toTrimmedString(record.arabic_text),
    translation_text: toTrimmedString(record.translation_text),
    english_narrator: toTrimmedString(record.english_narrator),
    scholar_name: toTrimmedString(record.scholar_name),
    fatwa_reference: toTrimmedString(record.fatwa_reference || record.fatwa_number || record.reference_number),
    grade: toTrimmedString(record.grade),
    translator: toTrimmedString(record.translator),
    dataset_name: toTrimmedString(record.dataset_name),
    dataset_version: toTrimmedString(record.dataset_version),
    original_source: toTrimmedString(record.original_source),
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
  searchSources,
  toDatabaseRow,
  upsertSource,
};
