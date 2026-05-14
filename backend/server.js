const http = require('http');
const fs = require('fs');
const path = require('path');

const REFUSAL_MESSAGE = 'I could not find enough reliable evidence in the approved sources.';
const DEBUG_SOURCES = String(process.env.VITE_DEBUG_SOURCES || 'false').toLowerCase() === 'true';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

function selectOllamaModel(modelMode = 'balanced') {
  const mode = ['fast', 'balanced', 'deep'].includes(modelMode) ? modelMode : 'balanced';
  const map = {
    fast: process.env.OLLAMA_FAST_MODEL || 'qwen2.5:7b',
    balanced: process.env.OLLAMA_BALANCED_MODEL || 'llama3.1:8b',
    deep: process.env.OLLAMA_DEEP_MODEL || 'qwen2.5:14b',
  };
  const timeoutMs = mode === 'fast' ? 30000 : mode === 'deep' ? 90000 : 60000;
  return { mode, model: map[mode], timeoutMs };
}

function normalizeArabic(input = '') { return input.replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, ' ').trim(); }
function normalizeEnglish(input = '') { return input.toLowerCase().replace(/\s+/g, ' ').trim(); }
function normalizeText(input = '') { return `${normalizeArabic(String(input))} ${normalizeEnglish(String(input))}`.trim(); }
function detectLanguage(msg=''){ if(/[\u0600-\u06FF]/.test(msg)) return 'arabic'; if(/[a-zA-Z]/.test(msg)) return 'english'; return 'auto'; }
function classifyIslamicQuestion(question) { return /(allah|quran|hadith|sunnah|fiqh|fatwa|tafsir|islam|prophet|dua|aqidah|zakat|salah|ramadan|umrah|hajj|bukhari|muslim|تفسير|حديث|القران|القرآن|فقه|فتوى)/i.test(question || ''); }

function validateIslamicCitations(answer, sources) {
  const issues=[];
  const sourceIds = new Set(sources.map(s=>s.id));
  const mentionsAllahOrQuran = /allah says|quran|surah|ayah|قال الله|آية/i.test(answer);
  const mentionsProphetOrHadith = /the prophet ﷺ said|the prophet said|hadith|قال الرسول/i.test(answer);
  const mentionsScholar = /(ibn baz|khamees|ibn uthaymeen|فتوى|ابن باز|العثيمين)/i.test(answer);
  const mentionedIds = [...answer.matchAll(/SOURCE ID:\s*([\w:-]+)/gi)].map(m=>m[1]);
  mentionedIds.forEach(id=>{ if(!sourceIds.has(id)) issues.push(`Unknown source id cited: ${id}`); });

  const hasQuranCitation = sources.some((s) => s.source_type === 'quran' && s.surah_number && (s.ayah_number || s.ayah_range));
  const hasHadithCitation = sources.some((s) => s.source_type === 'hadith' && s.collection_name && (s.hadith_number || s.hadith_number_unavailable===true));
  const hasScholarCitation = sources.some((s) => ['scholar_statement', 'fatwa', 'lecture', 'book', 'video_transcript'].includes(s.source_type) && s.scholar_name && (s.reference_number || s.fatwa_number || s.page_number || s.timestamp || s.local_reference || s.url));
  if (mentionsAllahOrQuran && !hasQuranCitation) issues.push('Quran claim without Quran source metadata');
  if (mentionsProphetOrHadith && !hasHadithCitation) issues.push('Hadith claim without hadith source metadata');
  if (mentionsScholar && !hasScholarCitation) issues.push('Scholar/fatwa claim without exact scholar reference');
  if (/page\s+\d+/i.test(answer) && !sources.some(s=>s.page_number)) issues.push('Page claim without page metadata');
  if (/\b\d{1,2}:\d{2}(:\d{2})?\b/.test(answer) && !sources.some(s=>s.timestamp || s.source_type==='video_transcript')) issues.push('Timestamp claim without timestamp source');
  return { passed: issues.length===0, issues };
}

