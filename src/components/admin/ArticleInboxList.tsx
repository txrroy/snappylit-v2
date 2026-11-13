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
import type { Article, ArticleFlag, ArticleStatus } from '@/types/article';
import { getFlagShortLabel } from '@/lib/editorialLabels';

export type AccuracyBucket = 'all' | 'low' | 'medium' | 'high';
export type JudgeFilter = 'all' | 'pass' | 'review';

export interface ArticleFilterState {
  search: string;
  status: ArticleStatus | 'all';
  judge: JudgeFilter;
  accuracy: AccuracyBucket;
  topic: string | 'all';
  region: string | 'all';
  flag: ArticleFlag | 'SENSITIVE' | 'all';
}

export const INITIAL_FILTERS: ArticleFilterState = {
  search: '',
  status: 'all',
  judge: 'all',
  accuracy: 'all',
  topic: 'all',
  region: 'all',
  flag: 'all',
};

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
}

export function isHighConfidenceReady(article: Article): boolean {
  const acc = article.scores?.accuracy ?? article.confidence_score;
  return (
    article.status === 'draft' &&
    article.judge_pass === true &&
    (article.flags?.length ?? 0) === 0 &&
    !article.sensitive &&
    acc >= 85
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

function getStatusTone(status: ArticleStatus): DSTone {
  if (status === 'published') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warning';
}

function getScoreTone(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 85) return 'success';
  if (score >= 65) return 'warning';
  return 'danger';
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

    if (filters.judge === 'pass' && article.judge_pass !== true) {
      return false;
    }
    if (filters.judge === 'review' && article.judge_pass !== false) {
      return false;
    }

    const acc = getArticleAccuracy(article);
    if (filters.accuracy === 'low' && acc >= 65) return false;
    if (filters.accuracy === 'medium' && (acc < 65 || acc >= 85)) return false;
    if (filters.accuracy === 'high' && acc < 85) return false;

    if (filters.topic !== 'all' && article.topic !== filters.topic) {
      return false;
    }

    if (filters.region !== 'all' && article.region !== filters.region) {
      return false;
    }

    if (filters.flag === 'SENSITIVE' && !article.sensitive) {
      return false;
    }
    if (
      filters.flag !== 'all' &&
      filters.flag !== 'SENSITIVE' &&
      !(article.flags ?? []).includes(filters.flag)
    ) {
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
}: ArticleInboxListProps) {
  const { theme } = useDSTheme();
  const [batchModalOpen, setBatchModalOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);

  const { needsJudgment, readyToBatch } = useMemo(() => {
    const drafts = filteredArticles.filter((a) => a.status === 'draft');
    if (drafts.length === 0) {
      return { needsJudgment: [] as Article[], readyToBatch: [] as Article[] };
    }
    return {
      needsJudgment: filteredArticles.filter(
        (a) => a.status === 'draft' && !isHighConfidenceReady(a)
      ),
      readyToBatch: filteredArticles.filter((a) => isHighConfidenceReady(a)),
    };
  }, [filteredArticles]);

  const showTriageLanes =
    !showStatusFilter &&
    (needsJudgment.length > 0 || readyToBatch.length > 0) &&
    filteredArticles.every((a) => a.status === 'draft');

  const handleConfirmBatch = async () => {
    if (!onBatchApprove || readyToBatch.length === 0) return;
    setBatchBusy(true);
    try {
      await onBatchApprove(readyToBatch.map((a) => a.id));
      setBatchModalOpen(false);
    } finally {
      setBatchBusy(false);
    }
  };

  const availableFactors = useMemo(() => {
    const statuses = new Set<ArticleStatus>();
    const topics = new Set<string>();
    const regions = new Set<string>();
    const flags = new Set<ArticleFlag>();
    let hasJudge = false;
    let hasSensitive = false;

    for (const a of articles) {
      statuses.add(a.status);
      if (a.topic) topics.add(a.topic);
      if (a.region) regions.add(a.region);
      if (a.judge_pass !== undefined) hasJudge = true;
      if (a.sensitive) hasSensitive = true;
      for (const f of a.flags ?? []) {
        flags.add(f);
      }
    }

    return {
      statuses: Array.from(statuses),
      topics: Array.from(topics).sort(),
      regions: Array.from(regions).sort(),
      flags: Array.from(flags).sort(),
      hasJudge,
      hasSensitive,
    };
  }, [articles]);

  const hasActiveFilters =
    filters.search.trim() !== '' ||
    filters.status !== 'all' ||
    filters.judge !== 'all' ||
    filters.accuracy !== 'all' ||
    filters.topic !== 'all' ||
    filters.region !== 'all' ||
    filters.flag !== 'all';

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
                ? `${articles.length} articles`
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
                  paddingRight: filters.search ? theme.spacing.xxxl : theme.spacing.md,
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
                label="Clear"
                variant="secondary"
                size="sm"
                pill
                onPress={() => onChangeFilters(INITIAL_FILTERS)}
              />
            ) : null}
          </View>
        </View>

        {/* Dynamic Factor Filters */}
        {articles.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingVertical: theme.spacing.xxs,
            }}
          >
            {showStatusFilter && availableFactors.statuses.length > 1 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <DSText variant="micro" weight="semibold" tone="tertiary">
                  Status:
                </DSText>
                {(['draft', 'published', 'rejected'] as ArticleStatus[])
                  .filter((s) => availableFactors.statuses.includes(s))
                  .map((status) => (
                    <DSChip
                      key={status}
                      label={
                        status === 'draft'
                          ? 'Pending'
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
                  ))}
              </View>
            ) : null}

            {availableFactors.hasJudge ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <DSText variant="micro" weight="semibold" tone="tertiary">
                  Judge:
                </DSText>
                <DSChip
                  label="Auto-Pass"
                  active={filters.judge === 'pass'}
                  onPress={() =>
                    onChangeFilters({
                      ...filters,
                      judge: filters.judge === 'pass' ? 'all' : 'pass',
                    })
                  }
                />
                <DSChip
                  label="Needs Review"
                  active={filters.judge === 'review'}
                  onPress={() =>
                    onChangeFilters({
                      ...filters,
                      judge: filters.judge === 'review' ? 'all' : 'review',
                    })
                  }
                />
              </View>
            ) : null}

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
              }}
            >
              <DSText variant="micro" weight="semibold" tone="tertiary">
                Accuracy:
              </DSText>
              {(
                [
                  ['low', '<65'],
                  ['medium', '65–84'],
                  ['high', '85+'],
                ] as const
              ).map(([bucket, label]) => (
                <DSChip
                  key={bucket}
                  label={label}
                  active={filters.accuracy === bucket}
                  onPress={() =>
                    onChangeFilters({
                      ...filters,
                      accuracy: filters.accuracy === bucket ? 'all' : bucket,
                    })
                  }
                />
              ))}
            </View>

            {availableFactors.topics.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <DSText variant="micro" weight="semibold" tone="tertiary">
                  Topic:
                </DSText>
                {availableFactors.topics.map((topic) => (
                  <DSChip
                    key={topic}
                    label={topic}
                    active={filters.topic === topic}
                    onPress={() =>
                      onChangeFilters({
                        ...filters,
                        topic: filters.topic === topic ? 'all' : topic,
                      })
                    }
                  />
                ))}
              </View>
            ) : null}

            {availableFactors.regions.length > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <DSText variant="micro" weight="semibold" tone="tertiary">
                  Region:
                </DSText>
                {availableFactors.regions.map((region) => (
                  <DSChip
                    key={region}
                    label={region}
                    active={filters.region === region}
                    onPress={() =>
                      onChangeFilters({
                        ...filters,
                        region: filters.region === region ? 'all' : region,
                      })
                    }
                  />
                ))}
              </View>
            ) : null}

            {availableFactors.flags.length > 0 ||
            availableFactors.hasSensitive ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.xs,
                }}
              >
                <DSText variant="micro" weight="semibold" tone="tertiary">
                  Flags:
                </DSText>
                {availableFactors.hasSensitive ? (
                  <DSChip
                    label="SENSITIVE"
                    active={filters.flag === 'SENSITIVE'}
                    onPress={() =>
                      onChangeFilters({
                        ...filters,
                        flag:
                          filters.flag === 'SENSITIVE' ? 'all' : 'SENSITIVE',
                      })
                    }
                  />
                ) : null}
                {availableFactors.flags.map((flag) => (
                  <DSChip
                    key={flag}
                    label={flag}
                    active={filters.flag === flag}
                    onPress={() =>
                      onChangeFilters({
                        ...filters,
                        flag: filters.flag === flag ? 'all' : flag,
                      })
                    }
                  />
                ))}
              </View>
            ) : null}
          </ScrollView>
        ) : null}
      </View>

      {/* Article Rows */}
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
                ? 'No articles in this section.'
                : 'No articles match the active filters.'}
            </DSText>
            {hasActiveFilters ? (
              <DSButton
                label="Reset Filters"
                variant="secondary"
                size="sm"
                pill
                onPress={() => onChangeFilters(INITIAL_FILTERS)}
                style={{ marginTop: theme.spacing.md }}
              />
            ) : null}
          </View>
        ) : showTriageLanes ? (
          <View>
            {needsJudgment.length > 0 ? (
              <View>
                <View
                  style={{
                    backgroundColor: theme.colors.surfaceHeader,
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.sm,
                    borderBottomWidth: theme.layout.borderWidth,
                    borderBottomColor: theme.colors.borderSubtle,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <DSText variant="micro" weight="bold" tone="warning" uppercase>
                    Needs Human Judgment ({needsJudgment.length})
                  </DSText>
                  <DSText variant="micro" tone="tertiary">
                    Flagged, sensitive, or score &lt; 85
                  </DSText>
                </View>
                {needsJudgment.map((item) => {
                  const isSelected = item.id === selectedArticleId;
                  const accuracy = getArticleAccuracy(item);
                  const statusTone = getStatusTone(item.status);
                  const scoreTone = getScoreTone(accuracy);
                  const flags = item.flags ?? [];

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
                        <View
                          style={{
                            width: theme.spacing.sm,
                            height: theme.spacing.sm,
                            borderRadius: theme.radii.pill,
                            marginRight: theme.spacing.md,
                            backgroundColor: theme.colors.tones[statusTone].dot,
                          }}
                        />
                        <View
                          style={{ paddingRight: theme.spacing.md }}
                          className="w-24 md:w-36 shrink-0"
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
                        <View
                          style={{
                            flex: 1,
                            minWidth: 0,
                            paddingRight: theme.spacing.md,
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              theme.typography.body,
                              {
                                fontFamily: theme.fontFamilies.sans,
                                color: theme.colors.textPrimary,
                              },
                            ]}
                          >
                            <Text style={{ fontWeight: '600' }}>
                              {item.ai_headline}
                            </Text>
                            <Text
                              style={{
                                color: theme.colors.textTertiary,
                                fontWeight: '400',
                              }}
                            >
                              {' '}
                              — {item.ai_summary}
                            </Text>
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: theme.spacing.sm,
                            flexShrink: 0,
                          }}
                        >
                          {item.sensitive ? (
                            <DSBadge label="SENSITIVE" tone="warning" />
                          ) : null}
                          {flags.length > 0 ? (
                            <View className="hidden md:flex">
                              <DSBadge
                                label={
                                  flags.length === 1
                                    ? getFlagShortLabel(flags[0])
                                    : `${flags.length} flags`
                                }
                                tone="danger"
                              />
                            </View>
                          ) : null}
                          <DSText
                            variant="footnote"
                            weight="bold"
                            tone={scoreTone}
                            tabularNums
                            style={{ width: 28, textAlign: 'right' }}
                          >
                            {accuracy}
                          </DSText>
                        </View>
                      </Pressable>
                      <DSDivider />
                    </View>
                  );
                })}
              </View>
            ) : null}

            {readyToBatch.length > 0 ? (
              <View>
                <View
                  style={{
                    backgroundColor: theme.colors.surfaceHeader,
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: theme.spacing.sm,
                    borderBottomWidth: theme.layout.borderWidth,
                    borderBottomColor: theme.colors.borderSubtle,
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: theme.spacing.sm,
                  }}
                >
                  <DSText variant="micro" weight="bold" tone="success" uppercase>
                    Ready to Batch-Approve ({readyToBatch.length})
                  </DSText>
                  {onBatchApprove ? (
                    <DSButton
                      label={`Approve All High-Confidence (${readyToBatch.length})`}
                      variant="accent"
                      size="sm"
                      pill
                      onPress={() => setBatchModalOpen(true)}
                    />
                  ) : null}
                </View>
                {readyToBatch.map((item) => {
                  const isSelected = item.id === selectedArticleId;
                  const accuracy = getArticleAccuracy(item);
                  const statusTone = getStatusTone(item.status);
                  const scoreTone = getScoreTone(accuracy);

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
                        <View
                          style={{
                            width: theme.spacing.sm,
                            height: theme.spacing.sm,
                            borderRadius: theme.radii.pill,
                            marginRight: theme.spacing.md,
                            backgroundColor: theme.colors.tones[statusTone].dot,
                          }}
                        />
                        <View
                          style={{ paddingRight: theme.spacing.md }}
                          className="w-24 md:w-36 shrink-0"
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
                        <View
                          style={{
                            flex: 1,
                            minWidth: 0,
                            paddingRight: theme.spacing.md,
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={[
                              theme.typography.body,
                              {
                                fontFamily: theme.fontFamilies.sans,
                                color: theme.colors.textPrimary,
                              },
                            ]}
                          >
                            <Text style={{ fontWeight: '600' }}>
                              {item.ai_headline}
                            </Text>
                            <Text
                              style={{
                                color: theme.colors.textTertiary,
                                fontWeight: '400',
                              }}
                            >
                              {' '}
                              — {item.ai_summary}
                            </Text>
                          </Text>
                        </View>
                        <View
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: theme.spacing.sm,
                            flexShrink: 0,
                          }}
                        >
                          <DSText
                            variant="micro"
                            weight="semibold"
                            tone="success"
                            className="hidden sm:flex"
                          >
                            PASS
                          </DSText>
                          <DSText
                            variant="footnote"
                            weight="bold"
                            tone={scoreTone}
                            tabularNums
                            style={{ width: 28, textAlign: 'right' }}
                          >
                            {accuracy}
                          </DSText>
                        </View>
                      </Pressable>
                      <DSDivider />
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : (
          filteredArticles.map((item) => {
            const isSelected = item.id === selectedArticleId;
            const accuracy = getArticleAccuracy(item);
            const statusTone = getStatusTone(item.status);
            const scoreTone = getScoreTone(accuracy);
            const flags = item.flags ?? [];

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
                      backgroundColor: theme.colors.tones[statusTone].dot,
                    }}
                  />

                  {/* Left column: Topic / Source */}
                  <View
                    style={{ paddingRight: theme.spacing.md }}
                    className="w-24 md:w-36 shrink-0"
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

                  {/* Center: Headline — Summary snippet */}
                  <View
                    style={{
                      flex: 1,
                      minWidth: 0,
                      paddingRight: theme.spacing.md,
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        theme.typography.body,
                        {
                          fontFamily: theme.fontFamilies.sans,
                          color: theme.colors.textPrimary,
                        },
                      ]}
                    >
                      <Text style={{ fontWeight: '600' }}>
                        {item.ai_headline}
                      </Text>
                      <Text
                        style={{
                          color: theme.colors.textTertiary,
                          fontWeight: '400',
                        }}
                      >
                        {' '}
                        — {item.ai_summary}
                      </Text>
                    </Text>
                  </View>

                  {/* Right: Restrained Flags & Tabular Accuracy */}
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.sm,
                      flexShrink: 0,
                    }}
                  >
                    {item.sensitive ? (
                      <DSBadge label="SENSITIVE" tone="warning" />
                    ) : null}

                    {flags.length > 0 ? (
                      <View className="hidden md:flex">
                        <DSBadge
                          label={
                            flags.length === 1
                              ? getFlagShortLabel(flags[0])
                              : `${flags.length} flags`
                          }
                          tone="danger"
                        />
                      </View>
                    ) : null}

                    <DSText
                      variant="footnote"
                      weight="bold"
                      tone={scoreTone}
                      tabularNums
                      style={{ width: 28, textAlign: 'right' }}
                    >
                      {accuracy}
                    </DSText>
                  </View>
                </Pressable>
                <DSDivider />
              </View>
            );
          })
        )}
      </ScrollView>

      {/* Batch-Approve Confirmation Modal */}
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
            headerTitle={`Approve ${readyToBatch.length} High-Confidence Stories`}
            headerSubtitle="All selected drafts passed Judge audit with 0 flags and accuracy ≥ 85."
            elevated
            padding="lg"
            style={{ width: '100%', maxWidth: 520 }}
          >
            <ScrollView style={{ maxHeight: 260, marginBottom: theme.spacing.lg }}>
              <View style={{ gap: theme.spacing.sm }}>
                {readyToBatch.map((a) => (
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
                    <DSBadge
                      label={`${getArticleAccuracy(a)}`}
                      tone="success"
                    />
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
                label={`Confirm & Publish (${readyToBatch.length})`}
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
