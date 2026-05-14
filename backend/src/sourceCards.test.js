const assert = require('assert');
const { test } = require('node:test');
const { formatSourceCards } = require('./sourceCards');

test('formats tafsir and Quran translation records as Quran-family source cards', () => {
  const [tafsir] = formatSourceCards([
    {
      source_type: 'tafsir',
      surah_name_en: 'Al-Fatihah',
      surah_number: 1,
      ayah_number: 1,
      summary: 'Testing explanation',
    },
  ]);

  assert.strictEqual(tafsir.type, 'tafsir');
  assert.strictEqual(tafsir.badge, 'Tafsir');
  assert.strictEqual(tafsir.copyCitation, 'Al-Fatihah (1:1)');
});

test('formats hadith explanation records as hadith source cards', () => {
  const [hadith] = formatSourceCards([
    {
      source_type: 'hadith_explanation',
      collection_name: 'Sahih Example',
      hadith_number_unavailable: true,
      summary: 'Testing explanation',
    },
  ]);

  assert.strictEqual(hadith.type, 'hadith_explanation');
  assert.strictEqual(hadith.badge, 'Hadith');
  assert.strictEqual(hadith.hadithNumber, 'Hadith number not available in this source.');
  assert.strictEqual(hadith.copyCitation, 'Sahih Example #N/A');
});