function loadIndexSources() { const p=path.join(__dirname,'..','data','islamic-sources','indexes','compiled-sources.json'); return fs.existsSync(p)?(JSON.parse(fs.readFileSync(p,'utf8')).records||[]):[]; }
function modeAllowedTypes(mode){ return ({quran_mode:['quran','quran_translation','tafsir'],hadith_mode:['hadith','hadith_explanation'],tafsir_mode:['quran','quran_translation','tafsir'],fiqh_mode:['quran','hadith','hadith_explanation','scholar_statement','fatwa','book'],aqidah_mode:['quran','hadith','hadith_explanation','scholar_statement','book','educational_explanation'],arabic_mode:null,student_explanation_mode:['quran','hadith','tafsir','educational_explanation'],compare_opinions_mode:['scholar_statement','fatwa','book','lecture','video_transcript'],islamic_search_mode:null})[mode]||null; }
function weightedScore(source,tokens){ const strong=normalizeText([source.title,source.source_name,source.topic,source.scholar_name,source.collection_name,source.book_name].filter(Boolean).join(' ')); const medium=normalizeText([source.translation_text,source.arabic_text,source.summary,source.source_title].filter(Boolean).join(' ')); const weak=normalizeText(JSON.stringify(source)); let score=0; tokens.forEach(t=>{ if(strong.includes(t)) score+=5; if(medium.includes(t)) score+=3; if(weak.includes(t)) score+=1;}); return score; }
function searchIslamicKnowledgeBase(question, mode){ const debug={query:question,normalizedQuery:normalizeText(question),totalSearched:0,matchedApproved:0,rejected:[],modeFilter:mode,citationValidation:null,openWebDisabled:true}; const all=loadIndexSources(); debug.totalSearched=all.length; const allowed=modeAllowedTypes(mode); const approved=all.filter(s=>{ if(!s.verified_by_admin||!s.approved_for_answers){debug.rejected.push(`${s.id}:not approved`); return false;} if((s.source_type==='uploaded_document'||s.source_type==='approved_pdf')&&s.upload_status!=='approved'){debug.rejected.push(`${s.id}:upload not approved`); return false;} if(allowed&&!allowed.includes(s.source_type)){debug.rejected.push(`${s.id}:mode excluded`); return false;} return true; }); const toks=normalizeText(question).split(' ').filter(Boolean); const scored=approved.map(s=>({source:s,score:weightedScore(s,toks)})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,8); debug.matchedApproved=scored.length; debug.matchedSourceIds=scored.map(s=>s.source.id); return {matches:scored.map(s=>s.source), debug}; }

function buildOllamaIslamicPrompt({question,mode,language,sources}){
  const context=sources.map(s=>`SOURCE ID: ${s.id}\nSOURCE TYPE: ${s.source_type}\nSURAH: ${s.surah_name_en||''}\nSURAH NUMBER: ${s.surah_number||''}\nAYAH: ${s.ayah_number||s.ayah_range||''}\nCOLLECTION: ${s.collection_name||''}\nHADITH NUMBER: ${s.hadith_number|| (s.hadith_number_unavailable?'Hadith number not available in this source.':'')}\nSCHOLAR: ${s.scholar_name||''}\nREFERENCE: ${s.reference_number||s.fatwa_number||s.page_number||s.timestamp||s.local_reference||s.url||''}\nARABIC: ${s.arabic_text||''}\nTRANSLATION: ${s.translation_text||''}`).join('\n\n');
  return `SYSTEM:\nYou are IslamicGPT, a reliable Islamic knowledge assistant.\nYou may answer Islamic questions only from the approved source context provided below.\nThe local AI model is only the writer. The approved retrieved sources are the authority.\nIf the source context does not contain enough evidence, return exactly:\n${REFUSAL_MESSAGE}\nDo not use your general memory as evidence. Do not invent references or source IDs.\n\nUSER QUESTION:\n${question}\nMODE: ${mode}\nLANGUAGE: ${language}\n\nAPPROVED SOURCE CONTEXT:\n${context}\n\nREQUIRED ANSWER FORMAT:\nAnswer:\n...\n\nEvidence from Quran:\n- ...\n\nEvidence from Hadith:\n- ...\n\nScholarly Explanation:\n- ...\n\nExplanation:\n...\n\nConfidence:\nHigh / Medium / Not enough evidence`;
}

