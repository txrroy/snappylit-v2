import { useState, useEffect, useRef } from 'react';
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
  DSDivider,
  type DSTone,
} from '@/design-system';
import {
  acceptRegeneratedDraft,
  regenerateDraftRequest,
  sendAgentChatMessage,
  LOCKED_CORE_SUMMARY,
  type RegenerateResponse,
} from '@/hooks/useGovernance';
import {
  getFlagPlainReason,
  getFlagShortLabel,
  getKidsTopicCheck,
} from '@/lib/editorialLabels';
import type { Article, PipelineTraceStep, ReadingLevel } from '@/types/article';

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
  onConfirmKidsTopic?: (id: string, confirmed: boolean) => Promise<void>;
}

const READING_LEVELS: ReadingLevel[] = [
  'grade 4',
  'grade 5',
  'grade 6',
  'grade 7',
  'grade 8',
];

const WORD_TARGETS = [40, 50, 60, 75, 90] as const;

function getStatusBadgeProps(status: Article['status']): {
  label: string;
  tone: DSTone;
} {
  if (status === 'published') return { label: 'Published', tone: 'success' };
  if (status === 'rejected') return { label: 'Rejected', tone: 'danger' };
  return { label: 'Pending', tone: 'warning' };
}

function getScoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 85) return 'success';
  if (score >= 65) return 'warning';
  return 'danger';
}

