#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const KNOWN_COLLECTIONS = {
  bukhari: {
    slug: 'bukhari',
    englishName: 'Sahih al-Bukhari',
    arabicName: 'صحيح البخاري',
    aliases: ['bukhari', 'sahih-bukhari', 'sahih_al_bukhari'],
  },
  muslim: {
    slug: 'muslim',
    englishName: 'Sahih Muslim',
    arabicName: 'صحيح مسلم',
    aliases: ['muslim', 'sahih-muslim', 'sahih_muslim'],
  },
  abudawud: {
    slug: 'abudawud',
    englishName: 'Sunan Abi Dawud',
    arabicName: 'سنن أبي داود',
    aliases: ['abudawud', 'abi-dawud', 'abi_dawud', 'abu-dawud', 'abu_dawud', 'dawud'],
  },
  tirmidhi: {
    slug: 'tirmidhi',
    englishName: 'Jami` at-Tirmidhi',
    arabicName: 'جامع الترمذي',
    aliases: ['tirmidhi', 'trimidhi'],
  },
  nasai: {
    slug: 'nasai',
    englishName: 'Sunan an-Nasa’i',
    arabicName: 'سنن النسائي',
    aliases: ['nasai', 'nasaai', 'nasaii', 'an-nasai', 'an_nasai'],
  },
  ibnmajah: {
    slug: 'ibnmajah',
    englishName: 'Sunan Ibn Majah',
    arabicName: 'سنن ابن ماجه',
    aliases: ['ibnmajah', 'ibn-majah', 'ibn_majah', 'majah'],
  },
  malik: {
    slug: 'malik',
    englishName: 'Muwatta Malik',
    arabicName: 'موطأ مالك',
    aliases: ['malik', 'muwatta', 'muwatta-malik', 'muwatta_malik'],
  },
  ahmad: {
    slug: 'ahmad',
    englishName: 'Musnad Ahmad',
    arabicName: 'مسند أحمد',
    aliases: ['ahmad', 'musnad-ahmad', 'musnad_ahmad'],
  },
  darimi: {
    slug: 'darimi',
    englishName: 'Sunan ad-Darimi',
    arabicName: 'سنن الدارمي',
    aliases: ['darimi', 'darmi', 'ad-darimi', 'ad_darimi'],
  },
};

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCliArgs(argv) {
  const options = {
    execute: false,
    dryRun: true,
    collections: null,
    approveCollections: new Set(),
    limit: null,
    batchSize: 500,
    datasetName: 'AhmedBaset/hadith-json',
    datasetVersion: 'v1.2.0',
    originalSource: 'Sunnah.com',
  };
  const positionals = [];

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    if (arg === '--execute') {
      options.execute = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      options.execute = false;
      continue;
    }
    if (arg.startsWith('--collections=')) {
      options.collections = new Set(arg.split('=', 2)[1].split(',').map((value) => value.trim()).filter(Boolean));
      continue;
    }
    if (arg.startsWith('--approve-collections=')) {
      options.approveCollections = new Set(arg.split('=', 2)[1].split(',').map((value) => value.trim()).filter(Boolean));
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = Number.parseInt(arg.split('=', 2)[1], 10);
      continue;
    }
    if (arg.startsWith('--batch-size=')) {
      options.batchSize = Number.parseInt(arg.split('=', 2)[1], 10) || 500;
      continue;
    }
    if (arg.startsWith('--dataset-name=')) {
      options.datasetName = arg.split('=', 2)[1] || options.datasetName;
      continue;
    }
    if (arg.startsWith('--dataset-version=')) {
      options.datasetVersion = arg.split('=', 2)[1] || options.datasetVersion;
      continue;
    }
    if (arg.startsWith('--original-source=')) {
      options.originalSource = arg.split('=', 2)[1] || options.originalSource;
    }
  }

  return { options, positionals };
}

function collectJsonFiles(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  const results = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (current.toLowerCase().endsWith('.json')) results.push(current);
  }

  return results.sort();
}

function inferCollectionSlug(filePath) {
  const lower = String(filePath || '').toLowerCase();
  for (const collection of Object.values(KNOWN_COLLECTIONS)) {
    if (collection.aliases.some((alias) => lower.includes(alias))) return collection.slug;
  }
  return slugify(path.basename(path.dirname(filePath)).replace(/\.json$/i, '')) || 'unknown';
}

function detectLayout(filePath, parsed) {
  const lower = String(filePath || '').toLowerCase();
  if (lower.includes('by_chapter')) return 'by_chapter';
  if (lower.includes('by_book')) return 'by_book';
  const sample = Array.isArray(parsed?.hadiths) && parsed.hadiths.length ? parsed.hadiths[0] : null;
  if (sample && (sample.chapterId !== undefined || sample.bookId !== undefined)) return 'by_chapter';
  return 'by_book';
}

function defaultCollectionMeta(slug) {
  return KNOWN_COLLECTIONS[slug] || {
    slug,
    englishName: slug,
    arabicName: null,
    aliases: [slug],
  };
}

