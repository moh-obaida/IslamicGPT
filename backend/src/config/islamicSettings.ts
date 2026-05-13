export type KnowledgeSourceMode =
  | 'verified_local_sources_only'
  | 'verified_local_sources_plus_approved_online_apis'
  | 'admin_review_mode';

export interface IslamicSettings {
  knowledgeSourceMode: KnowledgeSourceMode;
  useOnlyVerifiedSources: boolean;
  allowOpenWebForIslamic: false;
}

export const DEFAULT_ISLAMIC_SETTINGS: IslamicSettings = {
  knowledgeSourceMode: 'verified_local_sources_only',
  useOnlyVerifiedSources: true,
  allowOpenWebForIslamic: false,
};
