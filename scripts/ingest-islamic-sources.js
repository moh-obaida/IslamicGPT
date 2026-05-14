#!/usr/bin/env node
const { buildIslamicSourceIndex } = require('../backend/src/sourceStore');

const allowTestSources = String(process.env.ALLOW_TEST_SOURCES || 'false').toLowerCase() === 'true';
const result = buildIslamicSourceIndex({ allowTestSources, write: true });

console.log(`Indexed ${result.total_indexed} approved sources -> data/islamic-sources/indexes/compiled-sources.json`);
console.log(`Wrote ingest warnings -> data/islamic-sources/indexes/ingest-warnings.json`);
if (result.warnings.length) {
  console.log('\nWarnings:');
  result.warnings.forEach((w) => console.log(`- ${w}`));
}
