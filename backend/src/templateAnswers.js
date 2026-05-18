const TAFSIR_PREVIEW_MAX_CHARS = 1500;

const SCHOLAR_NOTE_EN = 'Note: This is a source-backed excerpt, not a personalized fatwa. For personal circumstances, consult a qualified scholar.';
const SCHOLAR_NOTE_AR = 'تنبيه: هذا مقتطف موثق من المصدر، وليس فتوى شخصية لحالة خاصة. في الحالات الخاصة، يُرجى مراجعة عالم مؤهل.';

const NO_SOURCE_EN = [
  'I could not find enough approved source evidence to answer this safely. Try asking with a specific reference, such as Quran 2:255, Sahih al-Bukhari Hadith 1, or Tafsir of Surah Al-Fatihah 1:1.',
].join('\n');

const NO_SOURCE_AR = [
  'لم أجد مصدرًا معتمدًا كافيًا للإجابة بأمان. جرّب السؤال بمرجع محدد مثل: القرآن 2:255، أو حديث صحيح البخاري رقم 1، أو تفسير الفاتحة 1:1.',
].join('\n');

function containsArabic(text) {
  return /[\u0600-\u06FF]/.test(String(text || ''));
}

function capText(value, maxChars = 1000) {
  const full = String(value || '').trim();
  if (!full) return '';
  const preview = full.slice(0, maxChars).trim();
  return full.length > preview.length ? `${preview}…` : preview;
}

function shouldUseArabicScholarTemplate(question, source = {}) {
  const normalizedQuestion = String(question || '').trim();
  if (containsArabic(normalizedQuestion)) return true;
  if (normalizedQuestion) return false;
  if (String(source.language || '').toLowerCase() === 'arabic') return true;
  return [source.title, source.question_text, source.answer_text, source.scholar_name, source.scholar_name_ar, source.arabic_text]
    .some((value) => containsArabic(value));
}