async function callOllama({model,prompt,timeoutMs}){
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{
    const res=await fetch(`${OLLAMA_BASE_URL}/api/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,prompt,stream:false}),signal:controller.signal});
    const data=await res.json();
    if(!res.ok) throw new Error(data.error||`HTTP ${res.status}`);
    return { ok:true, text:data.response||''};
  }catch(e){ return {ok:false,error:e.name==='AbortError'?'model_timeout':e.message}; }
  finally{clearTimeout(timer);} }

async function generateWithOllama(params){ return callOllama(params); }
async function regenerateWithCitationRepair(params){ const repair=`${params.prompt}\n\nYour previous answer included unsupported or invalid citations. Rewrite the answer using only the provided source IDs. If you cannot, return exactly: ${REFUSAL_MESSAGE}`; return callOllama({...params,prompt:repair}); }
function buildNoSourceResponse({mode,isIslamicQuestion,modelMode}){ return {answer:REFUSAL_MESSAGE,mode,modelMode,isIslamicQuestion,confidence:'not_enough_evidence',sources:[],sourceCards:[],warnings:[],errorState:'no_sources_found',modelUsed:null,llmCalled:false,validation:{passed:false,attempts:0,issues:['no_sources_found']},loadingStagesCompleted:['classified_question','searched_approved_sources']}; }
function buildOllamaUnavailableResponse({mode,isIslamicQuestion,modelMode,modelUsed,errorState='ollama_unavailable'}){ return {answer:'IslamicGPT could not reach the local AI model. Please check that Ollama is running.',mode,modelMode,isIslamicQuestion,confidence:'not_enough_evidence',sources:[],sourceCards:[],warnings:[],errorState,modelUsed,llmCalled:true,validation:{passed:false,attempts:1,issues:[errorState]},loadingStagesCompleted:['classified_question','searched_approved_sources','built_source_context','called_local_model']}; }

function formatSourceCards(sources){return sources.map(s=> s.source_type==='quran'?{type:'quran',badge:'Quran',surahName:s.surah_name_en||s.surah_name_ar,surahNumber:s.surah_number,ayah:s.ayah_number||s.ayah_range,arabic:s.arabic_text,translation:s.translation_text,usedFor:'Islamic evidence',copyCitation:`${s.surah_name_en||s.surah_name_ar} (${s.surah_number}:${s.ayah_number||s.ayah_range})`}: s.source_type==='hadith'?{type:'hadith',badge:'Hadith',collection:s.collection_name,bookChapter:[s.book_name,s.chapter_name].filter(Boolean).join(' / '),hadithNumber:s.hadith_number||'Hadith number not available in this source.',grade:s.grade,arabic:s.arabic_text,translation:s.translation_text,usedFor:'Islamic evidence',weakWarning:String(s.grade||'').toLowerCase().includes('weak')?'This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.':null,copyCitation:`${s.collection_name} #${s.hadith_number||'N/A'}`} : ['scholar_statement','fatwa','book','lecture','video_transcript'].includes(s.source_type)?{type:'scholar',badge:'Scholar / Fatwa / Explanation',scholar:s.scholar_name,sourceTitle:s.source_title||s.title,reference:s.reference_number||s.fatwa_number||s.page_number||s.timestamp||s.url||s.local_reference,quoteOrSummary:s.original_text||s.summary,usedFor:'Scholarly explanation',copyCitation:`${s.scholar_name||'Scholar'} - ${s.source_title||s.title||''}` } : {type:'document',badge:'Approved Document',documentTitle:s.document_title||s.title,fileName:s.file_name,pageNumber:s.page_number,section:s.section_title,approvalStatus:s.upload_status||'approved',usedFor:'Approved supporting document',copyCitation:`${s.document_title||s.title||'Document'}`});}

function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data));}

