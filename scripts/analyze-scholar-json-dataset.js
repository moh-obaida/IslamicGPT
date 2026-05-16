#!/usr/bin/env node
const path = require('path');
const {
  normalizeScholarDataset,
} = require('./scholar-json-utils');

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function main(argv = process.argv.slice(2)) {
  const datasetRoot = path.resolve(argv[0] || 'data/imports/scholars');
  const analysis = normalizeScholarDataset(datasetRoot, {});
  const sourceKinds = analysis.rows.reduce((acc, row) => {
    const key = [row.source_kind || 'unknown', row.work_type || 'unknown'].join(' / ');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  console.log(`Dataset root: ${analysis.datasetRoot}`);
  console.log(`Dataset detected: ${analysis.datasetDetected}`);
  console.log(`JSON files analyzed: ${analysis.files.length}`);
  console.log(`Total records: ${analysis.rows.length}`);
  console.log(`Scholars detected: ${JSON.stringify(countBy(analysis.rows, 'scholar_slug'))}`);
  console.log(`Source kinds detected: ${JSON.stringify(sourceKinds)}`);
  if (analysis.rows[0]) {
    console.log('Sample normalized row:');
    console.log(JSON.stringify(analysis.rows[0], null, 2));
  }
  if (analysis.warnings.length) {
    console.log('Warnings:');
    analysis.warnings.slice(0, 25).forEach((warning) => console.log(`- ${warning}`));
    if (analysis.warnings.length > 25) console.log(`- ...and ${analysis.warnings.length - 25} more warning(s)`);
  }
}

if (require.main === module) main();

module.exports = { main };
