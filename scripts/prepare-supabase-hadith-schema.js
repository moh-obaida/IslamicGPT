#!/usr/bin/env node
const path = require('path');

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  dotenv.config();
} catch (_) {}

const { getSupabaseClient, isSupabaseConfigured } = require('../backend/src/supabaseSourceDb');

const REQUIRED_COLUMNS = [
  'collection_slug',
  'collection_name_ar',
  'collection_name_en',
  'collection_author_ar',
  'collection_author_en',
  'book_id',
  'book_number',
  'book_name_ar',
  'book_name_en',
  'chapter_id',
  'chapter_number',
  'chapter_name_ar',
  'chapter_name_en',
  'chapter_intro_ar',
  'chapter_intro_en',
  'hadith_number_global',
  'hadith_number_in_book',
  'hadith_number_in_chapter',
  'english_narrator',
  'grade',
  'translator',
  'dataset_name',
  'dataset_version',
  'original_source',
  'import_batch_id',
];

async function main() {
  console.log('Run supabase/hadith_schema_upgrade.sql in Supabase SQL Editor.');

  if (!isSupabaseConfigured()) {
    console.log('Supabase is not configured in this environment, so column inspection was skipped.');
    return;
  }

  const client = getSupabaseClient();
  try {
    const { data, error } = await client
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'islamic_sources');

    if (error) throw error;

    const existing = new Set((data || []).map((row) => row.column_name));
    const missing = REQUIRED_COLUMNS.filter((column) => !existing.has(column));

    console.log(`Detected ${existing.size} visible columns on islamic_sources.`);
    if (!missing.length) {
      console.log('Hadith hierarchy columns already appear to be present.');
    } else {
      console.log(`Missing columns: ${missing.join(', ')}`);
    }
  } catch (error) {
    console.log(`Could not inspect current columns through Supabase JS: ${error.message}`);
    console.log('Please run the SQL file manually and verify the new columns in the Supabase dashboard.');
  }
}

main().catch((error) => {
  console.error(`Schema preparation check failed: ${error.message}`);
  process.exitCode = 1;
});
