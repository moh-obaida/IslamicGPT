#!/usr/bin/env node
const path = require('path');
const {
  KNOWN_COLLECTIONS,
  collectJsonFiles,
  normalizeHadithJsonFile,
} = require('./hadith-json-utils');

function readJson(file) {
  try {
    return JSON.parse(require('fs').readFileSync(file, 'utf8'));
  } catch (error) {
    return { __error: error.message };
  }
}

function main() {
  const datasetRoot = path.resolve(process.argv[2] || 'data/imports/hadith-json');
  const files = collectJsonFiles(datasetRoot);

  if (!files.length) {
    console.log(`No dataset files found under ${datasetRoot}.`);
    console.log('Place a local hadith JSON dataset under data/imports/hadith-json before running a full analysis.');
    return;
  }

  const perCollection = new Map();
  let totalFiles = 0;
  let totalHadith = 0;

  for (const file of files) {
    const parsed = readJson(file);
    if (parsed.__error) {
      console.log(`Warning: could not parse ${file}: ${parsed.__error}`);
      continue;
    }

    const normalized = normalizeHadithJsonFile(file, parsed, {});
    totalFiles += 1;
    totalHadith += normalized.hadithCount;

    if (!perCollection.has(normalized.slug)) {
      perCollection.set(normalized.slug, {
        slug: normalized.slug,
        collection: normalized.collection,
        fileCount: 0,
        hadithCount: 0,
        layouts: new Set(),
        warnings: [],
        sampleRow: normalized.sampleRow,
      });
    }

    const entry = perCollection.get(normalized.slug);
    entry.fileCount += 1;
    entry.hadithCount += normalized.hadithCount;
    entry.layouts.add(normalized.layout);
    entry.warnings.push(...normalized.warnings.map((warning) => `${path.basename(file)}: ${warning}`));
    if (!entry.sampleRow && normalized.sampleRow) entry.sampleRow = normalized.sampleRow;
  }

  console.log(`Dataset root: ${datasetRoot}`);
  console.log(`JSON files analyzed: ${totalFiles}`);
  console.log(`Total hadith rows detected: ${totalHadith}`);
  console.log(`Target collection slugs recognized: ${Object.keys(KNOWN_COLLECTIONS).join(', ')}`);

  for (const entry of [...perCollection.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
    console.log(`\nCollection slug: ${entry.slug}`);
    console.log(`Collection English name: ${entry.collection.englishName || 'unknown'}`);
    console.log(`Collection Arabic name: ${entry.collection.arabicName || 'unknown'}`);
    console.log(`Author English/Arabic: ${entry.collection.authorEnglish || 'unknown'} / ${entry.collection.authorArabic || 'unknown'}`);
    console.log(`File count: ${entry.fileCount}`);
    console.log(`Hadith count: ${entry.hadithCount}`);
    console.log(`Layouts detected: ${[...entry.layouts].join(', ')}`);
    if (entry.sampleRow) {
      console.log('Sample normalized row:');
      console.log(JSON.stringify(entry.sampleRow, null, 2));
    }
    if (entry.warnings.length) {
      console.log('Warnings:');
      entry.warnings.slice(0, 10).forEach((warning) => console.log(`- ${warning}`));
      if (entry.warnings.length > 10) console.log(`- ...and ${entry.warnings.length - 10} more warning(s)`);
    }
  }
}

main();
