import { PIPELINE_CONFIG } from './config';
import type {
  ActivePolicyDoc,
  AgentInstructionsSnapshot,
  FetchedArticle,
  PolicySettings,
  PolicyTone,
} from './types';

export const DEFAULT_POLICY_SETTINGS: PolicySettings = {
  reading_level: 'grade 6',
  target_headline_words: 10,
  target_summary_words: 60,
  tone: 'calm_neutral',
  max_per_topic: PIPELINE_CONFIG.maxPerTopic,
  max_per_region: PIPELINE_CONFIG.maxPerRegion,
  max_market_stories: PIPELINE_CONFIG.maxMarketStories,
};

export const DEFAULT_ACTIVE_POLICY: ActivePolicyDoc = {
  active_version: 'v1',
  settings: DEFAULT_POLICY_SETTINGS,
  admin_instructions: '',
};

export const LOCKED_CORE_SUMMARY =
  'Locked Core (Code-Only): Strict G-rated safety (no graphic detail, injury/body descriptions, profanity, or sexual content; wars/disasters in 1 plain factual sentence), source-only facts (no invented details), attribute every claim/opinion, neutral plain verbs, and structured JSON output.';

export const LOCKED_CORE_RULES = [
  'LOCKED CORE RULES (Always enforced, cannot be overridden):',
  '- Stick strictly to facts present in the source text. Do not invent details.',
  '- Include key named entities (people, countries, organizations) that appear in the source text.',
  '- Attribute every claim and opinion to who said it (e.g., "Officials said...", "Critics argue...").',
  '- For disputes, state each side’s position in one sentence.',
  '- Use plain verbs. Avoid loaded words such as "slammed", "regime", or "brutal".',
  '- Do not say who is right or what the reader should feel.',
  '- G-rated strictly: NO graphic detail, NO descriptions of injuries or bodies, NO profanity or sexual content.',
  '- Output format: JSON with ai_headline, ai_summary, and ai_explanation.',
];

const TONE_DESCRIPTIONS: Record<PolicyTone, string> = {
  calm_neutral: 'objective, neutral, calm, and G-rated',
  curious_educator: 'warm, clear, objective, curious educator, and G-rated',
  concise_wire: 'crisp, wire-style factual, neutral, and G-rated',
};

export function buildInstructionsSnapshot(
  policy: ActivePolicyDoc,
  editorRedirect?: string
): AgentInstructionsSnapshot {
  return {
    prompt_version: policy.active_version || 'v1',
    reading_level: policy.settings.reading_level,
    target_headline_words: policy.settings.target_headline_words,
    target_summary_words: policy.settings.target_summary_words,
    tone: policy.settings.tone,
    admin_instructions: policy.admin_instructions || '',
    ...(editorRedirect?.trim() ? { editor_redirect: editorRedirect.trim() } : {}),
    locked_core_summary: LOCKED_CORE_SUMMARY,
  };
}

export function buildSummarizerPrompt(
  article: FetchedArticle,
  policy: ActivePolicyDoc,
  editorRedirect?: string
): string {
  const { settings, admin_instructions } = policy;
  const toneText =
    TONE_DESCRIPTIONS[settings.tone] || TONE_DESCRIPTIONS.calm_neutral;

  const sensitivityInstruction = article.sensitive
    ? '- This story is marked SENSITIVE: state what happened in one plain factual sentence with zero graphic detail.'
    : '- Wars, disasters, and deaths may be reported only in one plain factual sentence.';

  const lines = [
    `You are a thoughtful educator explaining today's world news at a ${settings.reading_level} reading level so middle schoolers can understand it on their own.`,
    `Rewrite the article below in an ${toneText} tone.`,
    'Tier 1 Policy Settings:',
    `- ai_headline: Clear, neutral, and around ${settings.target_headline_words} words. State what happened. No questions, no teasers, no exclamation marks.`,
    `- ai_summary: Simple, accurate language in 3 to 4 sentences (around ${settings.target_summary_words} words total).`,
    `- ai_explanation: "Why it matters" in 2 to 3 short sentences for someone with zero background context—explain what led to this, who or what it affects in everyday life, and why it matters—in plain, calm, neutral, G-rated ${settings.reading_level} words (never tell the reader what to feel).`,
    `- Reading level: ${settings.reading_level}. If needed, explain 1 or 2 hard terms in plain words.`,
    sensitivityInstruction,
    '',
    ...LOCKED_CORE_RULES,
  ];

  if (admin_instructions?.trim()) {
    lines.push(
      '',
      'Tier 2 Admin Editorial Instructions (must still obey Locked Core):',
      admin_instructions.trim()
    );
  }

  if (editorRedirect?.trim()) {
    lines.push(
      '',
      'Editor Single-Draft Redirect Instructions (must still obey Locked Core):',
      editorRedirect.trim()
    );
  }

  lines.push(
    '',
    `Title: ${article.title}`,
    `Source: ${article.source}`,
    `Topic: ${article.topic} | Region: ${article.region} | Sensitive: ${article.sensitive}`,
    `Source Text:\n${article.fullText}`
  );

  return lines.join('\n');
}

