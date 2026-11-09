import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Surface, TouchableRipple } from 'react-native-paper';
import { scheduleOnRN } from 'react-native-worklets';

import { colors, deck, motion, radius, spacing } from '@/theme';

import { AppBadge } from './AppBadge';
import { createOnce } from './once';

export type StackItem = {
  key: string;
  // The card's content. Only the top card shows it; the layers behind are
  // textless.
  content: ReactNode;
};

type Props = {
  // The first item is the top card.
  items: readonly StackItem[];
  // Announced for the top card, with the hint and the action name below.
  topLabel: string;
  topHint: string;
  swipeActionLabel: string;
  // Announced by the count badge, which shows with two or more cards.
  countLabel: string;
  onPressTop: () => void;
  // Called when the top card is swiped away. Resolve false when it could not be
  // saved: the card slides back.
  onSwipeTop: () => Promise<boolean>;
};

// Lets tests find the top card's swipe gesture and the layers.
export const SWIPE_TEST_ID = 'card-stack-swipe';
export const LAYER_TEST_ID = 'card-stack-layer';

// True when a right swipe went far enough, or fast enough, to dismiss the card.
// A worklet: it runs on the UI thread while the finger lifts.
export function shouldDismissSwipe(translationX: number, velocityX: number): boolean {
  'worklet';
  return translationX >= motion.swipeDistance || velocityX >= motion.swipeVelocity;
}

// Layers behind the top card for a number of cards: none for one card, one for
// two, two for three or more.
export function layerCount(cards: number): number {
  return Math.max(0, Math.min(cards - 1, deck.maxLayers));
}

// Where a layer sits (1 is the nearest): lower, narrower and fainter.
function layerPose(depth: number) {
  return {
    translateY: depth * deck.layerOffset,
    scaleX: deck.layerWidths[depth - 1],
    // The layer is the text color; its opacity is the tint.
    opacity: deck.layerTints[depth - 1],
  };
}

// The system "reduce motion" setting, kept current.
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

type LayerProps = {
  depth: number;
  // Room the container keeps below the top card.
  reserve: number;
  reduceMotion: boolean;
};

// A textless layer. When its depth changes (the card in front was dismissed) it
// moves to the new pose; with reduce motion it switches at once.
function Layer({ depth, reserve, reduceMotion }: LayerProps) {
  const pose = layerPose(depth);
  const translateY = useSharedValue(pose.translateY);
  const scaleX = useSharedValue(pose.scaleX);
  const opacity = useSharedValue(pose.opacity);

  useEffect(() => {
    const target = layerPose(depth);
    if (reduceMotion) {
      translateY.value = target.translateY;
      scaleX.value = target.scaleX;
      opacity.value = target.opacity;
    } else {
      const timing = { duration: deck.settleDuration };
      translateY.value = withTiming(target.translateY, timing);
      scaleX.value = withTiming(target.scaleX, timing);
      opacity.value = withTiming(target.opacity, timing);
    }
  }, [depth, reduceMotion, translateY, scaleX, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { scaleX: scaleX.value }],
  }));

  return (
    <Animated.View
      testID={LAYER_TEST_ID}
      pointerEvents="none"
      // Decoration only: hidden from screen readers.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.layer, { bottom: reserve }, style]}
    >
      <Surface elevation={0} style={styles.layerSurface}>
        <View />
      </Surface>
    </Animated.View>
  );
}

type TopCardProps = {
  item: StackItem;
  label: string;
  hint: string;
  swipeActionLabel: string;
  // The count badge, on the card's top-right corner.
  badge: ReactNode;
  // True when this card replaced one that was dismissed: it moves up from the
  // first layer's pose into the front.
  settle: boolean;
  reduceMotion: boolean;
  onPress: () => void;
  onSwipe: () => Promise<boolean>;
};

