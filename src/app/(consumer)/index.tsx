import { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_CONFIG } from '@/config/appConfig';
import { usePublishedArticles } from '@/hooks/useArticles';
import { formatEditionDate } from '@/lib/consumerUtils';
import { SwipeCardDeck } from '@/components/consumer/SwipeCardDeck';
import { NewspaperFrontPage } from '@/components/consumer/NewspaperFrontPage';

type ViewMode = 'today' | 'older';

export default function ConsumerHomeScreen() {
  const {
    articles,
    olderArticles,
    loading,
    loadingOlder,
    hasMoreOlder,
    error,
    isShowingFallback,
    loadOlderArticles,
    loadMoreOlderArticles,
  } = usePublishedArticles();
  const { width } = useWindowDimensions();

  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [currentIndex, setCurrentIndex] = useState(0);

  const useNewspaperLayout = Platform.OS === 'web' && width >= 768;

  const displayedArticles = viewMode === 'today' ? articles : olderArticles;

  const handleReturnToToday = () => {
    setViewMode('today');
  };

  const handleSelectOlderNews = async () => {
    setViewMode('older');
    await loadOlderArticles();
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-paper items-center justify-center p-6">
        <ActivityIndicator size="large" color="#0D9488" />
        <Text className="text-[16px] text-stone-500 mt-3.5">
          Loading today&apos;s edition...
        </Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="flex-1 bg-paper items-center justify-center p-6">
        <View className="bg-white border border-red-200/80 rounded-3xl p-6 max-w-md w-full">
          <Text className="text-[18px] font-semibold text-red-800 mb-1.5">
            Unable to load stories
          </Text>
          <Text className="text-[15px] leading-[22px] text-red-700/85">
            {error}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (articles.length === 0 && viewMode === 'today') {
    return (
      <SafeAreaView className="flex-1 bg-paper items-center justify-center p-6">
        <View className="bg-white border border-stone-200/80 rounded-[28px] p-8 max-w-md w-full items-center">
          <Text className="text-[22px] font-bold text-ink text-center tracking-[-0.3px] mb-2">
            {APP_CONFIG.preparingBanner}
          </Text>
          <Text className="text-[15.5px] leading-[23px] text-stone-500 text-center">
            Our editors are reviewing today&apos;s stories. Please check back
            shortly.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (useNewspaperLayout) {
    return (
      <SafeAreaView className="flex-1 bg-paper">
        <NewspaperFrontPage
          articles={articles}
          isShowingFallback={isShowingFallback}
          olderArticles={olderArticles}
          loadingOlder={loadingOlder}
          hasMoreOlder={hasMoreOlder}
          onLoadOlder={loadMoreOlderArticles}
        />
      </SafeAreaView>
    );
  }

  const shortDate =
    articles.length > 0 ? formatEditionDate(articles[0].date, 'short') : '';
  const totalCount = displayedArticles.length;
  const clampedCount = Math.min(currentIndex + 1, Math.max(totalCount, 1));
  const activeBgImage = displayedArticles[currentIndex]?.image_url ?? null;

  return (
    <SafeAreaView
      className="flex-1 bg-paper consumer-mobile-reader"
      style={{ position: 'relative', overflow: 'hidden' }}
      edges={['top', 'left', 'right']}
    >
      {/* Ambient Blurred Header-Image Glass Background */}
      {activeBgImage ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            overflow: 'hidden',
          }}
        >
          <Image
            source={{ uri: activeBgImage }}
            contentFit="cover"
            blurRadius={Platform.OS === 'web' ? 0 : 45}
            transition={350}
            style={{
              position: 'absolute',
              top: -32,
              left: -32,
              right: -32,
              bottom: -32,
              ...(Platform.OS === 'web'
                ? ({
                    filter: 'blur(44px) saturate(1.25)',
                    transform: 'scale(1.12)',
                  } as Record<string, unknown>)
                : {}),
            }}
          />
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(250, 249, 246, 0.72)',
              ...(Platform.OS === 'web'
                ? ({ backdropFilter: 'blur(24px)' } as Record<string, unknown>)
                : {}),
            }}
          />
        </View>
      ) : null}

      {/* Minimal Apple HIG Header */}
      <View className="px-5 pt-6 pb-0.5 flex-row items-center justify-between">
        <Pressable
          onPress={handleReturnToToday}
          accessibilityLabel="Back to today's news"
          className="flex-row items-center gap-2.5 flex-1 active:opacity-70"
        >
          <Image
            source={require('../../../assets/images/snappylit-logo-v3.png')}
            contentFit="contain"
            style={{ width: 28, height: 28, borderRadius: 7 }}
          />
          <Text className="text-[22px] font-bold text-ink tracking-[-0.45px]">
            {APP_CONFIG.title}
          </Text>
        </Pressable>

        {/* Right Header: Nov 13 (1/13) in today mode; hidden in older news mode */}
        {viewMode === 'today' && totalCount > 0 ? (
          <Text className="text-[13px] font-medium text-stone-600 ml-2">
            {shortDate} ({clampedCount}/{totalCount})
          </Text>
        ) : null}
      </View>

      {/* Main Content */}
      {loadingOlder && viewMode === 'older' ? (
        <View className="flex-1 items-center justify-center p-6">
          <ActivityIndicator size="large" color="#0D9488" />
          <Text className="text-[15px] text-stone-500 mt-3">
            Loading older editions...
          </Text>
        </View>
      ) : displayedArticles.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <View className="bg-white border border-stone-200/80 rounded-[26px] p-7 max-w-sm w-full items-center">
            <Text className="text-[18px] font-bold text-ink text-center mb-1.5">
              No older news yet
            </Text>
            <Text className="text-[14.5px] leading-[21px] text-stone-500 text-center mb-5">
              Previous editions will appear here once published.
            </Text>
            <Pressable
              onPress={handleReturnToToday}
              className="bg-ink rounded-full px-6 py-2.5 active:opacity-80"
            >
              <Text className="text-white text-[14px] font-semibold">
                Back to today&apos;s news
              </Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <SwipeCardDeck
          articles={displayedArticles}
          onIndexChange={setCurrentIndex}
          onRequestOlderNews={
            viewMode === 'today' ? handleSelectOlderNews : undefined
          }
        />
      )}
    </SafeAreaView>
  );
}
