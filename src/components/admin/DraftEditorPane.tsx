import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  Linking,
  ActivityIndicator,
} from 'react-native';
import type { Article } from '@/types/article';

interface DraftEditorPaneProps {
  article: Article | null;
  adminUid: string;
  onSaveChanges: (id: string, headline: string, summary: string) => Promise<void>;
  onApprove: (
    id: string,
    headline: string,
    summary: string,
    adminUid: string
  ) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

export function DraftEditorPane({
  article,
  adminUid,
  onSaveChanges,
  onApprove,
  onReject,
}: DraftEditorPaneProps) {
  const [headline, setHeadline] = useState('');
  const [summary, setSummary] = useState('');
  const [busyAction, setBusyAction] = useState<'save' | 'approve' | 'reject' | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setHeadline(article?.ai_headline ?? '');
    setSummary(article?.ai_summary ?? '');
    setFeedback(null);
    setBusyAction(null);
  }, [article?.id, article?.ai_headline, article?.ai_summary]);

  if (!article) {
    return (
      <View className="flex-1 bg-paper items-center justify-center p-8">
        <Text className="text-xl font-semibold text-ink/70 text-center">
          Select a draft from the queue to review and edit.
        </Text>
      </View>
    );
  }

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
      setFeedback(err instanceof Error ? err.message : 'Failed to save changes.');
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
      setFeedback(err instanceof Error ? err.message : 'Failed to approve article.');
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
      setFeedback(err instanceof Error ? err.message : 'Failed to reject article.');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <View className="flex-1 bg-paper">
      <ScrollView className="flex-1 p-6 md:p-8">
        <View className="max-w-3xl w-full self-center">
          {/* Top: Source link & Judge metadata */}
          <View className="bg-white border border-stone-200 rounded-2xl p-5 mb-6">
            <View className="flex-row flex-wrap items-center justify-between gap-2 mb-3">
              <Text className="text-sm font-semibold text-ink/60">
                Date: {article.date}
                {article.topic ? ` • ${article.topic}` : ''}
                {article.region ? ` • ${article.region}` : ''}
                {article.source_count ? ` • ${article.source_count} outlets` : ''}
              </Text>
              <Pressable
                onPress={() => Linking.openURL(article.original_url)}
                className="bg-stone-100 px-3 py-1.5 rounded-lg"
              >
                <Text className="text-sm font-semibold text-accent">
                  Open Original Source ↗
                </Text>
              </Pressable>
            </View>

            <Text
              numberOfLines={1}
              className="text-xs text-ink/50 mb-3"
            >
              {article.original_url}
            </Text>

            {/* Four Judge Scores */}
            <View className="flex-row flex-wrap gap-2 mb-3">
              {(
                [
                  ['Accuracy', article.scores?.accuracy ?? article.confidence_score],
                  ['Neutrality', article.scores?.neutrality ?? article.confidence_score],
                  ['Safety (G)', article.scores?.safety ?? article.confidence_score],
                  ['Readability (Gr 6)', article.scores?.readability ?? article.confidence_score],
                ] as const
              ).map(([label, score]) => {
                const badgeClass =
                  score >= 85
                    ? 'bg-emerald-100 text-emerald-800'
                    : score >= 65
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800';
                return (
                  <View key={label} className={`px-3 py-1 rounded-full ${badgeClass}`}>
                    <Text className="text-xs font-bold">
                      {label}: {score}/100
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* Flags & Judge Pass */}
            {(article.flags && article.flags.length > 0) ||
            article.sensitive ||
            article.judge_pass !== undefined ? (
              <View className="flex-row flex-wrap gap-1.5 mb-3">
                {article.judge_pass !== undefined ? (
                  <View
                    className={`px-2.5 py-1 rounded-full ${
                      article.judge_pass ? 'bg-emerald-100' : 'bg-amber-100'
                    }`}
                  >
                    <Text
                      className={`text-xs font-bold ${
                        article.judge_pass ? 'text-emerald-800' : 'text-amber-900'
                      }`}
                    >
                      {article.judge_pass ? 'AUTO-PASS' : 'NEEDS REVIEW'}
                    </Text>
                  </View>
                ) : null}
                {article.sensitive ? (
                  <View className="bg-amber-100 px-2.5 py-1 rounded-full">
                    <Text className="text-xs font-bold text-amber-900">
                      SENSITIVE
                    </Text>
                  </View>
                ) : null}
                {(article.flags ?? []).map((flag) => (
                  <View key={flag} className="bg-rose-100 px-2.5 py-1 rounded-full">
                    <Text className="text-xs font-bold text-rose-800">
                      {flag}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {article.selection_reason ? (
              <View className="bg-paper border border-stone-200 rounded-xl p-3 mb-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-ink/50 mb-1">
                  Selection Rationale
                </Text>
                <Text className="text-sm text-ink/80 leading-relaxed">
                  {article.selection_reason}
                </Text>
              </View>
            ) : null}

            {article.ai_explanation ? (
              <View className="bg-paper border border-stone-200 rounded-xl p-3 mb-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-ink/50 mb-1">
                  Background Explanation ("What&apos;s this about?")
                </Text>
                <Text className="text-sm text-ink/80 leading-relaxed">
                  {article.ai_explanation}
                </Text>
              </View>
            ) : null}

            <View className="bg-paper border border-stone-200 rounded-xl p-3">
              <Text className="text-xs font-bold uppercase tracking-wider text-ink/50 mb-1">
                Judge Reasoning
              </Text>
              <Text className="text-sm text-ink/80 leading-relaxed">
                {article.confidence_reasoning || 'No reasoning recorded.'}
              </Text>
            </View>

            {/* Claim-by-Claim Evidence */}
            {article.claims && article.claims.length > 0 ? (
              <View className="mt-3 bg-paper border border-stone-200 rounded-xl p-3">
                <Text className="text-xs font-bold uppercase tracking-wider text-ink/50 mb-2">
                  Claims & Source Evidence
                </Text>
                <View className="gap-2.5">
                  {article.claims.map((item, idx) => {
                    const isUnsupported =
                      item.evidence.trim().toLowerCase() === 'unsupported';
                    return (
                      <View
                        key={`${idx}-${item.claim.slice(0, 20)}`}
                        className="border-b border-stone-200 pb-2 last:border-b-0 last:pb-0"
                      >
                        <Text className="text-sm font-semibold text-ink mb-0.5">
                          Claim: {item.claim}
                        </Text>
                        <Text
                          className={`text-xs leading-relaxed ${
                            isUnsupported
                              ? 'text-red-700 font-bold'
                              : 'text-ink/70'
                          }`}
                        >
                          Evidence: {item.evidence}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </View>

          {/* Middle: Headline & Summary Textareas */}
          <View className="bg-white border border-stone-200 rounded-2xl p-6 mb-6">
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-bold uppercase tracking-wider text-ink/60">
                Headline
              </Text>
              {isDirty ? (
                <Text className="text-xs font-semibold text-amber-700">
                  Unsaved edits
                </Text>
              ) : null}
            </View>
            <TextInput
              value={headline}
              onChangeText={setHeadline}
              multiline
              className="border border-stone-300 rounded-xl p-4 text-xl font-bold text-ink bg-paper mb-6 min-h-[72px]"
            />

            <Text className="text-sm font-bold uppercase tracking-wider text-ink/60 mb-2">
              Summary
            </Text>
            <TextInput
              value={summary}
              onChangeText={setSummary}
              multiline
              textAlignVertical="top"
              className="border border-stone-300 rounded-xl p-4 text-lg text-ink bg-paper min-h-[180px] leading-relaxed"
            />
          </View>

          {feedback ? (
            <View className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4">
              <Text className="text-sm font-medium text-teal-800">{feedback}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Bottom Action Bar */}
      <View className="border-t border-stone-200 bg-white px-6 py-4">
        <View className="max-w-3xl w-full self-center flex-row flex-wrap items-center justify-between gap-3">
          <Pressable
            onPress={handleReject}
            disabled={busyAction !== null}
            className="border border-red-300 bg-red-50 rounded-xl px-5 py-3"
          >
            {busyAction === 'reject' ? (
              <ActivityIndicator color="#B91C1C" />
            ) : (
              <Text className="text-red-700 font-semibold text-base">Reject</Text>
            )}
          </Pressable>

          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={handleSave}
              disabled={busyAction !== null}
              className="border border-stone-300 bg-white rounded-xl px-5 py-3"
            >
              {busyAction === 'save' ? (
                <ActivityIndicator color="#1C1917" />
              ) : (
                <Text className="text-ink font-semibold text-base">
                  Save Changes
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={handleApprove}
              disabled={busyAction !== null}
              className="bg-accent rounded-xl px-6 py-3"
            >
              {busyAction === 'approve' ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-white font-semibold text-base">
                  Approve & Publish
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
