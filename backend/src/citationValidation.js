function validateIslamicCitations(answer, sources) {
  const issues = [];
  const sourceIds = new Set(sources.map((s) => s.id));
  [...answer.matchAll(/SOURCE ID:\s*([\w:-]+)/gi)].forEach((m) => {
    if (!sourceIds.has(m[1])) issues.push(`Unknown source id cited: ${m[1]}`);
  });

  const mentionsQuran = /(allah says|quran|surah|ayah|قال الله|آية)/i.test(answer);
  const mentionsHadith = /(the prophet ﷺ said|the prophet said|hadith|قال الرسول)/i.test(answer);
  const mentionsScholar = /(ibn baz|khamees|ibn uthaymeen|فتوى|ابن باز|العثيمين)/i.test(answer);

  const hasQuran = sources.some((s) => s.source_type === 'quran' && s.surah_number && (s.ayah_number || s.ayah_range));
  const hasHadith = sources.some((s) => s.source_type === 'hadith' && s.collection_name && (s.hadith_number || s.hadith_number_unavailable === true));
  const hasScholar = sources.some((s) => ['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript'].includes(s.source_type) && s.scholar_name && (s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.local_reference || s.url));

  if (mentionsQuran && !hasQuran) issues.push('Quran claim without Quran source ID metadata');
  if (mentionsHadith && !hasHadith) issues.push('Hadith claim without hadith source ID metadata');
  if (mentionsScholar && !hasScholar) issues.push('Scholar/Fatwa claim without scholar source ID metadata');

  if (/page\s+\d+/i.test(answer) && !sources.some((s) => s.page_number)) issues.push('Page claim without metadata');
  if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(answer) && !sources.some((s) => s.timestamp || s.source_type === 'video_transcript')) issues.push('Timestamp claim without metadata');

  return { passed: issues.length === 0, issues };
}

module.exports = { validateIslamicCitations };
