import {
  formatEditionDate,
  getSourceLabel,
  openArticleUrl,
} from '@/lib/consumerUtils';
import { db } from '@/lib/firebase';
import type { Article } from '@/types/article';
import { Image } from 'expo-image';
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  Platform,
  Pressable,
  Text,
  TextInput,
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
import { TopicPatternBanner } from './TopicPatternBanner';

interface SwipeCardDeckProps {
  articles: Article[];
  onIndexChange?: (index: number) => void;
  onRequestOlderNews?: () => void;
  activeTopic?: string | null;
  onSelectTopic?: (topic: string) => void;
  onClearTopic?: () => void;
  showOnboardingTips?: boolean;
  showImages?: boolean;
}

const FEEDBACK_EMOJIS = [
  { emoji: '😕', label: 'Not great' },
  { emoji: '🙂', label: 'Good' },
  { emoji: '😍', label: 'Loved it' },
] as const;

function getCoarseLocation(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    // ignore
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'Unknown';
}

const LOREM_IPSUM_BODY =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.';

const SPRING_CONFIG = {
  damping: 22,
  stiffness: 260,
  mass: 0.85,
};

export function SwipeCardDeck({
  articles,
  onIndexChange,
  onRequestOlderNews,
  activeTopic,
  onSelectTopic,
  onClearTopic,
  showOnboardingTips = false,
  showImages = true,
}: SwipeCardDeckProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [feedbackStep, setFeedbackStep] = useState<'idle' | 'note' | 'sent'>('idle');
  const [feedbackDocId, setFeedbackDocId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [sendingNote, setSendingNote] = useState(false);
  const [articleVotes, setArticleVotes] = useState<
    Record<string, 'important' | 'not_worth'>
  >({});
  const [compactImage, setCompactImage] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [nextImageLoadFailed, setNextImageLoadFailed] = useState(false);
  const [flipTipDismissed, setFlipTipDismissed] = useState(false);
  const [topicTipDismissed, setTopicTipDismissed] = useState(false);
  const textAreaHeightRef = useRef(0);
  const textContentHeightRef = useRef(0);
  const suppressFlipRef = useRef(false);
  const noteInputRef = useRef<ComponentRef<typeof TextInput>>(null);
  const { width, height } = useWindowDimensions();

  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const flipProgress = useSharedValue(0);
  const nextCardBlur = useSharedValue(6);
  const isAnimating = useSharedValue(false);

  const currentArticle = articles[currentIndex] ?? null;
  const nextArticle = articles[currentIndex + 1] ?? null;
  const thirdArticle = articles[currentIndex + 2] ?? null;

  useEffect(() => {
    setCompactImage(false);
    setImageLoadFailed(false);
    setNextImageLoadFailed(false);
    textAreaHeightRef.current = 0;
    textContentHeightRef.current = 0;
  }, [currentArticle?.id]);

  const checkTextOverflow = useCallback(() => {
    if (
      textAreaHeightRef.current > 0 &&
      textContentHeightRef.current > textAreaHeightRef.current + 2
    ) {
      setCompactImage(true);
    }
  }, []);

  const horizontalThreshold = Math.min(width * 0.24, 100);
  const verticalThreshold = Math.min(height * 0.16, 100);

  const resetFlip = useCallback(() => {
    setIsFlipped(false);
    flipProgress.value = 0;
  }, [flipProgress]);

  const suppressNextFlip = useCallback(() => {
    suppressFlipRef.current = true;
    setTimeout(() => {
      suppressFlipRef.current = false;
    }, 150);
  }, []);

  const toggleFlip = useCallback(() => {
    if (suppressFlipRef.current) {
      suppressFlipRef.current = false;
      return;
    }
    if (currentIndex === 1) {
      setFlipTipDismissed(true);
    } else if (currentIndex === 2) {
      setTopicTipDismissed(true);
    }
    setIsFlipped((prev) => {
      const next = !prev;
      flipProgress.value = withTiming(next ? 1 : 0, { duration: 320 });
      return next;
    });
  }, [currentIndex, flipProgress]);

  // Reset deck to first card when the article list changes (e.g. search or mode switch)
  useEffect(() => {
    setCurrentIndex(0);
    resetFlip();
    setFeedbackStep('idle');
    setFeedbackDocId(null);
    setNoteText('');
    translateX.value = 0;
    translateY.value = 0;
    onIndexChange?.(0);
  }, [articles, onIndexChange, resetFlip, translateX, translateY]);

  const handleSelectEmoji = useCallback(async (emoji: string) => {
    setFeedbackStep('note');
    setTimeout(() => {
      noteInputRef.current?.focus();
    }, 50);

    try {
      const docRef = await addDoc(collection(db, 'feedback'), {
        emoji,
        date: new Date().toISOString().split('T')[0],
        location: getCoarseLocation(),
      });
      setFeedbackDocId(docRef.id);
    } catch {
      // Fail silently so UI still lets reader continue
    }
  }, []);

  const handleSendNote = useCallback(async () => {
    const trimmed = noteText.trim();
    if (!trimmed) {
      setFeedbackStep('sent');
      return;
    }
    setSendingNote(true);
    try {
      if (feedbackDocId) {
        await updateDoc(doc(db, 'feedback', feedbackDocId), {
          note: trimmed,
        });
      }
    } catch {
      // ignore
    } finally {
      setSendingNote(false);
      setNoteText('');
      setFeedbackStep('sent');
    }
  }, [feedbackDocId, noteText]);

  const handleCancelNote = useCallback(() => {
    setNoteText('');
    setFeedbackStep('sent');
  }, []);

  const handleArticleVote = useCallback(
    async (articleId: string, vote: 'important' | 'not_worth') => {
      setArticleVotes((prev) => ({ ...prev, [articleId]: vote }));
      try {
        await addDoc(collection(db, 'feedback'), {
          type: 'article_feedback',
          article_id: articleId,
          vote,
          date: new Date().toISOString().split('T')[0],
          location: getCoarseLocation(),
        });
      } catch {
        // ignore network/rules errors so UI stays responsive
      }
    },
    []
  );

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
    resetFlip();
    setCurrentIndex((prev) => Math.min(prev + 1, articles.length));
    translateX.value = 0;
    translateY.value = 0;
    nextCardBlur.value = 6;
    isAnimating.value = false;
  }, [articles.length, isAnimating, nextCardBlur, resetFlip, translateX, translateY]);

  const commitPrev = useCallback(
    (fromAxis: 'x' | 'y') => {
      resetFlip();
      setCurrentIndex((prev) => Math.max(0, prev - 1));
      if (fromAxis === 'x') {
        translateX.value = -width * 0.35;
        translateY.value = 0;
        translateX.value = withSpring(0, SPRING_CONFIG, () => {
          isAnimating.value = false;
        });
      } else {
        translateX.value = 0;
        translateY.value = height * 0.25;
        translateY.value = withSpring(0, SPRING_CONFIG, () => {
          isAnimating.value = false;
        });
      }
    },
    [height, isAnimating, resetFlip, translateX, translateY, width]
  );

  // Up and Right move forward; Left and Down move backward
  const panGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((event) => {
      if (isAnimating.value) return;
      const draggingBackwardX = currentIndex === 0 && event.translationX < 0;
      const draggingBackwardY = currentIndex === 0 && event.translationY > 0;
      translateX.value = draggingBackwardX
        ? event.translationX * 0.22
        : event.translationX;
      translateY.value = draggingBackwardY
        ? event.translationY * 0.22
        : event.translationY;
    })
    .onEnd((event) => {
      if (isAnimating.value) return;

      const absX = Math.abs(event.translationX);
      const absY = Math.abs(event.translationY);
      const horizontalDominant = absX >= absY;

      const swipedRight =
        event.translationX > horizontalThreshold || event.velocityX > 480;
      const swipedUp =
        event.translationY < -verticalThreshold || event.velocityY < -480;

      const swipedLeft =
        currentIndex > 0 &&
        (event.translationX < -horizontalThreshold || event.velocityX < -480);
      const swipedDown =
        currentIndex > 0 &&
        (event.translationY > verticalThreshold || event.velocityY > 480);

      if ((horizontalDominant && swipedRight) || (!horizontalDominant && swipedUp) || (!swipedLeft && !swipedDown && (swipedRight || swipedUp))) {
        isAnimating.value = true;
        nextCardBlur.value = withTiming(0, { duration: 180 });
        if (swipedUp && (!swipedRight || absY > absX)) {
          translateY.value = withTiming(
            -height * 1.1,
            { duration: 210 },
            (finished) => {
              if (finished) {
                runOnJS(commitNext)();
              } else {
                isAnimating.value = false;
              }
            }
          );
        } else {
          translateX.value = withTiming(
            width * 1.15,
            { duration: 200 },
            (finished) => {
              if (finished) {
                runOnJS(commitNext)();
              } else {
                isAnimating.value = false;
              }
            }
          );
        }
      } else if (swipedLeft || swipedDown) {
        isAnimating.value = true;
        if (swipedDown && (!swipedLeft || absY > absX)) {
          translateY.value = withTiming(
            height * 0.5,
            { duration: 160 },
            (finished) => {
              if (finished) {
                runOnJS(commitPrev)('y');
              } else {
                isAnimating.value = false;
              }
            }
          );
        } else {
          translateX.value = withTiming(
            -width * 0.55,
            { duration: 160 },
            (finished) => {
              if (finished) {
                runOnJS(commitPrev)('x');
              } else {
                isAnimating.value = false;
              }
            }
          );
        }
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .enabled(!isFlipped && currentArticle?.id !== '__ftue_welcome__')
    .onEnd(() => {
      if (isAnimating.value) return;
      runOnJS(toggleFlip)();
    });

  const cardGesture = Gesture.Exclusive(panGesture, tapGesture);

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

  const frontFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [0, 180]);
    const opacity = interpolate(flipProgress.value, [0, 0.49, 0.5, 1], [1, 1, 0, 0]);
    return {
      opacity,
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
    };
  });

  const backFaceStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipProgress.value, [0, 1], [180, 360]);
    const opacity = interpolate(flipProgress.value, [0, 0.49, 0.5, 1], [0, 0, 1, 1]);
    return {
      opacity,
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden' as const,
    };
  });

  const nextCardStyle = useAnimatedStyle(() => {
    const forwardDist = Math.max(0, translateX.value, -translateY.value);
    const progress = interpolate(
      forwardDist,
      [0, width * 0.45],
      [0, 1],
      Extrapolation.CLAMP
    );
    const offsetY = interpolate(progress, [0, 1], [-6, 0]);
    const scaleX = interpolate(progress, [0, 1], [0.94, 1]);
    const opacity = interpolate(progress, [0, 1], [0.96, 1]);

    return {
      opacity,
      transform: [{ translateY: offsetY }, { scaleX }],
    };
  });

  const nextCardContentStyle = useAnimatedStyle(() => {
    const contentOpacity = interpolate(nextCardBlur.value, [6, 0], [0.68, 1]);
    if (Platform.OS === 'web') {
      return {
        opacity: contentOpacity,
        filter: `blur(${nextCardBlur.value.toFixed(2)}px)`,
      } as Record<string, unknown>;
    }
    return {
      opacity: contentOpacity,
    };
  });

  const caughtUpPanGesture = Gesture.Pan()
    .minDistance(10)
    .onUpdate((event) => {
      if (isAnimating.value) return;
      translateX.value = event.translationX;
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      if (isAnimating.value) return;
      const absX = Math.abs(event.translationX);
      const absY = Math.abs(event.translationY);
      const horizontalDominant = absX >= absY;

      const swipedRight =
        event.translationX > horizontalThreshold || event.velocityX > 480;
      const swipedUp =
        event.translationY < -verticalThreshold || event.velocityY < -480;
      const swipedLeft =
        articles.length > 0 &&
        (event.translationX < -horizontalThreshold || event.velocityX < -480);
      const swipedDown =
        articles.length > 0 &&
        (event.translationY > verticalThreshold || event.velocityY > 480);

      if (
        onRequestOlderNews &&
        ((horizontalDominant && swipedRight) ||
          (!horizontalDominant && swipedUp) ||
          (!swipedLeft && !swipedDown && (swipedRight || swipedUp)))
      ) {
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
        runOnJS(onRequestOlderNews)();
      } else if (swipedLeft || swipedDown) {
        isAnimating.value = true;
        if (swipedDown && (!swipedLeft || absY > absX)) {
          translateY.value = withTiming(
            height * 0.5,
            { duration: 160 },
            (finished) => {
              if (finished) {
                runOnJS(commitPrev)('y');
              } else {
                isAnimating.value = false;
              }
            }
          );
        } else {
          translateX.value = withTiming(
            -width * 0.55,
            { duration: 160 },
            (finished) => {
              if (finished) {
                runOnJS(commitPrev)('x');
              } else {
                isAnimating.value = false;
              }
            }
          );
        }
      } else {
        translateX.value = withSpring(0, SPRING_CONFIG);
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });

  if (!currentArticle) {
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
        <View
          style={{
            flex: 1,
            width: '100%',
            maxWidth: 420,
            position: 'relative',
          }}
        >
          <GestureDetector gesture={caughtUpPanGesture}>
            <Animated.View
              style={[
                activeCardStyle,
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 26,
                  backgroundColor: '#FFFFFF',
                  borderWidth: Platform.OS === 'web' ? 0 : 1,
                  borderColor: 'rgba(28, 25, 23, 0.08)',
                  boxShadow:
                    '0 10px 26px -4px rgba(28, 25, 23, 0.18), 0 2px 6px rgba(28, 25, 23, 0.08), 0 0 0 1px rgba(28, 25, 23, 0.08)',
                  shadowColor: '#1C1917',
                  shadowOpacity: 0.1,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 10 },
                  padding: 28,
                  justifyContent: 'space-between',
                },
              ]}
            >
              <View className="flex-1 items-center justify-center">
                <View className="w-12 h-12 rounded-full bg-teal-50 items-center justify-center mb-4">
                  <Text className="text-xl text-accent font-bold">✓</Text>
                </View>
                <Text className="text-[22px] font-bold text-ink text-center tracking-[-0.3px] mb-2">
                  You&apos;re all caught up
                </Text>
                <Text className="text-[15.5px] leading-[23px] text-stone-500 text-center">
                  Swipe to read older news.
                </Text>
              </View>

              <View className="pt-5 border-t border-stone-100 items-center w-full">
                {feedbackStep === 'idle' ? (
                  <>
                    <Text className="text-[15px] font-medium text-ink text-center mb-4">
                      Did you enjoy reading today?
                    </Text>
                    <View className="flex-row items-center justify-center gap-5">
                      {FEEDBACK_EMOJIS.map((item) => (
                        <Pressable
                          key={item.emoji}
                          onPress={() => void handleSelectEmoji(item.emoji)}
                          accessibilityLabel={item.label}
                          className="w-12 h-12 rounded-full bg-[#F5F4F0] items-center justify-center active:scale-95 active:opacity-75"
                        >
                          <Text className="text-[24px]">{item.emoji}</Text>
                        </Pressable>
                      ))}
                    </View>
                  </>
                ) : feedbackStep === 'note' ? (
                  <View className="w-full">
                    <Text className="text-[14.5px] font-medium text-ink text-center mb-3">
                      Thanks! Add another line?
                    </Text>
                    <TextInput
                      ref={noteInputRef}
                      value={noteText}
                      onChangeText={setNoteText}
                      placeholder="Write a quick note..."
                      placeholderTextColor="#A8A29E"
                      autoFocus
                      multiline
                      className="w-full bg-[#F5F4F0] border border-stone-200 rounded-2xl px-3.5 py-2.5 text-[14.5px] text-ink min-h-[72px] mb-3"
                    />
                    <View className="flex-row items-center justify-end gap-2.5">
                      <Pressable
                        onPress={handleCancelNote}
                        disabled={sendingNote}
                        className="px-4 py-2 rounded-full active:opacity-60"
                      >
                        <Text className="text-[13.5px] font-medium text-stone-500">
                          Cancel
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => void handleSendNote()}
                        disabled={sendingNote}
                        className="px-5 py-2 rounded-full bg-ink active:opacity-80"
                      >
                        <Text className="text-[13.5px] font-semibold text-white">
                          {sendingNote ? 'Sending...' : 'Send'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Text className="text-[14.5px] font-medium text-accent text-center py-2">
                    Thanks for your feedback!
                  </Text>
                )}
              </View>
            </Animated.View>
          </GestureDetector>
        </View>
      </View>
    );
  }

  const sourceLabel = getSourceLabel(currentArticle);
  const shortDate = formatEditionDate(currentArticle.date, 'short');

  return (
    <View
      style={{
        flex: 1,
        paddingLeft: 20,
        paddingRight: 20,
        paddingTop: 22,
        paddingBottom: 20,
        alignItems: 'center',
      }}
    >
      {/* Full-Height Floating Card Stack */}
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 420,
          position: 'relative',
        }}
      >
        {/* Third card peeking 12px from top */}
        {thirdArticle || onRequestOlderNews ? (
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
              backgroundColor: '#EAE8E2',
              borderWidth: Platform.OS === 'web' ? 0 : 1,
              borderColor: 'rgba(28, 25, 23, 0.08)',
              transform: [{ translateY: -12 }, { scaleX: 0.88 }],
              boxShadow:
                '0 2px 8px rgba(28, 25, 23, 0.05), 0 0 0 1px rgba(28, 25, 23, 0.08)',
              shadowColor: '#1C1917',
              shadowOpacity: 0.04,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            }}
          />
        ) : null}

        {/* Second card animated preview peeking 6px from top */}
        {nextArticle || onRequestOlderNews ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 2,
                borderRadius: 26,
                overflow: 'hidden',
                backgroundColor: '#F4F3EF',
                borderWidth: Platform.OS === 'web' ? 0 : 1,
                borderColor: 'rgba(28, 25, 23, 0.08)',
                boxShadow:
                  '0 4px 12px rgba(28, 25, 23, 0.08), 0 0 0 1px rgba(28, 25, 23, 0.08)',
                shadowColor: '#1C1917',
                shadowOpacity: 0.06,
                shadowRadius: 12,
                shadowOffset: { width: 0, height: 4 },
                ...(Platform.OS === 'web'
                  ? ({
                    isolation: 'isolate',
                    WebkitMaskImage: '-webkit-radial-gradient(white, black)',
                  } as Record<string, unknown>)
                  : {}),
              },
              nextCardStyle,
            ]}
          >
            <Animated.View style={[{ flex: 1 }, nextCardContentStyle]}>
              {nextArticle ? (
                <View
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: 175,
                    borderTopLeftRadius: 26,
                    borderTopRightRadius: 26,
                    overflow: 'hidden',
                  }}
                >
                  {showImages && nextArticle.image_url && !nextImageLoadFailed ? (
                    <Image
                      source={{ uri: nextArticle.image_url }}
                      contentFit="cover"
                      blurRadius={Platform.OS === 'web' ? 0 : 6}
                      onError={() => setNextImageLoadFailed(true)}
                      style={{
                        width: '100%',
                        height: '100%',
                        backgroundColor: '#F1EFEA',
                        borderTopLeftRadius: 26,
                        borderTopRightRadius: 26,
                      }}
                    />
                  ) : (
                    <TopicPatternBanner topic={nextArticle.topic} />
                  )}
                  {nextArticle.topic ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        backgroundColor: 'rgba(28, 25, 23, 0.65)',
                        borderRadius: 999,
                        paddingHorizontal: 11,
                        paddingVertical: 4,
                      }}
                    >
                      <Text className="text-[11.5px] font-medium text-white">
                        {nextArticle.topic}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {nextArticle ? (
                <View
                  style={{
                    flex: 1,
                    padding: 20,
                    justifyContent: 'space-between',
                  }}
                >
                  <View style={{ flexShrink: 1 }}>
                    <View className="flex-row items-center gap-2 mb-2 min-w-0">
                      <Text
                        className="text-[11.5px] font-medium text-stone-400 flex-shrink"
                        numberOfLines={1}
                      >
                        {[
                          formatEditionDate(nextArticle.date, 'short'),
                          getSourceLabel(nextArticle) || 'News',
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </Text>
                    </View>

                    <Text
                      className="text-[20px] leading-[26px] font-bold text-ink tracking-[-0.35px] mb-2.5"
                      numberOfLines={3}
                    >
                      {nextArticle.ai_headline}
                    </Text>

                    <Text className="text-[15px] leading-[22px] text-stone-600">
                      {LOREM_IPSUM_BODY}
                    </Text>
                  </View>
                </View>
              ) : null}
            </Animated.View>
          </Animated.View>
        ) : null}

        {/* Active Swipeable & Flippable Card */}
        <GestureDetector gesture={cardGesture}>
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
              },
            ]}
          >
            {/* FRONT FACE */}
            <Animated.View
              pointerEvents={isFlipped ? 'none' : 'auto'}
              style={[
                frontFaceStyle,
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 26,
                  overflow: 'hidden',
                  backgroundColor:
                    currentArticle.id === '__ftue_welcome__'
                      ? '#fefaef'
                      : '#FFFFFF',
                  borderWidth: Platform.OS === 'web' ? 0 : 1,
                  borderColor: 'rgba(28, 25, 23, 0.08)',
                  boxShadow:
                    '0 10px 26px -4px rgba(28, 25, 23, 0.18), 0 2px 6px rgba(28, 25, 23, 0.08), 0 0 0 1px rgba(28, 25, 23, 0.08)',
                  shadowColor: '#1C1917',
                  shadowOpacity: 0.1,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 10 },
                },
              ]}
            >
              {currentArticle.id === '__ftue_welcome__' ? (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 28,
                  }}
                >
                  <Image
                    source={require('../../../assets/images/snappylit-logo-v2.png')}
                    contentFit="contain"
                    style={{ width: 96, height: 96, marginBottom: 20 }}
                  />
                  <Text className="text-[22px] font-bold text-ink text-center tracking-[-0.35px] mb-2">
                    Welcome curious reader!
                  </Text>
                  <Text className="text-[15px] leading-[22px] text-stone-600 text-center">
                    Swipe to start reading
                  </Text>
                </View>
              ) : (
                <>
                  <View
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: compactImage ? 88 : 175,
                    }}
                  >
                    {showImages &&
                      currentArticle.image_url &&
                      !imageLoadFailed ? (
                      <Image
                        source={{ uri: currentArticle.image_url }}
                        contentFit="cover"
                        transition={180}
                        onError={() => setImageLoadFailed(true)}
                        style={{
                          width: '100%',
                          height: '100%',
                          backgroundColor: '#F1EFEA',
                        }}
                      />
                    ) : (
                      <TopicPatternBanner topic={currentArticle.topic} />
                    )}
                    {activeTopic ? (
                      <View
                        style={{
                          position: 'absolute',
                          top: 12,
                          left: 12,
                          right: 12,
                          zIndex: 10,
                          backgroundColor: 'rgba(28, 25, 23, 0.72)',
                          borderRadius: 999,
                          paddingLeft: 14,
                          paddingRight: 8,
                          paddingVertical: 5,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                        }}
                      >
                        <Text
                          className="text-[12px] font-medium text-white flex-shrink"
                          numberOfLines={1}
                        >
                          {activeTopic} ({Math.min(currentIndex + 1, articles.length)}/
                          {articles.length})
                        </Text>
                        <Pressable
                          onPressIn={suppressNextFlip}
                          onPress={(e) => {
                            e.stopPropagation?.();
                            onClearTopic?.();
                          }}
                          accessibilityLabel="Clear topic filter"
                          hitSlop={8}
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 999,
                            backgroundColor: 'rgba(255, 255, 255, 0.18)',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Text className="text-[11px] font-bold text-white leading-none">
                            ✕
                          </Text>
                        </Pressable>
                      </View>
                    ) : currentArticle.topic ? (
                      <Pressable
                        onPressIn={suppressNextFlip}
                        onPress={(e) => {
                          e.stopPropagation?.();
                          if (currentArticle.topic) {
                            onSelectTopic?.(currentArticle.topic);
                          }
                        }}
                        accessibilityLabel={`Filter by ${currentArticle.topic}`}
                        hitSlop={6}
                        style={{
                          position: 'absolute',
                          top: 12,
                          left: 12,
                          zIndex: 10,
                          backgroundColor: 'rgba(28, 25, 23, 0.65)',
                          borderRadius: 999,
                          paddingHorizontal: 11,
                          paddingVertical: 4,
                        }}
                      >
                        <Text className="text-[11.5px] font-medium text-white">
                          {currentArticle.topic}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  <View
                    onLayout={(e) => {
                      textAreaHeightRef.current = e.nativeEvent.layout.height - 40;
                      checkTextOverflow();
                    }}
                    style={{
                      flex: 1,
                      padding: 20,
                      overflow: 'hidden',
                    }}
                  >
                    <View
                      onLayout={(e) => {
                        textContentHeightRef.current = e.nativeEvent.layout.height;
                        checkTextOverflow();
                      }}
                    >
                      {showImages && !currentArticle.image_url && activeTopic ? (
                        <View
                          style={{
                            backgroundColor: 'rgba(28, 25, 23, 0.85)',
                            borderRadius: 999,
                            paddingLeft: 14,
                            paddingRight: 8,
                            paddingVertical: 5,
                            marginBottom: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 8,
                          }}
                        >
                          <Text
                            className="text-[12px] font-medium text-white flex-shrink"
                            numberOfLines={1}
                          >
                            {activeTopic} ({Math.min(currentIndex + 1, articles.length)}/
                            {articles.length})
                          </Text>
                          <Pressable
                            onPressIn={suppressNextFlip}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              onClearTopic?.();
                            }}
                            accessibilityLabel="Clear topic filter"
                            hitSlop={8}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: 999,
                              backgroundColor: 'rgba(255, 255, 255, 0.18)',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Text className="text-[11px] font-bold text-white leading-none">
                              ✕
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}

                      {/* Eyebrow: Subject pill fallback (if no image and no active filter) + Date, Source on left */}
                      <View className="flex-row items-center gap-2 mb-2 min-w-0">
                        {showImages && !currentArticle.image_url && !activeTopic && currentArticle.topic ? (
                          <Pressable
                            onPressIn={suppressNextFlip}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              if (currentArticle.topic) {
                                onSelectTopic?.(currentArticle.topic);
                              }
                            }}
                            accessibilityLabel={`Filter by ${currentArticle.topic}`}
                            className="bg-stone-100 rounded-full px-2.5 py-0.5 active:opacity-75"
                          >
                            <Text className="text-[11.5px] font-medium text-ink">
                              {currentArticle.topic}
                            </Text>
                          </Pressable>
                        ) : null}
                        {shortDate || sourceLabel ? (
                          <Text
                            className="text-[11.5px] font-medium text-stone-400 flex-shrink"
                            numberOfLines={1}
                          >
                            {[shortDate, sourceLabel].filter(Boolean).join(', ')}
                          </Text>
                        ) : null}
                      </View>

                      {/* Headline */}
                      <Text
                        className="text-[20px] leading-[26px] font-bold text-ink tracking-[-0.35px] mb-2.5"
                        numberOfLines={3}
                      >
                        {currentArticle.ai_headline}
                      </Text>

                      {/* Summary */}
                      <Text className="text-[15px] leading-[22px] text-stone-600">
                        {currentArticle.ai_summary}
                      </Text>
                    </View>
                  </View>

                  {showOnboardingTips &&
                    currentIndex === 1 &&
                    !isFlipped &&
                    !flipTipDismissed ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        bottom: 18,
                        left: 20,
                        right: 20,
                        alignItems: 'center',
                        zIndex: 15,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: '#fefaef',
                          borderRadius: 999,
                          paddingHorizontal: 14,
                          paddingVertical: 7,
                          borderWidth: 1,
                          borderColor: 'rgba(28, 25, 23, 0.14)',
                          boxShadow: '0 6px 16px rgba(28, 25, 23, 0.14)',
                        }}
                      >
                        <Text className="text-[13px] font-medium text-ink">
                          👆 Tap to flip cards
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {showOnboardingTips &&
                    currentIndex === 2 &&
                    !activeTopic &&
                    currentArticle.topic &&
                    !isFlipped &&
                    !topicTipDismissed ? (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        top: !showImages || currentArticle.image_url ? 42 : 44,
                        left: 14,
                        zIndex: 15,
                        alignItems: 'flex-start',
                      }}
                    >
                      <View
                        style={{
                          marginLeft: 14,
                          width: 0,
                          height: 0,
                          borderLeftWidth: 7,
                          borderRightWidth: 7,
                          borderBottomWidth: 8,
                          borderLeftColor: 'transparent',
                          borderRightColor: 'transparent',
                          borderBottomColor: '#fefaef',
                        }}
                      />
                      <View
                        style={{
                          backgroundColor: '#fefaef',
                          borderRadius: 14,
                          paddingHorizontal: 12,
                          paddingVertical: 7,
                          borderWidth: 1,
                          borderColor: 'rgba(28, 25, 23, 0.14)',
                          boxShadow: '0 6px 16px rgba(28, 25, 23, 0.16)',
                        }}
                      >
                        <Text className="text-[12.5px] font-medium text-ink">
                          Tap here to focus on a subject
                        </Text>
                      </View>
                    </View>
                  ) : null}
                </>
              )}
            </Animated.View>

            {/* BACK FACE (Why it matters + Quick Feedback + Read Source) */}
            <Animated.View
              pointerEvents={isFlipped ? 'auto' : 'none'}
              style={[
                backFaceStyle,
                {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  borderRadius: 26,
                  overflow: 'hidden',
                  backgroundColor: '#FAF9F6',
                  borderWidth: Platform.OS === 'web' ? 0 : 1,
                  borderColor: 'rgba(28, 25, 23, 0.08)',
                  boxShadow:
                    '0 10px 26px -4px rgba(28, 25, 23, 0.18), 0 2px 6px rgba(28, 25, 23, 0.08), 0 0 0 1px rgba(28, 25, 23, 0.08)',
                  shadowColor: '#1C1917',
                  shadowOpacity: 0.1,
                  shadowRadius: 24,
                  shadowOffset: { width: 0, height: 10 },
                  padding: 22,
                  justifyContent: 'space-between',
                },
              ]}
            >
              <View style={{ flex: 1 }}>
                <View className="flex-row items-center justify-between gap-2 mb-4">
                  <Pressable onPress={toggleFlip} className="active:opacity-70">
                    <Text className="text-[17px] font-bold text-ink">
                      💡 Why it matters
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => openArticleUrl(currentArticle.original_url)}
                    hitSlop={8}
                    className="py-1 active:opacity-60"
                  >
                    <Text className="text-[13px] font-normal text-accent">
                      Read source ↗
                    </Text>
                  </Pressable>
                </View>

                <Pressable onPress={toggleFlip} style={{ flex: 1 }}>
                  <Text className="text-[15.5px] leading-[24px] text-stone-700">
                    {currentArticle.ai_explanation ||
                      'Tap to return to the story.'}
                  </Text>
                </Pressable>
              </View>

              <View className="gap-4">
                {/* Quick Feedback */}
                <View className="pt-3.5 border-t border-stone-200/80">
                  <Text className="text-[13px] font-medium text-stone-500 mb-2.5">
                    Quick Feedback?
                  </Text>
                  {articleVotes[currentArticle.id] ? (
                    <Text className="text-[13px] font-medium text-accent">
                      Thanks for your feedback! (
                      {articleVotes[currentArticle.id] === 'important'
                        ? '👍 Important news'
                        : '👎 Not worth a read'}
                      )
                    </Text>
                  ) : (
                    <View className="flex-row flex-wrap items-center gap-2">
                      <Pressable
                        onPress={() =>
                          void handleArticleVote(currentArticle.id, 'important')
                        }
                        className="px-3.5 py-2 rounded-full bg-white border border-stone-200 active:opacity-70"
                      >
                        <Text className="text-[13px] font-medium text-ink">
                          👍 Important news
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          void handleArticleVote(currentArticle.id, 'not_worth')
                        }
                        className="px-3.5 py-2 rounded-full bg-white border border-stone-200 active:opacity-70"
                      >
                        <Text className="text-[13px] font-medium text-ink">
                          👎 Not worth a read
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}
