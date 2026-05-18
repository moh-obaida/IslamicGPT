const assert = require('assert');
const { test } = require('node:test');
const { formatSourceCards } = require('./sourceCards');
const {
  buildNoSourceMessage,
  buildValidationBlockedMessage,
  buildQuranTemplate,
  buildTafsirTemplate,
  buildScholarTemplate,
  buildTemplateAnswer,
  answerHasBuiltInScholarNote,
  resolveAnswerType,
  resolveSurahLabel,
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
  translation_source_url: 'https://tanzil.net/trans/en.sahih',
  quran_arabic_source: 'Uthmani',
  dataset_name: 'risan/quran-json',
  dataset_url: 'https://github.com/risan/quran-json',
  attribution_text: 'Quran JSON dataset attribution',
  attribution_url: 'https://github.com/risan/quran-json',
  license_status: 'CC-BY-SA-4.0',
  requires_attribution: true,
  requires_sharealike_review: true,
  approved_for_answers: true,
  verified_by_admin: true,
};

const tafsirSource = {
  source_type: 'tafsir',
  surah_number: 2,
  ayah_number: 255,
  surah_name_en: 'Al-Baqarah',
  surah_name_ar: 'البقرة',
  tafsir_book_name: 'Tafsir Muyassar',
  tafsir_author: 'الميسر',
  tafsir_edition_slug: 'ar-tafsir-muyassar',
  original_source: 'Quran.com',
  dataset_url: 'https://github.com/spa5k/tafsir_api',
  repo_license: 'MIT',
  license_status: 'MIT-repo-content-source-needs-review',
  requires_attribution: true,
  explanation_text: 'تفسير موجز',
  approved_for_answers: true,
  verified_by_admin: true,
};

const scholarSource = {
  source_type: 'fatwa',
  title: 'حكم التماثيل',
  scholar_name_ar: 'ابن باز',
  question_text: 'ما حكم التماثيل؟',
  answer_text: 'جواب مختصر',
  fatwa_reference: '863',
  source_url: 'https://binbaz.org.sa/fatwas/863/example',
};

test('English Quran template uses English labels and concise source line', () => {
  const answer = buildQuranTemplate(quranSource, 'Quran 2:255');
  assert.match(answer, /Quran verse/);
  assert.match(answer, /\*\*Surah:\*\*/);
  assert.match(answer, /Al-Baqarah/);
  assert.match(answer, /\*\*Ayah:\*\*/);
  assert.match(answer, /\*\*Ayah:\*\*[\s\S]*2:255/);
  assert.match(answer, /Translation: Saheeh International/);
  assert.doesNotMatch(answer, /github\.com\/risan\/quran-json/i);
  assert.doesNotMatch(answer, /License: CC-BY-SA-4.0/i);
  assert.doesNotMatch(answer, /Attribution required/i);
  assert.doesNotMatch(answer, /Share-alike review required/i);
});

test('Arabic Quran template uses Arabic labels', () => {
  const answer = buildQuranTemplate(quranSource, 'القرآن 2:255');
  assert.match(answer, /### آية من القرآن الكريم/);
  assert.match(answer, /\*\*السورة:\*\*/);
  assert.match(answer, /البقرة/);
  assert.match(answer, /\*\*الآية:\*\*/);
  assert.match(answer, /الترجمة: Saheeh International/);
  assert.doesNotMatch(answer, /github\.com/i);
});

test('Quran sourceCards metadata still includes dataset and license fields', () => {
  const [card] = formatSourceCards([quranSource]);
  assert.strictEqual(card.metadata.translation_source, 'Tanzil');
  assert.strictEqual(card.metadata.dataset_name, 'risan/quran-json');
  assert.strictEqual(card.metadata.license_status, 'CC-BY-SA-4.0');
  assert.strictEqual(card.metadata.requires_attribution, true);
  assert.strictEqual(card.metadata.requires_sharealike_review, true);
});

test('English Tafsir template is concise', () => {
  const answer = buildTafsirTemplate(tafsirSource, 'Tafsir of Quran 2:255');
  assert.match(answer, /### Tafsir/);
  assert.match(answer, /\*\*Surah:\*\*/);
  assert.match(answer, /Al-Baqarah/);
  assert.match(answer, /\*\*Ayah:\*\*/);
  assert.match(answer, /\*\*Explanation:\*\*/);
  assert.doesNotMatch(answer, /github\.com\/spa5k\/tafsir_api/i);
  assert.doesNotMatch(answer, /License: MIT/i);
  assert.doesNotMatch(answer, /License status/i);
  assert.doesNotMatch(answer, /Attribution required/i);
  assert.doesNotMatch(answer, /\*\*Edition:\*\*/i);
});

test('Arabic Tafsir template uses surah name and ayah ref correctly', () => {
  const answer = buildTafsirTemplate(tafsirSource, 'تفسير 2:255');
  assert.match(answer, /### تفسير الآية/);
  assert.match(answer, /\*\*السورة:\*\*/);
  assert.match(answer, /البقرة/);
  assert.match(answer, /\*\*الآية:\*\*/);
  assert.match(answer, /\*\*الآية:\*\*[\s\S]*2:255/);
  const surahSection = answer.split('**السورة:**')[1].split('**الآية:**')[0];
  assert.doesNotMatch(surahSection, /2:255/);
});

test('resolveSurahLabel never uses full ayah ref as surah label', () => {
  assert.strictEqual(resolveSurahLabel(tafsirSource, true), 'البقرة');
  assert.strictEqual(resolveSurahLabel(tafsirSource, false), 'Al-Baqarah');
  assert.strictEqual(resolveSurahLabel({ surah_number: 2 }, false), '2');
});

test('Tafsir sourceCards metadata still includes edition and license fields', () => {
  const [card] = formatSourceCards([tafsirSource]);
  assert.strictEqual(card.metadata.tafsir_edition_slug, 'ar-tafsir-muyassar');
  assert.strictEqual(card.metadata.dataset_url, 'https://github.com/spa5k/tafsir_api');
  assert.strictEqual(card.metadata.repo_license, 'MIT');
  assert.strictEqual(card.metadata.requires_attribution, true);
});

test('scholar template includes single standardized note and compact link', () => {
  const en = buildScholarTemplate(scholarSource, 'Ibn Baz fatwa');
  const ar = buildScholarTemplate(scholarSource, 'ما حكم التماثيل عند ابن باز؟');
  assert.strictEqual((en.match(/personalized fatwa/gi) || []).length, 1);
  assert.strictEqual((ar.match(/فتوى شخصية/g) || []).length, 1);
  assert.match(en, /Official source \(binbaz\.org\.sa\)/);
  assert.doesNotMatch(en, /https:\/\/binbaz\.org\.sa\/fatwas\/863/);
  assert.match(ar, /رابط المصدر الرسمي \(binbaz\.org\.sa\)/);
});

test('no-source and validation-blocked messages are language-aware', () => {
  assert.match(buildNoSourceMessage('unknown topic'), /I could not find enough approved source evidence/);
  assert.match(buildNoSourceMessage('موضوع غير معروف'), /لم أجد مصدرًا معتمدًا كافيًا/);
  assert.match(buildValidationBlockedMessage('explain topic'), /could not safely generate an answer/);
  assert.match(buildValidationBlockedMessage('اشرح آية الكرسي'), /لم أتمكن من توليد إجابة آمنة/);
  assert.match(buildValidationBlockedMessage('اشرح آية الكرسي'), /تفسير آية الكرسي/);
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
