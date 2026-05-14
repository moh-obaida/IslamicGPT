function formatSourceCards(sources) {
  return sources.map((s) => {
    if (s.source_type === 'quran') {
      return { type: 'quran', badge: 'Quran', surahName: s.surah_name_en || s.surah_name_ar, surahNumber: s.surah_number, ayah: s.ayah_number || s.ayah_range, arabic: s.arabic_text, translation: s.translation_text, usedFor: 'Islamic evidence', copyCitation: `${s.surah_name_en || s.surah_name_ar} (${s.surah_number}:${s.ayah_number || s.ayah_range})` };
    }
    if (s.source_type === 'hadith') {
      return { type: 'hadith', badge: 'Hadith', collection: s.collection_name, bookChapter: [s.book_name, s.chapter_name].filter(Boolean).join(' / '), hadithNumber: s.hadith_number || 'Hadith number not available in this source.', grade: s.grade, arabic: s.arabic_text, translation: s.translation_text, usedFor: 'Islamic evidence', weakWarning: String(s.grade || '').toLowerCase().includes('weak') ? 'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.' : null, copyCitation: `${s.collection_name} #${s.hadith_number || 'N/A'}` };
    }
    if (['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript'].includes(s.source_type)) {
      return { type: 'scholar', badge: 'Scholar / Fatwa / Explanation', scholar: s.scholar_name, sourceTitle: s.source_title || s.title, reference: s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.url || s.local_reference, quoteOrSummary: s.original_text || s.summary, usedFor: 'Scholarly explanation', copyCitation: `${s.scholar_name || 'Scholar'} - ${s.source_title || s.title || ''}` };
    }
    return { type: 'document', badge: 'Approved Document', documentTitle: s.document_title || s.title, fileName: s.file_name, pageNumber: s.page_number, section: s.section_title, approvalStatus: s.upload_status || 'approved', usedFor: 'Approved supporting document', copyCitation: `${s.document_title || s.title || 'Document'}` };
  });
}

module.exports = { formatSourceCards };
