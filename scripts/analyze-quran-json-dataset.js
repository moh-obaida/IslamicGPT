#!/usr/bin/env node
const path = require('path');
const {
  DEFAULT_QURAN_METADATA,
  normalizeQuranDataset,
} = require('./quran-json-utils');

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function main() {
  const datasetRoot = path.resolve(process.argv[2] || 'data/imports/quran-json');
  const analysis = normalizeQuranDataset(datasetRoot, {});
  const suspiciousTranslationWarnings = analysis.warnings.filter((warning) => warning.includes('translation_text does not appear to match requested translation_language=en.'));

  console.log(`Dataset root: ${analysis.datasetRoot}`);
  console.log(`Dataset detected: ${analysis.datasetDetected}`);
  console.log(`JSON files analyzed: ${analysis.filesAnalyzed}`);
  console.log(`Ayah files processed: ${analysis.ayahFilesProcessed || 0}`);
  console.log(`Metadata files skipped: ${analysis.metadataFilesSkipped || 0}`);
  console.log(`Structure dist/quran.json: ${yesNo(analysis.structures.hasDistQuran)}`);
  console.log(`Structure dist/quran_en.json: ${yesNo(analysis.structures.hasDistQuranEn)}`);
  console.log(`Structure dist/chapters/en/*.json: ${yesNo(analysis.structures.hasChapterEnFiles)}`);
  console.log(`Structure dist/chapters/*.json: ${yesNo(analysis.structures.hasChapterFiles)}`);
  console.log(`Structure dist/verses/*.json: ${yesNo(analysis.structures.hasVerseFiles)}`);
  console.log(`Total surahs: ${analysis.totalSurahs}`);
  console.log(`Total ayahs: ${analysis.totalAyahs}`);
  console.log(`License: ${DEFAULT_QURAN_METADATA.licenseStatus}`);
  console.log(`Translator: ${DEFAULT_QURAN_METADATA.translator}`);
  console.log(`Translation: ${DEFAULT_QURAN_METADATA.translationName}`);
  console.log(`Translation language: ${DEFAULT_QURAN_METADATA.translationLanguage}`);
  console.log(`Translation source: ${DEFAULT_QURAN_METADATA.translationSource}`);
  console.log(`Arabic source: ${DEFAULT_QURAN_METADATA.quranArabicSource}`);
  if (suspiciousTranslationWarnings.length) console.log(`Suspicious translation_language=en rows: ${suspiciousTranslationWarnings.length}`);

  if (!analysis.files.length) {
    console.log('No dataset files found. Place local risan/quran-json files under data/imports/quran-json.');
    return;
  }

  if (analysis.sampleRow) {
    console.log('Sample normalized Quran row:');
    console.log(JSON.stringify(analysis.sampleRow, null, 2));
  }

  if (analysis.warnings.length) {
    console.log('Warnings:');
    analysis.warnings.slice(0, 25).forEach((warning) => console.log(`- ${warning}`));
    if (analysis.warnings.length > 25) console.log(`- ...and ${analysis.warnings.length - 25} more warning(s)`);
  }
}

if (require.main === module) main();

module.exports = { main };
