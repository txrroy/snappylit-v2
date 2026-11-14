import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import {
  useDSTheme,
  DSText,
  DSChip,
  DSBadge,
  DSButton,
  DSInput,
  DSDivider,
  DSCard,
  type DSTone,
} from '@/design-system';
import type { Article, ArticleStatus } from '@/types/article';
import {
  getEditorialState,
  getEditorialStateTone,
  getQueueReviewReason,
} from '@/lib/editorialLabels';

export type ArticleInboxView =
  | 'all'
  | 'ready'
  | 'needs-check'
  | 'unverified'
  | 'sensitive';

export interface ArticleFilterState {
  search: string;
  view: ArticleInboxView;
  status: ArticleStatus | 'all';
}

export const INITIAL_FILTERS: ArticleFilterState = {
  search: '',
  view: 'all',
  status: 'all',
};

const FOUR_VIEWS: {
  id: Exclude<ArticleInboxView, 'all'>;
  label: string;
}[] = [
  { id: 'ready', label: 'Ready' },
  { id: 'needs-check', label: 'Needs a check' },
  { id: 'unverified', label: 'Could not verify' },
  { id: 'sensitive', label: 'Sensitive' },
];

interface ArticleInboxListProps {
  folderTitle: string;
  articles: Article[];
  filteredArticles: Article[];
  filters: ArticleFilterState;
  showStatusFilter: boolean;
  selectedArticleId: string | null;
  onChangeFilters: (next: ArticleFilterState) => void;
  onSelectArticle: (id: string) => void;
  onBatchApprove?: (ids: string[]) => Promise<void>;
  onBatchReject?: (ids: string[]) => Promise<void>;
  onUnpublish?: (id: string) => Promise<void>;
}

export function isHighConfidenceReady(article: Article): boolean {
  return (
    article.status === 'draft' &&
    getEditorialState(article) === 'Ready to approve'
  );
}

export function getArticleAccuracy(article: Article): number {
  return article.scores?.accuracy ?? article.confidence_score;
}

