import { IslamicSourceChunk } from '../islamicSources';

export interface QuranSourceCard {
  sourceType: 'Quran';
  surah: string;
  surahNumber: number;
  ayah: string;
  arabic?: string;
  translation?: string;
  source: string;
  usedFor: string;
}

export interface HadithSourceCard {
  sourceType: 'Hadith';
  collection: string;
  bookChapter?: string;
  hadithNumber: string;
  numberingSource?: string;
  grade?: string;
  arabic?: string;
  translation?: string;
  source: string;
  usedFor: string;
  weakWarning?: string;
}

export function formatQuranSourceCard(source: IslamicSourceChunk, usedFor: string): QuranSourceCard {
  return {
    sourceType: 'Quran',
    surah: source.surah_name_en ?? source.surah_name_ar ?? 'Unknown Surah',
    surahNumber: source.surah_number ?? 0,
    ayah: source.ayah_range ?? String(source.ayah_number ?? ''),
    arabic: source.arabic_text,
    translation: source.translation_text,
    source: source.source_name ?? source.local_reference ?? 'Approved Quran database',
    usedFor,
  };
}

export function formatHadithSourceCard(source: IslamicSourceChunk, usedFor: string): HadithSourceCard {
  const weak = source.grade?.toLowerCase().includes('weak');
  return {
    sourceType: 'Hadith',
    collection: source.collection_name ?? 'Unknown Collection',
    bookChapter: [source.book_name, source.chapter_name].filter(Boolean).join(' / ') || undefined,
    hadithNumber: source.hadith_number ?? 'Hadith number not available in this source.',
    numberingSource: source.hadith_numbering_source,
    grade: source.grade,
    arabic: source.arabic_text,
    translation: source.translation_text,
    source: source.source_name ?? source.source_url ?? source.local_reference ?? 'Approved hadith database',
    usedFor,
    weakWarning: weak ? 'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.' : undefined,
  };
}
