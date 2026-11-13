import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  arrayUnion,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getApiBaseUrl } from '@/config/appConfig';
import type {
  ActivePolicyDoc,
  AgentInstructionsSnapshot,
  ArticleFlag,
  JudgeClaim,
  JudgeScores,
  PipelineTraceStep,
  PolicySettings,
  PolicyVersion,
  ReadingLevel,
  RssSourceConfig,
} from '@/types/article';

export const DEFAULT_POLICY_SETTINGS: PolicySettings = {
  reading_level: 'grade 6',
  target_headline_words: 10,
  target_summary_words: 60,
  tone: 'calm_neutral',
  max_per_topic: 4,
  max_per_region: 5,
  max_market_stories: 1,
};

export const LOCKED_CORE_SUMMARY =
  'Strict G-rated safety (no graphic detail, injury/body descriptions, profanity, or sexual content; wars/disasters in 1 plain factual sentence), source-only facts (no invented details), attribute every claim/opinion, neutral plain verbs, and structured JSON output.';

export const DEFAULT_RSS_SOURCES: RssSourceConfig[] = [
  {
    name: 'AP',
    enabled: true,
    url: 'https://news.google.com/rss/search?q=site:apnews.com&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'Reuters',
    enabled: true,
    url: 'https://news.google.com/rss/search?q=site:reuters.com&hl=en-US&gl=US&ceid=US:en',
  },
  {
    name: 'BBC World',
    enabled: true,
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  },
  {
    name: 'DW World',
    enabled: true,
    url: 'https://rss.dw.com/rdf/rss-en-world',
  },
  {
    name: 'France 24',
    enabled: true,
    url: 'https://www.france24.com/en/rss',
  },
  {
    name: 'Al Jazeera',
    enabled: true,
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
  },
  {
    name: 'NPR World',
    enabled: true,
    url: 'https://feeds.npr.org/1004/rss.xml',
  },
  {
    name: 'The Guardian World',
    enabled: true,
    url: 'https://www.theguardian.com/world/rss',
  },
  {
    name: 'The Hindu International',
    enabled: true,
    url: 'https://www.thehindu.com/news/international/feeder/default.rss',
  },
  {
    name: 'ABC Australia World',
    enabled: true,
    url: 'https://www.abc.net.au/news/feed/104217382/rss.xml',
  },
  {
    name: 'AllAfrica',
    enabled: true,
    url: 'https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf',
  },
  {
    name: 'UN News',
    enabled: true,
    url: 'https://news.un.org/feed/subscribe/en/news/all/rss.xml',
  },
  {
    name: 'Google News World',
    enabled: true,
    url: 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en',
  },
];

export interface RegenerateResponse {
  before: {
    ai_headline: string;
    ai_summary: string;
    ai_explanation: string;
    scores: JudgeScores;
    judge_pass: boolean;
    flags: ArticleFlag[];
  };
  after: {
    ai_headline: string;
    ai_summary: string;
    ai_explanation: string;
    confidence_score: number;
    confidence_reasoning: string;
    judge_pass: boolean;
    scores: JudgeScores;
    flags: ArticleFlag[];
    claims: JudgeClaim[];
  };
  instructionsSnapshot: AgentInstructionsSnapshot;
  traceStep: PipelineTraceStep;
}

export interface PolicyTestSample {
  id: string;
  date: string;
  originalHeadline: string;
  originalSummary: string;
  originalScores: JudgeScores;
  candidateHeadline: string;
  candidateSummary: string;
  candidateScores: JudgeScores;
  candidatePass: boolean;
  candidateFlags: ArticleFlag[];
  candidateReasoning: string;
}

export async function regenerateDraftRequest(params: {
  articleId: string;
  readingLevel: ReadingLevel;
  targetSummaryWords: number;
  redirectInstructions: string;
  idToken: string;
}): Promise<RegenerateResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/regenerate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.idToken}`,
    },
    body: JSON.stringify({
      articleId: params.articleId,
      readingLevel: params.readingLevel,
      targetSummaryWords: params.targetSummaryWords,
      redirectInstructions: params.redirectInstructions,
    }),
  });

  const data = (await res.json()) as RegenerateResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Regeneration failed (${res.status})`);
  }
  return data;
}