function getSourceReference(source = {}) {
  const candidates = [
    source.fatwa_reference,
    source.reference,
    source.reference_number,
    source.metadata?.reference,
    source.metadata?.original_record?.reference,
    source.fatwa_number,
  ];
  const seen = new Set();
  for (const item of candidates) {
    const value = String(item || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    return value;
  }
  return '';
}

function getSourceUrl(source = {}) {
  return String(source.source_url || source.url || source.metadata?.url || source.metadata?.original_record?.url || '').trim();
}

function scholarReference(source) {
  const normalizedRef = getSourceReference(source);
  const looksLikeFatwaPrefix = /^\s*fatwa\b/i.test(normalizedRef);
  const fatwaLabel = source.fatwa_number && !normalizedRef ? `Fatwa ${source.fatwa_number}` : '';
  return [
    source.work_title || source.work_title_en || source.work_title_ar,
    !looksLikeFatwaPrefix && normalizedRef ? normalizedRef : '',
    fatwaLabel,
    source.page_number ? `p. ${source.page_number}` : '',
    source.page_range ? `pp. ${source.page_range}` : '',
  ].filter(Boolean).join(' / ');
}

function buildQuranAttribution(source) {
  const parts = [];
  if (source.quran_arabic_source) parts.push(`Arabic text: ${source.quran_arabic_source}`);
  if (source.translation_name) parts.push(`Translation: ${source.translation_name}`);
  if (source.translator && source.translator !== source.translation_name) parts.push(`Translator: ${source.translator}`);
  if (source.translation_source) parts.push(`Translation source: ${source.translation_source}`);
  if (source.translation_source_url) parts.push(source.translation_source_url);
  if (source.dataset_name) parts.push(`Dataset: ${source.dataset_name}`);
  if (source.attribution_text) parts.push(source.attribution_text);
  if (source.attribution_url) parts.push(source.attribution_url);
  if (source.license_status) parts.push(`License: ${source.license_status}`);
  if (source.requires_attribution === true) parts.push('Attribution required');
  if (source.requires_sharealike_review === true) parts.push('Share-alike review required');
  return parts.filter(Boolean);
}

function buildTafsirAttribution(source) {
  const parts = [];
  if (source.tafsir_edition_slug) parts.push(`Edition: ${source.tafsir_edition_slug}`);
  if (source.tafsir_book_name) parts.push(`Book: ${source.tafsir_book_name}`);
  if (source.tafsir_author) parts.push(`Author: ${source.tafsir_author}`);
  if (source.original_source) parts.push(`Original source: ${source.original_source}`);
  if (source.dataset_url) parts.push(source.dataset_url);
  if (source.repo_license) parts.push(`License: ${source.repo_license}`);
  if (source.license_status) parts.push(`License status: ${source.license_status}`);
  if (source.requires_attribution === true) parts.push('Attribution required');
  return parts.filter(Boolean);
}

function resolveAnswerType(source = {}) {
  const type = source.source_type || '';
  if (['quran', 'quran_translation'].includes(type)) return 'quran';
  if (type === 'tafsir') return 'tafsir';
  if (['fatwa', 'scholar_statement'].includes(type)) return 'fatwa';
  if (['hadith', 'hadith_explanation'].includes(type)) return 'hadith';
  return 'source';
}

function answerHasBuiltInScholarNote(answer) {
  const text = String(answer || '');
  return text.includes(SCHOLAR_NOTE_EN)
    || text.includes(SCHOLAR_NOTE_AR)
    || text.includes('not a personalized fatwa')
    || text.includes('ليس فتوى شخصية');
}

function buildNoSourceMessage(question = '') {
  return containsArabic(question) ? NO_SOURCE_AR : NO_SOURCE_EN;
}

function buildQuranTemplate(source, question = '') {
  const useArabic = containsArabic(question);
  const ref = `${source.surah_number || source.surah || '?'}:${source.ayah_number || source.ayah || source.ayah_range || '?'}`;
  const surahLabel = useArabic
    ? (source.surah_name_ar || source.surah_name_en || ref)
    : (source.surah_name_en || source.surah_name_ar || ref);
  const attribution = buildQuranAttribution(source);

  if (useArabic) {
    return [
      '### آية من القرآن الكريم',
      '',
      '**السورة:**',
      surahLabel,
      '',
      '**الآية:**',
      ref,
      '',
      source.arabic_text ? '**النص العربي:**' : null,
      source.arabic_text || null,
      source.arabic_text ? '' : null,
      source.translation_text ? '**الترجمة:**' : null,
      source.translation_text ? `> ${source.translation_text}` : null,
      source.translation_text ? '' : null,
      '**المصدر:**',
      `القرآن ${ref}`,
      attribution.length ? attribution.join('\n') : null,
      '',
      '**تنبيه:**',
      'هذا نص قرآني موثق من المصادر المعتمدة فقط، وليس تفسيرًا أو فتوى.',
    ].filter(Boolean).join('\n');
  }

  return [
    '### Quran verse',
    '',
    '**Surah:**',
    surahLabel,
    '',
    '**Ayah:**',
    ref,
    '',
    source.arabic_text ? '**Arabic:**' : null,
    source.arabic_text || null,
    source.arabic_text ? '' : null,
    source.translation_text ? '**Translation:**' : null,
    source.translation_text ? `> ${source.translation_text}` : null,
    source.translation_text ? '' : null,
    '**Source:**',
    `Quran ${ref}`,
    attribution.length ? attribution.join('\n') : null,
    '',
    '**Note:**',
    'This is stored Quranic text from approved sources only, not model-generated translation or tafsir.',
  ].filter(Boolean).join('\n');
}

function buildTafsirTemplate(source, question = '') {
  const useArabic = containsArabic(question);
  const ref = `${source.surah_number || source.surah || '?'}:${source.ayah_range || source.ayah_number || source.ayah || '?'}`;
  const tafsirBookName = source.tafsir_book_name || source.tafsir_book_name_en || source.tafsir_book_name_ar || source.title || 'Tafsir source';
  const previewSource = source.explanation_text || source.translation_text || 'Explanation text is not available in the approved source record.';
  const preview = String(previewSource).slice(0, TAFSIR_PREVIEW_MAX_CHARS).trim();
  const previewSuffix = String(previewSource).length > preview.length ? '…' : '';
  const author = source.tafsir_author || source.original_source || '';
  const attribution = buildTafsirAttribution(source);

  if (useArabic) {
    return [
      '### تفسير الآية',
      '',
      '**السورة:**',
      source.surah_name_ar || source.surah_name_en || ref,
      '',
      '**الآية:**',
      ref,
      '',
      '**كتاب التفسير:**',
      tafsirBookName,
      '',
      author ? '**المؤلف / الجهة:**' : null,
      author || null,
      author ? '' : null,
      '**نص التفسير:**',
      `${preview}${previewSuffix}`,
      '',
      '**المصدر:**',
      `${tafsirBookName} — تفسير ${ref}`,
      attribution.length ? attribution.join('\n') : null,
      '',
      '**تنبيه:**',
      'هذا مقتطف تفسير موثق من المصدر المعتمد فقط، وليس فتوى شخصية.',
    ].filter(Boolean).join('\n');
  }

  return [
    '### Tafsir',
    '',
    '**Surah:**',
    source.surah_name_en || source.surah_name_ar || ref,
    '',
    '**Ayah:**',
    ref,
    '',
    '**Tafsir book:**',
    tafsirBookName,
    '',
    author ? '**Author/source:**' : null,
    author || null,
    author ? '' : null,
    '**Explanation:**',
    `${preview}${previewSuffix}`,
    '',
    '**Source:**',
    `${tafsirBookName}, Tafsir of ${ref}`,
    attribution.length ? attribution.join('\n') : null,
    '',
    '**Note:**',
    'This is a source-backed Tafsir excerpt from approved records only, not model paraphrase.',
  ].filter(Boolean).join('\n');
}

function buildScholarTemplate(source, question = '') {
  const useArabic = shouldUseArabicScholarTemplate(question, source);
  const scholarName = source.scholar_name_en || source.scholar_name_ar || source.scholar_name || '';
  const answerExcerpt = capText(
    source.answer_text || source.translation_text || source.arabic_text || source.summary_text || source.explanation_text || source.quote_text || 'Text is not available in the approved source record.',
  );
  const sourceRef = getSourceReference(source) || scholarReference(source) || source.source_title || source.title || source.id || 'Approved source';
  const sourceUrl = getSourceUrl(source);

  if (useArabic) {
    return [
      '### مصدر معتمد',
      '',
      '**العنوان:**',
      source.title || source.source_title || 'مصدر شرعي',
      '',
      scholarName ? '**العالم:**' : null,
      scholarName || null,
      scholarName ? '' : null,
      source.question_text ? '**السؤال:**' : null,
      source.question_text || null,
      source.question_text ? '' : null,
      '**مقتطف من الجواب:**',
      answerExcerpt,
      '',
      sourceRef ? '**المرجع:**' : null,
      sourceRef || null,
      sourceRef ? '' : null,
      sourceUrl ? '**الرابط:**' : null,
      sourceUrl || null,
      sourceUrl ? '' : null,
      '**تنبيه:**',
      SCHOLAR_NOTE_AR.replace(/^تنبيه:\s*/, ''),
    ].filter(Boolean).join('\n');
  }

  return [
    '### Approved scholar source',
    '',
    '**Title:**',
    source.title || source.source_title || 'Scholar source',
    '',
    scholarName ? '**Scholar:**' : null,
    scholarName || null,
    scholarName ? '' : null,
    source.question_text ? '**Question:**' : null,
    source.question_text || null,
    source.question_text ? '' : null,
    '**Answer excerpt:**',
    answerExcerpt,
    '',
    '**Reference:**',
    sourceRef,
    '',
    sourceUrl ? '**Link:**' : null,
    sourceUrl || null,
    sourceUrl ? '' : null,
    '**Note:**',
    SCHOLAR_NOTE_EN.replace(/^Note:\s*/, ''),
  ].filter(Boolean).join('\n');
}

function buildHadithTemplate(source) {
  const ref = `${source.collection_name || 'Hadith source'}${source.hadith_number ? `, Hadith ${source.hadith_number}` : ''}`;
  const heading = source.title ? `### ${source.title}` : '### Hadith';
  const quoteText = source.translation_text || source.meaning_text || source.explanation_text || 'Translation text is not available in the approved source record.';
  const meaningCandidate = source.explanation_text || source.meaning_text || '';
  const shouldShowMeaning = Boolean(
    meaningCandidate
    && meaningCandidate.trim()
    && meaningCandidate.trim() !== String(source.translation_text || '').trim(),
  );
  return [
    heading,
    '',
    'The Prophet ﷺ said:',
    '',
    `> ${quoteText}`,
    '',
    source.arabic_text ? '**Arabic:**' : null,
    source.arabic_text || null,
    '',
    shouldShowMeaning ? '**Meaning:**' : null,
    shouldShowMeaning ? meaningCandidate : null,
    shouldShowMeaning ? '' : null,
    source.grade ? `**Grade:** ${source.grade}` : null,
    source.grade ? '' : null,
    '**Source:**',
    ref,
  ].filter(Boolean).join('\n');
}

function buildTemplateAnswer(source, question = '') {
  if (['hadith', 'hadith_explanation'].includes(source.source_type)) {
    return buildHadithTemplate(source);
  }
  if (source.source_type === 'tafsir') {
    return buildTafsirTemplate(source, question);
  }
  if (['quran', 'quran_translation'].includes(source.source_type)) {
    return buildQuranTemplate(source, question);
  }
  if (['fatwa', 'scholar_statement', 'book', 'lecture', 'educational_explanation'].includes(source.source_type)) {
    return buildScholarTemplate(source, question);
  }

  const sourceTitle = source.source_title || source.title || source.collection_name || source.scholar_name || source.id || 'Approved source';
  return [
    'I found an approved source related to this topic.',
    '',
    sourceTitle,
    '',
    source.translation_text || source.arabic_text || source.summary || 'Text is not available in the approved source record.',
    '',
    'Source:',
    sourceTitle,
  ].join('\n');
}

module.exports = {
  TAFSIR_PREVIEW_MAX_CHARS,
  SCHOLAR_NOTE_EN,
  SCHOLAR_NOTE_AR,
  containsArabic,
  shouldUseArabicScholarTemplate,
  getSourceReference,
  getSourceUrl,
  scholarReference,
  resolveAnswerType,
  answerHasBuiltInScholarNote,
  buildNoSourceMessage,
  buildTemplateAnswer,
  buildQuranTemplate,
  buildTafsirTemplate,
  buildScholarTemplate,
};
