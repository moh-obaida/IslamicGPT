const { normalizeText } = require('./sourceStore');

const KNOWN_COLLECTIONS = [
  'sahih al-bukhari',
  'bukhari',
  'sahih muslim',
  'muslim',
  'tirmidhi',
  'abu dawud',
  'nasai',
  'ibn majah',
];

const KNOWN_SCHOLARS = [
  'ibn baz',
  'ibn uthaymeen',
  'al-nawawi',
  'abu hanifa',
  'imam malik',
  'imam shafii',
  'imam ahmad',
  'ibn taymiyyah',
  'ibn al-qayyim',
  'khamees',
];

function sourceText(source) {
  return normalizeText([
    source.id,
    source.title,
    source.source_title,
    source.collection_name,
    source.book_name,
    source.chapter_name,
    source.hadith_number,
    source.surah_number || source.surah,
    source.ayah_number || source.ayah,
    source.scholar_name,
    source.fatwa_reference,
    source.arabic_text,
    source.translation_text,
  ].filter(Boolean).join(' '));
}

function quoteLooksSupported(quote, sources) {
  const normalizeQuote = (value) => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const normalizedQuote = normalizeQuote(quote);
  if (normalizedQuote.length < 20) return true;
  return sources.some((source) => [source.translation_text, source.arabic_text, source.title, source.source_title]
    .filter(Boolean)
    .map(normalizeQuote)
    .some((candidate) => candidate.includes(normalizedQuote) || normalizedQuote.includes(candidate)));
}

function validateIslamicAnswerAgainstSources(answer, sources) {
  const unsupportedClaims = [];
  const text = String(answer || '');
  const lower = text.toLowerCase();

  if (!Array.isArray(sources) || sources.length === 0) {
    return {
      ok: false,
      reason: 'no_sources_for_islamic_answer',
      unsupportedClaims: ['Islamic answer attempted without approved sources.'],
    };
  }

  const allowedCollections = new Set(sources.map((source) => String(source.collection_name || '').toLowerCase()).filter(Boolean));
  const allowedScholars = new Set(sources.map((source) => String(source.scholar_name || '').toLowerCase()).filter(Boolean));
  const allowedHadithNumbers = new Set(sources.map((source) => String(source.hadith_number || '').toLowerCase()).filter(Boolean));
  const allowedQuranRefs = new Set(
    sources
      .filter((source) => (source.surah_number || source.surah) && (source.ayah_number || source.ayah))
      .map((source) => `${source.surah_number || source.surah}:${source.ayah_number || source.ayah}`),
  );
  const hasHadithSource = sources.some((source) => ['hadith', 'hadith_explanation'].includes(source.source_type));
  const hasQuranSource = sources.some((source) => ['quran', 'quran_translation', 'tafsir'].includes(source.source_type));
  const hasScholarSource = sources.some((source) => ['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript', 'educational_explanation'].includes(source.source_type));

  for (const collection of KNOWN_COLLECTIONS) {
    if (lower.includes(collection) && !allowedCollections.has(collection)) {
      unsupportedClaims.push(`Referenced collection "${collection}" is not in the approved sources.`);
    }
  }

  for (const scholar of KNOWN_SCHOLARS) {
    if (lower.includes(scholar) && !allowedScholars.has(scholar)) {
      unsupportedClaims.push(`Referenced scholar "${scholar}" is not in the approved sources.`);
    }
  }

  const hadithMatches = [...text.matchAll(/(?:hadith|bukhari|muslim|tirmidhi|abu dawud|nasai|ibn majah)[^.\n\r]{0,20}#?\s*(\d{1,5})/gi)];
  hadithMatches.forEach((match) => {
    const hadithNumber = String(match[1] || '').toLowerCase();
    if (hadithNumber && !allowedHadithNumbers.has(hadithNumber)) {
      unsupportedClaims.push(`Referenced hadith number "${hadithNumber}" is not in the approved sources.`);
    }
  });

  const quranMatches = [...text.matchAll(/(?:quran|surah|ayah)[^.\n\r]{0,30}?(\d+):(\d+)/gi)];
  quranMatches.forEach((match) => {
    const ref = `${match[1]}:${match[2]}`;
    if (!allowedQuranRefs.has(ref)) {
      unsupportedClaims.push(`Referenced Quran verse "${ref}" is not in the approved sources.`);
    }
  });

  const quotedSegments = [...text.matchAll(/["“”]([^"“”]{25,})["“”]/g)].map((match) => match[1]);
  quotedSegments.forEach((quote) => {
    if (!quoteLooksSupported(quote, sources)) {
      unsupportedClaims.push(`Quoted text "${quote.slice(0, 60)}..." is not supported by the approved sources.`);
    }
  });

  if (/there is a hadith in/i.test(text) && !hasHadithSource) unsupportedClaims.push('Answer mentions a hadith without an approved hadith source.');
  if (/the quran says in/i.test(text) && !hasQuranSource) unsupportedClaims.push('Answer mentions a Quran citation without an approved Quran source.');
  if (/according to imam/i.test(text) && !hasScholarSource) unsupportedClaims.push('Answer mentions a scholarly opinion without an approved scholar source.');

  return {
    ok: unsupportedClaims.length === 0,
    reason: unsupportedClaims.length ? 'unsupported_reference_detected' : null,
    unsupportedClaims,
  };
}

module.exports = {
  validateIslamicAnswerAgainstSources,
};
