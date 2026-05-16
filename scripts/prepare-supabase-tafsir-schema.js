#!/usr/bin/env node
const path = require('path');

const REQUIRED_COLUMNS = [
  'tafsir_edition_slug',
  'tafsir_book_name',
  'tafsir_book_name_ar',
  'tafsir_book_name_en',
  'tafsir_author',
  'tafsir_author_ar',
  'tafsir_author_en',
  'tafsir_language',
  'ayah_start',
  'ayah_end',
  'ayah_range',
  'explanation_text',
  'repo_license',
  'dataset_url',
  'attribution_text',
  'attribution_url',
  'requires_attribution',
];

function loadEnv() {
  try {
    const dotenv = require('dotenv');
    dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
    dotenv.config({ path: path.join(__dirname, '..', '.env') });
    dotenv.config();
  } catch (_) {}
}

async function main() {
  loadEnv();
  console.log('Run supabase/tafsir_schema_upgrade.sql in Supabase SQL Editor.');

  let db;
  try {
    db = require('../backend/src/supabaseSourceDb');
  } catch (error) {
    console.log(`Could not load Supabase helper: ${error.message}`);
    console.log(`Required Tafsir columns: ${REQUIRED_COLUMNS.join(', ')}`);
    return;
  }

  if (!db.isSupabaseConfigured()) {
    console.log('Supabase is not configured. Skipping column inspection.');
    console.log(`Required Tafsir columns: ${REQUIRED_COLUMNS.join(', ')}`);
    return;
  }

  try {
    const client = db.getSupabaseClient();
    const { data, error } = await client.from(db.TABLE_NAME).select(REQUIRED_COLUMNS.join(',')).limit(1);
    if (!error) {
      console.log('Column inspection succeeded. Tafsir columns appear queryable.');
      if (data) console.log(`Checked ${REQUIRED_COLUMNS.length} Tafsir column(s).`);
      return;
    }

    const missing = REQUIRED_COLUMNS.filter((column) => String(error.message || '').includes(column));
    if (missing.length) console.log(`Missing Tafsir column(s) detected: ${missing.join(', ')}`);
    else console.log(`Column inspection was inconclusive: ${error.message}`);
    console.log('Apply supabase/tafsir_schema_upgrade.sql manually before importing Tafsir rows.');
  } catch (error) {
    console.log(`Column inspection failed gracefully: ${error.message}`);
    console.log('Apply supabase/tafsir_schema_upgrade.sql manually before importing Tafsir rows.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Tafsir schema preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { REQUIRED_COLUMNS, main };
