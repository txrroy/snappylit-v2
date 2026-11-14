import { useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { APP_CONFIG } from '@/config/appConfig';
import { Fonts } from '@/constants/theme';
import {
  formatEditionDate,
  getSourceLabel,
  openArticleUrl,
} from '@/lib/consumerUtils';
import type { Article } from '@/types/article';

interface NewspaperFrontPageProps {
  articles: Article[];
  isShowingFallback?: boolean;
  olderArticles?: Article[];
  loadingOlder?: boolean;
  hasMoreOlder?: boolean;
  onLoadOlder?: () => Promise<void> | void;
}

function getColumnCount(width: number): number {
  if (width >= 1024) return 3;
  return 2;
}

function ArticleContextDrawer({ explanation }: { explanation: string }) {
  return (
    <View className="mt-3 mb-1 bg-[#F3F1EC] border-l-2 border-accent rounded-r-lg px-3.5 py-2.5">
      <Text className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-500 mb-1">
        Background Context
      </Text>
      <Text className="text-[13.5px] leading-[21px] text-stone-700">
        {explanation}
      </Text>
    </View>
  );
}

function LeadStory({ article }: { article: Article }) {
  const [showContext, setShowContext] = useState(false);
  const sourceLabel = getSourceLabel(article);
  const kicker = article.topic
    ? article.topic.toUpperCase()
    : 'LEAD STORY';

  return (
    <View className="py-7 border-b border-stone-300/90">
      <View
        className={
          article.image_url
            ? 'flex-row items-start gap-8'
            : 'max-w-3xl'
        }
      >
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-2.5">
            <Text className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              {kicker}
            </Text>
            {sourceLabel ? (
              <Text className="text-[11px] font-medium text-stone-400">
                • {sourceLabel}
              </Text>
            ) : null}
          </View>

          <Text
            style={{ fontFamily: Fonts?.serif }}
            className="text-[32px] leading-[38px] font-bold text-ink tracking-[-0.4px] mb-3.5"
          >
            {article.ai_headline}
          </Text>

          <Text className="text-[16.5px] leading-[27px] text-stone-700 mb-4">
            {article.ai_summary}
          </Text>

          {showContext && article.ai_explanation ? (
            <ArticleContextDrawer explanation={article.ai_explanation} />
          ) : null}

          <View className="flex-row items-center gap-5 pt-2">
            <Pressable
              onPress={() => openArticleUrl(article.original_url)}
              className="py-1"
            >
              <Text className="text-[13px] font-semibold text-accent">
                Read full story ↗
              </Text>
            </Pressable>

            {article.ai_explanation ? (
              <Pressable
                onPress={() => setShowContext((prev) => !prev)}
                className="py-1"
              >
                <Text className="text-[13px] font-medium text-stone-500">
                  {showContext ? 'Hide context' : "What's this about?"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {article.image_url ? (
          <View className="w-[44%] max-w-[480px]">
            <Image
              source={{ uri: article.image_url }}
              contentFit="cover"
              transition={250}
              style={{
                width: '100%',
                aspectRatio: 16 / 10,
                borderRadius: 10,
                backgroundColor: '#EAE8E3',
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ColumnStory({
  article,
  isLastInColumn,
  showDate = false,
}: {
  article: Article;
  isLastInColumn: boolean;
  showDate?: boolean;
}) {
  const [showContext, setShowContext] = useState(false);
  const sourceLabel = getSourceLabel(article);
  const kicker = article.topic ? article.topic.toUpperCase() : null;
  const dateLabel = showDate ? formatEditionDate(article.date, 'short') : null;

  return (
    <View
      className={
        isLastInColumn
          ? 'py-5'
          : 'py-5 border-b border-stone-200/90'
      }
    >
      {kicker || sourceLabel || dateLabel ? (
        <View className="flex-row flex-wrap items-center gap-1.5 mb-2">
          {dateLabel ? (
            <Text className="text-[10.5px] font-semibold text-stone-500">
              {dateLabel}
            </Text>
          ) : null}
          {dateLabel && (kicker || sourceLabel) ? (
            <Text className="text-[10.5px] text-stone-400">•</Text>
          ) : null}
          {kicker ? (
            <Text className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-accent">
              {kicker}
            </Text>
          ) : null}
          {kicker && sourceLabel ? (
            <Text className="text-[10.5px] text-stone-400">•</Text>
          ) : null}
          {sourceLabel ? (
            <Text className="text-[11px] font-medium text-stone-400">
              {sourceLabel}
            </Text>
          ) : null}
        </View>
      ) : null}

      <Text
        style={{ fontFamily: Fonts?.serif }}
        className="text-[20px] leading-[26px] font-bold text-ink tracking-[-0.2px] mb-3"
      >
        {article.ai_headline}
      </Text>

      {article.image_url ? (
        <View className="mb-3">
          <Image
            source={{ uri: article.image_url }}
            contentFit="cover"
            transition={250}
            style={{
              width: '100%',
              height: 170,
              borderRadius: 8,
              backgroundColor: '#EAE8E3',
            }}
          />
        </View>
      ) : null}

      <Text className="text-[15px] leading-[24px] text-stone-700 mb-3">
        {article.ai_summary}
      </Text>

      {showContext && article.ai_explanation ? (
        <ArticleContextDrawer explanation={article.ai_explanation} />
      ) : null}

      <View className="flex-row items-center justify-between pt-2">
        {article.ai_explanation ? (
          <Pressable
            onPress={() => setShowContext((prev) => !prev)}
            className="py-1"
          >
            <Text className="text-[12.5px] font-medium text-stone-500">
              {showContext ? 'Hide context' : "What's this about?"}
            </Text>
          </Pressable>
        ) : (
          <View />
        )}

        <Pressable
          onPress={() => openArticleUrl(article.original_url)}
          className="py-1"
        >
          <Text className="text-[12.5px] font-semibold text-accent">
            Read source ↗
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export function NewspaperFrontPage({
  articles,
  isShowingFallback = false,
  olderArticles = [],
  loadingOlder = false,
  hasMoreOlder = false,
  onLoadOlder,
}: NewspaperFrontPageProps) {
  const { width } = useWindowDimensions();
  const numColumns = getColumnCount(width);

  const leadArticle = articles[0];
  const restArticles = articles.slice(1);
  const formattedDate = leadArticle
    ? formatEditionDate(leadArticle.date, 'full')
    : '';

  const columns: Article[][] = Array.from({ length: numColumns }, () => []);
  restArticles.forEach((article, index) => {
    columns[index % numColumns].push(article);
  });

  const olderColumns: Article[][] = Array.from({ length: numColumns }, () => []);
  olderArticles.forEach((article, index) => {
    olderColumns[index % numColumns].push(article);
  });

  return (
    <ScrollView className="flex-1 bg-paper">
      <View className="w-full max-w-[1160px] self-center px-8 pt-6 pb-14">
        {/* Broadsheet Masthead */}
        <View className="border-t border-stone-300 pt-2.5 pb-5">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-500">
              Daily Edition
            </Text>
            <Text className="text-[12px] font-medium text-stone-600">
              {formattedDate}
            </Text>
            <View className="flex-row items-center gap-2">
              {isShowingFallback ? (
                <View className="bg-stone-200/70 rounded-full px-2.5 py-0.5">
                  <Text className="text-[10.5px] font-medium text-stone-600">
                    Latest Published
                  </Text>
                </View>
              ) : null}
              <Text className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                {articles.length} {articles.length === 1 ? 'Story' : 'Stories'}
              </Text>
            </View>
          </View>

          <View className="flex-row items-center justify-center gap-3">
            <Image
              source={require('../../../assets/images/snappylit-logo-v3.png')}
              contentFit="contain"
              style={{ width: 38, height: 38, borderRadius: 9 }}
            />
            <Text
              style={{ fontFamily: Fonts?.serif }}
              className="text-[44px] leading-[50px] font-bold text-ink text-center tracking-[-0.8px]"
            >
              {APP_CONFIG.title}
            </Text>
          </View>
        </View>

        {/* Classic Newspaper Double Rule */}
        <View className="h-[2px] bg-stone-800" />
        <View className="h-[1px] bg-stone-300 mt-[3px]" />

        {/* Fallback notice if today's edition is still in prep */}
        {isShowingFallback ? (
          <View className="py-2.5 border-b border-stone-200 items-center">
            <Text className="text-[12.5px] text-stone-500">
              {APP_CONFIG.preparingBanner} Showing the most recent published edition.
            </Text>
          </View>
        ) : null}

        {/* Lead Story */}
        {leadArticle ? <LeadStory article={leadArticle} /> : null}

        {/* Multi-Column Broadsheet Section */}
        {restArticles.length > 0 ? (
          <View className="flex-row items-start pt-2">
            {columns.map((columnItems, colIndex) => {
              const isFirst = colIndex === 0;
              const isLast = colIndex === columns.length - 1;
              return (
                <View
                  key={colIndex}
                  className={[
                    'flex-1',
                    !isFirst ? 'pl-6' : '',
                    !isLast ? 'pr-6 border-r border-stone-200/90' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {columnItems.map((article, itemIdx) => (
                    <ColumnStory
                      key={article.id}
                      article={article}
                      isLastInColumn={itemIdx === columnItems.length - 1}
                    />
                  ))}
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Edition Colophon */}
        <View className="mt-10 pt-4 border-t border-stone-300 flex-row items-center justify-between">
          <Text className="text-[11px] uppercase tracking-[0.12em] text-stone-400">
            {APP_CONFIG.title}
          </Text>
          <Text className="text-[11px] text-stone-400">
            End of Edition • {formattedDate}
          </Text>
        </View>

        {/* Appended Older News Archive */}
        {olderArticles.length > 0 ? (
          <View className="mt-10">
            <View className="h-[2px] bg-stone-800" />
            <View className="h-[1px] bg-stone-300 mt-[3px]" />
            <View className="py-3 border-b border-stone-200 flex-row items-center justify-between">
              <Text className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">
                Older News
              </Text>
              <Text className="text-[11px] text-stone-400">
                {olderArticles.length} {olderArticles.length === 1 ? 'Story' : 'Stories'} loaded
              </Text>
            </View>

            <View className="flex-row items-start pt-2">
              {olderColumns.map((columnItems, colIndex) => {
                const isFirst = colIndex === 0;
                const isLast = colIndex === olderColumns.length - 1;
                return (
                  <View
                    key={`older-${colIndex}`}
                    className={[
                      'flex-1',
                      !isFirst ? 'pl-6' : '',
                      !isLast ? 'pr-6 border-r border-stone-200/90' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {columnItems.map((article, itemIdx) => (
                      <ColumnStory
                        key={article.id}
                        article={article}
                        isLastInColumn={itemIdx === columnItems.length - 1}
                        showDate
                      />
                    ))}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* Load Older News Action */}
        {onLoadOlder && (hasMoreOlder || loadingOlder || olderArticles.length > 0) ? (
          <View className="mt-8 items-center">
            {hasMoreOlder || loadingOlder ? (
              <Pressable
                onPress={() => void onLoadOlder()}
                disabled={loadingOlder}
                className="px-6 py-2.5 rounded-full border border-stone-300 bg-white active:opacity-70 flex-row items-center gap-2"
              >
                {loadingOlder ? (
                  <ActivityIndicator size="small" color="#0D9488" />
                ) : null}
                <Text className="text-[13px] font-semibold text-ink">
                  {loadingOlder ? 'Loading older news...' : 'Load older news'}
                </Text>
              </Pressable>
            ) : (
              <Text className="text-[12px] text-stone-400">
                No more older news available.
              </Text>
            )}
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

