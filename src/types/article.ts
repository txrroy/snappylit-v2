export type ArticleStatus = 'draft' | 'published' | 'rejected';

export interface JudgeScores {
  accuracy: number;
  neutrality: number;
  safety: number;
  readability: number;
}

export interface JudgeClaim {
  claim: string;
  evidence: string;
}

export type ArticleFlag =
  | 'SNIPPET_ONLY'
  | 'LOADED_LANGUAGE'
  | 'ONE_SIDED'
  | 'GRAPHIC_DETAIL'
  | 'TOO_COMPLEX';

export type AutonomyLevel = 'ask_me' | 'fix_then_show' | 'fix_automatically';

export type FlagAutonomyConfig = Record<ArticleFlag, AutonomyLevel>;

export interface DecisionRecord {
  action: 'edited' | 'approved' | 'rejected' | 'regenerated' | 'unpublished';
  at: string;
}

export interface PipelineTraceStep {
  step: 'fetch' | 'select' | 'extract' | 'summarize' | 'judge' | 'regenerate';
  agent: string;
  at: string;
  duration_ms?: number;
  status: 'ok' | 'fallback' | 'warning' | 'error';
  summary: string;
  details?: Record<string, string | number | boolean>;
}

export interface PipelineRunLog {
  id: string;
  date: string;
  at: string;
  raw_headlines_count: number;
  merged_events_count: number;
  picked_count: number;
  target_count: number;
  full_text_count: number;
  snippet_fallback_count: number;
  ready_count: number;
  needs_check_count: number;
  could_not_verify_count: number;
  shortfall_reason?: string;
  dropped_candidates?: {
    title: string;
    source: string;
    source_count: number;
    drop_reason: string;
  }[];
}

export type PolicyTone = 'calm_neutral' | 'curious_educator' | 'concise_wire';

export type ReadingLevel =
  | 'grade 4'
  | 'grade 5'
  | 'grade 6'
  | 'grade 7'
  | 'grade 8';

export interface PolicySettings {
  reading_level: ReadingLevel;
  target_headline_words: number;
  target_summary_words: number;
  tone: PolicyTone;
  max_per_topic: number;
  max_per_region: number;
  max_market_stories: number;
  flag_autonomy?: FlagAutonomyConfig;
}

export interface AgentInstructionsSnapshot {
  prompt_version: string;
  reading_level: string;
  target_headline_words: number;
  target_summary_words: number;
  tone: PolicyTone;
  admin_instructions: string;
  editor_redirect?: string;
  locked_core_summary: string;
}

export interface PolicyVersion {
  id: string;
  version: string;
  settings: PolicySettings;
  admin_instructions: string;
  change_note: string;
  created_at: string;
  created_by: string;
  rolled_back_from?: string | null;
}

export interface ActivePolicyDoc {
  active_version: string;
  settings: PolicySettings;
  admin_instructions: string;
  updated_at: string;
  updated_by: string;
}

export interface RssSourceConfig {
  name: string;
  url: string;
  enabled: boolean;
}

export interface Article {
  id: string;
  /** Date string in YYYY-MM-DD format */
  date: string;
  original_url: string;
  image_url: string | null;
  ai_headline: string;
  ai_summary: string;
  ai_explanation?: string;
  source_text?: string;
  confidence_score: number;
  confidence_reasoning: string;
  judge_pass?: boolean;
  scores?: JudgeScores;
  flags?: ArticleFlag[];
  claims?: JudgeClaim[];
  source_count?: number;
  source_names?: string[];
  alternate_urls?: string[];
  topic?: string;
  region?: string;
  sensitive?: boolean;
  selection_reason?: string;
  used_fallback_snippet?: boolean;
  status: ArticleStatus;
  approved_by: string | null;
  edited_at?: string | null;
  approved_at?: string | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  kids_topic_confirmed?: boolean;
  source_checked?: boolean;
  auto_retried_complexity?: boolean;
  decision_history?: DecisionRecord[];
  prompt_version?: string;
  instructions_snapshot?: AgentInstructionsSnapshot;
  pipeline_trace?: PipelineTraceStep[];
}