export async function acceptRegeneratedDraft(
  articleId: string,
  result: RegenerateResponse
): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(db, 'articles', articleId);
  await updateDoc(ref, {
    ai_headline: result.after.ai_headline,
    ai_summary: result.after.ai_summary,
    ai_explanation: result.after.ai_explanation,
    confidence_score: result.after.confidence_score,
    confidence_reasoning: result.after.confidence_reasoning,
    judge_pass: result.after.judge_pass,
    scores: result.after.scores,
    flags: result.after.flags,
    claims: result.after.claims,
    instructions_snapshot: result.instructionsSnapshot,
    edited_at: now,
    pipeline_trace: arrayUnion(result.traceStep),
    decision_history: arrayUnion({ action: 'regenerated', at: now }),
  });
}

export function useAgentPolicy(enabled = true) {
  const [activePolicy, setActivePolicy] = useState<ActivePolicyDoc>({
    active_version: 'v1',
    settings: DEFAULT_POLICY_SETTINGS,
    admin_instructions: '',
    updated_at: '',
    updated_by: 'system',
  });
  const [versions, setVersions] = useState<PolicyVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const policyRef = doc(db, 'config', 'agent_policy');
    const unsubPolicy = onSnapshot(
      policyRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<ActivePolicyDoc>;
          setActivePolicy({
            active_version: data.active_version || 'v1',
            settings: {
              ...DEFAULT_POLICY_SETTINGS,
              ...(data.settings || {}),
            },
            admin_instructions: data.admin_instructions || '',
            updated_at: data.updated_at || '',
            updated_by: data.updated_by || 'system',
          });
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load agent policy');
        setLoading(false);
      }
    );

    const versionsQuery = query(
      collection(db, 'policy_versions'),
      orderBy('created_at', 'desc')
    );
    const unsubVersions = onSnapshot(
      versionsQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          ...(d.data() as Omit<PolicyVersion, 'id'>),
          id: d.id,
        }));
        setVersions(list);
      },
      (err) => {
        setError(err.message || 'Failed to load policy versions');
      }
    );

    return () => {
      unsubPolicy();
      unsubVersions();
    };
  }, [enabled]);

  const savePolicyVersion = useCallback(
    async (params: {
      settings: PolicySettings;
      adminInstructions: string;
      changeNote: string;
      userEmail: string;
      isAdmin: boolean;
      rolledBackFrom?: string | null;
    }) => {
      const now = new Date().toISOString();
      const nextNum = versions.length + 1;
      const versionLabel = `v${nextNum}`;
      const versionId = `${versionLabel}-${Date.now()}`;

      // Rule: Free-text instructions are admin role only
      const nextAdminInstructions = params.isAdmin
        ? params.adminInstructions.trim()
        : activePolicy.admin_instructions;

      const versionDoc: Omit<PolicyVersion, 'id'> = {
        version: versionLabel,
        settings: params.settings,
        admin_instructions: nextAdminInstructions,
        change_note: params.changeNote.trim() || 'Policy settings updated',
        created_at: now,
        created_by: params.userEmail,
        rolled_back_from: params.rolledBackFrom ?? null,
      };

      await setDoc(doc(db, 'policy_versions', versionId), versionDoc);
      await setDoc(doc(db, 'config', 'agent_policy'), {
        active_version: versionLabel,
        settings: params.settings,
        admin_instructions: nextAdminInstructions,
        updated_at: now,
        updated_by: params.userEmail,
      });

      return versionLabel;
    },
    [versions.length, activePolicy.admin_instructions]
  );

  const rollbackToVersion = useCallback(
    async (version: PolicyVersion, userEmail: string, isAdmin: boolean) => {
      return savePolicyVersion({
        settings: version.settings,
        adminInstructions: isAdmin
          ? version.admin_instructions
          : activePolicy.admin_instructions,
        changeNote: `Rolled back to ${version.version}`,
        userEmail,
        isAdmin,
        rolledBackFrom: version.version,
      });
    },
    [savePolicyVersion, activePolicy.admin_instructions]
  );

  const testPolicy = useCallback(
    async (params: {
      settings: PolicySettings;
      adminInstructions: string;
      idToken: string;
    }): Promise<PolicyTestSample[]> => {
      const res = await fetch(`${getApiBaseUrl()}/api/test-policy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.idToken}`,
        },
        body: JSON.stringify({
          settings: params.settings,
          adminInstructions: params.adminInstructions,
        }),
      });
      const data = (await res.json()) as {
        samples?: PolicyTestSample[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || `Policy test failed (${res.status})`);
      }
      return data.samples ?? [];
    },
    []
  );

  return {
    activePolicy,
    versions,
    loading,
    error,
    savePolicyVersion,
    rollbackToVersion,
    testPolicy,
  };
}

