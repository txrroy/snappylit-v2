import { GoogleGenAI, Type } from '@google/genai';
import { PIPELINE_CONFIG } from '../config';
import { withGeminiRetry } from '../lib/retry';
import {
  buildSummarizerPrompt,
  DEFAULT_ACTIVE_POLICY,
} from '../policy';
import type { ActivePolicyDoc, FetchedArticle, SummaryOutput } from '../types';

export interface SummarizeOptions {
  policy?: ActivePolicyDoc;
  editorRedirect?: string;
}

/**
 * Agent 2 (The Summarizer): Rewrites a news article into G-rated, neutral language
 * using the active three-tier policy (Settings, Admin instructions, Locked Core).
 */
export async function summarizeArticle(
  ai: GoogleGenAI,
  article: FetchedArticle,
  options: SummarizeOptions = {}
): Promise<SummaryOutput | null> {
  try {
    const policy = options.policy ?? DEFAULT_ACTIVE_POLICY;
    const prompt = buildSummarizerPrompt(
      article,
      policy,
      options.editorRedirect
    );

    const response = await withGeminiRetry(
      `Agent 2 (Summarizer: ${article.title.slice(0, 40)})`,
      () =>
        ai.models.generateContent({
          model: PIPELINE_CONFIG.geminiModel,
          contents: prompt,
          config: {
            abortSignal: AbortSignal.timeout(PIPELINE_CONFIG.llmTimeoutMs),
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                ai_headline: { type: Type.STRING },
                ai_summary: { type: Type.STRING },
                ai_explanation: { type: Type.STRING },
              },
              required: ['ai_headline', 'ai_summary', 'ai_explanation'],
            },
          },
        })
    );

    const parsed = JSON.parse(response.text || '{}') as Partial<SummaryOutput>;
    if (!parsed.ai_headline?.trim() || !parsed.ai_summary?.trim()) {
      throw new Error('Summarizer returned empty headline or summary');
    }

    return {
      ai_headline: parsed.ai_headline.trim(),
      ai_summary: parsed.ai_summary.trim(),
      ai_explanation: (parsed.ai_explanation || '').trim(),
    };
  } catch (err) {
    console.error(`Agent 2 (Summarizer) failed for "${article.title}":`, err);
    return null;
  }
}
