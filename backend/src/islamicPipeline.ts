import { DEFAULT_ISLAMIC_SETTINGS, IslamicSettings } from './config/islamicSettings';
import { IslamicSourceChunk, REFUSAL_MESSAGE } from './islamicSources';

export type IslamicMode =
  | 'quran_mode'
  | 'hadith_mode'
  | 'tafsir_mode'
  | 'fiqh_mode'
  | 'aqidah_mode'
  | 'student_explanation_mode'
  | 'arabic_mode'
  | 'compare_opinions_mode'
  | 'islamic_search_mode';

export interface IslamicAnswerRequest {
  question: string;
  mode?: IslamicMode;
  settings?: IslamicSettings;
  sourcePool: IslamicSourceChunk[];
}

export interface IslamicAnswerResult {
  isIslamicQuestion: boolean;
  answer: string;
  sources: IslamicSourceChunk[];
  blockedByValidation: boolean;
}

export function classifyIslamicQuestion(question: string): boolean {
  return /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|dua|aqidah|zakat|salah|ramadan|umrah|hajj)/i.test(question);
}

export function detectPersonalFatwaRisk(question: string): boolean {
  return /(divorce|marriage dispute|inheritance|contract|medical|oath|takfir|apostasy|legal|custody)/i.test(question);
}

export async function ingestIslamicSource(source: IslamicSourceChunk): Promise<IslamicSourceChunk> { return source; }
export async function chunkIslamicText(source: IslamicSourceChunk): Promise<IslamicSourceChunk[]> { return [source]; }
export async function embedIslamicChunk(chunks: IslamicSourceChunk[]): Promise<IslamicSourceChunk[]> { return chunks; }

export async function searchIslamicKnowledgeBase(query: string, chunks: IslamicSourceChunk[], settings: IslamicSettings): Promise<IslamicSourceChunk[]> {
  if (settings.allowOpenWebForIslamic) {
    throw new Error('Open web search must remain disabled for Islamic answers.');
  }

  const q = query.toLowerCase();
  return chunks.filter((c) => {
    const trustedByMode =
      settings.knowledgeSourceMode === 'admin_review_mode'
        ? c.verified_by_admin
        : c.approved_for_answers && c.verified_by_admin;

    const verifiedFilter = settings.useOnlyVerifiedSources ? c.verified_by_admin : true;
    return trustedByMode && verifiedFilter && JSON.stringify(c).toLowerCase().includes(q);
  });
}

export function buildIslamicAnswerContext(question: string, sources: IslamicSourceChunk[]): string {
  const header = [
    'You are IslamicGPT.',
    'You may answer ONLY from the approved retrieved source context below.',
    'If evidence is missing, return exactly: I could not find enough reliable evidence in the approved sources.',
    `User question: ${question}`,
    'Approved source context:',
  ];

  const body = sources.map((s) => JSON.stringify(s));
  return [...header, ...body].join('\n');
}

export function formatIslamicSources(sources: IslamicSourceChunk[]): IslamicSourceChunk[] {
  return [...sources].sort((a, b) => a.reliability_level - b.reliability_level);
}

export function validateIslamicCitations(answer: string, sources: IslamicSourceChunk[]): boolean {
  const mentionsAllahOrQuran = /allah says|quran|surah|ayah/i.test(answer);
  const mentionsProphetOrHadith = /the prophet ﷺ said|the prophet said|hadith/i.test(answer);
  const mentionsScholar = /(ibn baz|ibn uthaymeen|al-albani|al-fawzan|mohammad othman al-khamees|scholar|fatwa)/i.test(answer);
  const mentionsPage = /page\s+\d+/i.test(answer);
  const mentionsTimestamp = /\b\d{1,2}:\d{2}(:\d{2})?\b/.test(answer);

  const hasQuranCitation = sources.some((s) => s.source_type === 'quran' && !!s.surah_number && !!(s.ayah_number || s.ayah_range));
  const hasHadithCitation = sources.some((s) => s.source_type === 'hadith' && !!s.collection_name && (!!s.hadith_number || s.hadith_number === 'Hadith number not available in this source.'));
  const hasScholarCitation = sources.some((s) => ['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript'].includes(s.source_type) && !!s.scholar_name && !!(s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.local_reference || s.url));

  if (mentionsAllahOrQuran && !hasQuranCitation) return false;
  if (mentionsProphetOrHadith && !hasHadithCitation) return false;
  if (mentionsScholar && !hasScholarCitation) return false;

  if (mentionsPage) {
    const hasPageRef = sources.some((s) => !!s.page_number);
    if (!hasPageRef) return false;
  }

  if (mentionsTimestamp) {
    const hasTimestampRef = sources.some((s) => !!s.timestamp || s.source_type === 'video_transcript');
    if (!hasTimestampRef) return false;
  }

  return true;
}

export function refuseUnsupportedAnswer(): string { return REFUSAL_MESSAGE; }

export async function generateIslamicAnswer(request: IslamicAnswerRequest): Promise<IslamicAnswerResult> {
  const settings = request.settings ?? DEFAULT_ISLAMIC_SETTINGS;
  const isIslamicQuestion = classifyIslamicQuestion(request.question);

  if (!isIslamicQuestion) {
    return {
      isIslamicQuestion,
      answer: 'This pipeline is reserved for Islamic questions.',
      sources: [],
      blockedByValidation: false,
    };
  }

  const retrievedSources = await searchIslamicKnowledgeBase(request.question, request.sourcePool, settings);
  if (!retrievedSources.length) {
    return { isIslamicQuestion, answer: refuseUnsupportedAnswer(), sources: [], blockedByValidation: false };
  }

  const sortedSources = formatIslamicSources(retrievedSources);
  const context = buildIslamicAnswerContext(request.question, sortedSources);

  // Placeholder model output; real runtime should pass `context` to local model.
  const warning = detectPersonalFatwaRisk(request.question)
    ? ' This may require a qualified scholar who can review the full details. I can provide general information from approved sources, but I cannot issue a personal fatwa.'
    : '';

  const draftAnswer = `Based on the retrieved source context, here is the answer. ${warning}\n${context.slice(0, 200)}...`;
  const valid = validateIslamicCitations(draftAnswer, sortedSources);

  if (!valid) {
    return { isIslamicQuestion, answer: refuseUnsupportedAnswer(), sources: sortedSources, blockedByValidation: true };
  }

  return { isIslamicQuestion, answer: draftAnswer, sources: sortedSources, blockedByValidation: false };
}
