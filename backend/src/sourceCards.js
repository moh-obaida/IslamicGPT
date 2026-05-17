function sourceReference(s) {
  return s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.url || s.local_reference || '';
}

function previewText(value, maxChars = 300) {
  const full = String(value || '').trim();
  if (!full) return '';
  return full.length > maxChars ? `${full.slice(0, maxChars).trim()}…` : full;
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
        preview: s.source_type === 'tafsir'
          ? previewText(s.explanation_preview || s.explanation_text || s.translation_text || s.summary || '')
          : (s.translation_text || s.summary || ''),
        metadata: {
          translator: s.translator || '',
          translation_name: s.translation_name || '',
          translation_language: s.translation_language || '',
          translation_source: s.translation_source || '',
          translation_source_url: s.translation_source_url || '',
          quran_text_style: s.quran_text_style || '',
          quran_arabic_source: s.quran_arabic_source || '',
          quran_edition: s.quran_edition || '',
          license_status: s.license_status || '',
          attribution_text: s.attribution_text || '',
          attribution_url: s.attribution_url || '',
          requires_attribution: s.requires_attribution === true,
          requires_sharealike_review: s.requires_sharealike_review === true,
          dataset_name: s.dataset_name || '',
          dataset_version: s.dataset_version || '',
          dataset_url: s.dataset_url || '',
        },
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
