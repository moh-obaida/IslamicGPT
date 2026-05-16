#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const IMPORTER_VERSION = 'scholar-json-v1';
const DEFAULTS = {
  datasetName: 'curated-scholar-sources',
  datasetVersion: 'local',
  licenseStatus: 'source-usage-needs-review',
  adapter: 'generic-curated-json',
  sourceFamily: 'scholar',
};
const VALID_SOURCE_TYPES = new Set(['fatwa', 'scholar_statement', 'book', 'lecture', 'educational_explanation']);
const SCHOLAR_SOURCE_TYPES = new Set(['fatwa', 'scholar_statement', 'book', 'lecture', 'educational_explanation']);

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

function pickString(...values) {
  for (const value of values) {
    const text = toTrimmedString(value);
    if (text) return text;
  }
  return null;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseSet(value) {
  if (!value) return new Set();
  return new Set(String(value).split(',').map((entry) => entry.trim()).filter(Boolean));
}

function camelOptionName(name) {
  return String(name || '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseCliArgs(argv) {
  const options = {
    dryRun: true,
    execute: false,
    limit: null,
    batchSize: 500,
    approveScholars: new Set(),
    verifyScholars: new Set(),
    approveDatasets: new Set(),
    verifyDatasets: new Set(),
    datasetName: DEFAULTS.datasetName,
    datasetVersion: DEFAULTS.datasetVersion,
    licenseStatus: DEFAULTS.licenseStatus,
  };
  const positionals = [];

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      options.execute = false;
      continue;
    }
    if (arg === '--execute') {
      options.execute = true;
      options.dryRun = false;
      continue;
    }

    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, rawName, rawValue] = match;
    const value = rawValue.replace(/^"|"$/g, '');
    const name = camelOptionName(rawName);
    if (name === 'limit') options.limit = Number.parseInt(value, 10);
    else if (name === 'batchSize') options.batchSize = Number.parseInt(value, 10) || 500;
    else if (name === 'approveScholars') options.approveScholars = parseSet(value);
    else if (name === 'verifyScholars') options.verifyScholars = parseSet(value);
    else if (name === 'approveDatasets') options.approveDatasets = parseSet(value);
    else if (name === 'verifyDatasets') options.verifyDatasets = parseSet(value);
    else if (Object.prototype.hasOwnProperty.call(options, name)) options[name] = value || options[name];
  }

  return { options, positionals };
}

function collectJsonFiles(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  const results = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
      continue;
    }
    if (current.toLowerCase().endsWith('.json')) results.push(current);
  }

  return results.sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function extractRecordCandidates(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const arrays = ['records', 'sources', 'items', 'entries', 'data', 'fatwas', 'books', 'articles']
    .flatMap((key) => Array.isArray(parsed[key]) ? parsed[key] : []);
  if (arrays.length) return arrays.filter((entry) => entry && typeof entry === 'object');
  return [parsed];
}

function inferSourceType(record = {}) {
  const explicit = toTrimmedString(record.source_type || record.type);
  if (explicit && VALID_SOURCE_TYPES.has(explicit)) return explicit;

  const sourceKind = String(record.source_kind || '').toLowerCase();
  const workType = String(record.work_type || '').toLowerCase();
  if (sourceKind.includes('fatwa') || workType === 'fatwa' || record.fatwa_number) return 'fatwa';
  if (sourceKind.includes('book') || workType === 'book') return 'book';
  if (sourceKind.includes('lecture') || ['lecture', 'transcript'].includes(workType)) return 'lecture';
  if (sourceKind.includes('article') || ['article', 'curated_json'].includes(workType)) return 'educational_explanation';
  if (sourceKind.includes('statement')) return 'scholar_statement';
  return 'scholar_statement';
}

function stableSourceTypeSlug(sourceType) {
  if (sourceType === 'scholar_statement') return 'scholar';
  if (sourceType === 'educational_explanation') return 'educational';
  return slugify(sourceType);
}

