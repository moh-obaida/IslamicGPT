const { quranReferenceFromQuery } = require('./supabaseSourceDb');

const MODE_BEHAVIOR = {
  hadith_mode: { sourceType: 'hadith', intent: 'general' },
  quran_mode: { sourceType: 'quran', intent: 'general' },
  tafsir_mode: { sourceType: 'tafsir', intent: 'general' },
  scholar_mode: { sourceType: 'scholar', intent: 'general' },
  fiqh_mode: { sourceType: 'fiqh', intent: 'general' },
  aqidah_mode: { sourceType: 'aqidah', intent: 'general' },
  compare_opinions_mode: { sourceType: 'all', intent: 'comparison' },
  explain_simply_mode: { sourceType: 'all', intent: 'explanation' },
  student_explanation_mode: { sourceType: 'all', intent: 'explanation' },
  islamic_search_mode: { sourceType: 'all', intent: 'general' },
  arabic_mode: { sourceType: 'all', intent: 'general' },
};

const ISLAMIC_KEYWORDS = [
  'islam', 'muslim', 'quran', "qur'an", 'ayah', 'verse', 'surah', 'surat', 'sura', 'ayat al-kursi', 'ayat al kursi', 'ayatul kursi', 'hadith', 'sunnah',
  'prophet', 'rasul', 'allah', 'dua', 'dhikr', 'salah', 'prayer', 'wudu', 'zakat',
  'fasting', 'ramadan', 'hajj', 'umrah', 'halal', 'haram', 'fiqh', 'fatwa', 'aqidah',
  'tawheed', 'shirk', 'iman', 'ihsan', 'tafsir', 'sahaba', 'bukhari', 'muslim',
  'tirmidhi', 'abu dawud', 'nasai', 'ibn majah', 'intention', 'niyyah',
  'ibn baz', 'bin baz', 'ibn uthaymeen', 'ibn uthaymin', 'ibn taymiyyah',
  'ibn taymiyah', 'ibn al-qayyim', 'ibn al qayyim', 'nawawi', 'ibn hajar',
  'قرآن', 'آية', 'سورة', 'حديث', 'سنة', 'النبي', 'الرسول', 'الله', 'دعاء', 'ذكر',
  'صلاة', 'وضوء', 'زكاة', 'صيام', 'رمضان', 'حج', 'عمرة', 'حلال', 'حرام', 'فقه',
  'فتوى', 'عقيدة', 'توحيد', 'شرك', 'إيمان', 'إحسان', 'تفسير', 'نية', 'الأعمال بالنيات',
  'ابن باز', 'بن باز', 'ابن عثيمين', 'ابن تيمية', 'ابن القيم', 'النووي', 'ابن حجر',
];

const SENSITIVE_KEYWORDS = [
  'fatwa', 'ruling', 'valid', 'invalid', 'permissible', 'allowed', 'forbidden',
  'halal', 'haram', 'divorce', 'marriage', 'inheritance', 'riba', 'interest',
  'business halal', 'my prayer', 'my fast', 'my divorce', 'my marriage', 'can i',
  'should i', 'do i have to', 'is it valid', 'is it accepted', 'هل يجوز', 'هل يصح',
  'هل صلاتي', 'هل صومي', 'طلاق', 'زواج', 'ميراث', 'ربا',
];


const ARABIC_SCHOLAR_VARIANTS = [
  'ابن باز', 'بن باز', 'الشيخ ابن باز', 'الشيخ عبد العزيز بن باز', 'عبد العزيز بن باز',
];

const DIRECT_SCHOLAR_LOOKUP_PATTERNS = [
  /\b(?:ibn|bin)\s+baz\b.*\b(?:fatwa|ruling|opinion|view|said|quote)\b/i,
  /\b(?:fatwa|ruling|opinion|view)\b.*\b(?:ibn|bin)\s+baz\b/i,
  /ما\s+حكم.+(?:عند|للشيخ)\s+(?:ابن|بن)\s+باز/,
  /حكم.+عند\s+(?:ابن|بن)\s+باز/,
  /فتوى\s+(?:ابن|بن)\s+باز\s+(?:عن|في)/,
  /ما\s+فتوى\s+(?:ابن|بن)\s+باز\s+في/,
  /(?:ابن|بن)\s+باز.+(?:حكم|فتوى)/,
  /(?:الشيخ\s+)?(?:ابن|بن)\s+باز.+(?:حكم|فتوى)/,
  /قول\s+(?:ابن|بن)\s+باز\s+في/,
  /رأي\s+(?:ابن|بن)\s+باز\s+في/,
];

