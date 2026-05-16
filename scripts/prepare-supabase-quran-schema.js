#!/usr/bin/env node
const path = require('path');

const REQUIRED_COLUMNS = [
  'surah_number',
  'ayah_number',
  'ayah_global_number',
  'surah_name_ar',
  'surah_name_en',
  'juz',
  'hizb',
  'page_number',
  'revelation_place',
  'translator',
  'translation_name',
  'translation_language',
  'translation_source',
  'translation_source_url',
  'quran_text_style',
  'quran_arabic_source',
  'quran_edition',
  'license_status',
  'attribution_text',
  'attribution_url',
  'requires_attribution',
  'requires_sharealike_review',
  'dataset_url',
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
  console.log('Run supabase/quran_schema_upgrade.sql in Supabase SQL Editor.');

  let db;
  try {
    db = require('../backend/src/supabaseSourceDb');
  } catch (error) {
    console.log(`Could not load Supabase helper: ${error.message}`);
    return;
  }

  if (!db.isSupabaseConfigured()) {
    console.log('Supabase is not configured. Skipping column inspection.');
    console.log(`Required Quran columns: ${REQUIRED_COLUMNS.join(', ')}`);
    return;
  }

  try {
    const client = db.getSupabaseClient();
    const { data, error } = await client.from(db.TABLE_NAME).select(REQUIRED_COLUMNS.join(',')).limit(1);
    if (!error) {
      console.log('Column inspection succeeded. Quran columns appear queryable.');
      if (data) console.log(`Checked ${REQUIRED_COLUMNS.length} Quran column(s).`);
      return;
    }

    const missing = REQUIRED_COLUMNS.filter((column) => String(error.message || '').includes(column));
    if (missing.length) {
      console.log(`Missing Quran column(s) detected: ${missing.join(', ')}`);
    } else {
      console.log(`Column inspection was inconclusive: ${error.message}`);
    }
    console.log('Apply supabase/quran_schema_upgrade.sql manually before importing Quran rows.');
  } catch (error) {
    console.log(`Column inspection failed gracefully: ${error.message}`);
    console.log('Apply supabase/quran_schema_upgrade.sql manually before importing Quran rows.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Quran schema preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { REQUIRED_COLUMNS, main };
