const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.join(__dirname, '..', '..', 'data', 'islamic-sources');
const SOURCE_FOLDERS = ['quran', 'hadith', 'tafsir', 'scholars', 'fatwas', 'uploads', 'admin'];
const SEARCH_FIELDS = [
  'id',
  'title',
  'source_title',
  'source_name',
  'topic',
  'keywords',
  'scholar_name',
  'collection_name',
  'book_name',
  'chapter_name',
  'surah_name_en',
  'surah_name_ar',
  'surah_number',
  'ayah_number',
  'translator',
  'translation_name',
  'translation_text',
  'arabic_text',
  'original_text',
  'extracted_text',
  'summary',
  'document_title',
  'section_title',
  'article_title',
  'video_title',
  'local_reference',
];

function getRoot(root = process.env.ISLAMIC_SOURCES_ROOT || DEFAULT_ROOT) {
  return root;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJsonFile(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.join(dir, file));
}

function normalizeArabic(s = '') {
  return String(s).replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim();
}

function normalizeEnglish(s = '') {
  return String(s).toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeText(s = '') {
  return `${normalizeArabic(s)} ${normalizeEnglish(s)}`.trim();
}

function sourceSearchText(source) {
  return normalizeText(SEARCH_FIELDS.map((field) => source[field]).filter(Boolean).join(' '));
}

function sourceScore(source, query) {
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  if (!tokens.length) return 1;
  const text = sourceSearchText(source);
  return tokens.reduce((acc, token) => acc + (text.includes(token) ? 1 : 0), 0);
}

function typeGroupMatches(sourceType, group) {
  const normalized = String(group || 'all').toLowerCase();
  if (!normalized || normalized === 'all') return true;

  const groups = {
    quran: ['quran', 'quran_translation'],
    hadith: ['hadith', 'hadith_explanation'],
    tafsir: ['tafsir'],
    scholars: ['scholar_statement', 'book', 'lecture', 'video_transcript', 'educational_explanation'],
    fatwas: ['fatwa'],
    documents: ['uploaded_document', 'approved_pdf'],
  };

  return (groups[normalized] || [normalized]).includes(sourceType);
}

function exactReference(source) {
  return source.reference_number || source.fatwa_reference || source.fatwa_number || source.page_number || source.timestamp || source.source_url || source.url || source.local_reference || '';
}

function copyCitation(source) {
  if (['quran', 'quran_translation', 'tafsir'].includes(source.source_type)) {
    const name = source.surah_name_en || source.surah_name_ar || source.source_title || source.title || 'Quran';
    return `${name} (${source.surah_number || '?'}:${source.ayah_number || source.ayah_range || '?'})`;
  }

  if (['hadith', 'hadith_explanation'].includes(source.source_type)) {
    return `${source.collection_name || 'Hadith'} #${source.hadith_number || source.hadith_number_global || source.hadith_number_in_book || 'N/A'}`;
  }

  if (['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript', 'educational_explanation'].includes(source.source_type)) {
    return [source.scholar_name || 'Scholar', source.source_title || source.title, exactReference(source)].filter(Boolean).join(' - ');
  }

  return source.document_title || source.title || source.file_name || source.id || 'Document';
}

function publicSourceCard(source) {
  return {
    id: source.id,
    source_type: source.source_type,
    type: source.type || source.source_type,
    title: source.title || source.source_title || source.collection_name || source.document_title || source.source_name || source.id,
    source_title: source.source_title,
    collection_name: source.collection_name,
    book_name: source.book_name,
    chapter_name: source.chapter_name,
    surah_name_en: source.surah_name_en,
    surah_name_ar: source.surah_name_ar,
    surah: source.surah || source.surah_number,
    ayah: source.ayah || source.ayah_number,
    surah_number: source.surah || source.surah_number,
    ayah_number: source.ayah || source.ayah_number,
    ayah_range: source.ayah_range,
    hadith_number: source.hadith_number || source.hadith_number_global || source.hadith_number_in_book,
    hadith_number_global: source.hadith_number_global,
    hadith_number_in_book: source.hadith_number_in_book,
    hadith_number_unavailable: source.hadith_number_unavailable,
    arabic_text: source.arabic_text,
    translation_text: source.translation_text,
    explanation_text: source.explanation_text,
    scholar_name: source.scholar_name,
    fatwa_reference: source.fatwa_reference || source.fatwa_number || source.reference_number,
    topic_tags: Array.isArray(source.topic_tags) ? source.topic_tags : [],
    approved_for_answers: source.approved_for_answers === true,
    verified_by_admin: source.verified_by_admin === true,
    admin_managed: source.admin_managed === true,
    source_url: source.source_url || source.url || null,
    metadata: source.metadata || {},
    exact_reference: exactReference(source),
    grade: source.grade,
    approved_status: source.verified_by_admin && source.approved_for_answers ? 'approved' : 'not_approved',
    copyCitation: copyCitation(source),
    summary: source.summary,
  };
}

function warn(warnings, msg) {
  warnings.push(msg);
}

function validateSource(source, warnings) {
  if (!source || typeof source !== 'object') {
    warn(warnings, 'Invalid source record');
    return false;
  }

  if (!source.id || !source.source_type) warn(warnings, `Missing id/source_type for record: ${JSON.stringify(source).slice(0, 120)}`);

  if (source.disabled) {
    warn(warnings, `${source.id || 'unknown'}: disabled`);
    return false;
  }

  if (['quran', 'quran_translation', 'tafsir'].includes(source.source_type)) {
    if (!source.surah_number) warn(warnings, `${source.id}: Quran missing surah_number`);
    if (!(source.ayah_number || source.ayah_range)) warn(warnings, `${source.id}: Quran missing ayah_number/ayah_range`);
    if (!(source.arabic_text || source.translation_text || source.summary)) warn(warnings, `${source.id}: Quran missing arabic_text/translation_text`);
  }

  if (['hadith', 'hadith_explanation'].includes(source.source_type)) {
    if (!source.collection_name) warn(warnings, `${source.id}: Hadith missing collection_name`);
    if (!(source.hadith_number || source.hadith_number_unavailable === true)) warn(warnings, `${source.id}: Hadith missing hadith_number and hadith_number_unavailable flag`);
    if (!(source.arabic_text || source.translation_text || source.summary)) warn(warnings, `${source.id}: Hadith missing arabic_text/translation_text`);
    if (!source.grade) warn(warnings, `${source.id}: Hadith grade not provided (allowed but recommended)`);
  }

  if (['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript', 'educational_explanation'].includes(source.source_type)) {
    if (!source.scholar_name) warn(warnings, `${source.id}: Scholar source missing scholar_name`);
    if (!(source.source_title || source.title)) warn(warnings, `${source.id}: Scholar source missing source_title/title`);
    if (!exactReference(source)) warn(warnings, `${source.id}: Scholar source missing exact reference`);
  }

  if (['uploaded_document', 'approved_pdf'].includes(source.source_type)) {
    if (!source.file_name) warn(warnings, `${source.id}: Uploaded document missing file_name`);
    if (typeof source.approved_for_answers !== 'boolean') warn(warnings, `${source.id}: Uploaded document missing approved_for_answers boolean`);
    if (!source.approved_by_admin) warn(warnings, `${source.id}: Uploaded document missing approved_by_admin`);
    if (!source.upload_status) warn(warnings, `${source.id}: Uploaded document missing upload_status`);
    if (source.upload_status !== 'approved') return false;
  }

  return !source.disabled && source.verified_by_admin === true && source.approved_for_answers === true;
}

function adminValidationErrors(source) {
  const errors = [];
  if (!source.source_type) errors.push('source_type is required');

  if (['quran', 'quran_translation', 'tafsir'].includes(source.source_type)) {
    if (!source.surah_number) errors.push('surah_number is required for Quran sources');
    if (!(source.ayah_number || source.ayah_range)) errors.push('ayah_number or ayah_range is required for Quran sources');
    if (!(source.arabic_text || source.translation_text)) errors.push('arabic_text or translation_text is required for Quran sources');
  }

  if (['hadith', 'hadith_explanation'].includes(source.source_type)) {
    if (!source.collection_name) errors.push('collection_name is required for Hadith sources');
    if (!(source.hadith_number || source.hadith_number_unavailable === true)) errors.push('hadith_number is required unless hadith_number_unavailable is true');
    if (!(source.arabic_text || source.translation_text)) errors.push('arabic_text or translation_text is required for Hadith sources');
  }

  if (['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript', 'educational_explanation'].includes(source.source_type)) {
    if (!source.scholar_name) errors.push('scholar_name is required for scholar/fatwa sources');
    if (!(source.source_title || source.title)) errors.push('source_title or title is required for scholar/fatwa sources');
    if (!exactReference(source)) errors.push('an exact reference is required for scholar/fatwa sources');
  }

  if (['uploaded_document', 'approved_pdf'].includes(source.source_type)) {
    if (!source.approved_by_admin) errors.push('approved_by_admin is required for uploaded documents');
    if (source.approved_for_answers !== true) errors.push('approved_for_answers=true is required for uploaded documents');
    if (!source.upload_status) errors.push('upload_status is required for uploaded documents');
  }

  return errors;
}

function readRecordsFromFile(file, warnings = []) {
  try {
    const parsed = readJsonFile(file, []);
    const records = Array.isArray(parsed) ? parsed : [parsed];
    return records.map((record) => ({ ...record, _source_file: file, _source_folder: path.basename(path.dirname(file)) }));
  } catch (error) {
    warn(warnings, `Could not parse source file ${file}: ${error.message}`);
    return [];
  }
}

function listAllSourceRecords({ root = getRoot(), includeSourceMeta = false } = {}) {
  const warnings = [];
  const records = [];
  for (const folder of SOURCE_FOLDERS) {
    for (const file of listJsonFiles(path.join(root, folder))) {
      records.push(...readRecordsFromFile(file, warnings));
    }
  }

  if (includeSourceMeta) return { records, warnings };
  return { records: records.map(({ _source_file, _source_folder, ...record }) => record), warnings };
}

function compiledIndexPath(root = getRoot()) {
  return path.join(root, 'indexes', 'compiled-sources.json');
}

function warningsPath(root = getRoot()) {
  return path.join(root, 'indexes', 'ingest-warnings.json');
}

function loadCompiledIndex({ root = getRoot() } = {}) {
  const parsed = readJsonFile(compiledIndexPath(root), { records: [] });
  if (!parsed || !Array.isArray(parsed.records)) {
    throw new Error('Compiled source index is missing a records array.');
  }
  return parsed;
}

function loadIndexSources(options) {
  return loadCompiledIndex(options).records;
}

function loadIngestWarnings({ root = getRoot() } = {}) {
  return readJsonFile(warningsPath(root), []);
}

function buildIslamicSourceIndex({ root = getRoot(), allowTestSources = String(process.env.ALLOW_TEST_SOURCES || 'false').toLowerCase() === 'true', write = true } = {}) {
  const warnings = [];
  const indexed = [];
  let rejectedCount = 0;

  for (const folder of SOURCE_FOLDERS) {
    for (const file of listJsonFiles(path.join(root, folder))) {
      for (const source of readRecordsFromFile(file, warnings)) {
        const { _source_file, _source_folder, ...cleanSource } = source;
        const canInclude = validateSource(cleanSource, warnings);
        if (cleanSource.is_test_record === true && !allowTestSources) {
          rejectedCount += 1;
          warn(warnings, `${cleanSource.id || 'unknown'}: test record excluded from compiled index because ALLOW_TEST_SOURCES=false`);
          continue;
        }
        if (canInclude) indexed.push(cleanSource);
        else {
          rejectedCount += 1;
          warn(warnings, `${cleanSource.id || 'unknown'}: excluded from answer index (not approved/verified)`);
        }
      }
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    total_indexed: indexed.length,
    records: indexed,
  };

  if (write) {
    writeJsonFile(compiledIndexPath(root), output);
    writeJsonFile(warningsPath(root), warnings);
  }

  return { ...output, warnings, rejected_count: rejectedCount };
}

function adminSourcesPath(root = getRoot()) {
  return path.join(root, 'admin', 'sources.json');
}

function readAdminSources({ root = getRoot() } = {}) {
  const file = adminSourcesPath(root);
  const parsed = readJsonFile(file, []);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function writeAdminSources(records, { root = getRoot() } = {}) {
  writeJsonFile(adminSourcesPath(root), records);
}

function nowIso() {
  return new Date().toISOString();
}

function normalizeAdminSource(input, previous) {
  const now = nowIso();
  const source = {
    ...(previous || {}),
    ...(input || {}),
  };

  source.id = String(previous?.id || source.id || `admin-${Date.now()}`).trim();
  source.verified_by_admin = source.verified_by_admin === true;
  source.approved_for_answers = source.approved_for_answers === true;
  source.created_at = previous?.created_at || source.created_at || now;
  source.updated_at = now;
  return source;
}

function assertUniqueSourceId(id, { root = getRoot(), ignoreAdminIndex = -1 } = {}) {
  const adminSources = readAdminSources({ root });
  if (adminSources.some((source, index) => source.id === id && index !== ignoreAdminIndex)) {
    return false;
  }

  const { records } = listAllSourceRecords({ root, includeSourceMeta: true });
  return !records.some((source) => source.id === id && source._source_folder !== 'admin');
}

function addAdminSource(input, { root = getRoot() } = {}) {
  const adminSources = readAdminSources({ root });
  const source = normalizeAdminSource(input);
  const errors = adminValidationErrors(source);
  if (!source.id) errors.push('id is required');
  if (!assertUniqueSourceId(source.id, { root })) errors.push('id already exists');
  if (errors.length) return { ok: false, errors };

  adminSources.push(source);
  writeAdminSources(adminSources, { root });
  return { ok: true, source };
}

function updateAdminSource(id, input, { root = getRoot() } = {}) {
  const adminSources = readAdminSources({ root });
  const index = adminSources.findIndex((source) => source.id === id);
  if (index === -1) return { ok: false, status: 404, errors: ['admin source not found'] };

  const source = normalizeAdminSource({ ...input, id }, adminSources[index]);
  const errors = adminValidationErrors(source);
  if (!assertUniqueSourceId(source.id, { root, ignoreAdminIndex: index })) errors.push('id already exists');
  if (errors.length) return { ok: false, status: 400, errors };

  adminSources[index] = source;
  writeAdminSources(adminSources, { root });
  return { ok: true, source };
}

function deleteAdminSource(id, { root = getRoot() } = {}) {
  const adminSources = readAdminSources({ root });
  const next = adminSources.filter((source) => source.id !== id);
  if (next.length === adminSources.length) return { ok: false, status: 404, errors: ['admin source not found'] };
  writeAdminSources(next, { root });
  return { ok: true };
}

function searchCompiledSources({ q = '', type = 'all', limit = 50, root = getRoot() } = {}) {
  const index = loadCompiledIndex({ root });
  const records = index.records
    .filter((source) => typeGroupMatches(source.source_type, type))
    .map((source) => ({ source, score: sourceScore(source, q) }))
    .filter((entry) => !q || entry.score > 0)
    .sort((a, b) => b.score - a.score || String(a.source.id).localeCompare(String(b.source.id)))
    .slice(0, limit)
    .map((entry) => entry.source);

  return { generated_at: index.generated_at, total: records.length, records };
}

module.exports = {
  SEARCH_FIELDS,
  SOURCE_FOLDERS,
  addAdminSource,
  adminValidationErrors,
  buildIslamicSourceIndex,
  copyCitation,
  deleteAdminSource,
  exactReference,
  loadCompiledIndex,
  loadIndexSources,
  loadIngestWarnings,
  listAllSourceRecords,
  normalizeText,
  publicSourceCard,
  readAdminSources,
  searchCompiledSources,
  sourceScore,
  typeGroupMatches,
  updateAdminSource,
};
