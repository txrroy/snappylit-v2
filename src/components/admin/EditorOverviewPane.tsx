import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { DSButton, DSDivider, DSSurface, DSText, useDSTheme } from '@/design-system';
import type { InboxFolder } from '@/components/admin/InboxSidebar';
import {
  computeTodayCounts,
  formatRelativeAge,
  getArticleTimestamp,
  getLowestSubScore,
  getQueueReviewReason,
  getQueueStatus,
  isArticleBlocked,
  sortReviewQueue,
} from '@/lib/editorialLabels';
import type { Article } from '@/types/article';

const REJECT_REASONS = [
  'Off-topic',
  'Unsafe for kids',
  'Factually wrong',
  'Other',
] as const;

interface EditorOverviewPaneProps {
  articles: Article[];
  today: string;
  adminUid: string;
  drawerOpen: boolean;
  selectedArticleId?: string | null;
  onSelectArticle: (articleId: string) => void;
  onApproveArticle: (
    id: string,
    headline: string,
    summary: string,
    adminUid: string
  ) => Promise<void>;
  onRejectArticle: (id: string, reason?: string) => Promise<void>;
  onRevertToDraft: (id: string) => Promise<void>;
  onOpenInbox: (folder: InboxFolder, articleId?: string) => void;
  onOpenLivePipeline: () => void;
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatEditionHeading(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return dateStr;
  const month = MONTH_SHORT[parts[1] - 1] ?? '';
  return `${month} ${parts[2]}, ${parts[0]}`;
}

function formatRunTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function getScoreTone(value: number): 'danger' | 'warning' | 'secondary' {
  if (value < 70) return 'danger';
  if (value < 90) return 'warning';
  return 'secondary';
}

function formatDelta(todayVal: number | null, sevenDayVal: number | null): string {
  if (todayVal === null) return 'No data today';
  if (sevenDayVal === null) return 'First edition';
  const diff = todayVal - sevenDayVal;
  if (diff === 0) return '0 vs 7d avg';
  return diff > 0 ? `+${diff} vs 7d avg` : `${diff} vs 7d avg`;
}

export function EditorOverviewPane({
  articles,
  today,
  adminUid,
  drawerOpen,
  selectedArticleId,
  onSelectArticle,
  onApproveArticle,
  onRejectArticle,
  onRevertToDraft,
  onOpenInbox,
  onOpenLivePipeline,
}: EditorOverviewPaneProps) {
  const { theme } = useDSTheme();
  const [keyboardFocusedIdx, setKeyboardFocusedIdx] = useState<number>(-1);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [rejectPickerId, setRejectPickerId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState<{
    id: string;
    headline: string;
    action: 'approved' | 'rejected';
  } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showUndoToast = (id: string, headline: string, action: 'approved' | 'rejected') => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoToast({ id, headline, action });
    undoTimerRef.current = setTimeout(() => {
      setUndoToast(null);
      undoTimerRef.current = null;
    }, 10_000);
  };

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  // Single source of truth for today's edition
  const todayData = useMemo(() => {
    const todayItems = articles.filter((a) => a.date === today);
    const counts = computeTodayCounts(articles, today);
    const needsReview = sortReviewQueue(
      todayItems.filter((a) => a.status === 'draft')
    );

    let latestIso: string | null = null;
    let pipelineErrorCount = 0;
    let pipelineWarningCount = 0;

    for (const a of todayItems) {
      const ts = getArticleTimestamp(a);
      if (ts && (!latestIso || ts > latestIso)) {
        latestIso = ts;
      }
      for (const step of a.pipeline_trace ?? []) {
        if (step.status === 'error') pipelineErrorCount += 1;
        if (step.status === 'warning' || step.status === 'fallback') {
          pipelineWarningCount += 1;
        }
      }
    }

    const runTimeStr = formatRunTime(latestIso);
    let pipelineStatusText = 'Pipeline has not run today.';
    if (todayItems.length > 0) {
      const timePart = runTimeStr ? `Pipeline ran ${runTimeStr}. ` : '';
      const errorPart =
        pipelineErrorCount > 0 ? ` ${pipelineErrorCount} step error(s) logged.` : '';
      pipelineStatusText = `${timePart}${counts.total} stories processed.${errorPart}`;
    }

    return {
      total: counts.total,
      items: todayItems,
      publishedCount: counts.published,
      needsReview,
      rejectedCount: counts.rejected,
      blockedCount: counts.blocked,
      signOffCount: counts.signOff,
      pipelineErrorCount,
      pipelineWarningCount,
      pipelineStatusText,
    };
  }, [articles, today]);

  // Clamp keyboard focus index to queue length (-1 means no keyboard focus active)
  const clampedKeyboardIdx =
    keyboardFocusedIdx < 0 || todayData.needsReview.length === 0
      ? -1
      : Math.min(keyboardFocusedIdx, todayData.needsReview.length - 1);

  const handleInlineApprove = async (item: Article) => {
    if (busyId || isArticleBlocked(item)) return;
    setBusyId(item.id);
    try {
      await onApproveArticle(item.id, item.ai_headline, item.ai_summary, adminUid);
      showUndoToast(item.id, item.ai_headline, 'approved');
    } finally {
      setBusyId(null);
    }
  };

  const handleInlineReject = async (item: Article, reason: string) => {
    if (busyId) return;
    setBusyId(item.id);
    setRejectPickerId(null);
    try {
      await onRejectArticle(item.id, reason);
      showUndoToast(item.id, item.ai_headline, 'rejected');
    } finally {
      setBusyId(null);
    }
  };

  const handleUndo = async () => {
    if (!undoToast || busyId) return;
    const targetId = undoToast.id;
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoToast(null);
    setBusyId(targetId);
    try {
      await onRevertToDraft(targetId);
    } finally {
      setBusyId(null);
    }
  };

  // Keyboard navigation (j/k, a to approve non-blocked, o to open) on web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || drawerOpen) {
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || target?.isContentEditable) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const queue = todayData.needsReview;
      if (queue.length === 0) return;

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault();
        setKeyboardFocusedIdx((prev) =>
          prev < 0 ? 0 : Math.min(queue.length - 1, prev + 1)
        );
      } else if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault();
        setKeyboardFocusedIdx((prev) => (prev < 0 ? 0 : Math.max(0, prev - 1)));
      } else if (e.key === 'o' || e.key === 'Enter') {
        if (clampedKeyboardIdx >= 0 && queue[clampedKeyboardIdx]) {
          e.preventDefault();
          onSelectArticle(queue[clampedKeyboardIdx].id);
        }
      } else if (e.key === 'a') {
        if (
          clampedKeyboardIdx >= 0 &&
          queue[clampedKeyboardIdx] &&
          !busyId &&
          !isArticleBlocked(queue[clampedKeyboardIdx])
        ) {
          e.preventDefault();
          void handleInlineApprove(queue[clampedKeyboardIdx]);
        }
      } else if (e.key === 'Escape') {
        setRejectPickerId(null);
        setKeyboardFocusedIdx(-1);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    adminUid,
    busyId,
    clampedKeyboardIdx,
    drawerOpen,
    onSelectArticle,
    todayData.needsReview,
  ]);

  // Agent health derived from today's items
  const agentHealth = useMemo(() => {
    const items = todayData.items;
    if (items.length === 0) {
      return [
        {
          name: 'RSS Fetcher',
          statusLabel: 'Idle',
          tone: 'neutral' as const,
          metric: 'No stories fetched today',
        },
        {
          name: 'Grade-6 Summarizer',
          statusLabel: 'Idle',
          tone: 'neutral' as const,
          metric: 'Waiting for feeds',
        },
        {
          name: 'Quality Judge',
          statusLabel: 'Idle',
          tone: 'neutral' as const,
          metric: 'Waiting for drafts',
        },
      ];
    }

    const multiSource = items.filter((a) => (a.source_count ?? 1) > 1).length;
    const singleSource = items.length - multiSource;
    const multiRate = Math.round((multiSource / items.length) * 100);
    const avgReadability = Math.round(
      items.reduce(
        (s, a) => s + (a.scores?.readability ?? a.confidence_score),
        0
      ) / items.length
    );

    const needsReviewCount = todayData.needsReview.length;
    const blockedCount = todayData.blockedCount;
    const signOffCount = todayData.signOffCount;
    const fetcherWarn = singleSource > 0 || items.some((a) => a.used_fallback_snippet);
    const judgeWarn = blockedCount > 0 || todayData.pipelineErrorCount > 0;

    return [
      {
        name: 'RSS Fetcher',
        statusLabel: fetcherWarn
          ? `${singleSource} ${singleSource === 1 ? 'story' : 'stories'} had only 1 source.`
          : 'Normal',
        tone: (fetcherWarn ? 'warning' : 'success') as 'warning' | 'success',
        metric: `${multiRate}% multi-source (${multiSource}/${items.length})`,
      },
      {
        name: 'Grade-6 Summarizer',
        statusLabel: avgReadability < 75 ? 'Low readability' : 'Normal',
        tone: (avgReadability < 75 ? 'warning' : 'success') as 'warning' | 'success',
        metric: `Avg readability ${avgReadability}/100`,
      },
      {
        name: 'Quality Judge',
        statusLabel:
          needsReviewCount > 0 ? `${needsReviewCount} in queue` : 'Normal',
        tone: (judgeWarn
          ? 'warning'
          : needsReviewCount > 0
            ? 'neutral'
            : 'success') as 'warning' | 'neutral' | 'success',
        metric:
          needsReviewCount > 0
            ? `${blockedCount} blocked · ${signOffCount} need sign-off`
            : `All ${items.length} cleared`,
      },
    ];
  }, [
    todayData.blockedCount,
    todayData.items,
    todayData.needsReview.length,
    todayData.pipelineErrorCount,
    todayData.signOffCount,
  ]);

  // Judge quality scores: Today vs 7-day average (computed from real data)
  const qualityComparison = useMemo(() => {
    const distinctDates = Array.from(new Set(articles.map((a) => a.date))).sort();
    const recent7Dates = new Set(distinctDates.slice(-7));
    const sevenDayItems = articles.filter((a) => recent7Dates.has(a.date));

    const avgFor = (
      list: Article[],
      pick: (a: Article) => number
    ): number | null => {
      if (list.length === 0) return null;
      return Math.round(list.reduce((s, a) => s + pick(a), 0) / list.length);
    };

    const metrics = [
      {
        label: 'Accuracy',
        todayVal: avgFor(todayData.items, (a) => a.scores?.accuracy ?? a.confidence_score),
        sevenDayVal: avgFor(sevenDayItems, (a) => a.scores?.accuracy ?? a.confidence_score),
      },
      {
        label: 'Neutrality',
        todayVal: avgFor(todayData.items, (a) => a.scores?.neutrality ?? a.confidence_score),
        sevenDayVal: avgFor(sevenDayItems, (a) => a.scores?.neutrality ?? a.confidence_score),
      },
      {
        label: 'Safety',
        todayVal: avgFor(todayData.items, (a) => a.scores?.safety ?? a.confidence_score),
        sevenDayVal: avgFor(sevenDayItems, (a) => a.scores?.safety ?? a.confidence_score),
      },
      {
        label: 'Readability',
        todayVal: avgFor(todayData.items, (a) => a.scores?.readability ?? a.confidence_score),
        sevenDayVal: avgFor(sevenDayItems, (a) => a.scores?.readability ?? a.confidence_score),
      },
    ];

    const byDate = new Map<
      string,
      { date: string; published: number; pending: number; rejected: number }
    >();
    for (const a of articles) {
      const entry = byDate.get(a.date) ?? {
        date: a.date,
        published: 0,
        pending: 0,
        rejected: 0,
      };
      if (a.status === 'published') entry.published += 1;
      else if (a.status === 'rejected') entry.rejected += 1;
      else entry.pending += 1;
      byDate.set(a.date, entry);
    }
    const editionDays = Array.from(byDate.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    return {
      metrics,
      editionCount: distinctDates.length,
      editionDays,
      maxDayTotal: Math.max(
        1,
        ...editionDays.map((d) => d.published + d.pending + d.rejected)
      ),
    };
  }, [articles, todayData.items]);

  const queue = todayData.needsReview;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xxl,
          paddingVertical: theme.spacing.lg,
          paddingBottom: theme.spacing.xxxl,
        }}
      >
      <View
        style={{
          maxWidth: theme.layout.contentMaxWidth + 280,
          width: '100%',
          alignSelf: 'center',
          gap: theme.spacing.lg,
        }}
      >
        {/* SINGLE-LINE EDITION HEADER */}
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: theme.spacing.md,
            paddingBottom: theme.spacing.md,
            borderBottomWidth: theme.layout.borderWidth,
            borderBottomColor: theme.colors.borderSubtle,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'baseline',
              gap: theme.spacing.md,
              flex: 1,
              minWidth: 280,
            }}
          >
            <DSText variant="headline" weight="bold" tone="primary">
              {formatEditionHeading(today)}
            </DSText>
            <DSText
              variant="footnote"
              tone={todayData.pipelineErrorCount > 0 ? 'danger' : 'secondary'}
            >
              {todayData.pipelineStatusText}
            </DSText>
          </View>

          <DSButton
            label={
              queue.length > 0
                ? `Review ${queue.length} ${queue.length === 1 ? 'story' : 'stories'}`
                : 'Open approval inbox'
            }
            variant="accent"
            size="sm"
            onPress={() =>
              onOpenInbox(
                queue.length > 0
                  ? { type: 'today-pending' }
                  : { type: 'today-published' }
              )
            }
          />
        </View>

        {/* TWO-COLUMN NEWSROOM WORKSPACE (65% Queue / 35% Status & Health) */}
        <View
          style={{ gap: theme.spacing.xl, alignItems: 'flex-start' }}
          className="flex-col lg:flex-row"
        >
          {/* MAIN COLUMN (~65%): REVIEW QUEUE */}
          <View className="w-full lg:w-auto lg:flex-[65] lg:min-w-0">
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: theme.spacing.sm,
              }}
            >
              <DSText variant="subhead" weight="bold" tone="primary">
                Review queue ({queue.length})
              </DSText>
              <DSText variant="caption" tone="tertiary">
                Sorted by severity, score, and age · Keys: j/k move, a approve, o open
              </DSText>
            </View>

            <DSSurface
              variant="surface"
              radius="md"
              bordered
              style={{ overflow: 'hidden' }}
            >
              {todayData.total === 0 ? (
                <View
                  style={{
                    padding: theme.spacing.xxl,
                    alignItems: 'flex-start',
                    gap: theme.spacing.sm,
                  }}
                >
                  <DSText variant="subhead" weight="semibold" tone="primary">
                    Pipeline has not run today
                  </DSText>
                  <DSText variant="footnote" tone="secondary">
                    No stories have been fetched or summarized for {today} yet.
                    Run the pipeline to generate today&apos;s drafts.
                  </DSText>
                  <DSButton
                    label="Run pipeline"
                    variant="secondary"
                    size="sm"
                    onPress={onOpenLivePipeline}
                    style={{ marginTop: theme.spacing.xs }}
                  />
                </View>
              ) : queue.length === 0 && todayData.pipelineErrorCount > 0 ? (
                <View
                  style={{
                    padding: theme.spacing.xxl,
                    alignItems: 'flex-start',
                    gap: theme.spacing.sm,
                  }}
                >
                  <DSText variant="subhead" weight="semibold" tone="danger">
                    Pipeline failed on today&apos;s run
                  </DSText>
                  <DSText variant="footnote" tone="secondary">
                    {todayData.pipelineErrorCount} error(s) occurred during
                    processing and no drafts are waiting in the queue.
                  </DSText>
                  <DSButton
                    label="Inspect pipeline log"
                    variant="secondary"
                    size="sm"
                    onPress={onOpenLivePipeline}
                    style={{ marginTop: theme.spacing.xs }}
                  />
                </View>
              ) : queue.length === 0 ? (
                <View
                  style={{
                    padding: theme.spacing.xxl,
                    alignItems: 'flex-start',
                    gap: theme.spacing.sm,
                  }}
                >
                  <DSText variant="subhead" weight="semibold" tone="primary">
                    No stories in the review queue
                  </DSText>
                  <DSText variant="footnote" tone="secondary">
                    All {todayData.total} stories from today&apos;s edition have
                    been reviewed ({todayData.publishedCount} published,{' '}
                    {todayData.rejectedCount} rejected).
                  </DSText>
                </View>
              ) : (
                queue.map((item, idx) => {
                  const isKeyboardFocused = idx === clampedKeyboardIdx;
                  const isSelected = selectedArticleId === item.id;
                  const isHovered = hoveredId === item.id;
                  const isPickerOpen = rejectPickerId === item.id;
                  const showActions =
                    isHovered || isKeyboardFocused || isPickerOpen;
                  const lowestScore = getLowestSubScore(item);
                  const scoreTone = getScoreTone(lowestScore.value);
                  const queueStatus = getQueueStatus(item);
                  const isBlocked = queueStatus === 'Blocked';
                  const statusTone = isBlocked ? 'danger' : 'warning';
                  const statusIcon = isBlocked ? '✕' : '◔';
                  const reason = getQueueReviewReason(item);
                  const age = formatRelativeAge(
                    getArticleTimestamp(item),
                    item.date
                  );
                  const beat = item.topic || item.source_names?.[0] || 'General';
                  const isBusy = busyId === item.id;

                  return (
                    <View key={item.id} style={{ position: 'relative' }}>
                      {idx > 0 ? <DSDivider /> : null}
                      <View
                        onPointerEnter={() => setHoveredId(item.id)}
                        onPointerLeave={() =>
                          setHoveredId((prev) =>
                            prev === item.id ? null : prev
                          )
                        }
                        style={{
                          paddingHorizontal: theme.spacing.lg,
                          paddingVertical: theme.spacing.md,
                          backgroundColor: isSelected
                            ? theme.colors.surfaceSelected
                            : isHovered
                              ? theme.colors.surfaceHover
                              : theme.colors.surface,
                          borderLeftWidth: 3,
                          borderLeftColor: isKeyboardFocused
                            ? theme.colors.accent
                            : 'transparent',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: theme.spacing.md,
                        }}
                      >
                        {/* Left: Status (icon + text), Beat, Age, 2-line Headline, Lowest Sub-score + Reason */}
                        <Pressable
                          onPress={() => {
                            setKeyboardFocusedIdx(-1);
                            onSelectArticle(item.id);
                          }}
                          style={{ flex: 1, minWidth: 0, gap: 4 }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              flexWrap: 'wrap',
                              alignItems: 'center',
                              gap: theme.spacing.sm,
                            }}
                          >
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 5,
                              }}
                            >
                              <DSText
                                variant="caption"
                                weight="bold"
                                tone={statusTone}
                                accessibilityLabel={queueStatus}
                              >
                                {statusIcon}
                              </DSText>
                              <DSText
                                variant="caption"
                                weight="semibold"
                                tone={statusTone}
                              >
                                {queueStatus}
                              </DSText>
                            </View>
                            <DSText variant="caption" tone="tertiary">
                              · {beat}
                            </DSText>
                            <DSText variant="caption" tone="tertiary">
                              · {age}
                            </DSText>
                          </View>

                          <DSText
                            serif
                            weight="semibold"
                            tone="primary"
                            numberOfLines={2}
                            style={{ fontSize: 17.5, lineHeight: 23 }}
                            {...(Platform.OS === 'web'
                              ? ({ title: item.ai_headline } as Record<
                                  string,
                                  unknown
                                >)
                              : {})}
                          >
                            {item.ai_headline}
                          </DSText>

                          <DSText
                            variant="caption"
                            tone="secondary"
                            numberOfLines={2}
                          >
                            <DSText
                              variant="caption"
                              weight="semibold"
                              tone={scoreTone}
                              tabularNums
                            >
                              {lowestScore.label} {lowestScore.value}
                            </DSText>
                            {' — '}
                            {reason}
                          </DSText>
                        </Pressable>

                        {/* Right: Actions shown only on hovered or keyboard-focused row (sibling to left Pressable) */}
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: theme.spacing.xs,
                            flexShrink: 0,
                          }}
                        >
                          {showActions ? (
                            <>
                              {isBlocked ? (
                                <DSButton
                                  label="Open to fix"
                                  variant="secondary"
                                  size="sm"
                                  disabled={busyId !== null}
                                  onPress={() => {
                                    setRejectPickerId(null);
                                    onSelectArticle(item.id);
                                  }}
                                />
                              ) : (
                                <DSButton
                                  label="Approve"
                                  variant="secondary"
                                  size="sm"
                                  loading={isBusy}
                                  disabled={busyId !== null}
                                  onPress={() => {
                                    setRejectPickerId(null);
                                    void handleInlineApprove(item);
                                  }}
                                />
                              )}
                              <DSButton
                                label="Reject"
                                variant="ghost"
                                size="sm"
                                disabled={busyId !== null}
                                onPress={() => {
                                  setRejectPickerId((prev) =>
                                    prev === item.id ? null : item.id
                                  );
                                }}
                              />
                            </>
                          ) : (
                            <Pressable
                              onPress={() => onSelectArticle(item.id)}
                              style={({ pressed }) => ({
                                paddingHorizontal: theme.spacing.sm,
                                paddingVertical: theme.spacing.xs,
                                opacity: pressed ? 0.6 : 1,
                              })}
                            >
                              <DSText
                                variant="caption"
                                weight="medium"
                                tone="secondary"
                              >
                                Open
                              </DSText>
                            </Pressable>
                          )}
                        </View>
                      </View>

                      {/* Reject reason dropdown/picker */}
                      {isPickerOpen ? (
                        <View
                          style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: theme.spacing.xs,
                            paddingHorizontal: theme.spacing.lg,
                            paddingBottom: theme.spacing.sm,
                            backgroundColor: isSelected
                              ? theme.colors.surfaceSelected
                              : theme.colors.surfaceHover,
                          }}
                        >
                          <DSText
                            variant="caption"
                            tone="secondary"
                            style={{ marginRight: theme.spacing.xs }}
                          >
                            Reject reason:
                          </DSText>
                          {REJECT_REASONS.map((r) => (
                            <DSButton
                              key={r}
                              label={r}
                              variant="secondary"
                              size="sm"
                              disabled={busyId !== null}
                              onPress={(e) => {
                                e.stopPropagation?.();
                                void handleInlineReject(item, r);
                              }}
                            />
                          ))}
                          <DSButton
                            label="Cancel"
                            variant="ghost"
                            size="sm"
                            onPress={(e) => {
                              e.stopPropagation?.();
                              setRejectPickerId(null);
                            }}
                          />
                        </View>
                      ) : null}
                    </View>
                  );
                })
              )}
            </DSSurface>
          </View>

          {/* SIDE COLUMN (~35%): COUNTS, AGENT HEALTH, QUALITY, TRENDS */}
          <View
            style={{ gap: theme.spacing.lg }}
            className="w-full lg:w-auto lg:flex-[35] lg:min-w-[300px]"
          >
            {/* 1. Today's Counts */}
            <DSSurface
              variant="surface"
              radius="md"
              bordered
              style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                }}
              >
                <DSText variant="subhead" weight="bold" tone="primary">
                  Today&apos;s counts
                </DSText>
                <DSText variant="caption" tone="tertiary" tabularNums>
                  {todayData.total} total
                </DSText>
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                {[
                  {
                    label: 'Published',
                    count: todayData.publishedCount,
                    tone: 'success' as const,
                    folder: { type: 'today-published' } as InboxFolder,
                  },
                  {
                    label: 'Needs review',
                    count: todayData.needsReview.length,
                    tone: 'warning' as const,
                    folder: { type: 'today-pending' } as InboxFolder,
                  },
                  {
                    label: 'Rejected',
                    count: todayData.rejectedCount,
                    tone: 'danger' as const,
                    folder: { type: 'today-pending' } as InboxFolder,
                  },
                ].map((row) => (
                  <Pressable
                    key={row.label}
                    onPress={() => onOpenInbox(row.folder)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingVertical: 2,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: theme.spacing.sm,
                      }}
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: theme.radii.pill,
                          backgroundColor: theme.colors.tones[row.tone].dot,
                        }}
                      />
                      <DSText variant="footnote" weight="medium" tone="primary">
                        {row.label}
                      </DSText>
                    </View>
                    <DSText
                      variant="subhead"
                      weight="bold"
                      tone="primary"
                      tabularNums
                    >
                      {row.count}
                    </DSText>
                  </Pressable>
                ))}
              </View>
            </DSSurface>

            {/* 2. Agent Health */}
            <DSSurface
              variant="surface"
              radius="md"
              bordered
              style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <DSText variant="subhead" weight="bold" tone="primary">
                  Agent health
                </DSText>
                <Pressable onPress={onOpenLivePipeline}>
                  <DSText variant="caption" weight="semibold" tone="accent">
                    Pipeline log →
                  </DSText>
                </Pressable>
              </View>

              <View style={{ gap: theme.spacing.sm }}>
                {agentHealth.map((agent, i) => (
                  <View key={agent.name}>
                    {i > 0 ? (
                      <View style={{ marginBottom: theme.spacing.sm }}>
                        <DSDivider />
                      </View>
                    ) : null}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: theme.spacing.sm,
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <DSText variant="footnote" weight="semibold" tone="primary">
                          {agent.name}
                        </DSText>
                        <DSText variant="caption" tone="secondary">
                          {agent.metric}
                        </DSText>
                      </View>
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: theme.radii.pill,
                            backgroundColor: theme.colors.tones[agent.tone].dot,
                          }}
                        />
                        <DSText
                          variant="caption"
                          weight="semibold"
                          tone={agent.tone === 'neutral' ? 'tertiary' : agent.tone}
                        >
                          {agent.statusLabel}
                        </DSText>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            </DSSurface>

            {/* 3. Judge Quality Scores */}
            <DSSurface
              variant="surface"
              radius="md"
              bordered
              style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
            >
              <DSText variant="subhead" weight="bold" tone="primary">
                Judge quality scores
              </DSText>

              <View style={{ gap: theme.spacing.sm }}>
                {qualityComparison.metrics.map((m) => (
                  <View
                    key={m.label}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <DSText variant="footnote" tone="secondary">
                      {m.label}
                    </DSText>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'baseline',
                        gap: theme.spacing.sm,
                      }}
                    >
                      <DSText
                        variant="subhead"
                        weight="bold"
                        tone="primary"
                        tabularNums
                      >
                        {m.todayVal !== null ? m.todayVal : '—'}
                      </DSText>
                      {qualityComparison.editionCount >= 7 ? (
                        <DSText variant="caption" tone="tertiary" tabularNums>
                          ({formatDelta(m.todayVal, m.sevenDayVal)})
                        </DSText>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            </DSSurface>

            {/* 4. Trends (only shown when >= 7 editions exist) */}
            <DSSurface
              variant="surface"
              radius="md"
              bordered
              style={{ padding: theme.spacing.lg, gap: theme.spacing.sm }}
            >
              <DSText variant="subhead" weight="bold" tone="primary">
                Edition trends
              </DSText>
              {qualityComparison.editionCount < 7 ? (
                <DSText variant="caption" tone="secondary">
                  {qualityComparison.editionCount}{' '}
                  {qualityComparison.editionCount === 1 ? 'edition' : 'editions'}{' '}
                  recorded. Multi-day throughput chart will appear once 7
                  editions are available.
                </DSText>
              ) : (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-end',
                    justifyContent: 'space-between',
                    gap: theme.spacing.xs,
                    height: 96,
                    paddingTop: theme.spacing.sm,
                  }}
                >
                  {qualityComparison.editionDays.map((day) => {
                    const total = day.published + day.pending + day.rejected;
                    const h = Math.max(
                      8,
                      Math.round((total / qualityComparison.maxDayTotal) * 64)
                    );
                    return (
                      <View
                        key={day.date}
                        style={{
                          flex: 1,
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: 4,
                        }}
                      >
                        <DSText variant="caption" tone="secondary" tabularNums>
                          {total}
                        </DSText>
                        <View
                          style={{
                            width: '100%',
                            maxWidth: 24,
                            height: h,
                            borderRadius: theme.radii.xs,
                            backgroundColor: theme.colors.textPrimary,
                          }}
                        />
                        <DSText variant="caption" tone="tertiary" tabularNums>
                          {day.date.slice(5)}
                        </DSText>
                      </View>
                    );
                  })}
                </View>
              )}
            </DSSurface>
          </View>
        </View>
      </View>
      </ScrollView>

      {undoToast ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            bottom: theme.spacing.xl,
            left: theme.spacing.xl,
            right: theme.spacing.xl,
            alignItems: 'center',
          }}
        >
          <DSSurface
            variant="surface"
            radius="md"
            bordered
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: theme.spacing.sm,
              maxWidth: 520,
              backgroundColor: theme.colors.textPrimary,
            }}
          >
            <DSText
              variant="caption"
              style={{ color: theme.colors.surface, flex: 1 }}
              numberOfLines={1}
            >
              {undoToast.action === 'approved' ? 'Approved' : 'Rejected'} “
              {undoToast.headline}”
            </DSText>
            <Pressable
              onPress={() => void handleUndo()}
              style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <DSText
                variant="caption"
                weight="bold"
                style={{ color: theme.colors.surface, textDecorationLine: 'underline' }}
              >
                Undo
              </DSText>
            </Pressable>
          </DSSurface>
        </View>
      ) : null}
    </View>
  );
}