export function useSourcesConfig(enabled = true) {
  const [sources, setSources] = useState<RssSourceConfig[]>(DEFAULT_RSS_SOURCES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'config', 'sources');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { sources?: RssSourceConfig[] };
          if (Array.isArray(data.sources) && data.sources.length > 0) {
            setSources(data.sources);
          }
        }
        setLoading(false);
      },
      (err) => {
        setError(err.message || 'Failed to load sources config');
        setLoading(false);
      }
    );

    return unsub;
  }, [enabled]);

  const persistSources = useCallback(
    async (next: RssSourceConfig[], userEmail: string) => {
      await setDoc(doc(db, 'config', 'sources'), {
        sources: next,
        updated_at: new Date().toISOString(),
        updated_by: userEmail,
      });
    },
    []
  );

  const toggleSource = useCallback(
    async (name: string, userEmail: string) => {
      const next = sources.map((s) =>
        s.name === name ? { ...s, enabled: !s.enabled } : s
      );
      await persistSources(next, userEmail);
    },
    [sources, persistSources]
  );

  const addSource = useCallback(
    async (name: string, url: string, userEmail: string) => {
      const trimmedName = name.trim();
      const trimmedUrl = url.trim();
      if (!trimmedName || !trimmedUrl) {
        throw new Error('Source name and URL are required');
      }
      if (sources.some((s) => s.name.toLowerCase() === trimmedName.toLowerCase())) {
        throw new Error(`Source "${trimmedName}" already exists`);
      }
      const next = [
        ...sources,
        { name: trimmedName, url: trimmedUrl, enabled: true },
      ];
      await persistSources(next, userEmail);
    },
    [sources, persistSources]
  );

  const removeSource = useCallback(
    async (name: string, userEmail: string) => {
      const next = sources.filter((s) => s.name !== name);
      await persistSources(next, userEmail);
    },
    [sources, persistSources]
  );

  const resetDefaults = useCallback(
    async (userEmail: string) => {
      await persistSources(DEFAULT_RSS_SOURCES, userEmail);
    },
    [persistSources]
  );

  return {
    sources,
    loading,
    error,
    toggleSource,
    addSource,
    removeSource,
    resetDefaults,
  };
}

export interface PolicyProposal {
  observation: string;
  proposedRule: string;
  changeNote: string;
  evidenceCount: number;
}

export async function proposePolicyFromEdits(
  idToken: string
): Promise<PolicyProposal> {
  const res = await fetch(`${getApiBaseUrl()}/api/propose-policy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({}),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to analyze editor corrections');
  }
  return data as PolicyProposal;
}

export type AgentId = 'fetcher' | 'summarizer' | 'judge';

export async function sendAgentChatMessage(params: {
  agentId: AgentId;
  message: string;
  idToken: string;
}): Promise<string> {
  const res = await fetch(`${getApiBaseUrl()}/api/agent-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.idToken}`,
    },
    body: JSON.stringify({
      agentId: params.agentId,
      message: params.message,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to message agent');
  }
  return (data.reply as string) || 'Instruction received.';
}

