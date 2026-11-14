import { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Pressable,
  ScrollView,
  Linking,
  Animated,
  useWindowDimensions,
} from 'react-native';
import {
  useDSTheme,
  DSCard,
  DSText,
  DSBadge,
  DSChip,
  DSButton,
  DSInput,
  DSSurface,
  type DSTone,
} from '@/design-system';
import {
  acceptRegeneratedDraft,
  regenerateDraftRequest,
  LOCKED_CORE_SUMMARY,
  type RegenerateResponse,
} from '@/hooks/useGovernance';
import {
  getEditorialState,
  getEditorialStateTone,
  getFlagPlainReason,
  getFlagShortLabel,
  getWhyThisNeedsYouMessage,
  isSnippetOnlyUnverified,
} from '@/lib/editorialLabels';
import type { Article, ArticleFlag, ReadingLevel } from '@/types/article';

interface ArticleReaderDrawerProps {
  article: Article | null;
  adminUid: string;
  hasPrev: boolean;
  hasNext: boolean;
  getIdToken: () => Promise<string>;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onSaveChanges: (id: string, headline: string, summary: string) => Promise<void>;
  onApprove: (
    id: string,
    headline: string,
    summary: string,
    adminUid: string
  ) => Promise<void>;
  onReject: (id: string, reason?: string) => Promise<void>;
  onUnpublish?: (id: string) => Promise<void>;
  onConfirmKidsTopic?: (id: string, confirmed: boolean) => Promise<void>;
  onConfirmSourceChecked?: (id: string, checked: boolean) => Promise<void>;
}

const READING_LEVELS: ReadingLevel[] = [
  'grade 4',
  'grade 5',
  'grade 6',
  'grade 7',
  'grade 8',
];

const WORD_TARGETS = [40, 50, 60, 75, 90] as const;

function getStatusBadgeProps(article: Article): {
  label: string;
  tone: DSTone;
} {
  if (article.status === 'published') {
    return { label: 'Published', tone: 'success' };
  }
  if (article.status === 'rejected') {
    return { label: 'Rejected', tone: 'danger' };
  }
  const state = getEditorialState(article);
  return { label: state, tone: getEditorialStateTone(state) };
}

function getScoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 85) return 'success';
  if (score >= 65) return 'warning';
  return 'danger';
}

type TraceCollapseKey = 'fetcher' | 'summarizer' | 'judge';