const DIRECT_SOURCE_LOOKUP_PATTERNS = [
  /give me a hadith/i,
  /show me a hadith/i,
  /hadith about/i,
  /give me an ayah/i,
  /show me an ayah/i,
  /give me a quran verse/i,
  /show me a quran verse/i,
  /show me a verse/i,
  /ayah about/i,
  /verse about/i,
  /quran verse about/i,
  /\bquran\s+\d{1,3}\s*[:/-]\s*\d{1,3}\b/i,
  /\bquran\s+(?:aya|ayah|verse)\s+\d{1,3}\s*[:/-]\s*\d{1,3}\b/i,
  /\b(?:aya|ayah|verse)\s+\d{1,3}\s*[:/-]\s*\d{1,3}\b/i,
  /(?:آية|اية|ايه)\s*\d{1,3}\s*[:/-]\s*\d{1,3}/,
  /(?:الآية|الاية)\s*\d{1,3}\s*[:/-]\s*\d{1,3}/,
  /\bshow\s+(?:me\s+)?tafsir\b/i,
  /\btafsir\s+(?:ibn|al[-\s]|[\w-]+).*(?:\d{1,3}\s*[:/-]\s*\d{1,3}|fatihah|fatiha|kursi)\b/i,
  /\bayat\s+al[-\s]?kursi\b/i,
  /\bayatul\s+kursi\b/i,
  /source about/i,
  /\bfatwa\s+(?:by|from|of)\b/i,
  /\b(?:show|give|find|share)\s+(?:me\s+)?(?:a\s+)?fatwa\b/i,
  /\b(?:quote|source)\s+(?:from\s+)?(?:ibn|imam|shaykh|sheikh|al[-\s])/i,
  /فتوى\s+(?:ابن|بن|الشيخ)/,
  /قول\s+(?:ابن|الإمام|الشيخ|شيخ)/,
  /حديث عن/,
  /آية عن/,
  /أعطني حديث/,
  /أعطني آية/,
  /اعطني آية/,
  /آية الكرسي/,
  /\b(?:surah|surat|sura)\s+(?:al[-\s]?)?fatihah\b/i,
  /\b(?:surah|surat|sura)\s+fatiha\b/i,
  /\b(?:surah|surat|sura)\s+(?:al[-\s]?)?ikhlas\b/i,
  /\b(?:surah|surat|sura)\s+ikhlas\b/i,
  /\b(?:surah|surat|sura)\s+(?:al[-\s]?)?falaq\b/i,
  /\b(?:surah|surat|sura)\s+falaq\b/i,
  /\b(?:surah|surat|sura)\s+(?:an[-\s]?)?nas\b/i,
  /\b(?:surah|surat|sura)\s+nas\b/i,
  /\b(?:surah|surat|sura)\s+(?:al[-\s]?)?yusuf\b/i,
  /\b(?:surah|surat|sura)\s+yusuf\b/i,
  /سورة\s+الفاتحة/,
  /سورة\s+الإخلاص/,
  /سورة\s+الاخلاص/,
  /سورة\s+الفلق/,
  /سورة\s+الناس/,
  /اعرض.*تفسير/,
];

const EXPLANATION_PATTERNS = [
  /explain/i,
  /\btafsir\s+of\b/i,
  /\bexplanation\s+of\s+(?:quran|ayah|verse|surah)\b/i,
  /\bexplain\s+(?:ayah|quran|verse|surah)\b/i,
  /simply/i,
  /student/i,
  /what does .* mean/i,
  /what did .*\b(?:say|write|teach)\b/i,
  /\b(?:ibn|imam|shaykh|sheikh|al[-\s]).*\b(?:on|about|explanation of)\b/i,
  /meaning/i,
  /lesson/i,
  /benefit/i,
  /what does\s+\d{1,3}\s*[:/-]\s*\d{1,3}\s+mean/i,
  /شرح/,
  /اشرح/,
  /تفسير\s+(?:آية|اية|الفاتحة|سورة)/,
  /ببساطة/,
  /معنى/,
];

const COMPARISON_PATTERNS = [
  /compare/i,
  /difference/i,
  /opinions/i,
  /schools/i,
  /views/i,
  /قارن/,
  /اختلاف/,
];

const PERSONAL_RULING_PATTERNS = [
  /personal fatwa/i,
  /\bruling\s+(?:for|on)\s+(?:me|my)\b/i,
  /can i/i,
  /should i/i,
  /do i have to/i,
  /is it valid/i,
  /is it accepted/i,
  /is my .* valid/i,
  /is my .* accepted/i,
  /هل يجوز/,
  /هل يصح/,
  /هل .* صحيحة/,
];

function normalizeMessage(message = '') {
  return String(message || '').trim();
}

function includesAny(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.some((keyword) => lower.includes(String(keyword).toLowerCase()));
}

function isObviousQuranSurahQuery(message = '') {
  const text = String(message || '').trim();
  if (!text) return false;
  if (quranReferenceFromQuery(text)) return true;
  if (/\b(?:surah|surat|sura)\s+[\p{L}]/iu.test(text)) return true;
  if (/سورة\s+[\u0600-\u06FF]/u.test(text)) return true;
  return false;
}

