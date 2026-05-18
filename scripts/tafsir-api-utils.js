#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_TAFSIR_METADATA = {
  datasetName: 'spa5k/tafsir_api',
  datasetVersion: null,
  datasetUrl: 'https://github.com/spa5k/tafsir_api',
  repoLicense: 'MIT',
  licenseStatus: 'MIT-repo-content-source-needs-review',
  requiresAttribution: true,
  attributionText: 'Tafsir data from spa5k/tafsir_api. Review each edition original source before approval.',
  attributionUrl: 'https://github.com/spa5k/tafsir_api',
};

function toInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickString(...values) {
  for (const value of values) {
    const text = toTrimmedString(value);
    if (text) return text;
  }
  return null;
}

function pickNumber(...values) {
  for (const value of values) {
    const number = toInteger(value);
    if (number !== null) return number;
  }
  return null;
}

function looksArabic(value) {
  return /[\u0600-\u06FF]/.test(String(value || ''));
}

function parseSet(value) {
  if (!value) return new Set();
  return new Set(String(value).split(',').map((entry) => entry.trim()).filter(Boolean));
}

function parseOnlyRefs(value) {
  const refs = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const parsed = new Set();
  for (const ref of refs) {
    if (!/^\d{1,3}:\d{1,3}$/.test(ref)) throw new Error(`Invalid --only ref "${ref}". Expected format surah:ayah (e.g. 2:255).`);
    parsed.add(ref);
  }
  return parsed;
}

function parseSurahFilter(value) {
  const parts = String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const parsed = new Set();
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) throw new Error(`Invalid --surah value "${part}". Expected comma-separated surah numbers (e.g. 1,2,112).`);
    const surah = Number.parseInt(part, 10);
    if (!Number.isFinite(surah) || surah <= 0) throw new Error(`Invalid --surah value "${part}". Surah numbers must be positive integers.`);
    parsed.add(surah);
  }
  return parsed;
}

function parseCliArgs(argv) {
  const options = {
    dryRun: true,
    execute: false,
    limit: null,
    batchSize: 500,
    editions: null,
    onlyRefs: null,
    surahFilter: null,
    showHelp: false,
    approvedForAnswers: false,
    verifiedByAdmin: false,
    approveEditions: new Set(),
    verifyEditions: new Set(),
    ...DEFAULT_TAFSIR_METADATA,
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const takeValue = () => {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${arg}.`);
      i += 1;
      return next;
    };
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
    if (arg === '--help') {
      options.showHelp = true;
      continue;
    }
    if (arg === '--approved-for-answers') {
      options.approvedForAnswers = true;
      continue;
    }
    if (arg === '--verified-by-admin') {
      options.verifiedByAdmin = true;
      continue;
    }
    if (arg === '--only') {
      options.onlyRefs = parseOnlyRefs(takeValue());
      continue;
    }
    if (arg === '--surah') {
      options.surahFilter = parseSurahFilter(takeValue());
      continue;
    }
    if (arg === '--limit') {
      const value = Number.parseInt(takeValue(), 10);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid --limit value "${argv[i]}". Limit must be a positive integer.`);
      options.limit = value;
      continue;
    }

    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) throw new Error(`Unknown option: ${arg}`);
    const [, rawName, rawValue] = match;
    const value = rawValue.replace(/^"|"$/g, '');
    if (rawName === 'limit') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`Invalid --limit value "${value}". Limit must be a positive integer.`);
      options.limit = parsed;
    }
    else if (rawName === 'batch-size') options.batchSize = Number.parseInt(value, 10) || 500;
    else if (rawName === 'editions') options.editions = parseSet(value);
    else if (rawName === 'approve-editions') options.approveEditions = parseSet(value);
    else if (rawName === 'verify-editions') options.verifyEditions = parseSet(value);
    else if (rawName === 'only') options.onlyRefs = parseOnlyRefs(value);
    else if (rawName === 'surah') options.surahFilter = parseSurahFilter(value);
    else if (rawName === 'dataset-name') options.datasetName = value || options.datasetName;
    else if (rawName === 'dataset-version') options.datasetVersion = value || options.datasetVersion;
    else if (rawName === 'dataset-url') options.datasetUrl = value || options.datasetUrl;
    else if (rawName === 'repo-license') options.repoLicense = value || options.repoLicense;
    else if (rawName === 'license-status') options.licenseStatus = value || options.licenseStatus;
    else throw new Error(`Unknown option: --${rawName}`);
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

function relativeJsonPath(rootDir, filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, '/');
}

