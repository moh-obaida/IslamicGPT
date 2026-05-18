const assert = require('assert');
const { test } = require('node:test');
const { formatSourceCards } = require('./sourceCards');

test('formats tafsir source cards with tafsir metadata', () => {
  const [tafsir] = formatSourceCards([
    {
      id: 'tafsir-1',
      source_type: 'tafsir',
      title: 'Tafsir Muyassar 1:1',
      surah_name_en: 'Al-Fatihah',
      surah_name_ar: 'الفاتحة',
      surah_number: 1,
      ayah_number: 1,
      tafsir_edition_slug: 'ar-tafsir-muyassar',
      tafsir_book_name: 'Tafsir Muyassar',
      tafsir_author: 'King Fahd Complex',
      tafsir_language: 'ar',
      explanation_text: 'Testing explanation',
      approved_for_answers: true,
      verified_by_admin: true,
    },
  ]);

  assert.strictEqual(tafsir.type, 'tafsir');
  assert.strictEqual(tafsir.source_type, 'tafsir');
  assert.strictEqual(tafsir.badge, 'Tafsir');
  assert.strictEqual(tafsir.metadata.tafsir_edition_slug, 'ar-tafsir-muyassar');
  assert.strictEqual(tafsir.metadata.surah_name_ar, 'الفاتحة');
  assert.strictEqual(tafsir.copyCitation, 'Tafsir Muyassar — تفسير 1:1');
  assert.deepStrictEqual(tafsir.badges, ['Approved', 'Verified']);
});

test('formats Quran source cards with surah names and translation metadata', () => {
  const [quran] = formatSourceCards([
    {
      id: 'quran-2-255',
      source_type: 'quran',
      surah_name_en: 'Al-Baqarah',
      surah_name_ar: 'البقرة',
      surah_number: 2,
      ayah_number: 255,
      translation_name: 'Saheeh International',
      translation_source: 'Tanzil',
      quran_arabic_source: 'Uthmani',
      approved_for_answers: true,
      verified_by_admin: true,
    },
  ]);

  assert.strictEqual(quran.source_type, 'quran');
  assert.strictEqual(quran.badge, 'Quran');
  assert.strictEqual(quran.title, 'Al-Baqarah 2:255');
  assert.strictEqual(quran.copyCitation, 'Quran 2:255');
  assert.strictEqual(quran.metadata.translation_source, 'Tanzil');
  assert.strictEqual(quran.metadata.quran_arabic_source, 'Uthmani');
});

test('formats scholar fatwa source cards with scholar metadata', () => {
  const [fatwa] = formatSourceCards([
    {
      id: 'fatwa-1',
      source_type: 'fatwa',
      title: 'Statues in the house',
      scholar_name_en: 'Ibn Baz',
      question_text: 'What is the ruling?',
      answer_text: 'Answer excerpt',
      fatwa_reference: '863',
      source_url: 'https://binbaz.org.sa/fatwas/863',
      approved_for_answers: true,
      verified_by_admin: true,
    },
  ]);

  assert.strictEqual(fatwa.type, 'fatwa');
  assert.strictEqual(fatwa.badge, 'Fatwa');
  assert.strictEqual(fatwa.scholar_name, 'Ibn Baz');
  assert.strictEqual(fatwa.question_text, 'What is the ruling?');
  assert.strictEqual(fatwa.source_url, 'https://binbaz.org.sa/fatwas/863');
  assert.strictEqual(fatwa.metadata.fatwa_reference, '863');
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
  assert.strictEqual(hadith.title, 'Sahih Example #N/A');
});
