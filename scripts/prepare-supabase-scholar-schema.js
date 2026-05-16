#!/usr/bin/env node
const path = require('path');

const REQUIRED_COLUMNS = [
  'source_kind',
  'work_type',
  'scholar_slug',
  'scholar_name_ar',
  'scholar_name_en',
  'scholar_full_name',
  'scholar_death_year',
  'madhhab',
  'creed_school',
  'work_slug',
  'work_title',
  'work_title_ar',
  'work_title_en',
  'work_author',
  'work_language',
  'collection_title',
  'website_name',
  'volume',
  'page_range',
  'chapter_title',
  'section_title',
  'fatwa_number',
  'question_number',
  'lecture_title',
  'lecture_date',
  'timestamp_start',
  'timestamp_end',
  'question_text',
  'answer_text',
  'summary_text',
  'quote_text',
  'language',
  'translation_source',
  'publisher',
  'edition',
  'source_usage_notes',
  'admin_review_status',
  'review_notes',
  'reviewed_by',
  'reviewed_at',
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
  console.log('Run supabase/scholar_schema_upgrade.sql in Supabase SQL Editor.');

  let db;
  try {
    db = require('../backend/src/supabaseSourceDb');
  } catch (error) {
    console.log(`Could not load Supabase helper: ${error.message}`);
    console.log(`Required Scholar columns: ${REQUIRED_COLUMNS.join(', ')}`);
    return;
  }

  if (!db.isSupabaseConfigured()) {
    console.log('Supabase is not configured. Skipping column inspection.');
    console.log(`Required Scholar columns: ${REQUIRED_COLUMNS.join(', ')}`);
    return;
  }

  try {
    const client = db.getSupabaseClient();
    const { data, error } = await client.from(db.TABLE_NAME).select(REQUIRED_COLUMNS.join(',')).limit(1);
    if (!error) {
      console.log('Column inspection succeeded. Scholar columns appear queryable.');
      if (data) console.log(`Checked ${REQUIRED_COLUMNS.length} Scholar column(s).`);
      return;
    }

    const missing = REQUIRED_COLUMNS.filter((column) => String(error.message || '').includes(column));
    if (missing.length) console.log(`Missing Scholar column(s) detected: ${missing.join(', ')}`);
    else console.log(`Column inspection was inconclusive: ${error.message}`);
    console.log('Apply supabase/scholar_schema_upgrade.sql manually before importing Scholar rows.');
  } catch (error) {
    console.log(`Column inspection failed gracefully: ${error.message}`);
    console.log('Apply supabase/scholar_schema_upgrade.sql manually before importing Scholar rows.');
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Scholar schema preparation failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { REQUIRED_COLUMNS, main };