function detectDatasetStructures(files, rootDir) {
  const rels = new Set(files.map((file) => relativeJsonPath(rootDir, file)));
  return {
    hasEditionsFile: rels.has('tafsir/editions.json'),
    hasSurahFiles: [...rels].some((rel) => /^tafsir\/[^/]+\/\d+\.json$/i.test(rel)),
    hasAyahFiles: [...rels].some((rel) => /^tafsir\/[^/]+\/\d+\/\d+\.json$/i.test(rel)),
  };
}

function extractEditionCandidates(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  return [
    ...toArray(parsed.editions),
    ...toArray(parsed.data),
    ...toArray(parsed.resources),
    ...toArray(parsed.tafsir),
  ].filter((entry) => entry && typeof entry === 'object');
}

function normalizeEdition(entry = {}, fallbackSlug = null) {
  const slug = pickString(entry.slug, entry.id, entry.resource_id, entry.key, fallbackSlug);
  const name = pickString(entry.name, entry.title, entry.resource_name, entry.book_name, entry.english_name, entry.name_en);
  const author = pickString(entry.author, entry.author_name, entry.authorName, entry.author_en);
  const source = pickString(entry.source, entry.original_source, entry.source_name, entry.source_url, entry.url);
  const language = pickString(entry.language, entry.language_name, entry.lang, entry.locale);
  return {
    slug,
    name,
    name_ar: pickString(entry.name_ar, entry.arabic_name, looksArabic(name) ? name : null),
    name_en: pickString(entry.name_en, entry.english_name, !looksArabic(name) ? name : null),
    author,
    author_ar: pickString(entry.author_ar, entry.arabic_author, looksArabic(author) ? author : null),
    author_en: pickString(entry.author_en, entry.english_author, !looksArabic(author) ? author : null),
    language,
    source,
    source_url: pickString(entry.source_url, entry.url),
    raw: entry,
  };
}

function loadEditionMetadata(rootDir, files, warnings) {
  const editions = new Map();
  const editionsFile = files.find((file) => relativeJsonPath(rootDir, file) === 'tafsir/editions.json');
  if (!editionsFile) {
    warnings.push('tafsir/editions.json not found.');
    return editions;
  }

  try {
    const parsed = readJson(editionsFile);
    for (const candidate of extractEditionCandidates(parsed)) {
      const edition = normalizeEdition(candidate);
      if (edition.slug) editions.set(edition.slug, edition);
    }
  } catch (error) {
    warnings.push(`tafsir/editions.json: ${error.message}`);
  }
  return editions;
}

function pathContext(rootDir, filePath) {
  const rel = relativeJsonPath(rootDir, filePath);
  let match = rel.match(/^tafsir\/([^/]+)\/(\d+)\.json$/i);
  if (match) return { rel, editionSlug: match[1], surah: toInteger(match[2]), ayah: null, layout: 'surah_file' };
  match = rel.match(/^tafsir\/([^/]+)\/(\d+)\/(\d+)\.json$/i);
  if (match) return { rel, editionSlug: match[1], surah: toInteger(match[2]), ayah: toInteger(match[3]), layout: 'ayah_file' };
  return { rel, editionSlug: null, surah: null, ayah: null, layout: 'unknown' };
}

function parseVerseKey(value) {
  const text = toTrimmedString(value);
  if (!text) return {};
  const match = text.match(/(\d{1,3})\s*[:/-]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/);
  if (!match) return {};
  return {
    surah: toInteger(match[1]),
    ayah: toInteger(match[2]),
    ayahEnd: toInteger(match[3]),
  };
}

function extractRecordText(entry = {}) {
  const explanation = pickString(
    entry.explanation_text,
    entry.explanation,
    entry.tafsir,
    entry.text,
    entry.content,
    entry.body,
    entry.translation,
    entry.translation_text,
    entry.english,
  );
  const arabic = pickString(entry.arabic_text, entry.arabic, entry.ayah_text, entry.quran_text, entry.text_uthmani);
  const translation = pickString(entry.translation_text, entry.meaning, entry.translation_en);
  return { explanation_text: explanation, arabic_text: arabic, translation_text: translation };
}

function extractTafsirEntries(parsed, context) {
  if (Array.isArray(parsed)) {
    return parsed.map((entry, index) => ({ entry, inferredAyah: index + 1 }));
  }
  if (!parsed || typeof parsed !== 'object') return [];

  const arrays = [
    ...toArray(parsed.ayahs),
    ...toArray(parsed.ayas),
    ...toArray(parsed.verses),
    ...toArray(parsed.tafsir),
    ...toArray(parsed.data),
  ].filter((entry) => entry && typeof entry === 'object');
  if (arrays.length) return arrays.map((entry, index) => ({ entry, inferredAyah: index + 1 }));

  const keyedEntries = Object.entries(parsed)
    .filter(([key, value]) => /^\d+$/.test(key) && value)
    .map(([key, value]) => ({
      entry: typeof value === 'object' ? { ayah: key, ...value } : { ayah: key, text: value },
      inferredAyah: toInteger(key),
    }));
  if (keyedEntries.length) return keyedEntries;

  return [{ entry: parsed, inferredAyah: context.ayah }];
}

