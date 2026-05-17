#!/usr/bin/env node
const path = require('path');
const {
  normalizeQuranDataset,
  parseCliArgs,
} = require('./quran-json-utils');

function loadEnv() {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
    dotenv.config();
  } catch (_) {}
}

function chunk(array, size) {
  const out = [];
  for (let index = 0; index < array.length; index += size) out.push(array.slice(index, index + size));
  return out;
}

function printHelp() {
  console.log('Usage: node scripts/import-quran-json-to-supabase.js [datasetRoot] [options]');
  console.log('');
  console.log('Options:');
  console.log('  --help                         Show this help and exit.');
  console.log('  --dry-run                      Dry-run mode (default).');
  console.log('  --execute                      Execute Supabase upsert.');
  console.log('  --only <refs>                  Comma-separated refs, e.g. "1:1, 1:2, 2:255".');
  console.log('  --surah <numbers>              Comma-separated surah numbers, e.g. "1,112,113".');
  console.log('  --limit <n>                    Positive numeric cap after filtering.');
  console.log('  --approved-for-answers         Set approved_for_answers=true.');
  console.log('  --verified-by-admin            Set verified_by_admin=true.');
  console.log('  --batch-size <n>               Supabase upsert batch size (default: 500).');
}

function parseRefList(raw) {
  if (!raw) return null;
  const refs = raw.split(',').map((item) => item.trim()).filter(Boolean);
  const parsed = new Set();
  for (const ref of refs) {
    if (!/^\d{1,3}:\d{1,3}$/.test(ref)) throw new Error(`Invalid --only ref "${ref}". Expected format surah:ayah, e.g. 2:255.`);
    parsed.add(ref);
  }
  return parsed;
}

function parseSurahList(raw) {
  if (!raw) return null;
  const values = raw.split(',').map((item) => item.trim()).filter(Boolean);
  const surahs = new Set();
  for (const value of values) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number) || number <= 0) throw new Error(`Invalid --surah value "${value}". Use positive surah numbers.`);
    surahs.add(number);
  }
  return surahs;
}

async function main(argv = process.argv.slice(2)) {
  const { options, positionals } = parseCliArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  if (options.limit !== null && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error('Invalid --limit value. Use a positive integer.');
  }

  const onlyRefs = parseRefList(options.onlyRefs);
  const surahNumbers = parseSurahList(options.surahNumbers);
  const datasetRoot = path.resolve(positionals[0] || 'data/imports/quran-json');
  const importedAt = new Date().toISOString();
  const analysis = normalizeQuranDataset(datasetRoot, { ...options, importedAt });
  let rows = analysis.rows;
  if (onlyRefs) rows = rows.filter((row) => onlyRefs.has(`${row.surah_number}:${row.ayah_number}`));
  if (surahNumbers) rows = rows.filter((row) => surahNumbers.has(row.surah_number));
  if (Number.isFinite(options.limit) && options.limit > 0) rows = rows.slice(0, options.limit);
  const countsBySurah = rows.reduce((acc, row) => {
    acc[row.surah_number] = (acc[row.surah_number] || 0) + 1;
    return acc;
  }, {});

  console.log(`Dataset root: ${analysis.datasetRoot}`);
  console.log(`Dataset detected: ${analysis.datasetDetected}`);
  console.log(`Mode: ${options.execute ? 'execute' : 'dry-run'}`);
  console.log(`Rows prepared: ${rows.length}`);
  console.log(`JSON files analyzed: ${analysis.filesAnalyzed}`);
  console.log(`Ayah files processed: ${analysis.ayahFilesProcessed || 0}`);
  console.log(`Metadata files skipped: ${analysis.metadataFilesSkipped || 0}`);
  console.log(`Approved for answers: ${options.approve === true}`);
  console.log(`Verified by admin: ${options.verify === true}`);
  console.log(`Counts by surah: ${JSON.stringify(countsBySurah)}`);
  console.log(`License: ${options.licenseStatus}`);
  console.log(`Requires attribution: ${options.requiresAttribution}`);
  console.log(`Requires ShareAlike review: ${options.requiresSharealikeReview}`);

  if (rows[0]) {
    console.log('Sample row:');
    console.log(JSON.stringify(rows[0], null, 2));
  }
  if (analysis.warnings.length) {
    console.log('Warnings:');
    analysis.warnings.slice(0, 25).forEach((warning) => console.log(`- ${warning}`));
    if (analysis.warnings.length > 25) console.log(`- ...and ${analysis.warnings.length - 25} more warning(s)`);
  }

  if (!options.execute) {
    console.log('Dry-run only. No Supabase writes performed. Use --execute to upsert rows.');
    return;
  }

  loadEnv();
  const { TABLE_NAME, getSupabaseClient, isSupabaseConfigured, toDatabaseRow } = require('../backend/src/supabaseSourceDb');
  if (!isSupabaseConfigured()) {
    console.error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before using --execute.');
    process.exitCode = 1;
    return;
  }

  const client = getSupabaseClient();
  let written = 0;
  for (const batch of chunk(rows, options.batchSize || 500)) {
    const dbRows = batch.map((row) => toDatabaseRow(row));
    const { error } = await client.from(TABLE_NAME).upsert(dbRows, { onConflict: 'id' });
    if (error) {
      console.error(`Supabase batch upsert failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    written += dbRows.length;
    console.log(`Upserted batch of ${dbRows.length} row(s).`);
  }

  console.log(`Successfully upserted ${written} Quran row(s) into Supabase.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Quran import failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
