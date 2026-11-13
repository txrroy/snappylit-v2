import { View, Text, ScrollView, Pressable } from 'react-native';
import type { Article } from '@/types/article';

interface DraftQueuePaneProps {
  drafts: Article[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

interface AccuracyGroup {
  label: string;
  items: Article[];
}

function getAccuracy(article: Article): number {
  return article.scores?.accuracy ?? article.confidence_score;
}

function groupByAccuracy(drafts: Article[]): AccuracyGroup[] {
  const low = drafts.filter((d) => getAccuracy(d) < 65);
  const medium = drafts.filter(
    (d) => getAccuracy(d) >= 65 && getAccuracy(d) < 85
  );
  const high = drafts.filter((d) => getAccuracy(d) >= 85);

  return [
    { label: 'Needs Review (Accuracy < 65)', items: low },
    { label: 'Medium Accuracy (65–84)', items: medium },
    { label: 'High Accuracy (85–100)', items: high },
  ].filter((group) => group.items.length > 0);
}

function getScoreBadgeClasses(score: number): string {
  if (score >= 85) return 'bg-emerald-100 text-emerald-800';
  if (score >= 65) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

export function DraftQueuePane({
  drafts,
  selectedId,
  onSelect,
}: DraftQueuePaneProps) {
  const groups = groupByAccuracy(drafts);

  return (
    <View className="w-full md:w-96 border-b md:border-b-0 md:border-r border-stone-200 bg-white">
      <View className="px-5 py-4 border-b border-stone-200 flex-row items-center justify-between">
        <Text className="text-lg font-bold text-ink">Draft Queue</Text>
        <View className="bg-stone-100 px-2.5 py-1 rounded-full">
          <Text className="text-xs font-semibold text-ink/80">
            {drafts.length} pending
          </Text>
        </View>
      </View>

      <ScrollView className="flex-1 max-h-72 md:max-h-none">
        {groups.length === 0 ? (
          <View className="p-6 items-center">
            <Text className="text-base text-ink/60 text-center">
              No pending drafts in the queue.
            </Text>
          </View>
        ) : (
          groups.map((group) => (
            <View key={group.label} className="pt-4">
              <Text className="px-5 pb-2 text-xs font-bold uppercase tracking-wider text-ink/50">
                {group.label}
              </Text>
              {group.items.map((item) => {
                const isSelected = item.id === selectedId;
                const accuracy = getAccuracy(item);
                const scores = item.scores;
                const flags = item.flags ?? [];

                return (
                  <Pressable
                    key={item.id}
                    onPress={() => onSelect(item.id)}
                    className={`px-5 py-3.5 border-b border-stone-100 ${
                      isSelected ? 'bg-teal-50 border-l-4 border-l-accent' : 'bg-white'
                    }`}
                  >
                    <View className="flex-row items-center justify-between mb-1.5">
                      <Text className="text-xs text-ink/50 font-medium">
                        {item.date}
                        {item.source_count ? ` • ${item.source_count} outlets` : ''}
                      </Text>
                      <View className="flex-row items-center gap-1.5">
                        {item.judge_pass !== undefined ? (
                          <View
                            className={`px-2 py-0.5 rounded-full ${
                              item.judge_pass
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            <Text className="text-[11px] font-bold">
                              {item.judge_pass ? 'PASS' : 'REVIEW'}
                            </Text>
                          </View>
                        ) : null}
                        <View
                          className={`px-2 py-0.5 rounded-full ${getScoreBadgeClasses(
                            accuracy
                          )}`}
                        >
                          <Text className="text-xs font-bold">
                            Acc: {accuracy}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <Text
                      numberOfLines={2}
                      className="text-base font-semibold text-ink leading-snug mb-2"
                    >
                      {item.ai_headline}
                    </Text>

                    {scores ? (
                      <View className="flex-row flex-wrap gap-1.5 mb-1.5">
                        <Text className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-ink/70">
                          Acc {scores.accuracy}
                        </Text>
                        <Text className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-ink/70">
                          Neu {scores.neutrality}
                        </Text>
                        <Text className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-ink/70">
                          Saf {scores.safety}
                        </Text>
                        <Text className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-ink/70">
                          Read {scores.readability}
                        </Text>
                      </View>
                    ) : null}

                    {flags.length > 0 ? (
                      <View className="flex-row flex-wrap gap-1">
                        {flags.map((flag) => (
                          <View
                            key={flag}
                            className="bg-rose-100 px-1.5 py-0.5 rounded"
                          >
                            <Text className="text-[10px] font-bold text-rose-800">
                              {flag}
                            </Text>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}