function buildNormalizedRow(entry, context, editionMetadata, options = {}) {
  const defaults = { ...DEFAULT_TAFSIR_METADATA, ...options };
  const verseKey = parseVerseKey(entry.verse_key || entry.key || entry.reference);
  const surah = pickNumber(verseKey.surah, entry.surah, entry.surah_number, entry.chapter_id, context.surah);
  const ayah = pickNumber(verseKey.ayah, entry.ayah, entry.aya, entry.ayah_number, entry.verse_number, entry.number, context.ayah, context.inferredAyah);
  const ayahStart = pickNumber(entry.ayah_start, entry.from, ayah);
  const ayahEnd = pickNumber(entry.ayah_end, entry.to, verseKey.ayahEnd, ayahStart);
  const ayahRange = pickString(entry.ayah_range, ayahEnd && ayahStart && ayahEnd !== ayahStart ? `${ayahStart}-${ayahEnd}` : ayahStart ? String(ayahStart) : null);
  const editionSlug = context.editionSlug;
  const edition = editionMetadata || normalizeEdition({}, editionSlug);
  const text = extractRecordText(entry);
  const bookName = pickString(edition.name, edition.name_en, edition.name_ar, editionSlug);
  const author = pickString(edition.author, edition.author_en, edition.author_ar);
  const originalSource = pickString(entry.original_source, entry.source, entry.source_name, edition.source);
  const importedAt = defaults.importedAt || new Date().toISOString();

  return {
    id: `tafsir-${editionSlug}-${surah}-${ayah}`,
    source_type: 'tafsir',
    title: bookName && surah && ayahRange ? `${bookName}, Tafsir of ${surah}:${ayahRange}` : 'Tafsir source',
    collection_name: 'Tafsir',
    surah,
    ayah,
    surah_number: surah,
    ayah_number: ayah,
    ayah_start: ayahStart,
    ayah_end: ayahEnd,
    ayah_range: ayahRange,
    surah_name_ar: pickString(entry.surah_name_ar, entry.chapter_name_ar),
    surah_name_en: pickString(entry.surah_name_en, entry.chapter_name_en, entry.surah_name),
    tafsir_edition_slug: editionSlug,
    tafsir_book_name: bookName,
    tafsir_book_name_ar: pickString(edition.name_ar, looksArabic(bookName) ? bookName : null),
    tafsir_book_name_en: pickString(edition.name_en, !looksArabic(bookName) ? bookName : null),
    tafsir_author: author,
    tafsir_author_ar: pickString(edition.author_ar, looksArabic(author) ? author : null),
    tafsir_author_en: pickString(edition.author_en, !looksArabic(author) ? author : null),
    tafsir_language: edition.language,
    arabic_text: text.arabic_text,
    translation_text: text.translation_text,
    explanation_text: text.explanation_text,
    original_source: originalSource,
    source_url: pickString(entry.source_url, entry.url, edition.source_url),
    dataset_name: defaults.datasetName,
    dataset_version: defaults.datasetVersion,
    dataset_url: defaults.datasetUrl,
    repo_license: defaults.repoLicense,
    license_status: defaults.licenseStatus,
    attribution_text: defaults.attributionText,
    attribution_url: defaults.attributionUrl,
    requires_attribution: defaults.requiresAttribution === true || defaults.requiresAttribution === 'true',
    approved_for_answers: defaults.approveEditions instanceof Set && defaults.approveEditions.has(editionSlug),
    verified_by_admin: defaults.verifyEditions instanceof Set && defaults.verifyEditions.has(editionSlug),
    topic_tags: ['tafsir', editionSlug, entry.topic, entry.subject].filter(Boolean),
    metadata: {
      original_record: entry,
      original_file: context.rel,
      edition_metadata: edition.raw || null,
      imported_at: importedAt,
      importer_version: 'tafsir-api-v1',
      dataset_name: defaults.datasetName,
      dataset_url: defaults.datasetUrl,
      repo_license: defaults.repoLicense,
      license_status: defaults.licenseStatus,
      original_source: originalSource,
    },
  };
}


function parseTafsirPathKind(rel = '') {
  let match = rel.match(/^tafsir\/([^/]+)\/(\d+)\.json$/i);
  if (match) return { kind: 'aggregate', editionSlug: match[1], surah: Number(match[2]), ayah: null };
  match = rel.match(/^tafsir\/([^/]+)\/(\d+)\/(\d+)\.json$/i);
  if (match) return { kind: 'ayah', editionSlug: match[1], surah: Number(match[2]), ayah: Number(match[3]) };
  return { kind: 'other', editionSlug: null, surah: null, ayah: null };
}