function getSourceLabel(article: Article): string {
  if (article.topic) return article.topic;
  if (article.source_names && article.source_names.length > 0) {
    return article.source_names[0];
  }
  try {
    return new URL(article.original_url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

function getRowTone(article: Article): DSTone {
  if (article.status === 'published') return 'success';
  if (article.status === 'rejected') return 'danger';
  return getEditorialStateTone(getEditorialState(article));
}

function getRowStateLabel(article: Article): string {
  if (article.status === 'published') return 'Published';
  if (article.status === 'rejected') return 'Rejected';
  return getEditorialState(article);
}

export function applyArticleFilters(
  articles: Article[],
  filters: ArticleFilterState
): Article[] {
  const q = filters.search.trim().toLowerCase();

  return articles.filter((article) => {
    if (filters.status !== 'all' && article.status !== filters.status) {
      return false;
    }

    const state = getEditorialState(article);
    if (filters.view === 'ready' && state !== 'Ready to approve') {
      return false;
    }
    if (filters.view === 'needs-check' && state !== 'Needs a check') {
      return false;
    }
    if (filters.view === 'unverified' && state !== 'Could not verify') {
      return false;
    }
    if (filters.view === 'sensitive' && !article.sensitive) {
      return false;
    }

    if (q) {
      const haystack = [
        article.ai_headline,
        article.ai_summary,
        article.topic ?? '',
        article.region ?? '',
        ...(article.source_names ?? []),
        article.original_url,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }

    return true;
  });
}

export function ArticleInboxList({
  folderTitle,
  articles,
  filteredArticles,
  filters,
  showStatusFilter,
  selectedArticleId,
  onChangeFilters,
  onSelectArticle,
  onBatchApprove,
  onUnpublish,
}: ArticleInboxListProps) {
  const { theme } = useDSTheme();
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [unpublishingId, setUnpublishingId] = useState<string | null>(null);

  const viewCounts = useMemo(() => {
    let ready = 0;
    let needsCheck = 0;
    let unverified = 0;
    let sensitive = 0;

    for (const a of articles) {
      const st = getEditorialState(a);
      if (st === 'Ready to approve') ready += 1;
      else if (st === 'Needs a check') needsCheck += 1;
      else unverified += 1;
      if (a.sensitive) sensitive += 1;
    }

    return {
      ready,
      'needs-check': needsCheck,
      unverified,
      sensitive,
    };
  }, [articles]);

  const readyDraftsInView = useMemo(
    () =>
      filteredArticles.filter(
        (a) =>
          a.status === 'draft' &&
          getEditorialState(a) === 'Ready to approve'
      ),
    [filteredArticles]
  );

  // Fix 11: Remove "Select All (33)". Allow bulk approval only in the "Ready" view.
  const canBulkApproveReady =
    filters.view === 'ready' &&
    readyDraftsInView.length > 0 &&
    Boolean(onBatchApprove);

  const handleConfirmBatch = async () => {
    if (!onBatchApprove || readyDraftsInView.length === 0) return;
    setBatchBusy(true);
    try {
      await onBatchApprove(readyDraftsInView.map((a) => a.id));
      setBatchModalOpen(false);
    } finally {
      setBatchBusy(false);
    }
  };

  const handleQuickUnpublish = async (id: string) => {
    if (!onUnpublish || unpublishingId) return;
    setUnpublishingId(id);
    try {
      await onUnpublish(id);
    } finally {
      setUnpublishingId(null);
    }
  };

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.view !== 'all' ||
    filters.status !== 'all';

  return (
    <View
      style={{
        flex: 1,
        minWidth: 0,
        backgroundColor: theme.colors.surface,
      }}
    >
      {/* Top Search & Folder Header */}
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderBottomWidth: theme.layout.borderWidth,
          borderBottomColor: theme.colors.borderSubtle,
          backgroundColor: theme.colors.surface,
          gap: theme.spacing.md,
        }}
      >
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
              alignItems: 'baseline',
              gap: theme.spacing.sm,
            }}
          >
            <DSText variant="headline" weight="bold" tone="primary">
              {folderTitle}
            </DSText>
            <DSText variant="caption" tone="tertiary">
              {filteredArticles.length === articles.length
                ? `${articles.length} stories`
                : `${filteredArticles.length} of ${articles.length}`}
            </DSText>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              flex: 1,
              maxWidth: 420,
              minWidth: 200,
            }}
          >
            <View style={{ flex: 1, position: 'relative' }}>
              <DSInput
                value={filters.search}
                onChangeText={(text) =>
                  onChangeFilters({ ...filters, search: text })
                }
                placeholder="Search headline, summary, source..."
                compact
                style={{
                  borderRadius: theme.radii.pill,
                  paddingRight: filters.search
                    ? theme.spacing.xxxl
                    : theme.spacing.md,
                }}
              />
              {filters.search ? (
                <Pressable
                  onPress={() => onChangeFilters({ ...filters, search: '' })}
                  style={{
                    position: 'absolute',
                    right: theme.spacing.md,
                    top: 0,
                    bottom: 0,
                    justifyContent: 'center',
                  }}
                >
                  <DSText variant="caption" weight="bold" tone="tertiary">
                    ✕
                  </DSText>
                </Pressable>
              ) : null}
            </View>

            {hasActiveFilters ? (
              <DSButton
                label="Show all"
                variant="secondary"
                size="sm"
                pill
                onPress={() => onChangeFilters(INITIAL_FILTERS)}
              />
            ) : null}
          </View>
        </View>

        {/* Fix 5: Replace the filter chips with four views: "Ready", "Needs a check", "Could not verify", "Sensitive" */}
        {articles.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.sm,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: theme.spacing.xs + 2,
              }}
            >
              <DSChip
                label={`All (${articles.length})`}
                active={filters.view === 'all'}
                onPress={() => onChangeFilters({ ...filters, view: 'all' })}
              />
              {FOUR_VIEWS.map((v) => {
                const count = viewCounts[v.id];
                return (
                  <DSChip
                    key={v.id}
                    label={`${v.label} (${count})`}
                    active={filters.view === v.id}
                    onPress={() =>
                      onChangeFilters({
                        ...filters,
                        view: filters.view === v.id ? 'all' : v.id,
                      })
                    }
                  />
                );
              })}

              {showStatusFilter ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    marginLeft: theme.spacing.sm,
                  }}
                >
                  {(['draft', 'published', 'rejected'] as ArticleStatus[]).map(
                    (status) => (
                      <DSChip
                        key={status}
                        label={
                          status === 'draft'
                            ? 'In review'
                            : status === 'published'
                              ? 'Published'
                              : 'Rejected'
                        }
                        active={filters.status === status}
                        onPress={() =>
                          onChangeFilters({
                            ...filters,
                            status: filters.status === status ? 'all' : status,
                          })
                        }
                      />
                    )
                  )}
                </View>
              ) : null}
            </View>

            {/* Fix 11: Allow bulk approval ONLY in the "Ready" view */}
            {canBulkApproveReady ? (
              <DSButton
                label={`Approve all Ready (${readyDraftsInView.length})`}
                variant="accent"
                size="sm"
                pill
                disabled={batchBusy}
                onPress={() => setBatchModalOpen(true)}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Fix 3: Show the plain reason in list rows. Move numeric scores to detail view. */}
      <ScrollView style={{ flex: 1 }}>
        {filteredArticles.length === 0 ? (
          <View
            style={{
              paddingVertical: theme.spacing.xxxl * 2,
              paddingHorizontal: theme.spacing.xxl,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <DSText variant="subhead" weight="medium" tone="secondary" center>
              {articles.length === 0
                ? 'No stories in this folder.'
                : 'No stories match this view.'}
            </DSText>
            {hasActiveFilters ? (
              <DSButton
                label="Show all stories"
                variant="secondary"
                size="sm"
                pill
                onPress={() => onChangeFilters(INITIAL_FILTERS)}
                style={{ marginTop: theme.spacing.md }}
              />
            ) : null}
          </View>
        ) : (
          filteredArticles.map((item) => {
            const isSelected = item.id === selectedArticleId;
            const rowTone = getRowTone(item);
            const stateLabel = getRowStateLabel(item);
            const plainReason =
              item.status === 'published'
                ? 'Published live in reader edition.'
                : item.status === 'rejected'
                  ? item.rejection_reason
                    ? `Rejected: ${item.rejection_reason}`
                    : 'Rejected by editor.'
                  : getQueueReviewReason(item);

            return (
              <View key={item.id}>
                <Pressable
                  onPress={() => onSelectArticle(item.id)}
                  style={({ pressed }) => [
                    {
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: theme.spacing.lg,
                      paddingVertical: theme.spacing.md,
                      backgroundColor: isSelected
                        ? theme.colors.surfaceSelected
                        : pressed
                          ? theme.colors.surfaceHover
                          : theme.colors.surface,
                    },
                  ]}
                >
                  {/* Status dot */}
                  <View
                    style={{
                      width: theme.spacing.sm,
                      height: theme.spacing.sm,
                      borderRadius: theme.radii.pill,
                      marginRight: theme.spacing.md,
                      backgroundColor: theme.colors.tones[rowTone].dot,
                    }}
                  />

                  {/* Left column: Topic / Source */}
                  <View
                    style={{ paddingRight: theme.spacing.md }}
                    className="w-24 md:w-32 shrink-0"
                  >
                    <DSText
                      variant="caption"
                      weight="semibold"
                      tone="secondary"
                      numberOfLines={1}
                    >
                      {getSourceLabel(item)}
                    </DSText>
                  </View>

                  {/* Center: Headline + One Plain Reason underneath (Fix 3) */}
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      paddingRight: theme.spacing.md,
                      gap: 2,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.body,
                        {
                          fontFamily: theme.fontFamilies.sans,
                          color: theme.colors.textPrimary,
                          fontWeight: '600',
                        },
                      ]}
                    >
                      {item.ai_headline}
                    </Text>
                    <DSText
                      variant="caption"
                      tone="secondary"
                      numberOfLines={1}
                    >
                      {plainReason}
                    </DSText>
                  </View>

                  {/* Right: Unified Three-State Badge + Unpublish button when published (Fix 2 & Fix 15) */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      flexShrink: 0,
                    }}
                  >
                    {item.sensitive ? (
                      <DSBadge label="Sensitive" tone="neutral" />
                    ) : null}

                    <DSBadge label={stateLabel} tone={rowTone} dot />

                    {item.status === 'published' && onUnpublish ? (
                      <DSButton
                        label="Unpublish"
                        variant="secondary"
                        size="sm"
                        loading={unpublishingId === item.id}
                        disabled={unpublishingId !== null}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          void handleQuickUnpublish(item.id);
                        }}
                      />
                    ) : null}
                  </View>
                </Pressable>
                <DSDivider />
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Batch-Approve Confirmation Modal (Ready view only) */}
      <Modal
        visible={batchModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBatchModalOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: theme.colors.backdrop,
            alignItems: 'center',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <DSCard
            headerTitle={`Approve ${readyDraftsInView.length} Ready Stories`}
            headerSubtitle="Every story below was verified against the full article text and passed all Judge checks."
            elevated
            padding="lg"
            style={{ width: '100%', maxWidth: 520 }}
          >
            <ScrollView
              style={{ maxHeight: 260, marginBottom: theme.spacing.lg }}
            >
              <View style={{ gap: theme.spacing.sm }}>
                {readyDraftsInView.map((a) => (
                  <View
                    key={a.id}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: theme.spacing.sm,
                    }}
                  >
                    <DSText
                      variant="caption"
                      weight="medium"
                      tone="primary"
                      numberOfLines={1}
                      style={{ flex: 1 }}
                    >
                      • {a.ai_headline}
                    </DSText>
                    <DSBadge label="Ready to approve" tone="success" />
                  </View>
                ))}
              </View>
            </ScrollView>

            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'flex-end',
                gap: theme.spacing.sm,
              }}
            >
              <DSButton
                label="Cancel"
                variant="secondary"
                size="md"
                disabled={batchBusy}
                onPress={() => setBatchModalOpen(false)}
              />
              <DSButton
                label={`Confirm & Publish (${readyDraftsInView.length})`}
                variant="primary"
                size="md"
                loading={batchBusy}
                onPress={handleConfirmBatch}
              />
            </View>
          </DSCard>
        </View>
      </Modal>
    </View>
  );
}
