import { getSourceLabel, openArticleUrl } from '@/lib/consumerUtils';
import type { Article } from '@/types/article';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

interface SwipeCardDeckProps {
  articles: Article[];
  onIndexChange?: (index: number) => void;
}

const SPRING_CONFIG = {
  damping: 22,
  stiffness: 260,
  mass: 0.85,
};

export function SwipeCardDeck({ articles, onIndexChange }: SwipeCardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);
  const { width } = useWindowDimensions();

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const isAnimating = useSharedValue(false);

  const currentArticle = articles[currentIndex] ?? null;
  const nextArticle = articles[currentIndex + 1] ?? null;
  const thirdArticle = articles[currentIndex + 2] ?? null;

  const swipeThreshold = Math.min(width * 0.25, 105);

  // Reset deck to first card when the article list changes (e.g. search or mode switch)
  useEffect(() => {
    setCurrentIndex(0);
    setShowExplanation(false);
    translateX.value = 0;
    translateY.value = 0;
    onIndexChange?.(0);
  }, [articles, onIndexChange, translateX, translateY]);

  useEffect(() => {
    onIndexChange?.(currentIndex);
  }, [currentIndex, onIndexChange]);

  // Prefetch upcoming article images for instant transitions
  useEffect(() => {
    const urls = [
      articles[currentIndex + 1]?.image_url,
      articles[currentIndex + 2]?.image_url,
    ].filter((u): u is string => Boolean(u));
    if (urls.length > 0) {
      Image.prefetch(urls).catch(() => { });
    }
  }, [currentIndex, articles]);

  const commitNext = useCallback(() => {
    setShowExplanation(false);
    setCurrentIndex((prev) => Math.min(prev + 1, articles.length));
    translateX.value = 0;
    translateY.value = 0;
    isAnimating.value = false;
  }, [articles.length, isAnimating, translateX, translateY]);

  const commitPrev = useCallback(() => {
    setShowExplanation(false);
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    translateX.value = -width * 0.35;
    translateY.value = 0;
    translateX.value = withSpring(0, SPRING_CONFIG, () => {
      isAnimating.value = false;
    });
  }, [isAnimating, translateX, translateY, width]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-20, 20])
    .onUpdate((event) => {
      if (isAnimating.value) return;
      if (currentIndex === 0 && event.translationX > 0) {
        translateX.value = event.translationX * 0.22;
      } else {
        translateX.value = event.translationX;
      }
      translateY.value = event.translationY * 0.15;
    })
    .onEnd((event) => {
      if (isAnimating.value) return;

      const swipedLeft =
        event.translationX < -swipeThreshold || event.velocityX < -480;
      const swipedRight =
        currentIndex > 0 &&
        (event.translationX > swipeThreshold || event.velocityX > 480);

      if (swipedLeft) {
        isAnimating.value = true;
        translateX.value = withTiming(
          -width * 1.15,
          { duration: 200 },
          (finished) => {
            if (finished) {
              runOnJS(commitNext)();
            } else {
              isAnimating.value = false;
            }
          }
        );
      } else if (swipedRight) {
        isAnimating.value = true;
        translateX.value = withTiming(
          width * 0.55,
          { duration: 160 },
          (finished) => {
            if (finished) {
              runOnJS(commitPrev)();
            } else {
              isAnimating.value = false;
            }
          }
        );
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const activeCardStyle = useAnimatedStyle(() => {
    const rotateDeg = interpolate(
      translateX.value,
      [-width * 0.6, 0, width * 0.6],
      [-5.5, 0, 5.5],
      Extrapolation.CLAMP
    );
    return {
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotateDeg}deg` },
      ],
    };
  });

  const nextCardStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      Math.max(0, -translateX.value),
      [0, width * 0.45],
      [0, 1],
      Extrapolation.CLAMP
    );
    const scale = interpolate(progress, [0, 1], [0.94, 1]);
    const offsetY = interpolate(progress, [0, 1], [-12, 0]);
    const opacity = interpolate(progress, [0, 1], [0.85, 1]);

    return {
      opacity,
      transform: [{ translateY: offsetY }, { scale }],
    };
  });

  if (!currentArticle) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <View
          style={{
            shadowColor: '#1C1917',
            shadowOpacity: 0.06,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 10 },
          }}
          className="bg-white border border-stone-200/80 rounded-[28px] p-8 items-center max-w-sm w-full"
        >
          <View className="w-12 h-12 rounded-full bg-teal-50 items-center justify-center mb-4">
            <Text className="text-xl text-accent font-bold">✓</Text>
          </View>
          <Text className="text-[22px] font-bold text-ink text-center tracking-[-0.3px] mb-2">
            You&apos;re all caught up
          </Text>
          <Text className="text-[15.5px] leading-[23px] text-stone-500 text-center mb-7">
            You&apos;ve read all {articles.length} stories in this edition.
          </Text>
          <Pressable
            onPress={() => {
              setShowExplanation(false);
              setCurrentIndex(0);
            }}
            className="bg-ink rounded-full px-7 py-3.5 active:opacity-85"
          >
            <Text className="text-white font-semibold text-[15px]">
              Read Again
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const sourceLabel = getSourceLabel(currentArticle);

  return (
    <View
      style={{
        flex: 1,
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 32,
        paddingBottom: 20,
        alignItems: 'center',
      }}
    >
      {/* Optimized Full-Height Floating Card Stack */}
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 420,
          position: 'relative',
        }}
      >
        {/* Third card peeking at top */}
        {thirdArticle ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 1,
              borderRadius: 26,
              backgroundColor: '#E7E5E0',
              borderWidth: 1,
              borderColor: 'rgba(214, 211, 209, 0.8)',
              transform: [{ translateY: -22 }, { scale: 0.88 }],
              shadowColor: '#1C1917',
              shadowOpacity: 0.04,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            }}
          />
        ) : null}

        {/* Second card animated preview peeking at top */}
        {nextArticle ? (
          <Animated.View
            pointerEvents="none"
            style={[
              nextCardStyle,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 2,
                borderRadius: 26,
                overflow: 'hidden',
                backgroundColor: '#F5F4F0',
                borderWidth: 1,
                borderColor: 'rgba(231, 229, 224, 0.9)',
                shadowColor: '#1C1917',
                shadowOpacity: 0.06,
                shadowRadius: 16,
                shadowOffset: { width: 0, height: 6 },
              },
            ]}
          >
            {nextArticle.image_url ? (
              <Image
                source={{ uri: nextArticle.image_url }}
                contentFit="cover"
                style={{ width: '100%', height: 175, backgroundColor: '#F1EFEA' }}
              />
            ) : null}
            <View className="p-5">
              <Text
                className="text-[19px] leading-[25px] font-bold text-ink/75"
                numberOfLines={3}
              >
                {nextArticle.ai_headline}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* Active Swipeable Card */}
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              activeCardStyle,
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 3,
                borderRadius: 26,
                overflow: 'hidden',
                backgroundColor: '#FFFFFF',
                borderWidth: 1,
                borderColor: 'rgba(231, 229, 224, 0.9)',
                shadowColor: '#1C1917',
                shadowOpacity: 0.1,
                shadowRadius: 24,
                shadowOffset: { width: 0, height: 10 },
              },
            ]}
          >
            {currentArticle.image_url ? (
              <Image
                source={{ uri: currentArticle.image_url }}
                contentFit="cover"
                transition={180}
                style={{
                  width: '100%',
                  height: 175,
                  backgroundColor: '#F1EFEA',
                }}
              />
            ) : null}

            <ScrollView
              className="flex-1"
              contentContainerStyle={{ padding: 20, paddingBottom: 18 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Quiet kicker + source */}
              {currentArticle.topic || sourceLabel ? (
                <View className="flex-row items-center gap-2 mb-2">
                  {currentArticle.topic ? (
                    <Text className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-accent">
                      {currentArticle.topic}
                    </Text>
                  ) : null}
                  {currentArticle.topic && sourceLabel ? (
                    <Text className="text-[10.5px] text-stone-300">•</Text>
                  ) : null}
                  {sourceLabel ? (
                    <Text
                      className="text-[11.5px] font-medium text-stone-400"
                      numberOfLines={1}
                    >
                      {sourceLabel}
                    </Text>
                  ) : null}
                </View>
              ) : null}

              {/* Headline */}
              <Text className="text-[20px] leading-[26px] font-bold text-ink tracking-[-0.35px] mb-2.5">
                {currentArticle.ai_headline}
              </Text>

              {/* Summary */}
              <Text className="text-[15px] leading-[23px] text-stone-600">
                {currentArticle.ai_summary}
              </Text>

              {/* Inline Context Drawer */}
              {showExplanation && currentArticle.ai_explanation ? (
                <View className="mt-3.5 bg-[#F5F4F0] rounded-2xl p-3.5">
                  <Text className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-500 mb-1">
                    Background
                  </Text>
                  <Text className="text-[13.5px] leading-[20px] text-stone-700">
                    {currentArticle.ai_explanation}
                  </Text>
                </View>
              ) : null}

              {/* Quiet inline links */}
              <View className="flex-row items-center justify-between mt-5 pt-3.5 border-t border-stone-100">
                <Pressable
                  onPress={() => openArticleUrl(currentArticle.original_url)}
                  className="py-1 active:opacity-60"
                >
                  <Text className="text-[13px] font-semibold text-accent">
                    Read source ↗
                  </Text>
                </Pressable>

                {currentArticle.ai_explanation ? (
                  <Pressable
                    onPress={() => setShowExplanation((prev) => !prev)}
                    className="flex-row items-center gap-1 py-1 active:opacity-60"
                  >
                    <Text className="text-[13px] font-medium text-stone-500">
                      What&apos;s this about?
                    </Text>
                    <Text className="text-[12px] text-stone-400">
                      {showExplanation ? '▴' : '▾'}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}
