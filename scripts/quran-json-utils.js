#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const DEFAULT_QURAN_METADATA = {
  translator: 'Umm Muhammad',
  translationName: 'Saheeh International',
  translationLanguage: 'en',
  translationSource: 'Tanzil',
  translationSourceUrl: 'https://tanzil.net/trans/en.sahih',
  quranArabicSource: "The Noble Qur'an Encyclopedia",
  quranEdition: 'Uthmani',
  quranTextStyle: 'Uthmani',
  datasetName: 'risan/quran-json',
  datasetVersion: '3.1.2',
  datasetUrl: 'https://github.com/risan/quran-json',
  licenseStatus: 'CC-BY-SA-4.0',
  attributionText: "Quran JSON dataset by risan/quran-json; Arabic text from The Noble Qur'an Encyclopedia; English translation Saheeh International / Umm Muhammad from Tanzil.",
  attributionUrl: 'https://github.com/risan/quran-json',
  requiresAttribution: true,
  requiresSharealikeReview: true,
};

function toInteger(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toTrimmedString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function camelOptionName(name) {
  return String(name || '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function parseCliArgs(argv) {
  const options = {
    dryRun: true,
    execute: false,
    limit: null,
    batchSize: 500,
    approve: false,
    verify: false,
    ...DEFAULT_QURAN_METADATA,
  };
  const positionals = [];

  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      options.execute = false;
      continue;
    }
    if (arg === '--execute') {
      options.execute = true;
      options.dryRun = false;
      continue;
    }
    if (arg === '--approve') {
      options.approve = true;
      continue;
    }
    if (arg === '--verify') {
      options.verify = true;
      continue;
    }

    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) continue;
    const [, rawName, rawValue] = match;
    const name = camelOptionName(rawName);
    const value = rawValue.replace(/^"|"$/g, '');
    if (name === 'limit') options.limit = Number.parseInt(value, 10);
    else if (name === 'batchSize') options.batchSize = Number.parseInt(value, 10) || 500;
    else if (Object.prototype.hasOwnProperty.call(options, name)) options[name] = value;
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
      for (const entry of fs.readdirSync(current)) stack.push(path.join(current, entry));
      continue;
    }
    if (current.toLowerCase().endsWith('.json')) results.push(current);
  }

  return results.sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function isEnglishPath(filePath) {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  return normalized.includes('/chapters/en/') || normalized.endsWith('/quran_en.json') || normalized.includes('/en/');
}

function detectDatasetStructures(files, rootDir) {
  const rels = new Set(files.map((file) => path.relative(rootDir, file).replace(/\\/g, '/')));
  return {
    hasDistQuran: rels.has('dist/quran.json'),
    hasDistQuranEn: rels.has('dist/quran_en.json'),
    hasChapterEnFiles: [...rels].some((rel) => /^dist\/chapters\/en\/[^/]+\.json$/i.test(rel)),
    hasChapterFiles: [...rels].some((rel) => /^dist\/chapters\/[^/]+\.json$/i.test(rel)),
    hasVerseFiles: [...rels].some((rel) => /^dist\/verses\/[^/]+\.json$/i.test(rel)),
  };
}

function isKnownMetadataFile(relPath) {
  const rel = String(relPath || '').replace(/\\/g, '/').toLowerCase();
  return (
    /^data\/chapters\/[^/]+\.json$/.test(rel)
    || /^data\/editions\/[^/]+\.json$/.test(rel)
    || /^dist\/chapters\/[^/]+\.json$/.test(rel)
    || /^dist\/chapters\/en\/[^/]+\.json$/.test(rel)
    || /^dist\/editions\/[^/]+\.json$/.test(rel)
  );
}

function pickNumber(...values) {
  for (const value of values) {
    const parsed = toInteger(value);
    if (parsed !== null) return parsed;
  }
  return null;
}

function pickString(...values) {
  for (const value of values) {
    const text = toTrimmedString(value);
    if (text) return text;
  }
  return null;
}

