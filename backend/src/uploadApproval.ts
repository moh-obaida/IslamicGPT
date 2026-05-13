import { IslamicSourceChunk } from './islamicSources';

export interface UploadedDocumentRecord extends IslamicSourceChunk {
  source_type: 'uploaded_document' | 'approved_pdf';
  upload_status: 'pending_review' | 'approved' | 'rejected';
}

export function createPendingUploadedDocument(record: UploadedDocumentRecord): UploadedDocumentRecord {
  return {
    ...record,
    upload_status: 'pending_review',
    approved_for_answers: false,
    approved_for_fatwa: false,
    verified_by_admin: false,
  };
}

export function canUseUploadedDocumentForIslamicAnswer(record: UploadedDocumentRecord): boolean {
  return record.upload_status === 'approved' && record.verified_by_admin && record.approved_for_answers;
}
