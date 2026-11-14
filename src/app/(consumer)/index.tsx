import { NewspaperFrontPage } from '@/components/consumer/NewspaperFrontPage';
import { SwipeCardDeck } from '@/components/consumer/SwipeCardDeck';
import { APP_CONFIG } from '@/config/appConfig';
import { usePublishedArticles } from '@/hooks/useArticles';
import { formatEditionDate } from '@/lib/consumerUtils';
import type { Article } from '@/types/article';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

type ViewMode = 'today' | 'older';

const FTUE_STORAGE_KEY = 'snappylit_ftue_seen';
let hasSeenFtueInSession = false;

function hasCompletedOnboarding(): boolean {
  if (hasSeenFtueInSession) return true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(FTUE_STORAGE_KEY) === '1';
    }
  } catch {
    // ignore storage errors
  }
  return false;
}

function markOnboardingComplete(): void {
  hasSeenFtueInSession = true;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(FTUE_STORAGE_KEY, '1');
    }
  } catch {
    // ignore storage errors
  }
}

const SHOW_IMAGES_STORAGE_KEY = 'snappylit_show_images';

function readShowImagesPreference(): boolean {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem(SHOW_IMAGES_STORAGE_KEY);
      if (saved === '0') return false;
    }
  } catch {
    // ignore storage errors
  }
  return true;
}