function parseVerseReference(value) {
  const text = toTrimmedString(value);
  if (!text) return {};
  const match = text.match(/(\d{1,3})\s*[:/-]\s*(\d{1,3})/);
  if (!match) return {};
  return { surah: toInteger(match[1]), ayah: toInteger(match[2]) };
}

function looksArabic(value) {
  return /[\u0600-\u06FF]/.test(String(value || ''));
}

function containsNonEnglishScript(value) {
  return /[\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0900-\u097F\u0980-\u09FF\u0E00-\u0E7F\u3040-\u30FF\u3100-\u312F\u31A0-\u31BF\u3400-\u9FFF\uAC00-\uD7AF]/.test(String(value || ''));
}

function englishWords(value) {
  return String(value || '')
    .toLowerCase()
    .match(/[a-z']+/g) || [];
}

function appearsEnglish(value) {
  const text = toTrimmedString(value);
  if (!text || containsNonEnglishScript(text)) return false;
  const latinLetters = text.match(/[A-Za-z]/g) || [];
  if (latinLetters.length < 3) return false;
  const words = englishWords(text);
  return words.length >= 2 || latinLetters.length >= 8;
}

function looksClearlyEnglish(value) {
  const text = toTrimmedString(value);
  if (!appearsEnglish(text)) return false;
  const words = englishWords(text);
  if (!words.length) return false;
  const commonWords = new Set([
    'a', 'all', 'allah', 'an', 'and', 'are', 'be', 'by', 'for', 'from',
    'has', 'have', 'he', 'his', 'in', 'indeed', 'is', 'it', 'its', 'lord',
    'may', 'merciful', 'most', 'not', 'of', 'on', 'or', 'our', 'said',
    'that', 'the', 'their', 'them', 'then', 'there', 'they', 'this', 'to',
    'upon', 'we', 'were', 'who', 'with', 'would', 'you', 'your',
  ]);
  return words.some((word) => commonWords.has(word));
}

function extractChapterCandidates(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  return [
    ...toArray(parsed.chapters),
    ...toArray(parsed.surahs),
    ...toArray(parsed.quran),
    ...toArray(parsed.data),
  ].filter((entry) => entry && typeof entry === 'object');
}

function extractVerseCandidates(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  return [
    ...toArray(parsed.verses),
    ...toArray(parsed.ayahs),
    ...toArray(parsed.ayas),
    ...toArray(parsed.data),
  ].filter((entry) => entry && typeof entry === 'object');
}

function chapterMeta(chapter = {}, englishContext = false) {
  const surah = pickNumber(chapter.id, chapter.number, chapter.surah, chapter.surah_number, chapter.chapter_id);
  const genericName = pickString(chapter.name);
  return {
    surah,
    surah_name_ar: pickString(chapter.name_ar, chapter.name_arabic, chapter.arabic_name, looksArabic(genericName) ? genericName : null),
    surah_name_en: pickString(
      chapter.transliteration,
      chapter.name_en,
      chapter.english_name,
      !looksArabic(genericName) && (englishContext || looksClearlyEnglish(genericName)) ? genericName : null,
      (englishContext || looksClearlyEnglish(chapter.translation)) ? chapter.translation : null,
    ),
    revelation_place: pickString(chapter.type, chapter.revelation_place, chapter.revelationPlace),
  };
}

function verseNumber(verse = {}, index = 0) {
  const ref = parseVerseReference(verse.verse_key || verse.key || verse.reference);
  return pickNumber(
    ref.ayah,
    verse.ayah,
    verse.aya,
    verse.ayah_number,
    verse.verse_number,
    verse.number_in_surah,
    verse.number,
    verse.id,
    index + 1,
  );
}

function fileGlobalVerseNumber(filePath) {
  const match = String(filePath || '').replace(/\\/g, '/').match(/\/dist\/verses\/(?:\d+\/)?(\d+)\.json$/i);
  return match ? toInteger(match[1]) : null;
}

function globalVerseNumber(verse = {}, filePath = null) {
  const chapterId = pickNumber(verse.chapter?.id, verse.chapter_id, verse.surah, verse.surah_number);
  const localNumber = pickNumber(verse.number, verse.ayah, verse.aya, verse.ayah_number, verse.verse_number, verse.number_in_surah);
  const fileGlobal = fileGlobalVerseNumber(filePath);

  if (chapterId && localNumber !== null) {
    return pickNumber(
      verse.ayah_global_number,
      verse.global_number,
      verse.global_id,
      fileGlobal,
      verse.id,
      verse.absolute_number,
    );
  }

  return pickNumber(
    verse.ayah_global_number,
    verse.global_number,
    verse.global_id,
    fileGlobal,
    verse.id,
    verse.number,
    verse.absolute_number,
  );
}

function translationEntryText(entry) {
  if (typeof entry === 'string') return toTrimmedString(entry);
  if (!entry || typeof entry !== 'object') return null;
  return pickString(entry.text, entry.translation, entry.translation_text, entry.value, entry.content);
}

function translationFromTranslations(verse = {}, language = 'en', englishContext = false) {
  if (!verse.translations) return null;

  if (!Array.isArray(verse.translations) && typeof verse.translations === 'object') {
    const exact = translationEntryText(verse.translations[language]);
    if (exact) return exact;
  }

  const translations = toArray(verse.translations);
  for (const entry of translations) {
    const text = translationEntryText(entry);
    if (!text) continue;
    if (entry && typeof entry === 'object') {
      const entryLanguage = pickString(entry.language, entry.lang, entry.locale, entry.code, entry.iso_code);
      if (entryLanguage && entryLanguage.toLowerCase().startsWith(String(language || '').toLowerCase())) return text;
    }
    if (language === 'en' && englishContext && looksClearlyEnglish(text)) return text;
  }

  return null;
}

function translationMatchesLanguage(text, language = 'en') {
  if (!text) return false;
  if (language === 'en') return appearsEnglish(text);
  return true;
}

function hasPotentialTranslationContent(verse = {}) {
  if (pickString(verse.translation_text, verse.translation, verse.meaning, verse.english)) return true;
  if (pickString(verse.text, verse.content) && !looksArabic(verse.text || verse.content)) return true;
  if (Array.isArray(verse.translations)) return verse.translations.some((entry) => Boolean(translationEntryText(entry)));
  if (verse.translations && typeof verse.translations === 'object') {
    return Object.values(verse.translations).some((entry) => Boolean(translationEntryText(entry)));
  }
  return false;
}

function extractVerseText(verse = {}, { englishContext = false, translationLanguage = 'en' } = {}) {
  const rawText = pickString(verse.text, verse.content);
  const explicitTranslation = pickString(verse.translation_text, verse.english, verse.meaning);
  const arabic = pickString(
    verse.arabic_text,
    verse.text_uthmani,
    verse.text_imlaei,
    verse.arabic,
    !englishContext && looksArabic(rawText) ? rawText : null,
  );

  let translation;
  if (translationLanguage === 'en') {
    translation = pickString(
      translationFromTranslations(verse, 'en', englishContext),
      looksClearlyEnglish(explicitTranslation) ? explicitTranslation : null,
      englishContext && looksClearlyEnglish(verse.translation) ? verse.translation : null,
      englishContext && looksClearlyEnglish(rawText) ? rawText : null,
      looksClearlyEnglish(rawText) ? rawText : null,
    );
  } else {
    translation = pickString(
      translationFromTranslations(verse, translationLanguage, englishContext),
      explicitTranslation,
      englishContext ? verse.translation : null,
      englishContext && !looksArabic(rawText) ? rawText : null,
    );
  }

  let translation_warning = null;
  if (translationLanguage === 'en') {
    if (translation && !translationMatchesLanguage(translation, 'en')) {
      translation_warning = 'translation_text does not appear to match requested translation_language=en.';
    } else if (!translation && hasPotentialTranslationContent(verse)) {
      translation_warning = 'no English translation available; left translation_text null.';
    }
  }

  return { arabic_text: arabic, translation_text: translation, translation_warning };
}

function addOrMergeVerse(map, partial) {
  if (!partial.surah || !partial.ayah) return false;
  const key = `${partial.surah}:${partial.ayah}`;
  const existing = map.get(key) || {};
  map.set(key, {
    ...existing,
    ...Object.fromEntries(Object.entries(partial).filter(([, value]) => value !== null && value !== undefined && value !== '')),
    metadata_records: [...(existing.metadata_records || []), partial.original_record].filter(Boolean).slice(-3),
    original_file: partial.original_file || existing.original_file || null,
  });
  return true;
}

function scanFile(filePath, parsed, verseMap, chapterMap, translationLanguage = DEFAULT_QURAN_METADATA.translationLanguage) {
  const englishContext = isEnglishPath(filePath);
  const chapters = extractChapterCandidates(parsed);
  const directVerses = extractVerseCandidates(parsed);
  let count = 0;

  for (const chapter of chapters) {
    const meta = chapterMeta(chapter, englishContext);
    if (meta.surah) chapterMap.set(meta.surah, { ...(chapterMap.get(meta.surah) || {}), ...meta });
    const verses = extractVerseCandidates(chapter);
    verses.forEach((verse, index) => {
      const ref = parseVerseReference(verse.verse_key || verse.key || verse.reference);
      const chapterId = pickNumber(verse.chapter?.id, verse.chapter_id);
      const chapterNumber = pickNumber(verse.number);
      const surah = pickNumber(ref.surah, verse.surah, verse.surah_number, chapterId, meta.surah);
      const ayah = (chapterId && chapterNumber !== null) ? chapterNumber : verseNumber(verse, index);
      const text = extractVerseText(verse, { englishContext, translationLanguage });
      if (addOrMergeVerse(verseMap, {
        ...meta,
        surah,
        ayah,
        ayah_global_number: globalVerseNumber(verse, filePath),
        juz: pickNumber(verse.juz, verse.juz_number),
        hizb: pickString(verse.hizb, verse.hizb_quarter),
        page_number: pickNumber(verse.page, verse.page_number),
        ...text,
        original_record: verse,
        original_file: filePath,
      })) count += 1;
    });
  }

  if (!chapters.length && directVerses.length) {
    directVerses.forEach((verse, index) => {
      const ref = parseVerseReference(verse.verse_key || verse.key || verse.reference);
      const chapterId = pickNumber(verse.chapter?.id, verse.chapter_id);
      const chapterNumber = pickNumber(verse.number);
      const surah = pickNumber(ref.surah, verse.surah, verse.surah_number, chapterId);
      const ayah = (chapterId && chapterNumber !== null) ? chapterNumber : verseNumber(verse, index);
      const text = extractVerseText(verse, { englishContext, translationLanguage });
      if (addOrMergeVerse(verseMap, {
        surah,
        ayah,
        ayah_global_number: globalVerseNumber(verse, filePath),
        juz: pickNumber(verse.juz, verse.juz_number),
        hizb: pickString(verse.hizb, verse.hizb_quarter),
        page_number: pickNumber(verse.page, verse.page_number),
        ...text,
        original_record: verse,
        original_file: filePath,
      })) count += 1;
    });
  }

  if (!chapters.length && !directVerses.length && parsed && typeof parsed === 'object') {
    const ref = parseVerseReference(parsed.verse_key || parsed.key || parsed.reference);
    const meta = chapterMeta(parsed.chapter || parsed.surah || {}, englishContext);
    const surah = pickNumber(ref.surah, parsed.surah, parsed.surah_number, parsed.chapter_id, meta.surah);
    const chapterId = pickNumber(parsed.chapter?.id, parsed.chapter_id);
    const chapterNumber = pickNumber(parsed.number);
    const ayah = (chapterId && chapterNumber !== null)
      ? chapterNumber
      : pickNumber(ref.ayah, parsed.ayah, parsed.ayah_number, parsed.verse_number, parsed.id);
    const text = extractVerseText(parsed, { englishContext, translationLanguage });
    if (addOrMergeVerse(verseMap, {
      ...meta,
      surah,
      ayah,
      ayah_global_number: globalVerseNumber(parsed, filePath),
      juz: pickNumber(parsed.juz, parsed.juz_number),
      hizb: pickString(parsed.hizb, parsed.hizb_quarter),
      page_number: pickNumber(parsed.page, parsed.page_number),
      ...text,
      original_record: parsed,
      original_file: filePath,
    })) count += 1;
  }

  return count;
}

function buildNormalizedRow(entry, options = {}) {
  const defaults = { ...DEFAULT_QURAN_METADATA, ...options };
  const surah = toInteger(entry.surah);
  const ayah = toInteger(entry.ayah);
  const titleName = entry.surah_name_en || `Surah ${surah}`;
  const importedAt = defaults.importedAt || new Date().toISOString();

  return {
    id: `quran-${surah}-${ayah}`,
    source_type: 'quran',
    title: `${titleName} ${surah}:${ayah}`,
    collection_name: 'Quran',
    surah,
    ayah,
    surah_number: surah,
    ayah_number: ayah,
    ayah_global_number: toInteger(entry.ayah_global_number),
    surah_name_ar: toTrimmedString(entry.surah_name_ar),
    surah_name_en: toTrimmedString(entry.surah_name_en),
    juz: toInteger(entry.juz),
    hizb: toTrimmedString(entry.hizb),
    page_number: toInteger(entry.page_number),
    revelation_place: toTrimmedString(entry.revelation_place),
    arabic_text: toTrimmedString(entry.arabic_text),
    translation_text: toTrimmedString(entry.translation_text),
    translator: defaults.translator,
    translation_name: defaults.translationName,
    translation_language: defaults.translationLanguage,
    translation_source: defaults.translationSource,
    translation_source_url: defaults.translationSourceUrl,
    quran_text_style: defaults.quranTextStyle,
    quran_arabic_source: defaults.quranArabicSource,
    quran_edition: defaults.quranEdition,
    license_status: defaults.licenseStatus,
    attribution_text: defaults.attributionText,
    attribution_url: defaults.attributionUrl,
    requires_attribution: defaults.requiresAttribution === true || defaults.requiresAttribution === 'true',
    requires_sharealike_review: defaults.requiresSharealikeReview === true || defaults.requiresSharealikeReview === 'true',
    dataset_name: defaults.datasetName,
    dataset_version: defaults.datasetVersion,
    dataset_url: defaults.datasetUrl,
    topic_tags: [],
    approved_for_answers: defaults.approve === true,
    verified_by_admin: defaults.verify === true,
    metadata: {
      original_record: entry.metadata_records || entry.original_record || null,
      original_file: entry.original_file || null,
      imported_at: importedAt,
      importer_version: 'quran-json-v1',
      dataset_name: defaults.datasetName,
      dataset_url: defaults.datasetUrl,
      license_status: defaults.licenseStatus,
      requires_attribution: defaults.requiresAttribution === true || defaults.requiresAttribution === 'true',
      requires_sharealike_review: defaults.requiresSharealikeReview === true || defaults.requiresSharealikeReview === 'true',
    },
  };
}

function normalizeQuranDataset(rootDir, options = {}) {
  const datasetRoot = path.resolve(rootDir || 'data/imports/quran-json');
  const translationLanguage = toTrimmedString(options.translationLanguage || DEFAULT_QURAN_METADATA.translationLanguage) || 'en';
  const files = collectJsonFiles(datasetRoot);
  const structures = detectDatasetStructures(files, datasetRoot);
  const verseMap = new Map();
  const chapterMap = new Map();
  const warnings = [];
  let filesAnalyzed = 0;
  let metadataFilesSkipped = 0;
  let ayahFilesProcessed = 0;

  for (const file of files) {
    let parsed;
    try {
      parsed = readJson(file);
    } catch (error) {
      warnings.push(`${file}: ${error.message}`);
      continue;
    }
    filesAnalyzed += 1;
    const rel = path.relative(datasetRoot, file).replace(/\\/g, '/');
    const found = scanFile(file, parsed, verseMap, chapterMap, translationLanguage);
    if (found) ayahFilesProcessed += 1;
    else if (isKnownMetadataFile(rel)) metadataFilesSkipped += 1;
    else warnings.push(`${rel}: no Quran ayah rows detected.`);
  }

  const rows = [...verseMap.values()]
    .map((entry) => {
      const chapter = chapterMap.get(toInteger(entry.surah)) || {};
      const mergedEntry = { ...chapter, ...entry };
      const row = buildNormalizedRow(mergedEntry, { ...options, translationLanguage });
      if (mergedEntry.translation_warning && !row.translation_text) warnings.push(`${row.id}: ${mergedEntry.translation_warning}`);
      if (translationLanguage === 'en' && row.translation_text && !translationMatchesLanguage(row.translation_text, 'en')) {
        warnings.push(`${row.id}: translation_text does not appear to match requested translation_language=en.`);
      }
      const records = toArray(mergedEntry.metadata_records || mergedEntry.original_record);
      const suspicious = records.some((record) => {
        const chapterId = pickNumber(record?.chapter?.id, record?.chapter_id);
        const localNumber = pickNumber(record?.number);
        const globalId = pickNumber(record?.id);
        return chapterId && localNumber !== null && globalId !== null && row.ayah_number === globalId && globalId !== localNumber;
      });
      if (suspicious) warnings.push(`${row.id}: ayah_number may reflect a global verse id instead of chapter-local verse.number.`);
      return row;
    })
    .filter((row) => {
      const valid = row.surah && row.ayah && (row.arabic_text || row.translation_text);
      if (!valid) warnings.push(`${row.id}: skipped because surah, ayah, and text are required.`);
      return valid;
    })
    .sort((a, b) => a.surah_number - b.surah_number || a.ayah_number - b.ayah_number);

  const totalSurahs = new Set(rows.map((row) => row.surah_number).filter(Boolean)).size;
  const missingArabic = rows.filter((row) => !row.arabic_text).length;
  const missingTranslation = rows.filter((row) => !row.translation_text).length;
  const missingSurahNames = rows.filter((row) => !row.surah_name_en && !row.surah_name_ar).length;

  if (files.length && missingArabic) warnings.push(`${missingArabic} row(s) are missing Arabic text.`);
  if (files.length && missingTranslation) warnings.push(`${missingTranslation} row(s) are missing ${translationLanguage === 'en' ? 'English' : translationLanguage} translation text.`);
  if (files.length && missingSurahNames) warnings.push(`${missingSurahNames} row(s) are missing surah names.`);

  return {
    datasetRoot,
    datasetDetected: files.length ? DEFAULT_QURAN_METADATA.datasetName : 'none',
    files,
    filesAnalyzed,
    ayahFilesProcessed,
    metadataFilesSkipped,
    structures,
    rows,
    totalSurahs,
    totalAyahs: rows.length,
    warnings: [...new Set(warnings)],
    sampleRow: rows.find((row) => row.id === 'quran-1-1') || rows[0] || null,
  };
}

module.exports = {
  DEFAULT_QURAN_METADATA,
  buildNormalizedRow,
  collectJsonFiles,
  normalizeQuranDataset,
  parseCliArgs,
  toInteger,
  toTrimmedString,
};