function detectIntent(message, mode) {
  if (COMPARISON_PATTERNS.some((pattern) => pattern.test(message)) || mode === 'compare_opinions_mode') return 'comparison';
  if (/\bshow\s+(?:me\s+)?tafsir\b/i.test(message) || /اعرض.*تفسير/.test(message)) return 'direct_source_lookup';
  if (/\bfatwa\s+(?:by|from|of|about)\b/i.test(message) || /\b(?:show|give|find|share)\s+(?:me\s+)?(?:a\s+)?fatwa\b/i.test(message) || /(?:ibn|bin)\s+[\w-]+\s+fatwa\b/i.test(message) || /فتوى\s+(?:ابن|بن|الشيخ)/.test(message)) return 'direct_source_lookup';
  if (DIRECT_SCHOLAR_LOOKUP_PATTERNS.some((pattern) => pattern.test(message)) || ARABIC_SCHOLAR_VARIANTS.some((variant) => message.includes(variant))) return 'direct_source_lookup';
  if (PERSONAL_RULING_PATTERNS.some((pattern) => pattern.test(message))) return 'personal_ruling';
  if (EXPLANATION_PATTERNS.some((pattern) => pattern.test(message)) || ['explain_simply_mode', 'student_explanation_mode'].includes(mode)) return 'explanation';
  if (quranReferenceFromQuery(message)) return 'direct_source_lookup';
  if (DIRECT_SOURCE_LOOKUP_PATTERNS.some((pattern) => pattern.test(message))) return 'direct_source_lookup';
  return 'general';
}

function inferSourceType(message, mode, intent) {
  if (MODE_BEHAVIOR[mode]?.sourceType && MODE_BEHAVIOR[mode].sourceType !== 'all') return MODE_BEHAVIOR[mode].sourceType;
  if (intent === 'comparison') return 'all';

  const lower = message.toLowerCase();
  if (/(hadith|bukhari|muslim|tirmidhi|abu dawud|nasai|ibn majah|حديث|سنة|النبي|الرسول|niyyah|intention)/i.test(message)) return 'hadith';
  if (/(tafsir|تفسير)/i.test(message)) return 'tafsir';
  if (intent === 'explanation' && /(quran|qur'an|ayah|verse|surah|\b\d{1,3}\s*[:/-]\s*\d{1,3}\b|قرآن|آية|سورة|آية الكرسي)/i.test(message)) return 'tafsir';
  if (/(quran|qur'an|ayah|verse|surah|ayat al[-\s]?kursi|ayatul kursi|\b\d{1,3}\s*[:/-]\s*\d{1,3}\b|قرآن|آية|سورة|آية الكرسي)/i.test(message)) return 'quran';
  if (/(aqidah|tawheed|shirk|iman|ihsan|عقيدة|توحيد|شرك|إيمان|إحسان)/i.test(message)) return 'aqidah';
  if (/(ibn baz|bin baz|ibn uthaymeen|ibn uthaymin|ibn taymiyyah|ibn taymiyah|ibn al[-\s]qayyim|nawawi|ibn hajar|ابن باز|بن باز|ابن عثيمين|ابن تيمية|ابن القيم|النووي|ابن حجر|fatwa|scholar|imam|shaykh|sheikh|فتوى|شيخ|عالم|قول)/i.test(message)) return lower.includes('fatwa') || message.includes('فتوى') ? 'fatwa' : 'scholar';
  if (/(prayer|wudu|zakat|fasting|ramadan|hajj|umrah|halal|haram|fiqh|salah|وضوء|زكاة|صيام|رمضان|حج|عمرة|حلال|حرام|فقه)/i.test(message)) return 'fiqh';
  return MODE_BEHAVIOR[mode]?.sourceType || 'all';
}

function classifyQuestion(message, mode = 'islamic_search_mode') {
  const normalizedMessage = normalizeMessage(message);
  const behavior = MODE_BEHAVIOR[mode] || MODE_BEHAVIOR.islamic_search_mode;
  const modeImpliesIslamic = Boolean(mode && mode in MODE_BEHAVIOR && mode !== 'islamic_search_mode');
  const isIslamic = Boolean(normalizedMessage) && (
    includesAny(normalizedMessage, ISLAMIC_KEYWORDS)
    || modeImpliesIslamic
    || isObviousQuranSurahQuery(normalizedMessage)
  );
  const intent = detectIntent(normalizedMessage, mode);
  const isSensitive = includesAny(normalizedMessage, SENSITIVE_KEYWORDS) || intent === 'personal_ruling' || mode === 'fiqh_mode';
  const sourceType = inferSourceType(normalizedMessage, mode, intent);
  const requiresSources = isIslamic;
  const requiresScholarWarning = isSensitive || intent === 'personal_ruling';

  const reasons = [];
  if (mode in MODE_BEHAVIOR) reasons.push(`mode:${mode}`);
  if (isIslamic) reasons.push('islamic_keywords_or_mode');
  if (isSensitive) reasons.push('sensitive_or_personal_ruling');
  reasons.push(`intent:${intent}`);
  reasons.push(`sourceType:${sourceType || behavior.sourceType}`);

  return {
    isIslamic,
    isSensitive,
    requiresSources,
    requiresScholarWarning,
    sourceType: sourceType || behavior.sourceType || 'all',
    intent: behavior.intent !== 'general' && intent === 'general' ? behavior.intent : intent,
    reason: reasons.join(', '),
  };
}

module.exports = {
  MODE_BEHAVIOR,
  classifyQuestion,
};