const server=http.createServer((req,res)=>{ if(req.method==='OPTIONS') return send(res,200,{}); if(req.url==='/api/chat'&&req.method==='POST'){ let body=''; req.on('data',c=>body+=c); req.on('end', async()=>{ try{ const p=JSON.parse(body||'{}'); const question=p.message||''; const mode=p.mode||'islamic_search_mode'; const language=p.language&&p.language!=='auto'?p.language:detectLanguage(question); const selected=selectOllamaModel(p.modelMode); const isIslamicQuestion=classifyIslamicQuestion(question)||String(mode).endsWith('_mode'); const loading=['classified_question']; if(!isIslamicQuestion){ return send(res,200,{answer:'IslamicGPT is focused on Islamic knowledge from approved sources.',mode,modelMode:selected.mode,modelUsed:null,isIslamicQuestion,llmCalled:false,confidence:'not_enough_evidence',sources:[],sourceCards:[],warnings:[],errorState:null,validation:{passed:true,attempts:0,issues:[]},loadingStagesCompleted:loading}); }
 const {matches,debug}=searchIslamicKnowledgeBase(question,mode); loading.push('searched_approved_sources'); if(!matches.length){const r=buildNoSourceResponse({mode,isIslamicQuestion,modelMode:selected.mode}); if(DEBUG_SOURCES||p.debug) r.debug=debug; return send(res,200,r);} const sourceCards=formatSourceCards(matches); loading.push('built_source_context'); const prompt=buildOllamaIslamicPrompt({question,mode,language,sources:matches}); const first=await generateWithOllama({model:selected.model,prompt,timeoutMs:selected.timeoutMs}); loading.push('called_local_model'); if(!first.ok){ const err=first.error==='model_timeout'?'model_timeout':'ollama_unavailable'; return send(res,503,buildOllamaUnavailableResponse({mode,isIslamicQuestion,modelMode:selected.mode,modelUsed:selected.model,errorState:err})); }
 let validation=validateIslamicCitations(first.text,matches); let finalText=first.text; let attempts=1; if(!validation.passed){ const second=await regenerateWithCitationRepair({model:selected.model,prompt,timeoutMs:selected.timeoutMs}); attempts=2; if(second.ok){ validation=validateIslamicCitations(second.text,matches); finalText=second.text; } }
 loading.push('validated_citations'); if(!validation.passed){ const fail={answer:REFUSAL_MESSAGE,mode,modelMode:selected.mode,modelUsed:selected.model,isIslamicQuestion,confidence:'not_enough_evidence',sources:[],sourceCards:[],warnings:[],errorState:'citation_validation_failed',llmCalled:true,validation:{passed:false,attempts,issues:validation.issues},loadingStagesCompleted:[...loading,'prepared_answer']}; if(DEBUG_SOURCES||p.debug) fail.debug={...debug,citationValidation:false}; return send(res,200,fail); }
 const warnings=[]; matches.forEach(m=>{ if(m.source_type==='hadith'&&String(m.grade||'').toLowerCase().includes('weak')) warnings.push('This hadith is graded weak in the approved source. It should not be used as main evidence for a ruling.');}); const ok={answer:finalText,mode,modelMode:selected.mode,modelUsed:selected.model,isIslamicQuestion,confidence:matches.length>2?'high':'medium',sources:matches,sourceCards,warnings,errorState:null,llmCalled:true,validation:{passed:true,attempts,issues:[]},loadingStagesCompleted:[...loading,'prepared_answer']}; if(DEBUG_SOURCES||p.debug) ok.debug={...debug,citationValidation:true,modelUsed:selected.model,llmCalled:true,openWebDisabled:true}; return send(res,200,ok);
 }catch{ return send(res,500,{answer:'IslamicGPT could not complete the answer because the source check failed. Please try again or check the source database.',errorState:'backend_unavailable'});} }); return;} send(res,404,{error:'Not found'});});

server.listen(Number(process.env.PORT||3001),()=>console.log('IslamicGPT backend listening on http://localhost:'+Number(process.env.PORT||3001)));
