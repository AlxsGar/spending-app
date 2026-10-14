import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet } from 'react-native';
import { Modal, Portal } from 'react-native-paper';

import { useSuccessStore } from '@/stores/success-store';
import type { SuccessTone } from '@/stores/success-store';
import { colors, motion, radius, sizes, spacing } from '@/theme';
import type { ColorToken } from '@/theme';

import { AppIcon } from './AppIcon';
import { AppText } from './AppText';

const TONE_COLOR: Record<SuccessTone, ColorToken> = {
  positive: 'accent',
  negative: 'alert',
};

type CardProps = {
  icon: string;
  tone: SuccessTone;
  message: string;
  amountText?: string;
  onPress: () => void;
};

function SuccessCard({ icon, tone, message, amountText, onPress }: CardProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [scale] = useState(() => new Animated.Value(motion.successStartScale));

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      const fade = Animated.timing(opacity, {
        toValue: 1,
        duration: motion.fadeDuration,
        useNativeDriver: true,
      });
      if (reduce) {
        // No bounce: the card appears at full size and only fades in.
        animation = Animated.parallel([
          fade,
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]);
      } else {
        animation = Animated.parallel([
          fade,
          Animated.spring(scale, {
            toValue: 1,
            friction: motion.springFriction,
            tension: motion.springTension,
            useNativeDriver: true,
          }),
        ]);
      }
      animation.start();
    });
    return () => {
      cancelled = true;
      animation?.stop();
    };
  }, [opacity, scale]);

  const label = amountText ? `${message}, ${amountText}` : message;

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="alert"
        accessibilityLabel={label}
        onPress={onPress}
        style={styles.card}
      >
        <AppIcon name={icon} size={sizes.successIcon} color={TONE_COLOR[tone]} />
        <AppText variant="bodyStrong" align="center">
          {message}
        </AppText>
        {amountText ? (
          <AppText
            variant="title"
            align="center"
            color={TONE_COLOR[tone]}
            style={styles.amount}
          >
            {amountText}
          </AppText>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

// Custom component: Paper has no toast-style confirmation card. Built from
// Paper's Portal and Modal. Mount ONE host near the app root (inside
// PaperProvider) and call showSuccess() from anywhere. The card auto-dismisses,
// and a tap on it or on the backdrop dismisses it sooner.
export function SuccessHost() {
  const current = useSuccessStore((state) => state.current);
  const hide = useSuccessStore((state) => state.hide);
  // Keep the last card so it stays visible while Modal fades out.
  const [last, setLast] = useState(current);
  if (current && current !== last) setLast(current);

  const id = current?.id;
  useEffect(() => {
    if (id === undefined || !current) return;
    AccessibilityInfo.announceForAccessibility(
      current.amountText ? `${current.message}, ${current.amountText}` : current.message,
    );
    // Cleared on dismiss (id changes), on a newer card, and on unmount.
    const timer = setTimeout(() => hide(id), motion.successDuration);
    return () => clearTimeout(timer);
    // current is only read when the id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hide]);

  return (
    <Portal>
      <Modal
        visible={current !== null}
        onDismiss={() => hide()}
        contentContainerStyle={styles.container}
      >
        {last ? (
          <SuccessCard
            key={last.id}
            icon={last.icon}
            tone={last.tone}
            message={last.message}
            amountText={last.amountText}
            onPress={() => hide()}
          />
        ) : null}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    minWidth: sizes.successCardMinWidth,
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius,
    backgroundColor: colors.surface,
  },
  amount: {
    fontVariant: ['tabular-nums'],
  },
});