function getTraceTone(status: PipelineTraceStep['status']): DSTone {
  if (status === 'ok') return 'success';
  if (status === 'fallback' || status === 'warning') return 'warning';
  return 'danger';
}

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
  onConfirmKidsTopic,
}: ArticleReaderDrawerProps) {
  const { theme } = useDSTheme();
  const { width: windowWidth } = useWindowDimensions();
  const slideAnim = useRef(new Animated.Value(windowWidth)).current;

  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [busyAction, setBusyAction] = useState<
    'save' | 'approve' | 'reject' | 'regen' | 'accept-regen' | null
  >(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [showInstructions, setShowInstructions] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [expandedTraceIdx, setExpandedTraceIdx] = useState<number | null>(null);
  const [showRegenerate, setShowRegenerate] = useState(false);

  const [regenLevel, setRegenLevel] = useState<ReadingLevel>('grade 6');
  const [regenWords, setRegenWords] = useState<number>(60);
  const [regenRedirect, setRegenRedirect] = useState('');
  const [regenPreview, setRegenPreview] = useState<RegenerateResponse | null>(
    null
  );
  const [activeClaimIdx, setActiveClaimIdx] = useState<number | null>(null);
  const [judgeQuestion, setJudgeQuestion] = useState('');
  const [judgeMessages, setJudgeMessages] = useState<
    { role: 'editor' | 'judge'; text: string }[]
  >([]);
  const [judgeBusy, setJudgeBusy] = useState(false);

  useEffect(() => {
    setHeadline(article?.ai_headline ?? '');
    setSummary(article?.ai_summary ?? '');
    setFeedback(null);
    setBusyAction(null);
    setRegenPreview(null);
    setRegenRedirect('');
    setExpandedTraceIdx(null);
    setActiveClaimIdx(null);
    setJudgeQuestion('');
    setJudgeMessages([]);
    if (article?.instructions_snapshot) {
      setRegenLevel(
        (article.instructions_snapshot.reading_level as ReadingLevel) || 'grade 6'
      );
      setRegenWords(article.instructions_snapshot.target_summary_words || 60);
    }
  }, [
    article?.id,
    article?.ai_headline,
    article?.ai_summary,
    article?.instructions_snapshot,
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

  if (!article) return null;

  const isDirty =
    headline.trim() !== article.ai_headline.trim() ||
    summary.trim() !== article.ai_summary.trim();

  const handleSave = async () => {
    setBusyAction('save');
    setFeedback(null);
    try {
      await onSaveChanges(article.id, headline, summary);
      setFeedback('Changes saved.');
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to save changes.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleApprove = async () => {
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

  const handleRegenerateWithPrompt = async (customRedirect?: string) => {
    const instruction = (customRedirect ?? regenRedirect).trim();
    if (customRedirect !== undefined) {
      setShowRegenerate(true);
      setRegenRedirect(instruction);
    }
    setBusyAction('regen');
    setFeedback(null);
    try {
      const token = await getIdToken();
      const result = await regenerateDraftRequest({
        articleId: article.id,
        readingLevel: regenLevel,
        targetSummaryWords: regenWords,
        redirectInstructions: instruction,
        idToken: token,
      });
      setRegenPreview(result);
    } catch (err) {
      setFeedback(
        err instanceof Error ? err.message : 'Failed to regenerate draft.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegenerate = () => handleRegenerateWithPrompt();

  const handleAskJudge = async () => {
    const q = judgeQuestion.trim();
    if (!q || judgeBusy) return;
    setJudgeMessages((prev) => [...prev, { role: 'editor', text: q }]);
    setJudgeQuestion('');
    setJudgeBusy(true);
    try {
      const token = await getIdToken();
      const contextualPrompt = `Regarding story "${article.ai_headline}" (id: ${article.id}, score: ${article.scores?.accuracy ?? article.confidence_score}): ${q}`;
      const reply = await sendAgentChatMessage({
        agentId: 'judge',
        message: contextualPrompt,
        idToken: token,
      });
      setJudgeMessages((prev) => [...prev, { role: 'judge', text: reply }]);
    } catch (err) {
      setJudgeMessages((prev) => [
        ...prev,
        {
          role: 'judge',
          text:
            err instanceof Error
              ? `Could not reach Judge: ${err.message}`
              : 'Could not reach Judge.',
        },
      ]);
    } finally {
      setJudgeBusy(false);
    }
  };

  const findMatchingClaimIdx = (sentence: string): number | null => {
    const claimsList = article.claims ?? [];
    if (claimsList.length === 0) return null;
    const words = sentence
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);
    let bestIdx: number | null = null;
    let bestScore = 0;
    claimsList.forEach((c, idx) => {
      const claimLower = c.claim.toLowerCase();
      const hits = words.filter((w) => claimLower.includes(w)).length;
      if (hits > bestScore) {
        bestScore = hits;
        bestIdx = idx;
      }
    });
    return bestScore > 0 ? bestIdx : null;
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
      setFeedback('Regenerated draft & Judge audit applied.');
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
  const statusBadge = getStatusBadgeProps(article.status);

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
            maxWidth: theme.layout.drawerMaxWidth,
            flexDirection: 'column',
          },
        ]}
        className="w-full md:w-[74%] lg:w-[66%]"
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
            {article.prompt_version ? (
              <DSBadge label={`Policy ${article.prompt_version}`} tone="neutral" />
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

        {/* Agent Authority Banner */}
        <View
          style={{
            backgroundColor: theme.colors.surfaceHeader,
            borderBottomWidth: theme.layout.borderWidth,
            borderBottomColor: theme.colors.borderSubtle,
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.xs + 2,
          }}
        >
          <DSText variant="micro" weight="medium" tone="tertiary">
            Agent Authority: Draft & Audit Only · Human editor approval required
            to publish
          </DSText>
        </View>

        {/* Scrollable Reading & Editing Content */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            padding: theme.spacing.xl,
            paddingBottom: theme.spacing.xxxl,
          }}
        >
          <View
            style={{
              maxWidth: theme.layout.contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
              gap: theme.spacing.lg,
            }}
          >
            {/* Editorial Headline & Summary */}
            <DSCard padding="xl">
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: theme.spacing.sm,
                  marginBottom: theme.spacing.lg,
                }}
              >
                <DSText variant="caption" weight="semibold" tone="secondary">
                  {article.date}
                  {article.topic ? ` • ${article.topic}` : ''}
                  {article.region ? ` • ${article.region}` : ''}
                  {article.source_count
                    ? ` • ${article.source_count} outlets`
                    : ''}
                </DSText>
                <DSButton
                  label="Open Original Source ↗"
                  variant="tinted"
                  size="sm"
                  pill
                  onPress={() => Linking.openURL(article.original_url)}
                />
              </View>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: theme.spacing.xs,
                }}
              >
                <DSText
                  variant="micro"
                  weight="bold"
                  tone="tertiary"
                  uppercase
                >
                  Headline
                </DSText>
                {isDirty ? (
                  <DSText variant="caption" weight="semibold" tone="warning">
                    Unsaved edits
                  </DSText>
                ) : null}
              </View>
              <DSInput
                value={headline}
                onChangeText={setHeadline}
                multiline
                style={[
                  theme.typography.title3,
                  {
                    fontWeight: '700',
                    minHeight: 68,
                    marginBottom: theme.spacing.lg,
                  },
                ]}
              />

              <DSText
                variant="micro"
                weight="bold"
                tone="tertiary"
                uppercase
                style={{ marginBottom: theme.spacing.xs }}
              >
                Summary
              </DSText>
              <DSInput
                value={summary}
                onChangeText={setSummary}
                multiline
                textAlignVertical="top"
                style={{ minHeight: 140 }}
              />

              {/* Interactive Claim Grounding Preview */}
              {article.claims && article.claims.length > 0 ? (
                <DSSurface
                  variant="muted"
                  radius="md"
                  bordered
                  style={{
                    padding: theme.spacing.md,
                    marginTop: theme.spacing.md,
                    gap: theme.spacing.sm,
                  }}
                >
                  <DSText variant="micro" weight="bold" tone="tertiary" uppercase>
                    Interactive Claim Grounding (Tap sentence or claim to inspect)
                  </DSText>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: theme.spacing.xs,
                    }}
                  >
                    {summary
                      .split(/(?<=[.!?])\s+/)
                      .filter(Boolean)
                      .map((sentence, sIdx) => {
                        const matchedIdx = findMatchingClaimIdx(sentence);
                        const isHighlighted =
                          activeClaimIdx !== null && matchedIdx === activeClaimIdx;
                        return (
                          <Pressable
                            key={sIdx}
                            onPress={() => {
                              if (matchedIdx !== null) {
                                setActiveClaimIdx(
                                  activeClaimIdx === matchedIdx ? null : matchedIdx
                                );
                              }
                            }}
                            style={{
                              paddingHorizontal: theme.spacing.xs + 2,
                              paddingVertical: theme.spacing.xxs,
                              borderRadius: theme.radii.xs,
                              backgroundColor: isHighlighted
                                ? theme.colors.accentSoft
                                : 'transparent',
                            }}
                          >
                            <DSText
                              variant="caption"
                              tone={isHighlighted ? 'accent' : 'secondary'}
                              weight={isHighlighted ? 'semibold' : 'regular'}
                            >
                              {sentence}
                            </DSText>
                          </Pressable>
                        );
                      })}
                  </View>

                  {activeClaimIdx !== null && article.claims[activeClaimIdx] ? (
                    <DSSurface
                      variant="surface"
                      radius="sm"
                      bordered
                      style={{
                        padding: theme.spacing.sm,
                        borderColor: theme.colors.accentBorder,
                      }}
                    >
                      <DSText variant="micro" weight="bold" tone="accent" uppercase>
                        Quoted Source Evidence
                      </DSText>
                      <DSText variant="caption" tone="primary">
                        {article.claims[activeClaimIdx].evidence}
                      </DSText>
                    </DSSurface>
                  ) : null}
                </DSSurface>
              ) : null}

              {article.source_names && article.source_names.length > 0 ? (
                <DSText
                  variant="caption"
                  tone="tertiary"
                  style={{ marginTop: theme.spacing.md }}
                >
                  Sources: {article.source_names.join(', ')}
                </DSText>
              ) : null}
            </DSCard>

            {/* Regenerate with New Instructions */}
            <DSCard
              headerTitle="Regenerate with New Instructions"
              headerSubtitle="Steer the Summarizer + automatic Judge re-audit (Locked Core enforced)"
              headerRight={
                <DSButton
                  label={showRegenerate ? 'Hide ▲' : 'Open ▼'}
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowRegenerate((v) => !v)}
                />
              }
              padding={showRegenerate ? 'lg' : 'xs'}
            >
              {showRegenerate ? (
                <View style={{ gap: theme.spacing.md }}>
                  <View>
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                      style={{ marginBottom: theme.spacing.xs + 2 }}
                    >
                      Reading Level
                    </DSText>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: theme.spacing.xs + 2,
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

                  <View>
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                      style={{ marginBottom: theme.spacing.xs + 2 }}
                    >
                      Target Summary Length ({regenWords} words)
                    </DSText>
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: theme.spacing.xs + 2,
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

                  <View>
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                      style={{ marginBottom: theme.spacing.xs + 2 }}
                    >
                      Redirect Instructions
                    </DSText>
                    <DSInput
                      value={regenRedirect}
                      onChangeText={setRegenRedirect}
                      placeholder="e.g., Explain the UN agency role more simply and shorten sentence 2..."
                      multiline
                      style={{ minHeight: 68 }}
                    />
                  </View>

                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.md,
                    }}
                  >
                    <DSText variant="micro" tone="tertiary" style={{ flex: 1 }}>
                      Locked Core (G-rated & source-only facts) remains enforced.
                    </DSText>
                    <DSButton
                      label="Regenerate & Re-Judge"
                      variant="primary"
                      size="md"
                      loading={busyAction === 'regen'}
                      disabled={busyAction !== null}
                      onPress={handleRegenerate}
                    />
                  </View>

                  {regenPreview ? (
                    <DSSurface
                      radius="md"
                      bordered
                      style={{
                        backgroundColor: theme.colors.accentSoft,
                        borderColor: theme.colors.accentBorder,
                        padding: theme.spacing.lg,
                        gap: theme.spacing.md,
                      }}
                    >
                      <DSText
                        variant="micro"
                        weight="bold"
                        tone="accent"
                        uppercase
                      >
                        Before vs. After Comparison
                      </DSText>

                      <View
                        style={{ gap: theme.spacing.md }}
                        className="flex-col md:flex-row"
                      >
                        <DSSurface
                          variant="surface"
                          radius="sm"
                          bordered
                          style={{ flex: 1, padding: theme.spacing.md }}
                        >
                          <DSText
                            variant="micro"
                            weight="bold"
                            tone="tertiary"
                            uppercase
                            style={{ marginBottom: theme.spacing.xs }}
                          >
                            Before (Acc {regenPreview.before.scores.accuracy} ·
                            Saf {regenPreview.before.scores.safety})
                          </DSText>
                          <DSText
                            variant="body"
                            weight="bold"
                            tone="primary"
                            style={{ marginBottom: theme.spacing.xs }}
                          >
                            {regenPreview.before.ai_headline}
                          </DSText>
                          <DSText variant="caption" tone="secondary">
                            {regenPreview.before.ai_summary}
                          </DSText>
                        </DSSurface>

                        <DSSurface
                          variant="surface"
                          radius="sm"
                          bordered
                          style={{
                            flex: 1,
                            padding: theme.spacing.md,
                            borderColor: theme.colors.accentBorder,
                          }}
                        >
                          <DSText
                            variant="micro"
                            weight="bold"
                            tone="accent"
                            uppercase
                            style={{ marginBottom: theme.spacing.xs }}
                          >
                            After (Acc {regenPreview.after.scores.accuracy} · Saf{' '}
                            {regenPreview.after.scores.safety} ·{' '}
                            {regenPreview.after.judge_pass ? 'PASS' : 'REVIEW'})
                          </DSText>
                          <DSText
                            variant="body"
                            weight="bold"
                            tone="primary"
                            style={{ marginBottom: theme.spacing.xs }}
                          >
                            {regenPreview.after.ai_headline}
                          </DSText>
                          <DSText variant="caption" tone="primary">
                            {regenPreview.after.ai_summary}
                          </DSText>
                        </DSSurface>
                      </View>

                      <DSText variant="caption" tone="secondary">
                        New Judge Note: {regenPreview.after.confidence_reasoning}
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
                          label="Accept & Update Draft"
                          variant="primary"
                          size="sm"
                          loading={busyAction === 'accept-regen'}
                          disabled={busyAction !== null}
                          onPress={handleAcceptRegenerated}
                        />
                      </View>
                    </DSSurface>
                  ) : null}
                </View>
              ) : null}
            </DSCard>

            {/* Judge Scores, Flags & Claim Evidence */}
            <DSCard
              headerTitle="Judge Audit & Evidence"
              headerSubtitle={article.original_url}
              padding="lg"
            >
              <View style={{ gap: theme.spacing.md }}>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: theme.spacing.md,
                    paddingBottom: theme.spacing.md,
                    borderBottomWidth: theme.layout.borderWidth,
                    borderBottomColor: theme.colors.borderSubtle,
                  }}
                >
                  {(
                    [
                      [
                        'Accuracy',
                        article.scores?.accuracy ?? article.confidence_score,
                      ],
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
                      <View key={label} style={{ flex: 1, minWidth: 90 }}>
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

                {(() => {
                  const kidsCheck = getKidsTopicCheck(article);
                  if (
                    !(article.flags && article.flags.length > 0) &&
                    !article.sensitive &&
                    article.judge_pass === undefined &&
                    !kidsCheck.rawTriggered
                  ) {
                    return null;
                  }
                  return (
                    <View style={{ gap: theme.spacing.sm }}>
                      <View
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          gap: theme.spacing.xs + 2,
                        }}
                      >
                        {article.judge_pass !== undefined ? (
                          <DSBadge
                            label={
                              article.judge_pass ? 'Passed audit' : 'Needs review'
                            }
                            tone={article.judge_pass ? 'success' : 'warning'}
                            dot
                          />
                        ) : null}
                        {article.sensitive ? (
                          <DSBadge label="Sensitive topic" tone="warning" dot />
                        ) : null}
                      </View>
                      {kidsCheck.rawTriggered ? (
                        <DSSurface
                          variant="muted"
                          radius="sm"
                          bordered
                          style={{
                            padding: theme.spacing.sm,
                            gap: theme.spacing.xs,
                            borderColor: kidsCheck.triggered
                              ? theme.colors.tones.danger.dot
                              : theme.colors.borderSubtle,
                          }}
                        >
                          <DSText
                            variant="caption"
                            weight="semibold"
                            tone={kidsCheck.triggered ? 'danger' : 'secondary'}
                          >
                            {kidsCheck.triggered
                              ? `✕ Blocked: Sensitive topic for children (matched "${kidsCheck.matchedTerm}")`
                              : `✓ Age-appropriate wording confirmed (matched "${kidsCheck.matchedTerm}")`}
                          </DSText>
                          {onConfirmKidsTopic ? (
                            <View style={{ flexDirection: 'row' }}>
                              <DSButton
                                label={
                                  article.kids_topic_confirmed
                                    ? 'Revoke confirmation'
                                    : 'Confirm age-appropriate wording'
                                }
                                variant={
                                  article.kids_topic_confirmed ? 'ghost' : 'secondary'
                                }
                                size="sm"
                                onPress={() =>
                                  void onConfirmKidsTopic(
                                    article.id,
                                    !article.kids_topic_confirmed
                                  )
                                }
                              />
                            </View>
                          ) : null}
                        </DSSurface>
                      ) : null}
                    {(article.flags ?? []).map((flag) => (
                      <View
                        key={flag}
                        style={{
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: theme.spacing.sm,
                          paddingVertical: theme.spacing.xs,
                          paddingHorizontal: theme.spacing.md,
                          borderRadius: theme.radii.sm,
                          backgroundColor: theme.colors.tones.danger.bg,
                        }}
                      >
                        <View style={{ flex: 1, minWidth: 200 }}>
                          <DSText variant="caption" weight="semibold" tone="danger">
                            {getFlagShortLabel(flag)}
                          </DSText>
                          <DSText variant="caption" tone="secondary">
                            {getFlagPlainReason(flag)}
                          </DSText>
                        </View>
                        <DSButton
                          label="Rewrite with Agent"
                          variant="secondary"
                          size="sm"
                          disabled={busyAction !== null}
                          onPress={() =>
                            handleRegenerateWithPrompt(
                              `Fix Judge flag ${flag}: rewrite to resolve ${flag.toLowerCase().replace(/_/g, ' ')} while keeping all facts strictly grounded in source text.`
                            )
                          }
                        />
                      </View>
                    ))}
                    </View>
                  );
                })()}

                {article.ai_explanation ? (
                  <DSSurface
                    variant="muted"
                    radius="md"
                    bordered
                    style={{ padding: theme.spacing.md }}
                  >
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                      style={{ marginBottom: theme.spacing.xs }}
                    >
                      Background Explanation
                    </DSText>
                    <DSText variant="body" tone="primary">
                      {article.ai_explanation}
                    </DSText>
                  </DSSurface>
                ) : null}

                {article.selection_reason ? (
                  <DSSurface
                    variant="muted"
                    radius="md"
                    bordered
                    style={{ padding: theme.spacing.md }}
                  >
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                      style={{ marginBottom: theme.spacing.xs }}
                    >
                      Selection Rationale
                    </DSText>
                    <DSText variant="body" tone="primary">
                      {article.selection_reason}
                    </DSText>
                  </DSSurface>
                ) : null}

                <DSSurface
                  variant="muted"
                  radius="md"
                  bordered
                  style={{ padding: theme.spacing.md }}
                >
                  <DSText
                    variant="caption"
                    weight="semibold"
                    tone="secondary"
                    style={{ marginBottom: theme.spacing.xs }}
                  >
                    Judge reasoning
                  </DSText>
                  <DSText variant="body" tone="primary">
                    {article.confidence_reasoning || 'No reasoning recorded.'}
                  </DSText>
                </DSSurface>

                {/* Contextual Ask Judge */}
                <View
                  style={{
                    gap: theme.spacing.sm,
                    paddingTop: theme.spacing.sm,
                    borderTopWidth: theme.layout.borderWidth,
                    borderTopColor: theme.colors.borderSubtle,
                  }}
                >
                  <DSText variant="caption" weight="semibold" tone="secondary">
                    Ask Judge about this story
                  </DSText>
                  {judgeMessages.length > 0 ? (
                    <DSSurface
                      variant="header"
                      radius="sm"
                      bordered
                      style={{ padding: theme.spacing.md, gap: theme.spacing.sm }}
                    >
                      {judgeMessages.map((m, idx) => (
                        <View key={idx} style={{ gap: 2 }}>
                          <DSText
                            variant="caption"
                            weight="semibold"
                            tone={m.role === 'editor' ? 'accent' : 'secondary'}
                          >
                            {m.role === 'editor' ? 'You' : 'Judge'}
                          </DSText>
                          <DSText variant="caption" tone="primary">
                            {m.text}
                          </DSText>
                        </View>
                      ))}
                    </DSSurface>
                  ) : null}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <DSInput
                      value={judgeQuestion}
                      onChangeText={setJudgeQuestion}
                      placeholder="Ask why this was flagged or how to verify a claim..."
                      compact
                      style={{ flex: 1 }}
                    />
                    <DSButton
                      label="Ask Judge"
                      variant="secondary"
                      size="sm"
                      loading={judgeBusy}
                      disabled={judgeBusy}
                      onPress={handleAskJudge}
                    />
                  </View>
                </View>

                {article.claims && article.claims.length > 0 ? (
                  <DSSurface
                    variant="muted"
                    radius="md"
                    bordered
                    style={{ padding: theme.spacing.md }}
                  >
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                      style={{ marginBottom: theme.spacing.sm }}
                    >
                      Claims & Source Evidence (Side-by-Side)
                    </DSText>
                    <View style={{ gap: theme.spacing.md }}>
                      {article.claims.map((item, idx) => {
                        const isUnsupported =
                          item.evidence.trim().toLowerCase() === 'unsupported';
                        const isClaimActive = activeClaimIdx === idx;
                        return (
                          <Pressable
                            key={`${idx}-${item.claim.slice(0, 20)}`}
                            onPress={() =>
                              setActiveClaimIdx(isClaimActive ? null : idx)
                            }
                          >
                            <View
                              style={{
                                gap: theme.spacing.sm,
                                padding: theme.spacing.xs,
                                borderRadius: theme.radii.sm,
                                backgroundColor: isClaimActive
                                  ? theme.colors.accentSoft
                                  : 'transparent',
                              }}
                              className="flex-col md:flex-row"
                            >
                              <DSSurface
                                variant="surface"
                                radius="sm"
                                bordered
                                style={{
                                  flex: 1,
                                  padding: theme.spacing.md,
                                  borderColor: isClaimActive
                                    ? theme.colors.accentBorder
                                    : theme.colors.borderSubtle,
                                }}
                              >
                                <DSText
                                  variant="micro"
                                  weight="bold"
                                  tone="tertiary"
                                  uppercase
                                  style={{ marginBottom: theme.spacing.xxs }}
                                >
                                  Draft Claim
                                </DSText>
                                <DSText
                                  variant="caption"
                                  weight="semibold"
                                  tone="primary"
                                >
                                  {item.claim}
                                </DSText>
                              </DSSurface>
                              <DSSurface
                                variant="surface"
                                radius="sm"
                                bordered
                                style={{
                                  flex: 1,
                                  padding: theme.spacing.md,
                                  backgroundColor: isUnsupported
                                    ? theme.colors.tones.danger.bg
                                    : theme.colors.surface,
                                  borderColor: isUnsupported
                                    ? theme.colors.tones.danger.border
                                    : theme.colors.borderSubtle,
                                }}
                              >
                                <View
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    marginBottom: theme.spacing.xxs,
                                  }}
                                >
                                  <DSText
                                    variant="micro"
                                    weight="bold"
                                    tone="tertiary"
                                    uppercase
                                  >
                                    Quoted Source Evidence
                                  </DSText>
                                  {isUnsupported ? (
                                    <DSButton
                                      label="Rewrite with Agent"
                                      variant="tinted"
                                      size="sm"
                                      pill
                                      disabled={busyAction !== null}
                                      onPress={() =>
                                        handleRegenerateWithPrompt(
                                          `Remove or rewrite the unsupported claim "${item.claim}" so every statement is strictly grounded in the source text.`
                                        )
                                      }
                                    />
                                  ) : null}
                                </View>
                                <DSText
                                  variant="caption"
                                  weight={isUnsupported ? 'bold' : 'regular'}
                                  tone={isUnsupported ? 'danger' : 'secondary'}
                                >
                                  {item.evidence}
                                </DSText>
                              </DSSurface>
                            </View>
                            {idx < article.claims!.length - 1 ? (
                              <View style={{ marginTop: theme.spacing.md }}>
                                <DSDivider />
                              </View>
                            ) : null}
                          </Pressable>
                        );
                      })}
                    </View>
                  </DSSurface>
                ) : null}
              </View>
            </DSCard>

            {/* Collapsible Read-Only Agent Instructions */}
            <DSCard
              headerTitle="Agent Instructions (Read-Only)"
              headerSubtitle={`Brief followed by Summarizer · ${
                snapshot?.prompt_version || article.prompt_version || 'v1'
              }`}
              headerRight={
                <DSButton
                  label={showInstructions ? 'Hide ▲' : 'Show ▼'}
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowInstructions((v) => !v)}
                />
              }
              padding={showInstructions ? 'lg' : 'xs'}
            >
              {showInstructions ? (
                <View style={{ gap: theme.spacing.md }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      flexWrap: 'wrap',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <DSBadge
                      label={`Version: ${
                        snapshot?.prompt_version ||
                        article.prompt_version ||
                        'v1'
                      }`}
                      tone="neutral"
                    />
                    <DSBadge
                      label={`Level: ${snapshot?.reading_level || 'grade 6'}`}
                      tone="neutral"
                    />
                    <DSBadge
                      label={`Target: ~${
                        snapshot?.target_summary_words || 60
                      } words`}
                      tone="neutral"
                    />
                    <DSBadge
                      label={`Tone: ${snapshot?.tone || 'calm_neutral'}`}
                      tone="neutral"
                    />
                  </View>

                  {snapshot?.admin_instructions ? (
                    <DSSurface
                      variant="muted"
                      radius="md"
                      bordered
                      style={{ padding: theme.spacing.md }}
                    >
                      <DSText
                        variant="micro"
                        weight="bold"
                        tone="tertiary"
                        uppercase
                        style={{ marginBottom: theme.spacing.xs }}
                      >
                        Tier 2 Admin Instructions
                      </DSText>
                      <DSText variant="caption" tone="primary">
                        {snapshot.admin_instructions}
                      </DSText>
                    </DSSurface>
                  ) : null}

                  {snapshot?.editor_redirect ? (
                    <DSSurface
                      radius="md"
                      bordered
                      style={{
                        backgroundColor: theme.colors.accentSoft,
                        borderColor: theme.colors.accentBorder,
                        padding: theme.spacing.md,
                      }}
                    >
                      <DSText
                        variant="micro"
                        weight="bold"
                        tone="accent"
                        uppercase
                        style={{ marginBottom: theme.spacing.xs }}
                      >
                        Editor Redirect Override
                      </DSText>
                      <DSText variant="caption" tone="primary">
                        {snapshot.editor_redirect}
                      </DSText>
                    </DSSurface>
                  ) : null}

                  <DSSurface
                    variant="muted"
                    radius="md"
                    bordered
                    style={{ padding: theme.spacing.md }}
                  >
                    <DSText
                      variant="micro"
                      weight="bold"
                      tone="tertiary"
                      uppercase
                      style={{ marginBottom: theme.spacing.xs }}
                    >
                      Tier 3 Locked Core (Code-Only)
                    </DSText>
                    <DSText variant="caption" tone="secondary">
                      {snapshot?.locked_core_summary || LOCKED_CORE_SUMMARY}
                    </DSText>
                  </DSSurface>
                </View>
              ) : null}
            </DSCard>

            {/* Per-Article Pipeline Trace */}
            <DSCard
              headerTitle="Pipeline Trace"
              headerSubtitle={
                traceSteps.length > 0
                  ? `${traceSteps.length} recorded agent handoff steps`
                  : 'No pipeline trace recorded on this legacy draft'
              }
              headerRight={
                <DSButton
                  label={showTrace ? 'Hide ▲' : 'Show ▼'}
                  variant="ghost"
                  size="sm"
                  onPress={() => setShowTrace((v) => !v)}
                />
              }
              padding={showTrace && traceSteps.length > 0 ? 'lg' : 'xs'}
            >
              {showTrace && traceSteps.length > 0 ? (
                <View style={{ gap: theme.spacing.sm }}>
                  {traceSteps.map((step, idx) => {
                    const isExpanded = expandedTraceIdx === idx;
                    const traceTone = getTraceTone(step.status);
                    return (
                      <Pressable
                        key={`${step.step}-${idx}`}
                        onPress={() =>
                          setExpandedTraceIdx(isExpanded ? null : idx)
                        }
                      >
                        <DSSurface
                          variant="muted"
                          radius="md"
                          bordered
                          style={{ padding: theme.spacing.md }}
                        >
                          <View
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
                                  width: theme.spacing.sm + 2,
                                  height: theme.spacing.sm + 2,
                                  borderRadius: theme.radii.pill,
                                  backgroundColor:
                                    theme.colors.tones[traceTone].dot,
                                }}
                              />
                              <DSText
                                variant="caption"
                                weight="bold"
                                tone="primary"
                              >
                                {step.agent}
                              </DSText>
                            </View>
                            <DSText variant="micro" tone="tertiary">
                              {step.duration_ms ? `${step.duration_ms}ms` : ''}
                            </DSText>
                          </View>
                          <DSText
                            variant="caption"
                            tone="secondary"
                            style={{ marginTop: theme.spacing.xs }}
                          >
                            {step.summary}
                          </DSText>
                          {isExpanded && step.details ? (
                            <View
                              style={{
                                marginTop: theme.spacing.sm,
                                paddingTop: theme.spacing.sm,
                                borderTopWidth: theme.layout.borderWidth,
                                borderTopColor: theme.colors.borderSubtle,
                                flexDirection: 'row',
                                flexWrap: 'wrap',
                                gap: theme.spacing.xs + 2,
                              }}
                            >
                              {Object.entries(step.details).map(([k, v]) => (
                                <DSBadge
                                  key={k}
                                  label={`${k}: ${String(v)}`}
                                  tone="neutral"
                                />
                              ))}
                            </View>
                          ) : null}
                        </DSSurface>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
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

        {/* Bottom Action Bar */}
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
              maxWidth: theme.layout.contentMaxWidth,
              width: '100%',
              alignSelf: 'center',
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.md,
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

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.sm,
              }}
            >
              <DSButton
                label="Save Changes"
                variant="secondary"
                size="md"
                loading={busyAction === 'save'}
                disabled={busyAction !== null}
                onPress={handleSave}
              />

              <DSButton
                label={
                  article.status === 'published'
                    ? 'Update Published'
                    : 'Approve & Publish'
                }
                variant="accent"
                size="md"
                pill
                loading={busyAction === 'approve'}
                disabled={busyAction !== null}
                onPress={handleApprove}
              />
            </View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
