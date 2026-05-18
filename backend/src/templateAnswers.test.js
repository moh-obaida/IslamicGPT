const assert = require('assert');
const { test } = require('node:test');
const {
  buildNoSourceMessage,
  buildQuranTemplate,
  buildTafsirTemplate,
  buildScholarTemplate,
  buildTemplateAnswer,
  answerHasBuiltInScholarNote,
  resolveAnswerType,
} = require('./templateAnswers');

const quranSource = {
  source_type: 'quran',
  surah_number: 2,
  ayah_number: 255,
  surah_name_en: 'Al-Baqarah',
  surah_name_ar: 'البقرة',
  arabic_text: 'الله لا إله إلا هو',
  translation_text: 'Allah - there is no deity except Him.',
  translation_name: 'Saheeh International',
  translation_source: 'Tanzil',
  quran_arabic_source: 'Uthmani',
};

const tafsirSource = {
  source_type: 'tafsir',
  surah_number: 2,
  ayah_number: 255,
  surah_name_en: 'Al-Baqarah',
  tafsir_book_name: 'Tafsir Muyassar',
  tafsir_author: 'King Fahd Complex',
  explanation_text: 'تفسير موجز',
};

const scholarSource = {
  source_type: 'fatwa',
  title: 'حكم التماثيل',
  scholar_name_ar: 'ابن باز',
  question_text: 'ما حكم التماثيل؟',
  answer_text: 'جواب مختصر',
  fatwa_reference: '863',
};

test('English Quran template uses English labels', () => {
  const answer = buildQuranTemplate(quranSource, 'Quran 2:255');
  assert.match(answer, /Quran verse/);
  assert.match(answer, /\*\*Surah:\*\*/);
  assert.match(answer, /\*\*Ayah:\*\*/);
  assert.match(answer, /\*\*Translation:\*\*/);
  assert.match(answer, /\*\*Source:\*\*/);
  assert.match(answer, /\*\*Note:\*\*/);
  assert.doesNotMatch(answer, /السورة/);
});

test('Arabic Quran template uses Arabic labels', () => {
  const answer = buildQuranTemplate(quranSource, 'القرآن 2:255');
  assert.match(answer, /### آية من القرآن الكريم/);
  assert.match(answer, /\*\*السورة:\*\*/);
  assert.match(answer, /\*\*الآية:\*\*/);
  assert.match(answer, /\*\*النص العربي:\*\*/);
  assert.match(answer, /\*\*الترجمة:\*\*/);
  assert.doesNotMatch(answer, /\*\*Surah:\*\*/);
});

test('English Tafsir template uses English labels', () => {
  const answer = buildTafsirTemplate(tafsirSource, 'Tafsir of Quran 2:255');
  assert.match(answer, /### Tafsir/);
  assert.match(answer, /\*\*Surah:\*\*/);
  assert.match(answer, /\*\*Explanation:\*\*/);
  assert.doesNotMatch(answer, /نص التفسير/);
});

test('Arabic Tafsir template uses Arabic labels', () => {
  const answer = buildTafsirTemplate(tafsirSource, 'تفسير 2:255');
  assert.match(answer, /### تفسير الآية/);
  assert.match(answer, /\*\*نص التفسير:\*\*/);
  assert.match(answer, /\*\*كتاب التفسير:\*\*/);
});

test('scholar template includes single standardized note', () => {
  const en = buildScholarTemplate(scholarSource, 'Ibn Baz fatwa');
  const ar = buildScholarTemplate(scholarSource, 'ما حكم التماثيل عند ابن باز؟');
  assert.strictEqual((en.match(/personalized fatwa/gi) || []).length, 1);
  assert.strictEqual((ar.match(/فتوى شخصية/g) || []).length, 1);
  assert.strictEqual(answerHasBuiltInScholarNote(en), true);
  assert.strictEqual(answerHasBuiltInScholarNote(ar), true);
});

test('no-source messages are clear in English and Arabic', () => {
  assert.match(buildNoSourceMessage('unknown topic'), /I could not find enough approved source evidence/);
  assert.match(buildNoSourceMessage('unknown topic'), /Quran 2:255/);
  assert.match(buildNoSourceMessage('موضوع غير معروف'), /لم أجد مصدرًا معتمدًا كافيًا/);
  assert.match(buildNoSourceMessage('موضوع غير معروف'), /القرآن 2:255/);
});

test('resolveAnswerType classifies source kinds', () => {
  assert.strictEqual(resolveAnswerType({ source_type: 'quran' }), 'quran');
  assert.strictEqual(resolveAnswerType({ source_type: 'tafsir' }), 'tafsir');
  assert.strictEqual(resolveAnswerType({ source_type: 'fatwa' }), 'fatwa');
  assert.strictEqual(resolveAnswerType({ source_type: 'hadith' }), 'hadith');
});

test('buildTemplateAnswer routes by source type', () => {
  assert.match(buildTemplateAnswer(quranSource, 'Quran 2:255'), /### Quran verse/);
  assert.match(buildTemplateAnswer(tafsirSource, 'تفسير آية'), /تفسير الآية/);
});
