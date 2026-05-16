#!/usr/bin/env node
const path = require('path');

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', 'backend', '.env') });
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
  dotenv.config();
} catch (_) {}

const { countSources, getSourceById, isSupabaseConfigured, upsertSource } = require('../backend/src/supabaseSourceDb');

async function main() {
  if (!isSupabaseConfigured()) {
    console.error('Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in backend/.env or .env.');
    process.exitCode = 1;
    return;
  }

  const starterSources = [
    {
      id: 'hadith-bukhari-1-intention',
      source_type: 'hadith',
      title: 'Actions are judged by intentions',
      collection_slug: 'bukhari',
      collection_name: 'Sahih al-Bukhari',
      collection_name_en: 'Sahih al-Bukhari',
      hadith_number: '1',
      hadith_number_global: '1',
      hadith_number_in_book: '1',
      arabic_text: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ',
      translation_text: 'Actions are judged by intentions, and every person will have only what they intended.',
      topic_tags: ['intention', 'niyyah', 'sincerity', 'actions', 'نية', 'الأعمال بالنيات'],
      approved_for_answers: true,
      verified_by_admin: true,
      admin_managed: true,
      metadata: {
        seed: true,
        starter: true,
        manual_verification_required_for_full_text: true,
      },
    },
  ];

  let seeded = 0;
  for (const source of starterSources) {
    const existing = await getSourceById(source.id);
    const safeSource = existing.ok && existing.record ? {
      ...existing.record,
      ...source,
      arabic_text: existing.record.arabic_text && existing.record.arabic_text.length > String(source.arabic_text || '').length ? existing.record.arabic_text : source.arabic_text,
      translation_text: existing.record.translation_text && existing.record.translation_text.length > String(source.translation_text || '').length ? existing.record.translation_text : source.translation_text,
      metadata: { ...(existing.record.metadata || {}), ...(source.metadata || {}) },
    } : source;
    const result = await upsertSource(safeSource);
    if (!result.ok) {
      console.error(`Failed to seed ${source.id}: ${result.error}`);
      process.exitCode = 1;
      return;
    }
    seeded += 1;
  }

  const counts = await countSources();
  console.log(`Seeded ${seeded} essential source(s) into Supabase.`);
  console.log(`Supabase totals -> total: ${counts.total}, approved: ${counts.approved}, verified: ${counts.verified}`);
  console.log(`Supabase types -> ${JSON.stringify(counts.byType)}`);
}

main().catch((error) => {
  console.error(`Supabase seed failed: ${error.message}`);
  process.exitCode = 1;
});
