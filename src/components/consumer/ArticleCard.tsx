import { useState } from 'react';
import { View, Text, Image, Pressable, Linking } from 'react-native';
import type { Article } from '@/types/article';

interface ArticleCardProps {
  article: Article;
}

export function ArticleCard({ article }: ArticleCardProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  return (
    <View className="bg-white border border-stone-200 rounded-2xl overflow-hidden shadow-sm">
      {article.image_url ? (
        <Image
          source={{ uri: article.image_url }}
          resizeMode="cover"
          className="w-full h-48 bg-stone-100"
        />
      ) : null}

      <View className="p-6">
        <Text className="text-xl font-bold text-ink leading-snug mb-3">
          {article.ai_headline}
        </Text>
        <Text className="text-[18px] text-ink/85 leading-relaxed mb-4">
          {article.ai_summary}
        </Text>

        {showExplanation && article.ai_explanation ? (
          <View className="bg-paper border border-stone-200 rounded-xl p-4 mb-4">
            <Text className="text-xs font-bold uppercase tracking-wider text-ink/50 mb-1">
              Background
            </Text>
            <Text className="text-sm text-ink/80 leading-relaxed">
              {article.ai_explanation}
            </Text>
          </View>
        ) : null}

        <View className="flex-row items-center justify-between pt-3 border-t border-stone-100">
          <Text className="text-xs font-medium text-ink/50">{article.date}</Text>
          <View className="flex-row items-center gap-4">
            {article.ai_explanation ? (
              <Pressable onPress={() => setShowExplanation((prev) => !prev)}>
                <Text className="text-sm font-semibold text-ink/70">
                  {showExplanation ? 'Hide context' : "What's this about?"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => Linking.openURL(article.original_url)}>
              <Text className="text-sm font-semibold text-accent">
                Read source ↗
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