function isExpectedMirrorDuplicate(existingFile, incomingFile, row) {
  const existing = parseTafsirPathKind(existingFile);
  const incoming = parseTafsirPathKind(incomingFile);
  if (!existing.editionSlug || !incoming.editionSlug) return false;
  if (existing.editionSlug !== incoming.editionSlug) return false;
  if (existing.surah !== incoming.surah) return false;
  if (Number(row?.ayah) !== Number(row?.ayah_number)) return false;
  if (incoming.kind === 'ayah' && incoming.ayah !== Number(row?.ayah)) return false;
  if (existing.kind === 'ayah' && existing.ayah !== Number(row?.ayah)) return false;
  return (
    (existing.kind === 'aggregate' && incoming.kind === 'ayah') ||
    (existing.kind === 'ayah' && incoming.kind === 'aggregate')
  );
}
function normalizeTafsirApiDataset(rootDir, options = {}) {
  const datasetRoot = path.resolve(rootDir || 'data/imports/tafsir-api');
  const files = collectJsonFiles(datasetRoot);
  const structures = detectDatasetStructures(files, datasetRoot);
  const warnings = [];
  const editions = loadEditionMetadata(datasetRoot, files, warnings);
  const rows = [];
  const rowsById = new Map();
  let filesAnalyzed = 0;
  let duplicateMirrorRowsSkipped = 0;

  for (const file of files) {
    const context = pathContext(datasetRoot, file);
    if (!context.editionSlug) continue;
    if (options.editions instanceof Set && options.editions.size && !options.editions.has(context.editionSlug)) continue;

    let parsed;
    try {
      parsed = readJson(file);
    } catch (error) {
      warnings.push(`${context.rel}: ${error.message}`);
      continue;
    }

    filesAnalyzed += 1;
    const entries = extractTafsirEntries(parsed, context);
    if (!entries.length) warnings.push(`${context.rel}: no tafsir ayah rows detected.`);
    for (const { entry, inferredAyah } of entries) {
      const row = buildNormalizedRow(entry, { ...context, inferredAyah }, editions.get(context.editionSlug), options);
      if (!row.surah || !row.ayah || !row.explanation_text) {
        warnings.push(`${context.rel}: skipped row missing surah, ayah, or explanation_text.`);
        continue;
      }
      if (!editions.has(context.editionSlug)) warnings.push(`${context.rel}: edition metadata missing for ${context.editionSlug}.`);
      const existing = rowsById.get(row.id);
      if (existing) {
        const existingFile = existing.metadata?.original_file || '';
        const expectedMirror = isExpectedMirrorDuplicate(existingFile, context.rel, row);
        if (expectedMirror) {
          duplicateMirrorRowsSkipped += 1;
          const existingKind = parseTafsirPathKind(existingFile).kind;
          const incomingKind = parseTafsirPathKind(context.rel).kind;
          if (existingKind === 'ayah' && incomingKind === 'aggregate') {
            const existingIndex = rows.findIndex((candidate) => candidate.id === row.id);
            if (existingIndex >= 0) rows[existingIndex] = row;
            rowsById.set(row.id, row);
          }
          continue;
        }
        warnings.push(`Duplicate tafsir id "${row.id}" detected in ${context.rel}; canonical row from ${existingFile || 'unknown'} retained.`);
        continue;
      }
      rowsById.set(row.id, row);
      rows.push(row);
    }
  }

  rows.sort((a, b) => String(a.tafsir_edition_slug).localeCompare(String(b.tafsir_edition_slug)) || a.surah_number - b.surah_number || a.ayah_number - b.ayah_number);

  return {
    datasetRoot,
    datasetDetected: structures.hasEditionsFile || structures.hasSurahFiles || structures.hasAyahFiles ? DEFAULT_TAFSIR_METADATA.datasetName : 'none',
    files,
    filesAnalyzed,
    structures,
    editions,
    editionsDetected: editions.size,
    rows,
    totalSurahs: new Set(rows.map((row) => row.surah_number).filter(Boolean)).size,
    totalTafsirRows: rows.length,
    warnings: [...new Set(warnings)],
    duplicateMirrorRowsSkipped,
    sampleRow: rows[0] || null,
  };
}

module.exports = {
  DEFAULT_TAFSIR_METADATA,
  buildNormalizedRow,
  collectJsonFiles,
  detectDatasetStructures,
  normalizeTafsirApiDataset,
  parseCliArgs,
  toInteger,
  toTrimmedString,
};