function TopCard({
  item,
  label,
  hint,
  swipeActionLabel,
  badge,
  settle,
  reduceMotion,
  onPress,
  onSwipe,
}: TopCardProps) {
  const translateX = useSharedValue(0);
  // 0 is the first layer's pose, 1 the front.
  const lift = useSharedValue(settle ? 0 : 1);
  const { width } = useWindowDimensions();
  // The card slides off only after the dismissal is saved, so a failed save
  // brings it back instead of leaving it half gone.
  const [busy, setBusy] = useState(false);

  // Set synchronously (state would only change after a re-render): onSwipe runs
  // at most once per card, however many swipe ends or accessibility actions
  // arrive. TopCard is keyed per card, so a new top card starts clear.
  const [once] = useState(createOnce);

  useEffect(() => {
    if (!settle) return;
    lift.value = reduceMotion ? 1 : withTiming(1, { duration: deck.settleDuration });
  }, [settle, reduceMotion, lift]);

  const finish = async () => {
    if (!once.tryStart()) return;
    setBusy(true);
    const ok = await onSwipe();
    if (!ok) {
      once.reset();
      setBusy(false);
      translateX.value = reduceMotion ? 0 : withSpring(0);
    }
  };

  const pan = Gesture.Pan()
    .withTestId(SWIPE_TEST_ID)
    .enabled(!busy)
    // Only a sideways move to the right starts it: taps and vertical scrolling
    // are left alone.
    .activeOffsetX(motion.swipeStart)
    .failOffsetY([-motion.swipeStart, motion.swipeStart])
    .onUpdate((event) => {
      translateX.value = Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      if (shouldDismissSwipe(event.translationX, event.velocityX)) {
        if (reduceMotion) {
          // No slide: the card simply goes.
          translateX.value = 0;
          scheduleOnRN(finish);
        } else {
          translateX.value = withTiming(
            width,
            { duration: motion.swipeExitDuration },
            (done) => {
              if (done) scheduleOnRN(finish);
            },
          );
        }
      } else {
        translateX.value = reduceMotion ? 0 : withSpring(0);
      }
    });

  const first = layerPose(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: first.translateY * (1 - lift.value) },
      { scaleX: first.scaleX + (1 - first.scaleX) * lift.value },
    ],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.top, animatedStyle]}>
        <Surface style={styles.card} elevation={2}>
          {/* The clip sits inside the Surface so its shadow is not cut off. */}
          <View style={styles.clip}>
            <TouchableRipple
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={hint}
              accessibilityActions={[{ name: 'dismiss', label: swipeActionLabel }]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === 'dismiss') void finish();
              }}
            >
              <View style={styles.content}>{item.content}</View>
            </TouchableRipple>
          </View>
        </Surface>
        {badge}
      </Animated.View>
    </GestureDetector>
  );
}

// Custom component: Paper has no card deck. The top card is a Paper Surface with
// a TouchableRipple (tap) in a Reanimated view with a Pan gesture (swipe right
// to dismiss). Up to two textless Paper Surface layers peek out below it (offset,
// widths and tints from the theme's `deck`), and with two or more cards a
// count badge (the AppBadge wrapper) sits inside its top-right corner. After a
// dismissal the next card and the layers move up; with reduce motion on nothing
// is animated. Use this wrapper for any deck; do not re-implement it.
export function CardStack({
  items,
  topLabel,
  topHint,
  swipeActionLabel,
  countLabel,
  onPressTop,
  onSwipeTop,
}: Props) {
  const reduceMotion = useReduceMotion();
  // The first top card this deck showed; any other top card replaced a dismissed
  // one and moves up into place.
  const [firstKey] = useState(() => items[0]?.key);
  if (items.length === 0) return null;
  const [top, ...rest] = items;
  const layers = rest.slice(0, layerCount(items.length));
  const reserve = layers.length * deck.layerOffset;

  return (
    <View style={{ paddingBottom: reserve }}>
      {layers
        .map((item, index) => ({ item, depth: index + 1 }))
        .reverse()
        .map(({ item, depth }) => (
          <Layer key={item.key} depth={depth} reserve={reserve} reduceMotion={reduceMotion} />
        ))}
      <TopCard
        key={top.key}
        item={top}
        label={topLabel}
        hint={topHint}
        swipeActionLabel={swipeActionLabel}
        badge={
          items.length >= 2 ? (
            <View style={styles.badge} pointerEvents="none">
              <AppBadge count={items.length} accessibilityLabel={countLabel} />
            </View>
          ) : null
        }
        settle={top.key !== firstKey}
        reduceMotion={reduceMotion}
        onPress={onPressTop}
        onSwipe={onSwipeTop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    zIndex: 1,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius,
  },
  clip: {
    borderRadius: radius,
    overflow: 'hidden',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  // As tall as the top card (the container reserves room below it for the
  // offsets, and each layer's bottom is set to that room), moved by transforms.
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  layerSurface: {
    flex: 1,
    backgroundColor: colors.text,
    borderRadius: radius,
  },
  badge: {
    position: 'absolute',
    top: deck.badgeInset,
    right: deck.badgeInset,
  },
});
