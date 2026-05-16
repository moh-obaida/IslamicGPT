#!/usr/bin/env node
const path = require('path');
const {
  DEFAULT_TAFSIR_METADATA,
  normalizeTafsirApiDataset,
} = require('./tafsir-api-utils');

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function main(argv = process.argv.slice(2)) {
  const datasetRoot = path.resolve(argv[0] || 'data/imports/tafsir-api');
  const analysis = normalizeTafsirApiDataset(datasetRoot, {});

  console.log(`Dataset root: ${analysis.datasetRoot}`);
  console.log(`Dataset detected: ${analysis.datasetDetected}`);
  console.log(`Structure tafsir/editions.json: ${yesNo(analysis.structures.hasEditionsFile)}`);
  console.log(`Structure tafsir/{editionSlug}/{surah}.json: ${yesNo(analysis.structures.hasSurahFiles)}`);
  console.log(`Structure tafsir/{editionSlug}/{surah}/{ayah}.json: ${yesNo(analysis.structures.hasAyahFiles)}`);
  console.log(`JSON tafsir files analyzed: ${analysis.filesAnalyzed}`);
  console.log(`Editions detected: ${analysis.editionsDetected}`);
  console.log(`Total surahs: ${analysis.totalSurahs}`);
  console.log(`Total tafsir rows: ${analysis.totalTafsirRows}`);
  console.log(`License status: ${DEFAULT_TAFSIR_METADATA.licenseStatus}`);
  console.log(`Repo license: ${DEFAULT_TAFSIR_METADATA.repoLicense}`);
  console.log(`Dataset URL: ${DEFAULT_TAFSIR_METADATA.datasetUrl}`);

  if (!analysis.files.length) {
    console.log('No dataset files found. Place local spa5k/tafsir_api files under data/imports/tafsir-api.');
    return;
  }

  for (const edition of [...analysis.editions.values()].slice(0, 10)) {
    console.log(`Edition: ${edition.slug} | ${edition.name || 'unknown'} | ${edition.author || 'unknown'} | ${edition.language || 'unknown'} | source: ${edition.source || 'unknown'}`);
  }

  if (analysis.sampleRow) {
    console.log('Sample normalized Tafsir row:');
    console.log(JSON.stringify(analysis.sampleRow, null, 2));
    console.log(`Original source info: ${analysis.sampleRow.original_source || 'unknown'}`);
  }

  if (analysis.warnings.length) {
    console.log('Warnings:');
    analysis.warnings.slice(0, 25).forEach((warning) => console.log(`- ${warning}`));
    if (analysis.warnings.length > 25) console.log(`- ...and ${analysis.warnings.length - 25} more warning(s)`);
  }
}

if (require.main === module) main();

module.exports = { main };