export function ArticleReaderDrawer({
  article,
  adminUid,
  hasPrev,
  hasNext,
  getIdToken,
  onPrev,
  onNext,
  onClose,
  onSaveChanges,
  onApprove,
  onReject,
  onUnpublish,
  onConfirmSourceChecked,
}: ArticleReaderDrawerProps) {
  const { theme } = useDSTheme();
  const { width: windowWidth } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(windowWidth)).current;

  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [editingDraftText, setEditingDraftText] = useState(false);
  const [busyAction, setBusyAction] = useState<
    | 'save'
    | 'approve'
    | 'reject'
    | 'unpublish'
    | 'regen'
    | 'accept-regen'
    | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showCustomSteer, setShowCustomSteer] = useState(false);
  const [regenLevel, setRegenLevel] = useState<ReadingLevel>('grade 6');
  const [regenWords, setRegenWords] = useState<number>(60);
  const [regenRedirect, setRegenRedirect] = useState('');
  const [regenPreview, setRegenPreview] = useState<RegenerateResponse | null>(
    null
  );

  // Split-screen inline sentence grounding selection
  const [selectedSentenceIdx, setSelectedSentenceIdx] = useState<number | null>(
    0
  );

  // Fix 11: Pre-flight source check for "Could not verify" stories
  const [localSourceChecked, setLocalSourceChecked] = useState(false);

  // Fix 7: Three collapsed story trace steps (Fetcher, Summarizer, Judge)
  const [openTraceSteps, setOpenTraceSteps] = useState<
    Record<TraceCollapseKey, boolean>
  >({
    fetcher: false,
    summarizer: false,
    judge: false,
  });

  useEffect(() => {
    setHeadline(article?.ai_headline ?? '');
    setSummary(article?.ai_summary ?? '');
    setEditingDraftText(false);
    setFeedback(null);
    setBusyAction(null);
    setRegenPreview(null);
    setRegenRedirect('');
    setShowCustomSteer(false);
    setSelectedSentenceIdx(0);
    setLocalSourceChecked(Boolean(article?.source_checked));
    setOpenTraceSteps({ fetcher: false, summarizer: false, judge: false });
    if (article?.instructions_snapshot) {
      setRegenLevel(
        (article.instructions_snapshot.reading_level as ReadingLevel) ||
          'grade 6'
      );
      setRegenWords(article.instructions_snapshot.target_summary_words || 60);
    }
  }, [
    article?.id,
    article?.ai_headline,
    article?.ai_summary,
    article?.instructions_snapshot,
    article?.source_checked,
  ]);

  useEffect(() => {
    if (article) {
      slideAnim.setValue(Math.min(windowWidth, theme.layout.drawerMaxWidth));
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [article, slideAnim, theme.layout.drawerMaxWidth, windowWidth]);

  // Split summary into sentences and pair each sentence with its closest Judge claim
  const sentenceMappings = useMemo(() => {
    if (!article) return [];
    const sentences = summary
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const claims = article.claims ?? [];
    const unverifiedSnippet = isSnippetOnlyUnverified(article);

    return sentences.map((sentence, idx) => {
      const words = sentence
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 3);
      let bestClaim = claims[idx] ?? null;
      let bestHits = 0;

      for (const c of claims) {
        const cl = c.claim.toLowerCase();
        const hits = words.filter((w) => cl.includes(w)).length;
        if (hits > bestHits) {
          bestHits = hits;
          bestClaim = c;
        }
      }

      const evidenceQuote = bestClaim?.evidence?.trim() || '';
      const isExplicitlyUnsupported =
        evidenceQuote.toLowerCase() === 'unsupported';
      const status: 'supported' | 'unsupported' | 'unverified' =
        isExplicitlyUnsupported
          ? 'unsupported'
          : unverifiedSnippet || !evidenceQuote
            ? 'unverified'
            : 'supported';

      return {
        idx,
        sentence,
        claim: bestClaim?.claim ?? sentence,
        evidenceQuote,
        status,
      };
    });
  }, [article, summary]);

  // Split source text into sentences/paragraphs and highlight whichever matches the active summary sentence
  const sourceSegments = useMemo(() => {
    if (!article) return [];
    const rawSource = (article.source_text || '').trim();
    if (!rawSource) return [];

    const activeMap =
      selectedSentenceIdx !== null
        ? sentenceMappings[selectedSentenceIdx]
        : null;
    const quoteToMatch = activeMap?.evidenceQuote?.toLowerCase().trim() || '';
    const quoteTokens = quoteToMatch
      .split(/\W+/)
      .filter((w) => w.length > 4);

    const paragraphs = rawSource
      .split(/\n+/)
      .map((p) => p.trim())
      .filter(Boolean);

    const segments: { text: string; highlighted: boolean }[] = [];
    for (const para of paragraphs) {
      const sents = para
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of sents) {
        const sLower = s.toLowerCase();
        let highlighted = false;
        if (
          quoteToMatch &&
          quoteToMatch !== 'unsupported' &&
          quoteToMatch.length > 12
        ) {
          if (
            sLower.includes(quoteToMatch.slice(0, 32)) ||
            quoteToMatch.includes(sLower.slice(0, 32))
          ) {
            highlighted = true;
          } else if (quoteTokens.length >= 3) {
            const shared = quoteTokens.filter((t) => sLower.includes(t)).length;
            if (shared >= Math.ceil(quoteTokens.length * 0.6)) {
              highlighted = true;
            }
          }
        }
        segments.push({ text: s, highlighted });
      }
    }
    return segments;
  }, [article, selectedSentenceIdx, sentenceMappings]);

  if (!article) return null;

  const isDirty =
    headline.trim() !== article.ai_headline.trim() ||
    summary.trim() !== article.ai_summary.trim();

  const editorialState = getEditorialState(article);
  const whyNeedsYou = getWhyThisNeedsYouMessage(article);
  const snippetUnverified = isSnippetOnlyUnverified(article);
  const requiresPreFlightCheck = editorialState === 'Could not verify';
  const canApproveNow = !requiresPreFlightCheck || localSourceChecked;

  const handleToggleSourceCheck = async () => {
    const next = !localSourceChecked;
    setLocalSourceChecked(next);
    if (onConfirmSourceChecked) {
      try {
        await onConfirmSourceChecked(article.id, next);
      } catch {
        // Ignore persistence error if offline
      }
    }
  };

  const handleSave = async () => {
    setBusyAction('save');
    setFeedback(null);
    try {
      await onSaveChanges(article.id, headline, summary);
      setFeedback('Changes saved.');
      setEditingDraftText(false);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to save changes.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleApprove = async () => {
    if (!canApproveNow) return;
    setBusyAction('approve');
    setFeedback(null);
    try {
      await onApprove(article.id, headline, summary, adminUid);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to approve article.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleReject = async () => {
    setBusyAction('reject');
    setFeedback(null);
    try {
      await onReject(article.id);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to reject article.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleUnpublish = async () => {
    if (!onUnpublish) return;
    setBusyAction('unpublish');
    setFeedback(null);
    try {
      await onUnpublish(article.id);
      setFeedback('Story unpublished and returned to review queue.');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to unpublish story.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleRunAgentAction = async (options: {
    redirectInstructions: string;
    readingLevel?: ReadingLevel;
    tryAlternateSource?: boolean;
  }) => {
    setBusyAction('regen');
    setFeedback(null);
    if (options.readingLevel) {
      setRegenLevel(options.readingLevel);
    }
    setRegenRedirect(options.redirectInstructions);
    try {
      const token = await getIdToken();
      const result = await regenerateDraftRequest({
        articleId: article.id,
        readingLevel: options.readingLevel ?? regenLevel,
        targetSummaryWords: regenWords,
        redirectInstructions: options.redirectInstructions,
        tryAlternateSource: options.tryAlternateSource,
        idToken: token,
      });
      setRegenPreview(result);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to run agent action.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleAcceptRegenerated = async () => {
    if (!regenPreview) return;
    setBusyAction('accept-regen');
    setFeedback(null);
    try {
      await acceptRegeneratedDraft(article.id, regenPreview);
      setHeadline(regenPreview.after.ai_headline);
      setSummary(regenPreview.after.ai_summary);
      setRegenPreview(null);
      setRegenRedirect('');
      setFeedback('Updated draft & Judge verification applied.');
    } catch (err) {
      setFeedback(
        err instanceof Error
          ? err.message
          : 'Failed to apply regenerated draft.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const snapshot = article.instructions_snapshot;
  const traceSteps = article.pipeline_trace ?? [];
  const statusBadge = getStatusBadgeProps(article);
  const flags = article.flags ?? [];

  const toggleTraceSection = (key: TraceCollapseKey) => {
    setOpenTraceSteps((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const fetcherStep = traceSteps.find(
    (s) => s.step === 'fetch' || s.step === 'select' || s.step === 'extract'
  );
  const summarizerStep = traceSteps.find((s) => s.step === 'summarize');
  const judgeStep = traceSteps.find((s) => s.step === 'judge');

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 50,
        flexDirection: 'row',
        justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: theme.colors.backdrop }}
        accessibilityLabel="Close reading pane"
      />

      {/* Slide-over Reading Page */}
      <Animated.View
        style={[
          theme.shadows.popover,
          {
            transform: [{ translateX: slideAnim }],
            backgroundColor: theme.colors.canvas,
            borderLeftWidth: theme.layout.borderWidth,
            borderLeftColor: theme.colors.borderDefault,
            height: '100%',
            maxWidth: 1080,
            flexDirection: 'column',
          },
        ]}
        className="w-full md:w-[84%] lg:w-[76%]"
      >
        {/* Top Reader Toolbar */}
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderBottomWidth: theme.layout.borderWidth,
            borderBottomColor: theme.colors.borderSubtle,
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              flexWrap: 'wrap',
            }}
          >
            <DSButton
              label="← Back"
              variant="secondary"
              size="sm"
              pill
              onPress={onClose}
            />
            <DSBadge label={statusBadge.label} tone={statusBadge.tone} dot />
            {article.sensitive ? (
              <DSBadge label="Sensitive" tone="neutral" />
            ) : null}
            {article.prompt_version ? (
              <DSBadge
                label={`Policy ${article.prompt_version}`}
                tone="neutral"
              />
            ) : null}
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
            }}
          >
            <DSButton
              label="‹ Prev"
              variant="secondary"
              size="sm"
              disabled={!hasPrev}
              onPress={onPrev}
            />
            <DSButton
              label="Next ›"
              variant="secondary"
              size="sm"
              disabled={!hasNext}
              onPress={onNext}
            />
          </View>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: theme.spacing.xl,
            paddingBottom: theme.spacing.xxxl,
          }}
        >
          <View
            style={{
              maxWidth: 980,
              width: '100%',
              alignSelf: 'center',
              gap: theme.spacing.lg,
            }}
          >
            {/* FIX 9: "WHY THIS NEEDS YOU" CARD AT THE TOP OF THE DETAIL VIEW */}
            <DSSurface
              radius="md"
              bordered
              style={{
                padding: theme.spacing.lg,
                gap: theme.spacing.sm,
                backgroundColor:
                  whyNeedsYou.state === 'Ready to approve'
                    ? theme.colors.tones.success.bg
                    : whyNeedsYou.state === 'Needs a check'
                      ? theme.colors.tones.warning.bg
                      : theme.colors.tones.danger.bg,
                borderColor:
                  whyNeedsYou.state === 'Ready to approve'
                    ? theme.colors.tones.success.border
                    : whyNeedsYou.state === 'Needs a check'
                      ? theme.colors.tones.warning.border
                      : theme.colors.tones.danger.border,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                }}
              >
                <DSText
                  variant="micro"
                  weight="bold"
                  tone={getEditorialStateTone(whyNeedsYou.state)}
                  uppercase
                >
                  {whyNeedsYou.headline}
                </DSText>
                <DSText variant="caption" tone="secondary">
                  {article.date}
                  {article.topic ? ` · ${article.topic}` : ''}
                  {article.region ? ` · ${article.region}` : ''}
                  {article.source_names?.length
                    ? ` · ${article.source_names.join(', ')}`
                    : ''}
                </DSText>
              </View>

              <DSText variant="subhead" weight="semibold" tone="primary">
                “{whyNeedsYou.sentence}”
              </DSText>

              {/* FIX 10: MATCH EACH ACTION TO ITS FLAG + MERGE REGENERATE INTO THIS SAME CONTROL */}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                  paddingTop: theme.spacing.xs,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: theme.spacing.sm,
                  }}
                >
                  {snippetUnverified ? (
                    <>
                      <DSButton
                        label="Try another source"
                        variant="primary"
                        size="sm"
                        loading={busyAction === 'regen'}
                        disabled={busyAction !== null}
                        onPress={() =>
                          void handleRunAgentAction({
                            redirectInstructions:
                              'Re-extract from alternate outlet URL and verify all claims against full text.',
                            tryAlternateSource: true,
                          })
                        }
                      />
                      <DSButton
                        label="Open source ↗"
                        variant="secondary"
                        size="sm"
                        onPress={() => Linking.openURL(article.original_url)}
                      />
                    </>
                  ) : null}

                  {flags.includes('TOO_COMPLEX') ? (
                    <DSButton
                      label="Simplify"
                      variant="primary"
                      size="sm"
                      loading={busyAction === 'regen'}
                      disabled={busyAction !== null}
                      onPress={() =>
                        void handleRunAgentAction({
                          readingLevel: 'grade 5',
                          redirectInstructions:
                            'Simplify reading level to Grade 5–6. Replace complex or technical terms with everyday words and shorten long sentences.',
                        })
                      }
                    />
                  ) : null}

                  {flags.includes('ONE_SIDED') ? (
                    <DSButton
                      label="Add the other side"
                      variant="primary"
                      size="sm"
                      loading={busyAction === 'regen'}
                      disabled={busyAction !== null}
                      onPress={() =>
                        void handleRunAgentAction({
                          redirectInstructions:
                            'Present each side’s position in one calm, neutral attributed sentence so the summary is balanced.',
                        })
                      }
                    />
                  ) : null}

                  {flags.includes('LOADED_LANGUAGE') ? (
                    <DSButton
                      label="Use neutral wording"
                      variant="primary"
                      size="sm"
                      loading={busyAction === 'regen'}
                      disabled={busyAction !== null}
                      onPress={() =>
                        void handleRunAgentAction({
                          redirectInstructions:
                            'Replace any loaded or emotional adjectives with plain, neutral verbs and attributed statements.',
                        })
                      }
                    />
                  ) : null}

                  {flags.includes('GRAPHIC_DETAIL') ? (
                    <DSButton
                      label="Soften for G-rating"
                      variant="primary"
                      size="sm"
                      loading={busyAction === 'regen'}
                      disabled={busyAction !== null}
                      onPress={() =>
                        void handleRunAgentAction({
                          redirectInstructions:
                            'Remove all graphic or injury details and state what happened in one plain factual G-rated sentence.',
                        })
                      }
                    />
                  ) : null}

                  {!snippetUnverified ? (
                    <DSButton
                      label="Open source ↗"
                      variant="secondary"
                      size="sm"
                      onPress={() => Linking.openURL(article.original_url)}
                    />
                  ) : null}
                </View>

                <DSButton
                  label={
                    showCustomSteer
                      ? 'Hide custom instructions ▲'
                      : 'Custom instructions & length ▼'
                  }
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowCustomSteer((v) => !v)}
                />
              </View>

              {/* Merged Custom Steering Controls (Fix 10) */}
              {showCustomSteer ? (
                <DSSurface
                  variant="surface"
                  radius="sm"
                  bordered
                  style={{
                    padding: theme.spacing.md,
                    marginTop: theme.spacing.xs,
                    gap: theme.spacing.md,
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: theme.spacing.lg,
                    }}
                  >
                    <View style={{ gap: theme.spacing.xs }}>
                      <DSText
                        variant="micro"
                        weight="bold"
                        tone="tertiary"
                        uppercase
                      >
                        Reading Level
                      </DSText>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: theme.spacing.xs,
                        }}
                      >
                        {READING_LEVELS.map((lvl) => (
                          <DSChip
                            key={lvl}
                            label={lvl}
                            active={regenLevel === lvl}
                            onPress={() => setRegenLevel(lvl)}
                          />
                        ))}
                      </View>
                    </View>

                    <View style={{ gap: theme.spacing.xs }}>
                      <DSText
                        variant="micro"
                        weight="bold"
                        tone="tertiary"
                        uppercase
                      >
                        Target Length ({regenWords}w)
                      </DSText>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          gap: theme.spacing.xs,
                        }}
                      >
                        {WORD_TARGETS.map((w) => (
                          <DSChip
                            key={w}
                            label={`~${w}w`}
                            active={regenWords === w}
                            onPress={() => setRegenWords(w)}
                          />
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={{ gap: theme.spacing.xs }}>
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                    >
                      Steering instruction for Summarizer
                    </DSText>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: theme.spacing.sm,
                        alignItems: 'center',
                      }}
                    >
                      <DSInput
                        value={regenRedirect}
                        onChangeText={setRegenRedirect}
                        placeholder="e.g., Explain the UN agency role more simply and shorten sentence 2..."
                        compact
                        style={{ flex: 1, minWidth: 240 }}
                      />
                      <DSButton
                        label="Rewrite & Re-Judge"
                        variant="primary"
                        size="sm"
                        loading={busyAction === 'regen'}
                        disabled={busyAction !== null}
                        onPress={() =>
                          void handleRunAgentAction({
                            redirectInstructions: regenRedirect.trim(),
                          })
                        }
                      />
                    </View>
                  </View>
                </DSSurface>
              ) : null}

              {/* Before vs. After Preview when agent action runs */}
              {regenPreview ? (
                <DSSurface
                  variant="surface"
                  radius="sm"
                  bordered
                  style={{
                    padding: theme.spacing.md,
                    marginTop: theme.spacing.xs,
                    borderColor: theme.colors.accentBorder,
                    gap: theme.spacing.sm,
                  }}
                >
                  <DSText variant="micro" weight="bold" tone="accent" uppercase>
                    Candidate Rewrite Preview
                  </DSText>
                  <DSText variant="subhead" weight="bold" tone="primary">
                    {regenPreview.after.ai_headline}
                  </DSText>
                  <DSText variant="body" tone="primary">
                    {regenPreview.after.ai_summary}
                  </DSText>
                  <DSText variant="caption" tone="secondary">
                    Judge check: {regenPreview.after.confidence_reasoning}
                  </DSText>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <DSButton
                      label="Discard"
                      variant="secondary"
                      size="sm"
                      onPress={() => setRegenPreview(null)}
                    />
                    <DSButton
                      label="Accept Rewrite"
                      variant="primary"
                      size="sm"
                      loading={busyAction === 'accept-regen'}
                      disabled={busyAction !== null}
                      onPress={handleAcceptRegenerated}
                    />
                  </View>
                </DSSurface>
              ) : null}
            </DSSurface>

            {/* FIX 8: SHOW EVIDENCE INLINE IN A SPLIT SCREEN (Draft on Left, Source Text on Right) */}
            <DSCard
              headerTitle="Draft vs. Source Evidence (Split View)"
              headerSubtitle="Click any sentence on the left to highlight its matching quote in the source text on the right"
              headerRight={
                <DSButton
                  label={
                    editingDraftText ? 'Done editing text' : 'Edit text manually'
                  }
                  variant="secondary"
                  size="sm"
                  pill
                  onPress={() => setEditingDraftText((v) => !v)}
                />
              }
              padding="lg"
            >
              <View
                style={{ gap: theme.spacing.lg, alignItems: 'stretch' }}
                className="flex-col lg:flex-row"
              >
                {/* LEFT COLUMN: DRAFT HEADLINE, SENTENCES (SUPPORTED / UNSUPPORTED) & WHY IT MATTERS */}
                <View
                  style={{ flex: 1, gap: theme.spacing.md }}
                  className="w-full lg:w-1/2"
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                    >
                      Draft Story (Left)
                    </DSText>
                    {isDirty ? (
                      <DSText
                        variant="caption"
                        weight="semibold"
                        tone="warning"
                      >
                        Unsaved edits
                      </DSText>
                    ) : null}
                  </View>

                  {editingDraftText ? (
                    <View style={{ gap: theme.spacing.sm }}>
                      <DSText variant="caption" weight="semibold" tone="secondary">
                        Headline
                      </DSText>
                      <DSInput
                        value={headline}
                        onChangeText={setHeadline}
                        multiline
                        style={[
                          theme.typography.subhead,
                          { fontWeight: '700', minHeight: 56 },
                        ]}
                      />
                      <DSText variant="caption" weight="semibold" tone="secondary">
                        Summary
                      </DSText>
                      <DSInput
                        value={summary}
                        onChangeText={setSummary}
                        multiline
                        textAlignVertical="top"
                        style={{ minHeight: 150 }}
                      />
                    </View>
                  ) : (
                    <View style={{ gap: theme.spacing.sm }}>
                      <DSText variant="title3" weight="bold" tone="primary">
                        {headline}
                      </DSText>

                      <View style={{ gap: theme.spacing.xs + 2 }}>
                        {sentenceMappings.map((item) => {
                          const isSelected = selectedSentenceIdx === item.idx;
                          const badgeProps =
                            item.status === 'supported'
                              ? { label: 'Supported', tone: 'success' as const }
                              : item.status === 'unsupported'
                                ? {
                                    label: 'Unsupported',
                                    tone: 'danger' as const,
                                  }
                                : {
                                    label: 'Snippet only',
                                    tone: 'warning' as const,
                                  };

                          return (
                            <Pressable
                              key={item.idx}
                              onPress={() => setSelectedSentenceIdx(item.idx)}
                            >
                              <DSSurface
                                variant="surface"
                                radius="sm"
                                bordered
                                style={{
                                  padding: theme.spacing.md,
                                  gap: theme.spacing.xs,
                                  backgroundColor: isSelected
                                    ? theme.colors.accentSoft
                                    : item.status === 'unsupported'
                                      ? theme.colors.tones.danger.bg
                                      : theme.colors.surface,
                                  borderColor: isSelected
                                    ? theme.colors.accentBorder
                                    : item.status === 'unsupported'
                                      ? theme.colors.tones.danger.border
                                      : theme.colors.borderSubtle,
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: theme.spacing.sm,
                                  }}
                                >
                                  <DSText
                                    variant="micro"
                                    weight="bold"
                                    tone="tertiary"
                                    uppercase
                                  >
                                    Sentence {item.idx + 1}
                                  </DSText>
                                  <DSBadge
                                    label={badgeProps.label}
                                    tone={badgeProps.tone}
                                  />
                                </View>
                                <DSText
                                  variant="body"
                                  weight={isSelected ? 'semibold' : 'regular'}
                                  tone="primary"
                                >
                                  {item.sentence}
                                </DSText>
                              </DSSurface>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {article.ai_explanation ? (
                    <DSSurface
                      variant="muted"
                      radius="sm"
                      bordered
                      style={{ padding: theme.spacing.md, gap: 4 }}
                    >
                      <DSText
                        variant="micro"
                        weight="bold"
                        tone="tertiary"
                        uppercase
                      >
                        Why it matters (Background explanation)
                      </DSText>
                      <DSText variant="caption" tone="secondary">
                        {article.ai_explanation}
                      </DSText>
                    </DSSurface>
                  ) : null}
                </View>

                {/* RIGHT COLUMN: SOURCE TEXT WITH INLINE HIGHLIGHTING */}
                <View
                  style={{ flex: 1, gap: theme.spacing.md }}
                  className="w-full lg:w-1/2"
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                    >
                      Source Text (Right)
                    </DSText>
                    <DSText variant="caption" tone="tertiary">
                      {snippetUnverified
                        ? 'Fallback RSS snippet only'
                        : 'Extracted publisher text'}
                    </DSText>
                  </View>

                  {/* Matched Evidence Callout for selected sentence */}
                  {selectedSentenceIdx !== null &&
                  sentenceMappings[selectedSentenceIdx] ? (
                    <DSSurface
                      variant="muted"
                      radius="sm"
                      bordered
                      style={{ padding: theme.spacing.md, gap: 4 }}
                    >
                      <DSText
                        variant="micro"
                        weight="bold"
                        tone={
                          sentenceMappings[selectedSentenceIdx].status ===
                          'unsupported'
                            ? 'danger'
                            : 'accent'
                        }
                        uppercase
                      >
                        {sentenceMappings[selectedSentenceIdx].status ===
                        'unsupported'
                          ? 'No supporting quote found in source'
                          : `Matched quote for Sentence ${selectedSentenceIdx + 1}`}
                      </DSText>
                      <DSText variant="caption" tone="primary">
                        {sentenceMappings[selectedSentenceIdx].evidenceQuote &&
                        sentenceMappings[
                          selectedSentenceIdx
                        ].evidenceQuote.toLowerCase() !== 'unsupported'
                          ? `“${sentenceMappings[selectedSentenceIdx].evidenceQuote}”`
                          : snippetUnverified
                            ? 'Only a short RSS snippet was available; open the original source to verify.'
                            : 'This sentence is not directly supported by a quote in the extracted text.'}
                      </DSText>
                    </DSSurface>
                  ) : null}

                  <DSSurface
                    variant="muted"
                    radius="md"
                    bordered
                    style={{
                      padding: theme.spacing.md,
                      maxHeight: 420,
                    }}
                  >
                    <ScrollView nestedScrollEnabled>
                      {sourceSegments.length === 0 ? (
                        <DSText variant="caption" tone="tertiary">
                          No source text stored for this story. Click &ldquo;Open
                          source ↗&rdquo; above to read the publisher page.
                        </DSText>
                      ) : (
                        <View style={{ gap: theme.spacing.xs + 2 }}>
                          {sourceSegments.map((seg, idx) => (
                            <View
                              key={idx}
                              style={{
                                paddingHorizontal: seg.highlighted
                                  ? theme.spacing.xs + 2
                                  : 0,
                                paddingVertical: seg.highlighted ? 4 : 0,
                                borderRadius: theme.radii.xs,
                                backgroundColor: seg.highlighted
                                  ? theme.colors.accentSoft
                                  : 'transparent',
                                borderLeftWidth: seg.highlighted ? 3 : 0,
                                borderLeftColor: seg.highlighted
                                  ? theme.colors.accent
                                  : 'transparent',
                              }}
                            >
                              <DSText
                                variant="caption"
                                weight={seg.highlighted ? 'semibold' : 'regular'}
                                tone={seg.highlighted ? 'primary' : 'secondary'}
                                style={{ lineHeight: 20 }}
                              >
                                {seg.text}
                              </DSText>
                            </View>
                          ))}
                        </View>
                      )}
                    </ScrollView>
                  </DSSurface>
                </View>
              </View>
            </DSCard>

            {/* FIX 3 & FIX 13: REPORT SCORES HONESTLY IN DETAIL VIEW ("Not verified" for snippet-only) */}
            <DSCard
              headerTitle="Judge Rubric Scores"
              headerSubtitle={
                snippetUnverified
                  ? 'Accuracy is reported as "Not verified" because only an RSS snippet was available'
                  : 'Evaluated by Agent 3 (Quality Judge) against full source text and Grade-6 rubric'
              }
              padding="lg"
            >
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: theme.spacing.md,
                }}
              >
                {/* Accuracy Card (Fix 13: Show "Not verified" for snippet-only stories) */}
                <View style={{ flex: 1, minWidth: 130 }}>
                  <DSText variant="micro" tone="tertiary">
                    Accuracy
                  </DSText>
                  {snippetUnverified ? (
                    <>
                      <DSText
                        variant="subhead"
                        weight="bold"
                        tone="danger"
                        style={{ marginTop: 4 }}
                      >
                        Not verified
                      </DSText>
                      <DSText
                        variant="micro"
                        tone="tertiary"
                        style={{ marginTop: 2 }}
                      >
                        Snippet only — source check required
                      </DSText>
                    </>
                  ) : (
                    <>
                      <DSText
                        variant="title3"
                        weight="bold"
                        tone={getScoreTone(
                          article.scores?.accuracy ?? article.confidence_score
                        )}
                        tabularNums
                        style={{ marginTop: 2 }}
                      >
                        {article.scores?.accuracy ?? article.confidence_score}
                      </DSText>
                      <View
                        style={{
                          height: 3,
                          borderRadius: theme.radii.pill,
                          backgroundColor: theme.colors.surfaceMuted,
                          marginTop: theme.spacing.xs,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${Math.min(100, article.scores?.accuracy ?? article.confidence_score)}%`,
                            height: '100%',
                            backgroundColor:
                              theme.colors.tones[
                                getScoreTone(
                                  article.scores?.accuracy ??
                                    article.confidence_score
                                )
                              ].dot,
                          }}
                        />
                      </View>
                    </>
                  )}
                </View>

                {(
                  [
                    [
                      'Neutrality',
                      article.scores?.neutrality ?? article.confidence_score,
                    ],
                    [
                      'Safety (G)',
                      article.scores?.safety ?? article.confidence_score,
                    ],
                    [
                      'Readability',
                      article.scores?.readability ?? article.confidence_score,
                    ],
                  ] as const
                ).map(([label, score]) => {
                  const tone = getScoreTone(score);
                  return (
                    <View key={label} style={{ flex: 1, minWidth: 110 }}>
                      <DSText variant="micro" tone="tertiary">
                        {label}
                      </DSText>
                      <DSText
                        variant="title3"
                        weight="bold"
                        tone={tone}
                        tabularNums
                        style={{ marginTop: 2 }}
                      >
                        {score}
                      </DSText>
                      <View
                        style={{
                          height: 3,
                          borderRadius: theme.radii.pill,
                          backgroundColor: theme.colors.surfaceMuted,
                          marginTop: theme.spacing.xs,
                          overflow: 'hidden',
                        }}
                      >
                        <View
                          style={{
                            width: `${Math.min(100, score)}%`,
                            height: '100%',
                            backgroundColor: theme.colors.tones[tone].dot,
                          }}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </DSCard>

            {/* FIX 7: STORY TRACE WITH THREE COLLAPSED STEPS (Fetcher, Summarizer, Judge) */}
            <DSCard
              headerTitle="Story Trace · How the 3 Agents Handled This Story"
              headerSubtitle="Click any agent step to inspect selection rationale, sources, instructions, and Judge reasoning"
              padding="lg"
            >
              <View style={{ gap: theme.spacing.sm }}>
                {/* Step 1: Fetcher */}
                <DSSurface
                  variant="muted"
                  radius="md"
                  bordered
                  style={{ padding: theme.spacing.md, gap: theme.spacing.xs }}
                >
                  <Pressable
                    onPress={() => toggleTraceSection('fetcher')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: theme.radii.pill,
                          backgroundColor: snippetUnverified
                            ? theme.colors.tones.warning.dot
                            : theme.colors.tones.success.dot,
                        }}
                      />
                      <DSText variant="footnote" weight="bold" tone="primary">
                        1. Fetcher
                      </DSText>
                      <DSText
                        variant="caption"
                        tone="secondary"
                        numberOfLines={1}
                        style={{ flex: 1 }}
                      >
                        {article.source_count ?? 1} outlet(s) ·{' '}
                        {snippetUnverified
                          ? 'Fell back to RSS snippet'
                          : 'Extracted full article text'}
                      </DSText>
                    </View>
                    <DSText variant="caption" weight="semibold" tone="accent">
                      {openTraceSteps.fetcher ? 'Hide ▲' : 'Show ▼'}
                    </DSText>
                  </Pressable>

                  {openTraceSteps.fetcher ? (
                    <View
                      style={{
                        marginTop: theme.spacing.xs,
                        paddingTop: theme.spacing.sm,
                        borderTopWidth: theme.layout.borderWidth,
                        borderTopColor: theme.colors.borderSubtle,
                        gap: theme.spacing.xs,
                      }}
                    >
                      <DSText variant="caption" weight="semibold" tone="primary">
                        Selection Rationale:{' '}
                        <DSText variant="caption" tone="secondary">
                          {article.selection_reason ||
                            'Selected for high global impact and multi-outlet coverage.'}
                        </DSText>
                      </DSText>
                      <DSText variant="caption" weight="semibold" tone="primary">
                        Outlets ({article.source_count ?? 1}):{' '}
                        <DSText variant="caption" tone="secondary">
                          {(article.source_names ?? []).join(', ') || 'Primary feed'}
                        </DSText>
                      </DSText>
                      {fetcherStep?.duration_ms ? (
                        <DSText variant="micro" tone="tertiary">
                          Step duration: {fetcherStep.duration_ms}ms
                        </DSText>
                      ) : null}
                    </View>
                  ) : null}
                </DSSurface>

                {/* Step 2: Summarizer */}
                <DSSurface
                  variant="muted"
                  radius="md"
                  bordered
                  style={{ padding: theme.spacing.md, gap: theme.spacing.xs }}
                >
                  <Pressable
                    onPress={() => toggleTraceSection('summarizer')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: theme.radii.pill,
                          backgroundColor: theme.colors.tones.success.dot,
                        }}
                      />
                      <DSText variant="footnote" weight="bold" tone="primary">
                        2. Summarizer
                      </DSText>
                      <DSText
                        variant="caption"
                        tone="secondary"
                        numberOfLines={1}
                        style={{ flex: 1 }}
                      >
                        Policy {snapshot?.prompt_version || article.prompt_version || 'v1'}{' '}
                        · {snapshot?.reading_level || 'grade 6'} · ~
                        {snapshot?.target_summary_words || 60} words
                        {article.auto_retried_complexity
                          ? ' · Auto-simplified once'
                          : ''}
                      </DSText>
                    </View>
                    <DSText variant="caption" weight="semibold" tone="accent">
                      {openTraceSteps.summarizer ? 'Hide ▲' : 'Show ▼'}
                    </DSText>
                  </Pressable>

                  {openTraceSteps.summarizer ? (
                    <View
                      style={{
                        marginTop: theme.spacing.xs,
                        paddingTop: theme.spacing.sm,
                        borderTopWidth: theme.layout.borderWidth,
                        borderTopColor: theme.colors.borderSubtle,
                        gap: theme.spacing.xs,
                      }}
                    >
                      <DSText variant="caption" tone="secondary">
                        {summarizerStep?.summary ||
                          `Rewrote story at ${snapshot?.reading_level || 'grade 6'} level in ${snapshot?.tone || 'calm_neutral'} tone.`}
                      </DSText>
                      {snapshot?.admin_instructions ? (
                        <DSText variant="caption" tone="primary">
                          Tier 2 Admin Instructions: {snapshot.admin_instructions}
                        </DSText>
                      ) : null}
                      {snapshot?.editor_redirect ? (
                        <DSText variant="caption" tone="accent">
                          Editor Redirect: {snapshot.editor_redirect}
                        </DSText>
                      ) : null}
                      <DSText variant="micro" tone="tertiary">
                        Locked Core: {snapshot?.locked_core_summary || LOCKED_CORE_SUMMARY}
                      </DSText>
                    </View>
                  ) : null}
                </DSSurface>

                {/* Step 3: Judge */}
                <DSSurface
                  variant="muted"
                  radius="md"
                  bordered
                  style={{ padding: theme.spacing.md, gap: theme.spacing.xs }}
                >
                  <Pressable
                    onPress={() => toggleTraceSection('judge')}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                        flex: 1,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: theme.radii.pill,
                          backgroundColor:
                            theme.colors.tones[
                              getEditorialStateTone(editorialState)
                            ].dot,
                        }}
                      />
                      <DSText variant="footnote" weight="bold" tone="primary">
                        3. Judge
                      </DSText>
                      <DSText
                        variant="caption"
                        tone="secondary"
                        numberOfLines={1}
                        style={{ flex: 1 }}
                      >
                        {editorialState} ·{' '}
                        {flags.length > 0
                          ? flags.map(getFlagShortLabel).join(', ')
                          : 'No flags'}
                      </DSText>
                    </View>
                    <DSText variant="caption" weight="semibold" tone="accent">
                      {openTraceSteps.judge ? 'Hide ▲' : 'Show ▼'}
                    </DSText>
                  </Pressable>

                  {openTraceSteps.judge ? (
                    <View
                      style={{
                        marginTop: theme.spacing.xs,
                        paddingTop: theme.spacing.sm,
                        borderTopWidth: theme.layout.borderWidth,
                        borderTopColor: theme.colors.borderSubtle,
                        gap: theme.spacing.xs,
                      }}
                    >
                      <DSText variant="caption" weight="semibold" tone="primary">
                        Judge Reasoning:
                      </DSText>
                      <DSText variant="caption" tone="secondary">
                        {article.confidence_reasoning ||
                          judgeStep?.summary ||
                          'Verified claims and rubric scores.'}
                      </DSText>
                      {flags.length > 0 ? (
                        <View style={{ gap: 2, marginTop: 4 }}>
                          {flags.map((f: ArticleFlag) => (
                            <DSText key={f} variant="caption" tone="danger">
                              • {getFlagShortLabel(f)}: {getFlagPlainReason(f)}
                            </DSText>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                </DSSurface>
              </View>
            </DSCard>

            {feedback ? (
              <DSSurface
                radius="md"
                bordered
                style={{
                  backgroundColor: theme.colors.accentSoft,
                  borderColor: theme.colors.accentBorder,
                  paddingHorizontal: theme.spacing.lg,
                  paddingVertical: theme.spacing.md,
                }}
              >
                <DSText variant="footnote" weight="medium" tone="accent">
                  {feedback}
                </DSText>
              </DSSurface>
            ) : null}
          </View>
        </ScrollView>

        {/* Bottom Action Bar (Fix 11: Pre-flight source check for "Could not verify" + Fix 15: Unpublish) */}
        <View
          style={{
            borderTopWidth: theme.layout.borderWidth,
            borderTopColor: theme.colors.borderSubtle,
            backgroundColor: theme.colors.surface,
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.md,
          }}
        >
          <View
            style={{
              maxWidth: 980,
              width: '100%',
              alignSelf: 'center',
              gap: theme.spacing.sm,
            }}
          >
            {/* Fix 11: Pre-flight check before publishing "Could not verify" stories */}
            {requiresPreFlightCheck && article.status !== 'published' ? (
              <Pressable
                onPress={() => void handleToggleSourceCheck()}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                  paddingVertical: 4,
                }}
              >
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: localSourceChecked
                      ? theme.colors.accent
                      : theme.colors.tones.danger.dot,
                    backgroundColor: localSourceChecked
                      ? theme.colors.accent
                      : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {localSourceChecked ? (
                    <DSText variant="micro" weight="bold" tone="inverse">
                      ✓
                    </DSText>
                  ) : null}
                </View>
                <DSText
                  variant="caption"
                  weight="semibold"
                  tone={localSourceChecked ? 'primary' : 'danger'}
                >
                  I checked this against the source (required to approve
                  “Could not verify” stories)
                </DSText>
              </Pressable>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: theme.spacing.md,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                <DSButton
                  label={article.status === 'rejected' ? 'Rejected' : 'Reject'}
                  variant="danger"
                  size="md"
                  loading={busyAction === 'reject'}
                  disabled={busyAction !== null || article.status === 'rejected'}
                  onPress={handleReject}
                />

                {/* Fix 15: Add Unpublish so editor can reverse a decision with confidence */}
                {article.status === 'published' && onUnpublish ? (
                  <DSButton
                    label="Unpublish"
                    variant="secondary"
                    size="md"
                    loading={busyAction === 'unpublish'}
                    disabled={busyAction !== null}
                    onPress={handleUnpublish}
                  />
                ) : null}
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.sm,
                }}
              >
                {isDirty || editingDraftText ? (
                  <DSButton
                    label="Save Changes"
                    variant="secondary"
                    size="md"
                    loading={busyAction === 'save'}
                    disabled={busyAction !== null}
                    onPress={handleSave}
                  />
                ) : null}

                <DSButton
                  label={
                    article.status === 'published'
                      ? 'Update Published'
                      : 'Approve & Publish'
                  }
                  variant="primary"
                  size="md"
                  loading={busyAction === 'approve'}
                  disabled={busyAction !== null || !canApproveNow}
                  onPress={handleApprove}
                />
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
