const TAFSIR_PREVIEW_MAX_CHARS = 1500;

const SCHOLAR_NOTE_EN = 'Note: This is a source-backed excerpt, not a personalized fatwa. For personal circumstances, consult a qualified scholar.';
const SCHOLAR_NOTE_AR = 'تنبيه: هذا مقتطف موثق من المصدر، وليس فتوى شخصية لحالة خاصة. في الحالات الخاصة، يُرجى مراجعة عالم مؤهل.';

const NO_SOURCE_EN = [
  'I could not find enough approved source evidence to answer this safely. Try asking with a specific reference, such as Quran 2:255, Sahih al-Bukhari Hadith 1, or Tafsir of Surah Al-Fatihah 1:1.',
].join('\n');

const NO_SOURCE_AR = [
  'لم أجد مصدرًا معتمدًا كافيًا للإجابة بأمان. جرّب السؤال بمرجع محدد مثل: القرآن 2:255، أو حديث صحيح البخاري رقم 1، أو تفسير الفاتحة 1:1.',
].join('\n');

const VALIDATION_BLOCKED_EN = [
  'I found approved sources, but I could not safely generate an answer without risking unsupported claims.',
  '',
  'Try a direct source lookup, such as: Tafsir of Ayat al-Kursi.',
].join('\n');

const VALIDATION_BLOCKED_AR = [
  'وجدت مصادر معتمدة، لكن لم أتمكن من توليد إجابة آمنة دون احتمال إضافة معلومات غير مدعومة من المصدر.',
  '',
  'جرّب سؤالًا مباشرًا مثل: تفسير آية الكرسي',
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

function resolveAyahRef(source = {}) {
  return `${source.surah_number || source.surah || '?'}:${source.ayah_number || source.ayah || source.ayah_range || '?'}`;
}

function resolveSurahLabel(source = {}, useArabic = false) {
  const surahNumber = source.surah_number || source.surah;
  if (useArabic) {
    return source.surah_name_ar || source.surah_name_en || (surahNumber ? String(surahNumber) : '?');
  }
  return source.surah_name_en || source.surah_name_ar || (surahNumber ? String(surahNumber) : '?');
}

function formatLinkDisplay(url, useArabic = false) {
  const value = String(url || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.replace(/^www\./i, '');
    return useArabic ? `رابط المصدر الرسمي (${host})` : `Official source (${host})`;
  } catch {
    return useArabic ? 'رابط المصدر الرسمي' : 'Official source link';
  }
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

function buildValidationBlockedMessage(question = '') {
  return containsArabic(question) ? VALIDATION_BLOCKED_AR : VALIDATION_BLOCKED_EN;
}

const LEAKED_METADATA_LINE_PATTERNS = [
  /^Arabic text:/i,
  /^Translation source:/i,
  /^Translator:/i,
  /^Dataset:/i,
  /^License:/i,
  /^License status:/i,
  /^Attribution required$/i,
  /^Share-alike review required$/i,
  /^Edition:\s/i,
  /^Book:\s/i,
  /^Original source:/i,
  /^https?:\/\/\S+$/i,
  /github\.com/i,
  /^Quran JSON dataset/i,
  /risan\/quran-json/i,
  /spa5k\/tafsir_api/i,
];

function stripLeakedMetadataFromAnswer(answer = '') {
  return String(answer || '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !LEAKED_METADATA_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildQuranTemplate(source, question = '') {
  const useArabic = containsArabic(question);
  const ref = resolveAyahRef(source);
  const surahLabel = resolveSurahLabel(source, useArabic);
  const translationCredit = source.translation_name || source.translator || '';

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
      translationCredit ? `الترجمة: ${translationCredit}` : null,
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
    translationCredit ? `Translation: ${translationCredit}` : null,
    '',
    '**Note:**',
    'This is stored Quranic text from approved sources only, not model-generated translation or tafsir.',
  ].filter(Boolean).join('\n');
}

function buildTafsirTemplate(source, question = '') {
  const useArabic = containsArabic(question);
  const ref = resolveAyahRef(source);
  const surahLabel = resolveSurahLabel(source, useArabic);
  const tafsirBookName = source.tafsir_book_name || source.tafsir_book_name_en || source.tafsir_book_name_ar || source.title || 'Tafsir source';
  const previewSource = source.explanation_text || source.translation_text || 'Explanation text is not available in the approved source record.';
  const preview = String(previewSource).slice(0, TAFSIR_PREVIEW_MAX_CHARS).trim();
  const previewSuffix = String(previewSource).length > preview.length ? '…' : '';
  const author = source.tafsir_author || '';

  if (useArabic) {
    return [
      '### تفسير الآية',
      '',
      '**السورة:**',
      surahLabel,
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
      '',
      '**تنبيه:**',
      'هذا مقتطف تفسير موثق من المصدر المعتمد فقط، وليس فتوى شخصية.',
    ].filter(Boolean).join('\n');
  }

  return [
    '### Tafsir',
    '',
    '**Surah:**',
    surahLabel,
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
  const linkLabel = sourceUrl ? formatLinkDisplay(sourceUrl, useArabic) : '';

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
      linkLabel ? '**الرابط:**' : null,
      linkLabel || null,
      linkLabel ? '' : null,
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
    linkLabel ? '**Link:**' : null,
    linkLabel || null,
    linkLabel ? '' : null,
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
  let answer;
  if (['hadith', 'hadith_explanation'].includes(source.source_type)) {
    answer = buildHadithTemplate(source);
  } else if (source.source_type === 'tafsir') {
    answer = buildTafsirTemplate(source, question);
  } else if (['quran', 'quran_translation'].includes(source.source_type)) {
    answer = buildQuranTemplate(source, question);
  } else if (['fatwa', 'scholar_statement', 'book', 'lecture', 'educational_explanation'].includes(source.source_type)) {
    answer = buildScholarTemplate(source, question);
  } else {
    const sourceTitle = source.source_title || source.title || source.collection_name || source.scholar_name || source.id || 'Approved source';
    answer = [
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
  return stripLeakedMetadataFromAnswer(answer);
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
  resolveSurahLabel,
  resolveAyahRef,
  formatLinkDisplay,
  resolveAnswerType,
  answerHasBuiltInScholarNote,
  buildNoSourceMessage,
  buildValidationBlockedMessage,
  stripLeakedMetadataFromAnswer,
  buildTemplateAnswer,
  buildQuranTemplate,
  buildTafsirTemplate,
  buildScholarTemplate,
};
