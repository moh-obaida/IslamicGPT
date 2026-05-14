#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'data', 'islamic-sources');
const FOLDERS = ['quran', 'hadith', 'tafsir', 'scholars', 'fatwas', 'uploads'];

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => path.join(dir, f));
}

function warn(arr, msg) { arr.push(msg); }

function validateSource(s, warnings) {
  if (!s.id || !s.source_type) warn(warnings, `Missing id/source_type for record: ${JSON.stringify(s).slice(0, 120)}`);

  if (s.source_type === 'quran') {
    if (!s.surah_number) warn(warnings, `${s.id}: Quran missing surah_number`);
    if (!(s.ayah_number || s.ayah_range)) warn(warnings, `${s.id}: Quran missing ayah_number/ayah_range`);
    if (!(s.arabic_text || s.translation_text)) warn(warnings, `${s.id}: Quran missing arabic_text/translation_text`);
  }

  if (s.source_type === 'hadith') {
    if (!s.collection_name) warn(warnings, `${s.id}: Hadith missing collection_name`);
    if (!(s.hadith_number || s.hadith_number_unavailable === true)) warn(warnings, `${s.id}: Hadith missing hadith_number and hadith_number_unavailable flag`);
    if (!(s.arabic_text || s.translation_text)) warn(warnings, `${s.id}: Hadith missing arabic_text/translation_text`);
    if (!s.grade) warn(warnings, `${s.id}: Hadith grade not provided (allowed but recommended)`);
  }

  if (['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript'].includes(s.source_type)) {
    if (!s.scholar_name) warn(warnings, `${s.id}: Scholar source missing scholar_name`);
    if (!(s.source_title || s.title)) warn(warnings, `${s.id}: Scholar source missing source_title/title`);
    if (!(s.url || s.page_number || s.fatwa_number || s.timestamp || s.local_reference || s.reference_number)) warn(warnings, `${s.id}: Scholar source missing exact reference`);
  }

  if (['uploaded_document', 'approved_pdf'].includes(s.source_type)) {
    if (!s.file_name) warn(warnings, `${s.id}: Uploaded document missing file_name`);
    if (typeof s.approved_for_answers !== 'boolean') warn(warnings, `${s.id}: Uploaded document missing approved_for_answers boolean`);
    if (!s.approved_by_admin) warn(warnings, `${s.id}: Uploaded document missing approved_by_admin`);
    if (!s.upload_status) warn(warnings, `${s.id}: Uploaded document missing upload_status`);
  }

  return s.verified_by_admin && s.approved_for_answers;
}

const warnings = [];
const indexed = [];

for (const folder of FOLDERS) {
  for (const file of listJsonFiles(path.join(ROOT, folder))) {
    let records = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!Array.isArray(records)) records = [records];

    for (const source of records) {
      const canInclude = validateSource(source, warnings);
      if (canInclude) indexed.push(source);
      else warn(warnings, `${source.id || 'unknown'}: excluded from answer index (not approved/verified)`);
    }
  }
}

const output = {
  generated_at: new Date().toISOString(),
  total_indexed: indexed.length,
  records: indexed,
};

const outPath = path.join(ROOT, 'indexes', 'compiled-sources.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`Indexed ${indexed.length} approved sources -> ${outPath}`);
if (warnings.length) {
  console.log('\nWarnings:');
  warnings.forEach((w) => console.log(`- ${w}`));
}
