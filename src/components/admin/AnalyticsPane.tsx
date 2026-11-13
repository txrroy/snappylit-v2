import { useMemo } from 'react';
import { View, ScrollView } from 'react-native';
import { useDSTheme, DSCard, DSText, DSSurface } from '@/design-system';
import type { Article } from '@/types/article';

interface AnalyticsPaneProps {
  articles: Article[];
}

interface VersionStats {
  version: string;
  total: number;
  published: number;
  rejected: number;
  pending: number;
  editedCount: number;
  regeneratedCount: number;
  avgAccuracy: number;
  avgSafety: number;
  approvalRate: number | null;
}

export function AnalyticsPane({ articles }: AnalyticsPaneProps) {
  const { theme } = useDSTheme();

  const stats = useMemo<VersionStats[]>(() => {
    const groups = new Map<string, Article[]>();
    for (const article of articles) {
      const ver =
        article.prompt_version ||
        article.instructions_snapshot?.prompt_version ||
        'unversioned';
      const list = groups.get(ver) ?? [];
      list.push(article);
      groups.set(ver, list);
    }

    return Array.from(groups.entries())
      .map(([version, items]) => {
        let published = 0;
        let rejected = 0;
        let pending = 0;
        let editedCount = 0;
        let regeneratedCount = 0;
        let accSum = 0;
        let safSum = 0;

        for (const a of items) {
          if (a.status === 'published') published += 1;
          else if (a.status === 'rejected') rejected += 1;
          else pending += 1;

          const history = a.decision_history ?? [];
          if (a.edited_at || history.some((h) => h.action === 'edited')) {
            editedCount += 1;
          }
          if (history.some((h) => h.action === 'regenerated')) {
            regeneratedCount += 1;
          }

          accSum += a.scores?.accuracy ?? a.confidence_score;
          safSum += a.scores?.safety ?? a.confidence_score;
        }

        const decided = published + rejected;
        const approvalRate =
          decided > 0 ? Math.round((published / decided) * 100) : null;

        return {
          version,
          total: items.length,
          published,
          rejected,
          pending,
          editedCount,
          regeneratedCount,
          avgAccuracy: Math.round(accSum / items.length),
          avgSafety: Math.round(safSum / items.length),
          approvalRate,
        };
      })
      .sort((a, b) => {
        if (a.version === 'unversioned') return 1;
        if (b.version === 'unversioned') return -1;
        return b.version.localeCompare(a.version);
      });
  }, [articles]);

  const totals = useMemo(() => {
    const pub = articles.filter((a) => a.status === 'published').length;
    const rej = articles.filter((a) => a.status === 'rejected').length;
    const decided = pub + rej;
    return {
      total: articles.length,
      published: pub,
      rejected: rej,
      pending: articles.length - decided,
      overallRate: decided > 0 ? Math.round((pub / decided) * 100) : null,
    };
  }, [articles]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.canvas }}
      contentContainerStyle={{
        padding: theme.spacing.xxl,
        paddingBottom: theme.spacing.xxxl,
      }}
    >
      <View
        style={{
          maxWidth: theme.layout.contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
          gap: theme.spacing.xl,
        }}
      >
        <View>
          <DSText variant="title3" weight="bold" tone="primary">
            Approval Rate per Prompt Version
          </DSText>
          <DSText
            variant="caption"
            tone="secondary"
            style={{ marginTop: theme.spacing.xxs }}
          >
            Human editor decisions become evaluation metrics for each policy
            version.
          </DSText>
        </View>

        {/* Cohesive Editorial Summary Strip */}
        <DSSurface
          variant="surface"
          radius="lg"
          bordered
          style={[
            theme.shadows.card,
            {
              padding: theme.spacing.xl,
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.spacing.xl,
            },
          ]}
        >
          <View style={{ minWidth: 160 }}>
            <DSText variant="micro" weight="bold" tone="tertiary" uppercase>
              Overall Approval Rate
            </DSText>
            <DSText
              variant="display"
              weight="bold"
              tone="accent"
              tabularNums
              style={{ marginTop: theme.spacing.xxs }}
            >
              {totals.overallRate !== null ? `${totals.overallRate}%` : '—'}
            </DSText>
          </View>

          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: theme.spacing.xxl,
            }}
          >
            {[
              { label: 'Published', value: totals.published, tone: 'success' as const },
              { label: 'Rejected', value: totals.rejected, tone: 'danger' as const },
              { label: 'Pending', value: totals.pending, tone: 'warning' as const },
              { label: 'Total Audited', value: totals.total, tone: 'primary' as const },
            ].map((item) => (
              <View key={item.label}>
                <DSText variant="micro" weight="semibold" tone="tertiary">
                  {item.label}
                </DSText>
                <DSText
                  variant="title2"
                  weight="bold"
                  tone={item.tone}
                  tabularNums
                  style={{ marginTop: 2 }}
                >
                  {item.value}
                </DSText>
              </View>
            ))}
          </View>
        </DSSurface>

        {/* Version Breakdown */}
        <DSCard headerTitle="Version Comparison" padding="lg">
          <View style={{ gap: theme.spacing.md }}>
            {stats.length === 0 ? (
              <DSText variant="caption" tone="tertiary">
                No articles available yet to compute approval rates.
              </DSText>
            ) : (
              stats.map((row) => {
                const rate = row.approvalRate ?? 0;
                return (
                  <DSSurface
                    key={row.version}
                    variant="muted"
                    radius="md"
                    bordered
                    style={{
                      padding: theme.spacing.lg,
                      gap: theme.spacing.sm,
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
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: theme.spacing.sm,
                        }}
                      >
                        <DSText variant="body" weight="bold" tone="primary">
                          {row.version}
                        </DSText>
                        <DSText variant="caption" tone="secondary">
                          {row.total} total ({row.published} approved ·{' '}
                          {row.rejected} rejected · {row.pending} pending)
                        </DSText>
                      </View>
                      <DSText variant="body" weight="bold" tone="accent">
                        {row.approvalRate !== null
                          ? `${row.approvalRate}% approval`
                          : 'No decisions yet'}
                      </DSText>
                    </View>

                    {/* Horizontal Progress Bar */}
                    <View
                      style={{
                        height: theme.spacing.sm + 2,
                        width: '100%',
                        backgroundColor: theme.colors.borderSubtle,
                        borderRadius: theme.radii.pill,
                        overflow: 'hidden',
                      }}
                    >
                      <View
                        style={{
                          width: `${rate}%`,
                          height: '100%',
                          backgroundColor: theme.colors.accent,
                          borderRadius: theme.radii.pill,
                        }}
                      />
                    </View>

                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        gap: theme.spacing.md,
                      }}
                    >
                      <DSText variant="caption" weight="medium" tone="secondary">
                        Avg Accuracy: {row.avgAccuracy}
                      </DSText>
                      <DSText variant="caption" weight="medium" tone="secondary">
                        Avg Safety: {row.avgSafety}
                      </DSText>
                      <DSText variant="caption" weight="medium" tone="secondary">
                        Human Edited: {row.editedCount}
                      </DSText>
                      <DSText variant="caption" weight="medium" tone="secondary">
                        Regenerated: {row.regeneratedCount}
                      </DSText>
                    </View>
                  </DSSurface>
                );
              })
            )}
          </View>
        </DSCard>
      </View>
    </ScrollView>
  );
}