function stableReferenceSlug(record, sourceType, index) {
  const reference = pickString(
    record.title,
    record.work_title_en,
    record.work_title,
    record.work_slug,
    record.fatwa_number,
    record.question_number,
    record.chapter_title,
    record.section_title,
    record.source_url,
    record.original_source,
  );
  const page = pickString(record.page_number ? `page-${record.page_number}` : null, record.page_range);
  return slugify([reference, page].filter(Boolean).join(' ')) || `record-${index + 1}`;
}

function buildStableId(record, sourceType, index) {
  const explicit = toTrimmedString(record.id);
  if (explicit) return explicit;
  const family = slugify(record.scholar_slug || record.source_kind || record.work_type || 'scholar');
  return [stableSourceTypeSlug(sourceType), family || 'scholar', stableReferenceSlug(record, sourceType, index)]
    .filter(Boolean)
    .join('-');
}

function normalizeTopicTags(value) {
  if (Array.isArray(value)) return [...new Set(value.map((entry) => toTrimmedString(entry)).filter(Boolean))];
  if (typeof value === 'string') return [...new Set(value.split(/[;,|]/).map((entry) => toTrimmedString(entry)).filter(Boolean))];
  return [];
}

function normalizeScholarRecord(record = {}, context = {}) {
  const sourceType = inferSourceType(record);
  const datasetName = pickString(record.dataset_name, context.datasetName, DEFAULTS.datasetName);
  const licenseStatus = pickString(record.license_status, context.licenseStatus, DEFAULTS.licenseStatus);
  const importedAt = context.importedAt || new Date().toISOString();
  const title = pickString(
    record.title,
    record.question_text,
    record.work_title_en,
    record.work_title,
    record.chapter_title,
    record.section_title,
    record.quote_text,
  );
  const scholarName = pickString(record.scholar_name, record.scholar_name_en, record.scholar_name_ar, record.scholar_full_name);
  const approved = context.approveScholars?.has(record.scholar_slug) || context.approveDatasets?.has(datasetName) || false;
  const verified = context.verifyScholars?.has(record.scholar_slug) || context.verifyDatasets?.has(datasetName) || false;

  return {
    id: buildStableId(record, sourceType, context.index || 0),
    source_type: sourceType,
    type: sourceType,
    title: title || 'Scholar source',
    collection_name: pickString(record.collection_name, record.collection_title, record.work_title, record.website_name),
    source_kind: pickString(record.source_kind),
    work_type: pickString(record.work_type),
    scholar_slug: pickString(record.scholar_slug),
    scholar_name: scholarName,
    scholar_name_ar: pickString(record.scholar_name_ar),
    scholar_name_en: pickString(record.scholar_name_en),
    scholar_full_name: pickString(record.scholar_full_name),
    scholar_death_year: toInteger(record.scholar_death_year),
    madhhab: pickString(record.madhhab),
    creed_school: pickString(record.creed_school),
    work_slug: pickString(record.work_slug),
    work_title: pickString(record.work_title, record.work_title_en, record.work_title_ar),
    work_title_ar: pickString(record.work_title_ar),
    work_title_en: pickString(record.work_title_en),
    work_author: pickString(record.work_author),
    work_language: pickString(record.work_language),
    collection_slug: pickString(record.collection_slug),
    collection_title: pickString(record.collection_title),
    website_name: pickString(record.website_name),
    volume: pickString(record.volume),
    page_number: toInteger(record.page_number),
    page_range: pickString(record.page_range),
    chapter_title: pickString(record.chapter_title),
    section_title: pickString(record.section_title),
    fatwa_reference: pickString(record.fatwa_reference, record.fatwa_number, record.reference_number),
    fatwa_number: pickString(record.fatwa_number, record.fatwa_reference, record.reference_number),
    reference_number: pickString(record.reference_number, record.fatwa_number, record.fatwa_reference),
    question_number: pickString(record.question_number),
    lecture_title: pickString(record.lecture_title),
    lecture_date: pickString(record.lecture_date),
    timestamp_start: pickString(record.timestamp_start),
    timestamp_end: pickString(record.timestamp_end),
    question_text: pickString(record.question_text),
    answer_text: pickString(record.answer_text),
    arabic_text: pickString(record.arabic_text),
    translation_text: pickString(record.translation_text),
    summary_text: pickString(record.summary_text, record.summary),
    explanation_text: pickString(record.explanation_text),
    quote_text: pickString(record.quote_text),
    language: pickString(record.language),
    translator: pickString(record.translator),
    translation_source: pickString(record.translation_source),
    source_url: pickString(record.source_url, record.url),
    original_source: pickString(record.original_source),
    publisher: pickString(record.publisher),
    edition: pickString(record.edition),
    dataset_name: datasetName,
    dataset_version: pickString(record.dataset_version, context.datasetVersion, DEFAULTS.datasetVersion),
    dataset_url: pickString(record.dataset_url),
    license_status: licenseStatus,
    attribution_text: pickString(record.attribution_text),
    attribution_url: pickString(record.attribution_url),
    requires_attribution: toBoolean(record.requires_attribution, false),
    source_usage_notes: pickString(record.source_usage_notes),
    approved_for_answers: approved === true,
    verified_by_admin: verified === true,
    admin_review_status: pickString(record.admin_review_status),
    review_notes: pickString(record.review_notes),
    reviewed_by: pickString(record.reviewed_by),
    reviewed_at: pickString(record.reviewed_at),
    topic_tags: normalizeTopicTags(record.topic_tags),
    metadata: {
      ...(record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata) ? record.metadata : {}),
      original_record: record,
      original_file: context.originalFile || null,
      imported_at: importedAt,
      importer_version: IMPORTER_VERSION,
      adapter: DEFAULTS.adapter,
      source_family: DEFAULTS.sourceFamily,
      dataset_name: datasetName,
      license_status: licenseStatus,
    },
  };
}

