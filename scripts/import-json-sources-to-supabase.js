#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  dotenv.config();
} catch (_) {}

const { isSupabaseConfigured, upsertSource } = require('../backend/src/supabaseSourceDb');
const { listAllSourceRecords } = require('../backend/src/sourceStore');

function readJsonIfPresent(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function toInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function topicTagsFrom(record) {
  const candidates = [];
  if (Array.isArray(record.topic_tags)) candidates.push(...record.topic_tags);
  if (Array.isArray(record.keywords)) candidates.push(...record.keywords);
  if (typeof record.topic === 'string') candidates.push(...record.topic.split(/[;,|]/));
  if (typeof record.tags === 'string') candidates.push(...record.tags.split(/[;,|]/));
  if (Array.isArray(record.tags)) candidates.push(...record.tags);
  return [...new Set(candidates.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function stableIdFor(record) {
  if (record.id) return String(record.id).trim();

  const type = String(record.source_type || record.type || 'source').trim().toLowerCase() || 'source';
  if ((type === 'quran' || type === 'quran_translation') && (record.surah_number || record.surah) && (record.ayah_number || record.ayah)) {
    return `quran-${record.surah_number || record.surah}-${record.ayah_number || record.ayah}`;
  }
  if ((type === 'hadith' || type === 'hadith_explanation') && record.collection_name && record.hadith_number) {
    return `hadith-${slugify(record.collection_name)}-${slugify(record.hadith_number)}`;
  }

  const descriptive = record.title || record.source_title || record.document_title || record.collection_name || record.scholar_name || record.book_name || 'source';
  return `${type}-${slugify(descriptive) || Date.now()}`;
}

function normalizeRecord(record) {
  if (!record || typeof record !== 'object') return null;
  if (record.is_test_record === true) return null;

  const sourceType = String(record.source_type || record.type || '').trim();
  if (!sourceType) return null;

  return {
    id: stableIdFor(record),
    source_type: sourceType,
    title: record.title || record.source_title || record.document_title || record.source_name || null,
    collection_name: record.collection_name || null,
    book_name: record.book_name || null,
    chapter_name: record.chapter_name || null,
    hadith_number: record.hadith_number || null,
    surah: toInteger(record.surah || record.surah_number),
    ayah: toInteger(record.ayah || record.ayah_number),
    arabic_text: record.arabic_text || record.original_text || null,
    translation_text: record.translation_text || record.summary || record.extracted_text || null,
    scholar_name: record.scholar_name || null,
    fatwa_reference: record.fatwa_reference || record.fatwa_number || record.reference_number || record.local_reference || record.page_number || null,
    topic_tags: topicTagsFrom(record),
    approved_for_answers: record.approved_for_answers === true,
    verified_by_admin: record.verified_by_admin === true,
    admin_managed: record.admin_managed === true || record._source_folder === 'admin',
    source_url: record.source_url || record.url || null,
    metadata: {
      imported_from_json: true,
      source_name: record.source_name || null,
      source_folder: record._source_folder || null,
      file_name: record.file_name || null,
      original_id: record.id || null,
    },
  };
}

async function main() {
  if (!isSupabaseConfigured()) {
    console.error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env or .env.');
    process.exitCode = 1;
    return;
  }

  const compiledPath = path.join(__dirname, '..', 'data', 'islamic-sources', 'indexes', 'compiled-sources.json');
  const compiled = readJsonIfPresent(compiledPath, { records: [] });
  const local = listAllSourceRecords({ includeSourceMeta: true });
  const candidates = [...local.records, ...((compiled && Array.isArray(compiled.records)) ? compiled.records : [])];

  const seen = new Set();
  const countsByType = {};
  let imported = 0;
  let skipped = 0;

  for (const candidate of candidates) {
    const normalized = normalizeRecord(candidate);
    if (!normalized) {
      skipped += 1;
      continue;
    }

    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);

    const result = await upsertSource(normalized);
    if (!result.ok) {
      skipped += 1;
      console.warn(`Skipped ${normalized.id}: ${result.error}`);
      continue;
    }

    imported += 1;
    countsByType[normalized.source_type] = (countsByType[normalized.source_type] || 0) + 1;
  }

  console.log(`Imported ${imported} source(s) into Supabase.`);
  console.log(`Skipped ${skipped} source(s).`);
  console.log(`Counts by type -> ${JSON.stringify(countsByType)}`);
}

main().catch((error) => {
  console.error(`Supabase import failed: ${error.message}`);
  process.exitCode = 1;
});
