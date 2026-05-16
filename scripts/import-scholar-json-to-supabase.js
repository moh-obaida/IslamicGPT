#!/usr/bin/env node
const path = require('path');
const {
  normalizeScholarDataset,
  parseCliArgs,
} = require('./scholar-json-utils');

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

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

async function main(argv = process.argv.slice(2)) {
  const { options, positionals } = parseCliArgs(argv);
  const datasetRoot = path.resolve(positionals[0] || 'data/imports/scholars');
  const importedAt = new Date().toISOString();
  const analysis = normalizeScholarDataset(datasetRoot, { ...options, importedAt });
  const rows = Number.isFinite(options.limit) && options.limit > 0 ? analysis.rows.slice(0, options.limit) : analysis.rows;

  console.log(`Dataset root: ${analysis.datasetRoot}`);
  console.log(`Dataset detected: ${analysis.datasetDetected}`);
  console.log(`Mode: ${options.execute ? 'execute' : 'dry-run'}`);
  console.log(`Rows prepared: ${rows.length}`);
  console.log(`Approved scholars: ${options.approveScholars.size ? [...options.approveScholars].join(', ') : 'none'}`);
  console.log(`Verified scholars: ${options.verifyScholars.size ? [...options.verifyScholars].join(', ') : 'none'}`);
  console.log(`Approved datasets: ${options.approveDatasets.size ? [...options.approveDatasets].join(', ') : 'none'}`);
  console.log(`Verified datasets: ${options.verifyDatasets.size ? [...options.verifyDatasets].join(', ') : 'none'}`);
  console.log(`Counts by scholar: ${JSON.stringify(countBy(rows, 'scholar_slug'))}`);
  console.log(`Counts by source type: ${JSON.stringify(countBy(rows, 'source_type'))}`);
  console.log(`License status default: ${options.licenseStatus}`);

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

  console.log(`Successfully upserted ${written} scholar source row(s) into Supabase.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Scholar import failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
