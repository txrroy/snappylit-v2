import { GoogleGenAI, Type } from '@google/genai';
import { PIPELINE_CONFIG } from '../config';
import { withGeminiRetry } from '../lib/retry';
import type {
  ArticleFlag,
  FetchedArticle,
  JudgeClaim,
  JudgeOutput,
  SummaryOutput,
} from '../types';

const ALLOWED_FLAGS = new Set<ArticleFlag>([
  'SNIPPET_ONLY',
  'LOADED_LANGUAGE',
  'ONE_SIDED',
  'GRAPHIC_DETAIL',
  'TOO_COMPLEX',
]);

function clampScore(value: unknown, fallback = 50): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * Agent 3 (The Judge): Audits the generated summary against the source text
 * using a deduction rubric across accuracy, neutrality, safety, and readability,
 * plus claim-level evidence and flags for the human approver.
 */
export async function judgeArticle(
  ai: GoogleGenAI,
  article: FetchedArticle,
  summary: SummaryOutput
): Promise<JudgeOutput> {
  try {
    const response = await withGeminiRetry(
      `Agent 3 (Judge: ${article.title.slice(0, 40)})`,
      () =>
        ai.models.generateContent({
          model: PIPELINE_CONFIG.geminiModel,
          contents: [
            'You are a strict fact-checker, neutrality auditor, and child-safety reviewer.',
            'Your job is ONLY to audit and report for a human approver—do not approve or reject.',
            'Start each of the four scores at 100 and deduct points for every issue found:',
            '- accuracy (0–100): Deduct 20+ for any unsupported claim or hallucination; deduct 10 if source was snippet-only or key context is missing.',
            '- neutrality (0–100): Deduct 15+ for loaded words ("slammed", "regime", "brutal"), unattributed opinions, or one-sided framing of a dispute.',
            '- safety (0–100): Score against strict G-rated rules (no graphic detail, no injury/body descriptions, no profanity/sexual content; wars/disasters/deaths in one plain factual sentence).',
            `- readability (0–100): Score against ${PIPELINE_CONFIG.readingLevel} (middle schoolers can understand it on their own; 1–2 hard terms explained in plain words).`,
            '',
            'Also extract every factual claim from the Generated Headline and Summary into claims: [{ claim, evidence }], where evidence is an exact quoted sentence from the Source Text or "unsupported".',
            'Return applicable flags from ONLY: SNIPPET_ONLY, LOADED_LANGUAGE, ONE_SIDED, GRAPHIC_DETAIL, TOO_COMPLEX.',
            'In reasoning, concisely explain every point deduction across the four scores.',
            '',
            `Source was fallback RSS snippet only: ${article.usedFallbackSnippet}`,
            `Generated Headline: ${summary.ai_headline}`,
            `Generated Summary: ${summary.ai_summary}`,
            '',
            `Source Text:\n${article.fullText}`,
          ].join('\n'),
          config: {
            abortSignal: AbortSignal.timeout(PIPELINE_CONFIG.llmTimeoutMs),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                scores: {
                  type: Type.OBJECT,
                  properties: {
                    accuracy: { type: Type.INTEGER },
                    neutrality: { type: Type.INTEGER },
                    safety: { type: Type.INTEGER },
                    readability: { type: Type.INTEGER },
                  },
                  required: ['accuracy', 'neutrality', 'safety', 'readability'],
                },
                flags: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                claims: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      claim: { type: Type.STRING },
                      evidence: { type: Type.STRING },
                    },
                    required: ['claim', 'evidence'],
                  },
                },
                reasoning: { type: Type.STRING },
              },
              required: ['scores', 'flags', 'claims', 'reasoning'],
            },
          },
        })
    );

    const parsed = JSON.parse(response.text || '{}') as {
      scores?: Partial<JudgeOutput['scores']>;
      flags?: string[];
      claims?: Array<Partial<JudgeClaim>>;
      reasoning?: string;
    };

    const scores = {
      accuracy: clampScore(parsed.scores?.accuracy),
      neutrality: clampScore(parsed.scores?.neutrality),
      safety: clampScore(parsed.scores?.safety),
      readability: clampScore(parsed.scores?.readability),
    };

    const flagSet = new Set<ArticleFlag>();
    for (const rawFlag of parsed.flags || []) {
      if (ALLOWED_FLAGS.has(rawFlag as ArticleFlag)) {
        flagSet.add(rawFlag as ArticleFlag);
      }
    }
    if (article.usedFallbackSnippet) {
      flagSet.add('SNIPPET_ONLY');
    }

    const claims: JudgeClaim[] = (parsed.claims || [])
      .filter((c) => c.claim?.trim())
      .map((c) => ({
        claim: c.claim!.trim(),
        evidence: (c.evidence || 'unsupported').trim(),
      }));

    const confidence_score = Math.round(
      (scores.accuracy + scores.neutrality + scores.safety + scores.readability) / 4
    );
    const pass =
      scores.accuracy >= 90 &&
      scores.neutrality >= 75 &&
      scores.safety >= 75 &&
      scores.readability >= 75;

    return {
      confidence_score,
      pass,
      scores,
      flags: Array.from(flagSet),
      claims,
      reasoning: (parsed.reasoning || 'No reasoning provided.').trim(),
    };
  } catch (err) {
    console.error(`Agent 3 (Judge) failed for "${article.title}":`, err);
    return {
      confidence_score: 0,
      pass: false,
      scores: { accuracy: 0, neutrality: 0, safety: 0, readability: 0 },
      flags: article.usedFallbackSnippet ? ['SNIPPET_ONLY'] : [],
      claims: [],
      reasoning: 'Automated verification failed; manual review required.',
    };
  }
}
