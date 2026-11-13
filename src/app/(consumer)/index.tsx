import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Modal,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { APP_CONFIG } from '@/config/appConfig';
import { usePublishedArticles } from '@/hooks/useArticles';
import { formatEditionDate } from '@/lib/consumerUtils';
import { SwipeCardDeck } from '@/components/consumer/SwipeCardDeck';
import { NewspaperFrontPage } from '@/components/consumer/NewspaperFrontPage';

type ViewMode = 'today' | 'older';

function HamburgerIcon() {
  return (
    <View className="w-5 h-4 justify-between">
      <View className="h-[1.8px] w-5 bg-ink rounded-full" />
      <View className="h-[1.8px] w-4 bg-ink rounded-full" />
      <View className="h-[1.8px] w-5 bg-ink rounded-full" />
    </View>
  );
}

export default function ConsumerHomeScreen() {
  const {
    articles,
    olderArticles,
    loading,
    loadingOlder,
    error,
    isShowingFallback,
    loadOlderArticles,
  } = usePublishedArticles();
  const { width } = useWindowDimensions();

  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);

  const useNewspaperLayout = Platform.OS === 'web' && width >= 768;

  const baseArticles = viewMode === 'today' ? articles : olderArticles;

  const displayedArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return baseArticles;
    return baseArticles.filter((article) => {
      const headline = article.ai_headline.toLowerCase();
      const summary = article.ai_summary.toLowerCase();
      const topic = (article.topic ?? '').toLowerCase();
      const sources = (article.source_names ?? []).join(' ').toLowerCase();
      return (
        headline.includes(q) ||
        summary.includes(q) ||
        topic.includes(q) ||
        sources.includes(q)
      );
    });
  }, [baseArticles, searchQuery]);

  const handleReturnToToday = () => {
    setViewMode('today');
    setSearchOpen(false);
    setSearchQuery('');
    setMenuOpen(false);
  };

  const handleSelectOlderNews = async () => {
    setMenuOpen(false);
    setViewMode('older');
    await loadOlderArticles();
  };

  const handleSelectSearch = () => {
    setMenuOpen(false);
    setSearchOpen(true);
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
        />
      </SafeAreaView>
    );
  }

  const shortDate =
    articles.length > 0 ? formatEditionDate(articles[0].date, 'short') : '';
  const totalCount = displayedArticles.length;
  const clampedCount = Math.min(currentIndex + 1, Math.max(totalCount, 1));

  return (
    <SafeAreaView className="flex-1 bg-paper" edges={['top', 'left', 'right']}>
      {/* Minimal Apple HIG Header */}
      <View className="px-5 pt-2.5 pb-1.5 flex-row items-center justify-between">
        <View className="flex-row items-center gap-3.5 flex-1">
          <Pressable
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Open menu"
            hitSlop={10}
            className="py-1.5 pr-1 active:opacity-60"
          >
            <HamburgerIcon />
          </Pressable>

          <Pressable
            onPress={handleReturnToToday}
            accessibilityLabel="Back to today's news"
            className="active:opacity-70"
          >
            <Text className="text-[22px] font-bold text-ink tracking-[-0.45px]">
              {APP_CONFIG.title}
            </Text>
          </Pressable>
        </View>

        {/* Right Header: Nov 13 (1/13) in today mode; hidden in older news mode */}
        {viewMode === 'today' && totalCount > 0 ? (
          <Text className="text-[13px] font-medium text-stone-400 ml-2">
            {shortDate} ({clampedCount}/{totalCount})
          </Text>
        ) : null}
      </View>

      {/* Expandable Minimalist Search Bar */}
      {searchOpen ? (
        <View className="px-5 pt-2 pb-1 flex-row items-center gap-2.5">
          <View className="flex-1 flex-row items-center bg-white border border-stone-200/90 rounded-full px-3.5 py-2">
            <Text className="text-[13px] text-stone-400 mr-2">🔍</Text>
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search headlines, topics, sources..."
              placeholderTextColor="#A8A29E"
              autoFocus
              returnKeyType="search"
              className="flex-1 text-[14.5px] text-ink"
            />
            {searchQuery.length > 0 ? (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Text className="text-[12px] font-semibold text-stone-400 px-1">
                  ✕
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
            className="py-1.5 px-1 active:opacity-60"
          >
            <Text className="text-[14px] font-medium text-accent">Cancel</Text>
          </Pressable>
        </View>
      ) : null}

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
              {searchQuery.trim()
                ? 'No matching stories'
                : 'No older news yet'}
            </Text>
            <Text className="text-[14.5px] leading-[21px] text-stone-500 text-center mb-5">
              {searchQuery.trim()
                ? 'Try a different keyword or clear your search.'
                : 'Previous editions will appear here once published.'}
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
        />
      )}

      {/* Minimalist Hamburger Menu Popover */}
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable
          onPress={() => setMenuOpen(false)}
          className="flex-1 bg-black/15"
        >
          <View className="pt-14 pl-5 pr-5 items-start">
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{
                shadowColor: '#1C1917',
                shadowOpacity: 0.14,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
              }}
              className="bg-white border border-stone-200/90 rounded-2xl w-56 overflow-hidden"
            >
              <Pressable
                onPress={handleSelectSearch}
                className="px-4 py-3.5 flex-row items-center gap-3 border-b border-stone-100 active:bg-stone-50"
              >
                <Text className="text-[14px] text-stone-500">🔍</Text>
                <Text className="text-[15px] font-medium text-ink">
                  Search
                </Text>
              </Pressable>

              {viewMode === 'today' ? (
                <Pressable
                  onPress={handleSelectOlderNews}
                  className="px-4 py-3.5 flex-row items-center gap-3 active:bg-stone-50"
                >
                  <Text className="text-[14px] text-stone-500">◷</Text>
                  <Text className="text-[15px] font-medium text-ink">
                    View older news
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={handleReturnToToday}
                  className="px-4 py-3.5 flex-row items-center gap-3 active:bg-stone-50"
                >
                  <Text className="text-[14px] text-accent">↺</Text>
                  <Text className="text-[15px] font-medium text-accent">
                    Back to today&apos;s news
                  </Text>
                </Pressable>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}