function validateScholarRow(row) {
  const warnings = [];
  if (!(row.source_type || row.source_kind)) warnings.push('missing source_type/source_kind');
  if (!(row.title || row.question_text || row.answer_text || row.arabic_text || row.translation_text)) warnings.push('missing title/content text');
  if (!(row.scholar_name_en || row.scholar_name_ar || row.work_title || row.source_url)) warnings.push('missing scholar/work/source identity');
  if (!SCHOLAR_SOURCE_TYPES.has(row.source_type)) warnings.push(`unsupported source_type: ${row.source_type}`);
  return warnings;
}

function normalizeScholarDataset(rootDir, options = {}) {
  const files = collectJsonFiles(rootDir);
  const warnings = [];
  const rows = [];
  const importedAt = options.importedAt || new Date().toISOString();

  files.forEach((file) => {
    let parsed;
    try {
      parsed = readJson(file);
    } catch (error) {
      warnings.push(`${file}: ${error.message}`);
      return;
    }

    extractRecordCandidates(parsed).forEach((record, index) => {
      const row = normalizeScholarRecord(record, {
        ...options,
        index: rows.length + index,
        importedAt,
        originalFile: file,
      });
      const rowWarnings = validateScholarRow(row);
      warnings.push(...rowWarnings.map((warning) => `${path.basename(file)}:${row.id}: ${warning}`));
      if (rowWarnings.length < 3) rows.push(row);
    });
  });

  return {
    datasetRoot: rootDir,
    datasetDetected: files.length > 0 && rows.length > 0 ? 'generic-curated-scholar-json' : 'none',
    files,
    rows,
    warnings,
  };
}

module.exports = {
  DEFAULTS,
  IMPORTER_VERSION,
  SCHOLAR_SOURCE_TYPES,
  buildStableId,
  collectJsonFiles,
  extractRecordCandidates,
  inferSourceType,
  normalizeScholarDataset,
  normalizeScholarRecord,
  parseCliArgs,
  parseSet,
  pickString,
  slugify,
  toBoolean,
  toInteger,
  toTrimmedString,
  validateScholarRow,
};
