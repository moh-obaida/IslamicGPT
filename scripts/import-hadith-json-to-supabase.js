#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  collectJsonFiles,
  normalizeHadithJsonFile,
  parseCliArgs,
} = require('./hadith-json-utils');

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

async function main() {
  const { options, positionals } = parseCliArgs(process.argv.slice(2));
  const datasetRoot = path.resolve(positionals[0] || 'data/imports/hadith-json');
  const jsonFiles = collectJsonFiles(datasetRoot);

  if (!jsonFiles.length) {
    console.log(`No dataset files found under ${datasetRoot}.`);
    console.log('Dry-run complete. No Supabase writes were performed.');
    return;
  }

  const importBatchId = `hadith-import-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const importedAt = new Date().toISOString();
  const normalizedRows = [];
  const warnings = [];

  for (const file of jsonFiles) {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
      warnings.push(`${file}: ${error.message}`);
      continue;
    }

    const normalized = normalizeHadithJsonFile(file, parsed, {
      datasetName: options.datasetName,
      datasetVersion: options.datasetVersion,
      originalSource: options.originalSource,
      importBatchId,
      importedAt,
      adminManaged: false,
      verifiedByAdmin: false,
    });

    normalized.rows.forEach((row) => {
      if (options.collections && !options.collections.has(row.collection_slug)) return;
      const approved = options.approveCollections.has(row.collection_slug);
      normalizedRows.push({
        ...row,
        approved_for_answers: approved,
        verified_by_admin: false,
      });
    });
    warnings.push(...normalized.warnings.map((warning) => `${path.basename(file)}: ${warning}`));
  }

  const limitedRows = Number.isFinite(options.limit) && options.limit > 0 ? normalizedRows.slice(0, options.limit) : normalizedRows;
  const countsByCollection = limitedRows.reduce((acc, row) => {
    acc[row.collection_slug] = (acc[row.collection_slug] || 0) + 1;
    return acc;
  }, {});

  console.log(`Dataset root: ${datasetRoot}`);
  console.log(`Mode: ${options.execute ? 'execute' : 'dry-run'}`);
  console.log(`Rows prepared: ${limitedRows.length}`);
  console.log(`Collections selected: ${options.collections ? [...options.collections].join(', ') : 'all recognized collections'}`);
  console.log(`Approved collections: ${options.approveCollections.size ? [...options.approveCollections].join(', ') : 'none'}`);
  console.log(`Import batch id: ${importBatchId}`);
  console.log(`Counts by collection: ${JSON.stringify(countsByCollection)}`);
  if (limitedRows[0]) {
    console.log('Sample row:');
    console.log(JSON.stringify(limitedRows[0], null, 2));
  }
  if (warnings.length) {
    console.log('Warnings:');
    warnings.slice(0, 20).forEach((warning) => console.log(`- ${warning}`));
    if (warnings.length > 20) console.log(`- ...and ${warnings.length - 20} more warning(s)`);
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
  for (const batch of chunk(limitedRows, options.batchSize || 500)) {
    const rows = batch.map((row) => toDatabaseRow(row));
    const { error } = await client.from(TABLE_NAME).upsert(rows, { onConflict: 'id' });
    if (error) {
      console.error(`Supabase batch upsert failed: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    written += rows.length;
    console.log(`Upserted batch of ${rows.length} row(s).`);
  }

  console.log(`Successfully upserted ${written} hadith row(s) into Supabase.`);
}

main().catch((error) => {
  console.error(`Hadith import failed: ${error.message}`);
  process.exitCode = 1;
});
