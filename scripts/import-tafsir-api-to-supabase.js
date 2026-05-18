#!/usr/bin/env node
const path = require('path');
const {
  normalizeTafsirApiDataset,
  parseCliArgs,
} = require('./tafsir-api-utils');

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
  console.log(`Usage: node scripts/import-tafsir-api-to-supabase.js [dataset-root] [options]

Options:
  --help                       Show this help message and exit
  --dry-run                    Prepare rows only (default)
  --execute                    Upsert prepared rows into Supabase
  --only <refs>                Comma-separated Quran refs (e.g. "1:1, 1:2, 2:255")
  --surah <numbers>            Comma-separated surah numbers (e.g. "1,112,113")
  --limit <n>                  Positive integer cap applied after filtering
  --approved-for-answers       Set approved_for_answers=true on prepared rows
  --verified-by-admin          Set verified_by_admin=true on prepared rows
  --editions=<slugs>           Optional edition slug filter
  --approve-editions=<slugs>   Mark specific editions approved_for_answers=true
  --verify-editions=<slugs>    Mark specific editions verified_by_admin=true`);
}

async function main(argv = process.argv.slice(2)) {
  const { options, positionals } = parseCliArgs(argv);
  if (options.showHelp) {
    printHelp();
    return;
  }
  const datasetRoot = path.resolve(positionals[0] || 'data/imports/tafsir-api');
  const importedAt = new Date().toISOString();
  const analysis = normalizeTafsirApiDataset(datasetRoot, { ...options, importedAt });
  let rows = analysis.rows;
  if (options.onlyRefs instanceof Set && options.onlyRefs.size) {
    rows = rows.filter((row) => options.onlyRefs.has(`${row.surah_number}:${row.ayah_number}`));
  }
  if (options.surahFilter instanceof Set && options.surahFilter.size) {
    rows = rows.filter((row) => options.surahFilter.has(row.surah_number));
  }
  if (options.approvedForAnswers) rows = rows.map((row) => ({ ...row, approved_for_answers: true }));
  if (options.verifiedByAdmin) rows = rows.map((row) => ({ ...row, verified_by_admin: true }));
  if (Number.isFinite(options.limit) && options.limit > 0) rows = rows.slice(0, options.limit);
  const countsByEdition = rows.reduce((acc, row) => {
    acc[row.tafsir_edition_slug] = (acc[row.tafsir_edition_slug] || 0) + 1;
    return acc;
  }, {});

  console.log(`Dataset root: ${analysis.datasetRoot}`);
  console.log(`Dataset detected: ${analysis.datasetDetected}`);
  console.log(`Mode: ${options.execute ? 'execute' : 'dry-run'}`);
  console.log(`Rows prepared: ${rows.length}`);
  console.log(`Duplicate mirror rows skipped: ${analysis.duplicateMirrorRowsSkipped || 0}`);
  console.log(`Editions selected: ${options.editions && options.editions.size ? [...options.editions].join(', ') : 'all detected editions'}`);
  console.log(`Approved editions: ${options.approveEditions.size ? [...options.approveEditions].join(', ') : 'none'}`);
  console.log(`Verified editions: ${options.verifyEditions.size ? [...options.verifyEditions].join(', ') : 'none'}`);
  console.log(`Only refs: ${options.onlyRefs && options.onlyRefs.size ? [...options.onlyRefs].join(', ') : 'none'}`);
  console.log(`Surah filter: ${options.surahFilter && options.surahFilter.size ? [...options.surahFilter].join(', ') : 'none'}`);
  console.log(`Counts by edition: ${JSON.stringify(countsByEdition)}`);
  console.log(`License status: ${options.licenseStatus}`);
  console.log(`Repo license: ${options.repoLicense}`);
  console.log(`Requires attribution: ${options.requiresAttribution}`);

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

  console.log(`Successfully upserted ${written} Tafsir row(s) into Supabase.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Tafsir import failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
