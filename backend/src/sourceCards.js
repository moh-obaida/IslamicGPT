function sourceReference(s) {
  return s.reference_number || s.fatwa_number || s.fatwa_reference || s.page_number || s.timestamp || s.url || s.local_reference || '';
}

function previewText(value, maxChars = 300) {
  const full = String(value || '').trim();
  if (!full) return '';
  return full.length > maxChars ? `${full.slice(0, maxChars).trim()}…` : full;
}

function quranTitle(source) {
  const surahNum = source.surah_number || source.surah;
  const ayahNum = source.ayah_number || source.ayah || source.ayah_range;
  const en = source.surah_name_en || '';
  const ar = source.surah_name_ar || '';
  const ref = surahNum && ayahNum ? `${surahNum}:${ayahNum}` : '';
  if (en && ref) return `${en} ${ref}`;
  if (ar && ref) return `${ar} ${ref}`;
  return source.title || ref || 'Quran';
}

function approvalBadges(source) {
  const badges = [];
  if (source.approved_for_answers === true) badges.push('Approved');
  if (source.verified_by_admin === true) badges.push('Verified');
  return badges;
}

function formatSourceCards(sources) {
  return sources.map((s) => {
    const badges = approvalBadges(s);

    if (s.source_type === 'tafsir') {
      const title = s.title || `${s.tafsir_book_name || 'Tafsir'} ${s.surah_number || '?'}:${s.ayah_number || s.ayah_range || '?'}`;
      const tafsirRef = `${s.tafsir_book_name || 'Tafsir'} — تفسير ${s.surah_number || '?'}:${s.ayah_number || s.ayah_range || '?'}`;
      return {
        id: s.id,
        type: 'tafsir',
        source_type: 'tafsir',
        badge: 'Tafsir',
        title,
        reference: s.source_title || s.title || `Quran ${s.surah_number || '?'}:${s.ayah_number || s.ayah_range || '?'}`,
        arabic: s.arabic_text || '',
        preview: previewText(s.explanation_preview || s.explanation_text || s.translation_text || s.summary || ''),
        metadata: {
          tafsir_edition_slug: s.tafsir_edition_slug || '',
          tafsir_book_name: s.tafsir_book_name || s.tafsir_book_name_en || s.tafsir_book_name_ar || '',
          tafsir_author: s.tafsir_author || '',
          tafsir_language: s.tafsir_language || '',
          surah_number: s.surah_number || s.surah || null,
          ayah_number: s.ayah_number || s.ayah || null,
          ayah_range: s.ayah_range || '',
          surah_name_en: s.surah_name_en || '',
          surah_name_ar: s.surah_name_ar || '',
          original_source: s.original_source || '',
          dataset_url: s.dataset_url || '',
          repo_license: s.repo_license || '',
          license_status: s.license_status || '',
          requires_attribution: s.requires_attribution === true,
          approved_for_answers: s.approved_for_answers === true,
          verified_by_admin: s.verified_by_admin === true,
        },
        badges,
        usedFor: 'Tafsir evidence',
        copyCitation: tafsirRef,
      };
    }

    if (['quran', 'quran_translation'].includes(s.source_type)) {
      const title = quranTitle(s);
      const quranRef = `Quran ${s.surah_number || s.surah || '?'}:${s.ayah_number || s.ayah || '?'}`;
      return {
        id: s.id,
        type: s.source_type,
        source_type: 'quran',
        badge: 'Quran',
        title,
        reference: s.source_title || s.title || `Quran ${s.surah_number || '?'}:${s.ayah_number || '?'}`,
        arabic: s.arabic_text || '',
        preview: s.translation_text || s.summary || '',
        metadata: {
          surah_number: s.surah_number || s.surah || null,
          ayah_number: s.ayah_number || s.ayah || null,
          surah_name_en: s.surah_name_en || '',
          surah_name_ar: s.surah_name_ar || '',
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
          approved_for_answers: s.approved_for_answers === true,
          verified_by_admin: s.verified_by_admin === true,
        },
        badges,
        usedFor: 'Quran evidence',
        copyCitation: quranRef,
      };
    }

    if (['hadith', 'hadith_explanation'].includes(s.source_type)) {
      const hadithNumber = s.hadith_number || s.hadith_number_global || s.hadith_number_in_book || 'N/A';
      const title = `${s.collection_name || 'Hadith'} #${hadithNumber}`;
      return {
        id: s.id,
        type: s.source_type,
        source_type: s.source_type,
        badge: 'Hadith',
        title,
        reference: [s.book_name, s.chapter_name].filter(Boolean).join(' / '),
        grade: s.grade || '',
        arabic: s.arabic_text || '',
        preview: s.translation_text || s.summary || '',
        badges,
        usedFor: 'Hadith evidence',
        weakWarning: String(s.grade || '').toLowerCase().includes('weak') ? 'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.' : null,
        copyCitation: title,
      };
    }

    if (['scholar_statement', 'fatwa', 'book', 'lecture', 'video_transcript', 'educational_explanation'].includes(s.source_type)) {
      const scholarName = s.scholar_name_en || s.scholar_name_ar || s.scholar_name || '';
      const title = s.title || s.source_title || scholarName || 'Scholar source';
      return {
        id: s.id,
        type: s.source_type === 'fatwa' ? 'fatwa' : 'scholar',
        source_type: s.source_type,
        badge: s.source_type === 'fatwa' ? 'Fatwa' : 'Scholar',
        title,
        scholar_name: scholarName,
        question_text: s.question_text || '',
        reference: sourceReference(s),
        source_url: s.source_url || s.url || '',
        preview: s.answer_text || s.original_text || s.translation_text || s.summary || '',
        metadata: {
          fatwa_reference: s.fatwa_reference || '',
          approved_for_answers: s.approved_for_answers === true,
          verified_by_admin: s.verified_by_admin === true,
        },
        badges,
        usedFor: 'Scholarly explanation',
        copyCitation: [scholarName, title, sourceReference(s)].filter(Boolean).join(' - '),
      };
    }

    return {
      id: s.id,
      type: 'document',
      source_type: s.source_type || 'document',
      badge: 'Approved Document',
      title: s.document_title || s.title || s.file_name || 'Document',
      reference: [s.section_title, s.page_number ? `Page ${s.page_number}` : '', s.upload_status || 'approved'].filter(Boolean).join(' · '),
      preview: s.summary || s.translation_text || s.arabic_text || '',
      badges,
      usedFor: 'Approved supporting document',
      copyCitation: `${s.document_title || s.title || s.file_name || 'Document'}`,
    };
  });
}

module.exports = { formatSourceCards, quranTitle, approvalBadges };