function writeShowImagesPreference(value: boolean): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(SHOW_IMAGES_STORAGE_KEY, value ? '1' : '0');
    }
  } catch {
    // ignore storage errors
  }
}

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
  const insets = useSafeAreaInsets();

  const [viewMode, setViewMode] = useState<ViewMode>('today');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [showWelcomeCard, setShowWelcomeCard] = useState(
    () => !hasCompletedOnboarding()
  );
  const [showImages, setShowImages] = useState(() =>
    readShowImagesPreference()
  );

  const handleToggleImages = () => {
    setShowImages((prev) => {
      const next = !prev;
      writeShowImagesPreference(next);
      return next;
    });
  };

  const drawerWidth = Math.round(width * 0.62);
  const drawerProgress = useSharedValue(0);

  useEffect(() => {
    drawerProgress.value = withTiming(menuOpen ? 1 : 0, { duration: 240 });
  }, [menuOpen, drawerProgress]);

  const mainPushStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerProgress.value * drawerWidth }],
  }));

  const drawerSlideStyle = useAnimatedStyle(() => ({
    opacity: interpolate(drawerProgress.value, [0, 0.4, 1], [0, 0.6, 1]),
    transform: [{ translateX: (drawerProgress.value - 1) * 28 }],
  }));

  const useNewspaperLayout = Platform.OS === 'web' && width >= 768;

  const displayedArticles = viewMode === 'today' ? articles : olderArticles;

  const availableTopics = useMemo(() => {
    const seen = new Set<string>();
    for (const article of displayedArticles) {
      const topic = article.topic?.trim();
      if (topic) seen.add(topic);
    }
    return Array.from(seen);
  }, [displayedArticles]);

  const filteredArticles = useMemo(() => {
    if (selectedTopic) {
      return displayedArticles.filter(
        (article) => article.topic?.trim() === selectedTopic
      );
    }

    if (showWelcomeCard && viewMode === 'today' && displayedArticles.length > 0) {
      const welcomeCard: Article = {
        id: '__ftue_welcome__',
        date: displayedArticles[0].date,
        original_url: '',
        image_url: null,
        ai_headline: 'Welcome curious reader!',
        ai_summary: 'Swipe to start reading',
        confidence_score: 1,
        confidence_reasoning: '',
        status: 'published',
        approved_by: null,
      };
      return [welcomeCard, ...displayedArticles];
    }

    return displayedArticles;
  }, [displayedArticles, selectedTopic, showWelcomeCard, viewMode]);

  const handleIndexChange = (index: number) => {
    setCurrentIndex(index);
    if (index > 0 && showWelcomeCard) {
      markOnboardingComplete();
    }
  };

  const handleSelectTopic = (topic: string | null) => {
    if (showWelcomeCard) {
      markOnboardingComplete();
      setShowWelcomeCard(false);
    }
    setSelectedTopic(topic);
    setCurrentIndex(0);
    setMenuOpen(false);
  };

  const handleReturnToToday = () => {
    setViewMode('today');
    setSelectedTopic(null);
    setCurrentIndex(0);
  };

  const handleSelectOlderNews = async () => {
    setViewMode('older');
    setSelectedTopic(null);
    setCurrentIndex(0);
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
  const headerTitle =
    viewMode === 'today'
      ? shortDate
        ? `What's up, ${shortDate}`
        : "What's up"
      : "What's up";
  const storyCount = filteredArticles.filter(
    (article) => article.id !== '__ftue_welcome__'
  ).length;
  const activeBgImage = showImages
    ? (filteredArticles[currentIndex]?.image_url ?? null)
    : null;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#141821',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Unified Ambient Blurred Header-Image Glass Background */}
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
            zIndex: 0,
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
              backgroundColor: 'rgba(20, 24, 33, 0.72)',
              ...(Platform.OS === 'web'
                ? ({ backdropFilter: 'blur(24px)' } as Record<string, unknown>)
                : {}),
            }}
          />
        </View>
      ) : null}

      {/* Left Push Drawer */}
      <Animated.View
        pointerEvents={menuOpen ? 'auto' : 'none'}
        style={[
          drawerSlideStyle,
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: drawerWidth,
            backgroundColor: 'transparent',
            paddingTop: insets.top + 36,
            paddingBottom: insets.bottom + 36,
            zIndex: 1,
            justifyContent: 'space-between',
          },
        ]}
      >
        {/* Top Area: Product Identity */}
        <View
          style={{
            paddingHorizontal: 30,
            paddingBottom: 38,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '700',
              color: '#fefaef',
              letterSpacing: -0.2,
            }}
            numberOfLines={1}
          >
            Snappylit News
          </Text>
        </View>

        {/* Middle Area: Scrollable Topic List */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingVertical: 12, gap: 6 }}
        >
          <Pressable
            onPress={() => handleSelectTopic(null)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 16,
              paddingHorizontal: 30,
              backgroundColor: 'transparent',
            }}
          >
            <View style={{ width: 22 }}>
              {selectedTopic === null ? (
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#FFFFFF' }}>
                  ✓
                </Text>
              ) : null}
            </View>
            <Text
              style={{
                fontSize: 15.5,
                fontWeight: selectedTopic === null ? '700' : '500',
                color:
                  selectedTopic === null
                    ? '#FFFFFF'
                    : 'rgba(250, 249, 246, 0.72)',
              }}
            >
              All Topics
            </Text>
          </Pressable>

          {availableTopics.map((topic) => {
            const isSelected = selectedTopic === topic;
            return (
              <Pressable
                key={topic}
                onPress={() => handleSelectTopic(topic)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 16,
                  paddingHorizontal: 30,
                  backgroundColor: 'transparent',
                }}
              >
                <View style={{ width: 22 }}>
                  {isSelected ? (
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: '#FFFFFF',
                      }}
                    >
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={{
                    fontSize: 15.5,
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected
                      ? '#FFFFFF'
                      : 'rgba(250, 249, 246, 0.72)',
                    flexShrink: 1,
                  }}
                  numberOfLines={1}
                >
                  {topic}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Bottom Area: Image Toggle + Contact & Support */}
        <View
          style={{
            paddingTop: 32,
            paddingHorizontal: 30,
            gap: 24,
          }}
        >
          <Pressable
            onPress={handleToggleImages}
            accessibilityRole="switch"
            accessibilityState={{ checked: showImages }}
            accessibilityLabel="Show images"
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                fontSize: 14.5,
                fontWeight: '500',
                color: 'rgba(250, 249, 246, 0.85)',
              }}
            >
              Show images
            </Text>
            <View
              style={{
                width: 40,
                height: 22,
                borderRadius: 999,
                backgroundColor: showImages
                  ? '#fefaef'
                  : 'rgba(255, 255, 255, 0.2)',
                padding: 2,
                justifyContent: 'center',
                alignItems: showImages ? 'flex-end' : 'flex-start',
              }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 999,
                  backgroundColor: showImages ? '#1C1917' : '#FAF9F6',
                }}
              />
            </View>
          </Pressable>

          <Pressable
            onPress={() => {
              setMenuOpen(false);
              Linking.openURL(
                `mailto:${APP_CONFIG.adminEmails[0]}?subject=Snappylit%20Contact`
              );
            }}
          >
            <Text
              style={{
                fontSize: 14.5,
                fontWeight: '500',
                color: 'rgba(250, 249, 246, 0.85)',
              }}
            >
              Contact
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setMenuOpen(false);
              Linking.openURL(
                `mailto:${APP_CONFIG.adminEmails[0]}?subject=Snappylit%20Support`
              );
            }}
          >
            <Text
              style={{
                fontSize: 14.5,
                fontWeight: '500',
                color: 'rgba(250, 249, 246, 0.85)',
              }}
            >
              Support
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      {/* Main Screen (pushes right when menu opens) */}
      <Animated.View
        style={[
          mainPushStyle,
          {
            flex: 1,
            backgroundColor: 'transparent',
            zIndex: 2,
          },
        ]}
      >
        <SafeAreaView
          className="flex-1 consumer-mobile-reader"
          style={{
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: 'transparent',
          }}
          edges={['top', 'left', 'right']}
        >
          {/* Minimal Apple HIG Header */}
          <View className="pr-5 pt-6 pb-0.5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-3 flex-1 min-w-0">
              <Pressable
                onPress={() => setMenuOpen((prev) => !prev)}
                accessibilityLabel="Open topics menu"
                hitSlop={12}
                pointerEvents={menuOpen ? 'none' : 'auto'}
                style={{
                  backgroundColor: 'transparent',
                  paddingVertical: 9,
                  paddingRight: 8,
                  paddingLeft: 0,
                  overflow: 'hidden',
                  justifyContent: 'center',
                  alignItems: 'center',
                  opacity: menuOpen ? 0 : 1,
                }}
              >
                <View
                  style={{
                    width: 18,
                    gap: 4,
                    transform: [{ translateX: -5 }],
                  }}
                >
                  <View className="h-[2px] w-full bg-white rounded-full" />
                  <View className="h-[2px] w-full bg-white rounded-full" />
                  <View className="h-[2px] w-full bg-white rounded-full" />
                </View>
              </Pressable>

              <Pressable
                onPress={handleReturnToToday}
                accessibilityLabel="Back to today's news"
                className="flex-1 min-w-0 active:opacity-70"
              >
                <Text
                  className="text-[22px] font-bold tracking-[-0.45px]"
                  style={{ color: '#FAF9F6' }}
                  numberOfLines={1}
                >
                  {headerTitle}
                </Text>
              </Pressable>
            </View>

            {/* Right Header: N story/stories in today mode; hidden in older news mode */}
            {viewMode === 'today' && storyCount > 0 ? (
              <Text
                className="text-[13px] font-medium ml-2"
                style={{ color: 'rgba(250, 249, 246, 0.75)' }}
              >
                {storyCount} {storyCount === 1 ? 'story' : 'stories'}
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
          ) : filteredArticles.length === 0 ? (
            <View className="flex-1 items-center justify-center px-6">
              <View className="bg-white border border-stone-200/80 rounded-[26px] p-7 max-w-sm w-full items-center">
                <Text className="text-[18px] font-bold text-ink text-center mb-1.5">
                  {selectedTopic ? `No stories in ${selectedTopic}` : 'No older news yet'}
                </Text>
                <Text className="text-[14.5px] leading-[21px] text-stone-500 text-center mb-5">
                  {selectedTopic
                    ? 'Clear the topic filter to return to all news.'
                    : 'Previous editions will appear here once published.'}
                </Text>
                <Pressable
                  onPress={
                    selectedTopic
                      ? () => handleSelectTopic(null)
                      : handleReturnToToday
                  }
                  className="bg-ink rounded-full px-6 py-2.5 active:opacity-80"
                >
                  <Text className="text-white text-[14px] font-semibold">
                    {selectedTopic ? 'Show all topics' : "Back to today's news"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <SwipeCardDeck
              articles={filteredArticles}
              onIndexChange={handleIndexChange}
              activeTopic={selectedTopic}
              onSelectTopic={(topic) => handleSelectTopic(topic)}
              onClearTopic={() => handleSelectTopic(null)}
              showOnboardingTips={
                showWelcomeCard && !selectedTopic && viewMode === 'today'
              }
              showImages={showImages}
              onRequestOlderNews={
                viewMode === 'today' && !selectedTopic
                  ? handleSelectOlderNews
                  : undefined
              }
            />
          )}
        </SafeAreaView>

        {menuOpen ? (
          <Pressable
            onPress={() => setMenuOpen(false)}
            accessibilityLabel="Close topics menu"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
            }}
          />
        ) : null}
      </Animated.View>
    </View>
  );
}
