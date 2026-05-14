export type IslamicSourceType =
  | 'quran'
  | 'quran_translation'
  | 'tafsir'
  | 'hadith'
  | 'hadith_explanation'
  | 'scholar_statement'
  | 'fatwa'
  | 'book'
  | 'lecture'
  | 'video_transcript'
  | 'approved_pdf'
  | 'uploaded_document'
  | 'educational_explanation';

export type ReliabilityLevel = 1 | 2 | 3 | 4 | 5;

export interface IslamicSourceChunk {
  id: string;
  source_type: IslamicSourceType;
  source_name?: string;
  title?: string;
  language?: string;
  reliability_level: ReliabilityLevel;
  verified_by_admin: boolean;
  approved_for_answers: boolean;
  approved_for_fatwa: boolean;
  url?: string;
  local_reference?: string;
  created_at?: string;
  updated_at?: string;

  surah_name_ar?: string;
  surah_name_en?: string;
  surah_number?: number;
  ayah_number?: number;
  ayah_range?: string;
  arabic_text?: string;
  translation_text?: string;
  translator?: string;
  tafsir_source?: string;

  collection_name?: string;
  book_name?: string;
  chapter_name?: string;
  hadith_number?: string;
  hadith_numbering_source?: string;
  grade?: string;
  grader?: string;
  chain_or_narrator_if_available?: string;
  narrator_if_available?: string;
  source_url?: string;

  scholar_name?: string;
  source_title?: string;
  reference_type?: string;
  reference_number?: string;
  fatwa_number?: string;
  page_number?: string;
  volume_number?: string;
  article_title?: string;
  video_title?: string;
  timestamp?: string;
  original_text?: string;
  transcript_verified?: boolean;
  summary?: string;

  uploaded_by?: string;
  approved_by_admin?: string;
  document_title?: string;
  section_title?: string;
  extracted_text?: string;
  file_name?: string;
  file_hash?: string;
}

export const REFUSAL_MESSAGE = 'I could not find enough reliable evidence in the approved sources.';