function normalizeHadithJsonFile(filePath, parsed, options = {}) {
  const warnings = [];
  if (!parsed || typeof parsed !== 'object') {
    return { slug: inferCollectionSlug(filePath), layout: 'unknown', filePath, hadithCount: 0, rows: [], warnings: ['Invalid JSON object.'] };
  }

  const hadiths = Array.isArray(parsed.hadiths) ? parsed.hadiths : [];
  if (!Array.isArray(parsed.hadiths)) warnings.push('Missing hadiths array.');

  const slug = inferCollectionSlug(filePath);
  const layout = detectLayout(filePath, parsed);
  const defaults = defaultCollectionMeta(slug);
  const metadata = parsed.metadata || {};
  const metadataArabic = metadata.arabic || {};
  const metadataEnglish = metadata.english || {};
  const chapterIntroEn = metadataEnglish.introduction || null;
  const chapterIntroAr = metadataArabic.introduction || null;
  const collectionNameEn = metadataEnglish.title || defaults.englishName;
  const collectionNameAr = metadataArabic.title || defaults.arabicName;
  const collectionName = collectionNameEn || collectionNameAr || defaults.englishName;

  const rows = hadiths.map((hadith, index) => {
    const globalNumber = hadith.id !== undefined && hadith.id !== null ? String(hadith.id) : null;
    const narrator = hadith.english && typeof hadith.english === 'object' ? hadith.english.narrator || null : null;
    const translationText = hadith.english && typeof hadith.english === 'object' ? hadith.english.text || null : null;
    const stableId = globalNumber
      ? `hadith-${slug}-${globalNumber}`
      : `hadith-${slug}-book-${hadith.bookId || 'unknown'}-chapter-${hadith.chapterId || 'unknown'}-item-${index + 1}`;

    return {
      id: stableId,
      source_type: 'hadith',
      type: 'hadith',
      title: `${collectionName || defaults.englishName || 'Hadith'}, Hadith ${globalNumber || hadith.idInBook || index + 1}`,
      display_title: `${collectionName || defaults.englishName || 'Hadith'}, Hadith ${globalNumber || hadith.idInBook || index + 1}`,
      collection_slug: slug,
      collection_name: collectionName,
      collection_name_en: collectionNameEn,
      collection_name_ar: collectionNameAr,
      collection_author_en: metadataEnglish.author || null,
      collection_author_ar: metadataArabic.author || null,
      book_id: toInteger(hadith.bookId),
      book_number: hadith.bookId !== undefined && hadith.bookId !== null ? String(hadith.bookId) : null,
      book_name: chapterIntroEn || chapterIntroAr || null,
      book_name_en: chapterIntroEn || null,
      book_name_ar: chapterIntroAr || null,
      chapter_id: toInteger(hadith.chapterId),
      chapter_number: hadith.chapterId !== undefined && hadith.chapterId !== null ? String(hadith.chapterId) : null,
      chapter_name: chapterIntroEn || chapterIntroAr || null,
      chapter_name_en: chapterIntroEn || null,
      chapter_name_ar: chapterIntroAr || null,
      chapter_intro_en: chapterIntroEn || null,
      chapter_intro_ar: chapterIntroAr || null,
      hadith_number: globalNumber || (hadith.idInBook !== undefined && hadith.idInBook !== null ? String(hadith.idInBook) : null),
      hadith_number_global: globalNumber,
      hadith_number_in_book: hadith.idInBook !== undefined && hadith.idInBook !== null ? String(hadith.idInBook) : null,
      hadith_number_in_chapter: hadith.idInChapter !== undefined && hadith.idInChapter !== null ? String(hadith.idInChapter) : null,
      arabic_text: hadith.arabic || null,
      english_narrator: narrator,
      translation_text: translationText,
      grade: hadith.grade || null,
      translator: hadith.english && typeof hadith.english === 'object' ? hadith.english.translator || null : null,
      dataset_name: options.datasetName || 'AhmedBaset/hadith-json',
      dataset_version: options.datasetVersion || 'v1.2.0',
      original_source: options.originalSource || 'Sunnah.com',
      import_batch_id: options.importBatchId || null,
      topic_tags: [],
      approved_for_answers: options.approvedForAnswers === true,
      verified_by_admin: options.verifiedByAdmin === true,
      admin_managed: options.adminManaged === true,
      metadata: {
        original_record: hadith,
        original_file: filePath,
        imported_at: options.importedAt || new Date().toISOString(),
        importer_version: 'hadith-json-v1',
        layout_detected: layout,
        license_status: 'unchecked',
      },
    };
  });

  if (!rows.length) warnings.push('No hadith rows found in file.');
  return {
    slug,
    layout,
    filePath,
    hadithCount: rows.length,
    rows,
    warnings,
    collection: {
      slug,
      englishName: collectionNameEn,
      arabicName: collectionNameAr,
      authorEnglish: metadataEnglish.author || null,
      authorArabic: metadataArabic.author || null,
    },
    sampleRow: rows[0] || null,
  };
}

module.exports = {
  KNOWN_COLLECTIONS,
  collectJsonFiles,
  defaultCollectionMeta,
  detectLayout,
  inferCollectionSlug,
  normalizeHadithJsonFile,
  parseCliArgs,
  toArray,
};
