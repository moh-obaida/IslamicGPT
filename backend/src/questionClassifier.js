const MODE_BEHAVIOR = {
  hadith_mode: { sourceType: 'hadith', intent: 'general' },
  quran_mode: { sourceType: 'quran', intent: 'general' },
  tafsir_mode: { sourceType: 'tafsir', intent: 'general' },
  fiqh_mode: { sourceType: 'fiqh', intent: 'general' },
  aqidah_mode: { sourceType: 'aqidah', intent: 'general' },
  compare_opinions_mode: { sourceType: 'all', intent: 'comparison' },
  explain_simply_mode: { sourceType: 'all', intent: 'explanation' },
  student_explanation_mode: { sourceType: 'all', intent: 'explanation' },
  islamic_search_mode: { sourceType: 'all', intent: 'general' },
  arabic_mode: { sourceType: 'all', intent: 'general' },
};

const ISLAMIC_KEYWORDS = [
  'islam', 'muslim', 'quran', "qur'an", 'ayah', 'verse', 'surah', 'ayat al-kursi', 'ayat al kursi', 'ayatul kursi', 'hadith', 'sunnah',
  'prophet', 'rasul', 'allah', 'dua', 'dhikr', 'salah', 'prayer', 'wudu', 'zakat',
  'fasting', 'ramadan', 'hajj', 'umrah', 'halal', 'haram', 'fiqh', 'fatwa', 'aqidah',
  'tawheed', 'shirk', 'iman', 'ihsan', 'tafsir', 'sahaba', 'bukhari', 'muslim',
  'tirmidhi', 'abu dawud', 'nasai', 'ibn majah', 'intention', 'niyyah',
  'قرآن', 'آية', 'سورة', 'حديث', 'سنة', 'النبي', 'الرسول', 'الله', 'دعاء', 'ذكر',
  'صلاة', 'وضوء', 'زكاة', 'صيام', 'رمضان', 'حج', 'عمرة', 'حلال', 'حرام', 'فقه',
  'فتوى', 'عقيدة', 'توحيد', 'شرك', 'إيمان', 'إحسان', 'تفسير', 'نية', 'الأعمال بالنيات',
];

const SENSITIVE_KEYWORDS = [
  'fatwa', 'ruling', 'valid', 'invalid', 'permissible', 'allowed', 'forbidden',
  'halal', 'haram', 'divorce', 'marriage', 'inheritance', 'riba', 'interest',
  'business halal', 'my prayer', 'my fast', 'my divorce', 'my marriage', 'can i',
  'should i', 'do i have to', 'is it valid', 'is it accepted', 'هل يجوز', 'هل يصح',
  'هل صلاتي', 'هل صومي', 'طلاق', 'زواج', 'ميراث', 'ربا',
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
  /\bshow\s+(?:me\s+)?tafsir\b/i,
  /\btafsir\s+(?:ibn|al[-\s]|[\w-]+).*(?:\d{1,3}\s*[:/-]\s*\d{1,3}|fatihah|fatiha|kursi)\b/i,
  /\bayat\s+al[-\s]?kursi\b/i,
  /\bayatul\s+kursi\b/i,
  /source about/i,
  /حديث عن/,
  /آية عن/,
  /أعطني حديث/,
  /أعطني آية/,
  /اعطني آية/,
  /آية الكرسي/,
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
  /fatwa/i,
  /ruling/i,
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

function detectIntent(message, mode) {
  if (COMPARISON_PATTERNS.some((pattern) => pattern.test(message)) || mode === 'compare_opinions_mode') return 'comparison';
  if (PERSONAL_RULING_PATTERNS.some((pattern) => pattern.test(message))) return 'personal_ruling';
  if (/\bshow\s+(?:me\s+)?tafsir\b/i.test(message) || /اعرض.*تفسير/.test(message)) return 'direct_source_lookup';
  if (EXPLANATION_PATTERNS.some((pattern) => pattern.test(message)) || ['explain_simply_mode', 'student_explanation_mode'].includes(mode)) return 'explanation';
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
  if (/(fatwa|scholar|imam|shaykh|فتوى|شيخ|عالم)/i.test(message)) return lower.includes('fatwa') || message.includes('فتوى') ? 'fatwa' : 'scholar';
  if (/(prayer|wudu|zakat|fasting|ramadan|hajj|umrah|halal|haram|fiqh|salah|وضوء|زكاة|صيام|رمضان|حج|عمرة|حلال|حرام|فقه)/i.test(message)) return 'fiqh';
  return MODE_BEHAVIOR[mode]?.sourceType || 'all';
}

function classifyQuestion(message, mode = 'islamic_search_mode') {
  const normalizedMessage = normalizeMessage(message);
  const behavior = MODE_BEHAVIOR[mode] || MODE_BEHAVIOR.islamic_search_mode;
  const modeImpliesIslamic = Boolean(mode && mode in MODE_BEHAVIOR && mode !== 'islamic_search_mode');
  const isIslamic = Boolean(normalizedMessage) && (includesAny(normalizedMessage, ISLAMIC_KEYWORDS) || modeImpliesIslamic);
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
