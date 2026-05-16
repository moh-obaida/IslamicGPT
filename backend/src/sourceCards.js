function sourceReference(s) {
  return s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.url || s.local_reference || '';
}

function formatSourceCards(sources) {
  return sources.map((s) => {
    if (['quran', 'quran_translation', 'tafsir'].includes(s.source_type)) {
      const badge = s.source_type === 'tafsir' ? 'Tafsir' : 'Quran';
      const title = `${s.surah_name_en || s.surah_name_ar || badge} (${s.surah_number || '?'}:${s.ayah_number || s.ayah_range || '?'})`;
      return {
        id: s.id,
        type: s.source_type,
        badge,
        title,
        reference: s.source_title || s.title || '',
        arabic: s.arabic_text || '',
        preview: s.translation_text || s.summary || '',
        usedFor: 'Islamic evidence',
        copyCitation: title,
      };
    }

    if (['hadith', 'hadith_explanation'].includes(s.source_type)) {
      const hadithNumber = s.hadith_number || s.hadith_number_global || s.hadith_number_in_book || 'N/A';
      const title = `${s.collection_name || 'Hadith'} #${hadithNumber}`;
      return {
        id: s.id,
        type: s.source_type,
        badge: 'Hadith',
        title,
        reference: [s.book_name, s.chapter_name].filter(Boolean).join(' / '),
        grade: s.grade || '',
        arabic: s.arabic_text || '',
        preview: s.translation_text || s.summary || '',
        usedFor: 'Islamic evidence',
        weakWarning: String(s.grade || '').toLowerCase().includes('weak') ? 'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.' : null,
        copyCitation: title,
      };
    }

    if (['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript', 'educational_explanation'].includes(s.source_type)) {
      return {
        id: s.id,
        type: 'scholar',
        badge: 'Scholar / Fatwa / Explanation',
        title: [s.scholar_name, s.source_title || s.title].filter(Boolean).join(' - ') || 'Scholar source',
        reference: sourceReference(s),
        preview: s.original_text || s.translation_text || s.summary || '',
        usedFor: 'Scholarly explanation',
        copyCitation: [s.scholar_name || 'Scholar', s.source_title || s.title || '', sourceReference(s)].filter(Boolean).join(' - '),
      };
    }

    return {
      id: s.id,
      type: 'document',
      badge: 'Approved Document',
      title: s.document_title || s.title || s.file_name || 'Document',
      reference: [s.section_title, s.page_number ? `Page ${s.page_number}` : '', s.upload_status || 'approved'].filter(Boolean).join(' · '),
      preview: s.summary || s.translation_text || s.arabic_text || '',
      usedFor: 'Approved supporting document',
      copyCitation: `${s.document_title || s.title || s.file_name || 'Document'}`,
    };
  });
}

module.exports = { formatSourceCards };
