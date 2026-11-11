import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Portal } from 'react-native-paper';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { colors, layout, spacing } from '@/theme';

// What is under the screen's content: the screen edge (stack screens), the tab
// bar, or the tab bar with the FAB over the content.
type ScreenBottom = 'edge' | 'tabBar' | 'fab';

type Props = {
  children: ReactNode;
  overlay?: ReactNode;
  bottom?: ScreenBottom;
  // For a screen shown without a navigator header (the start-up error screens):
  // adds the status bar inset on top, so the content does not sit under it.
  headerless?: boolean;
};

const scrollEnds = StyleSheet.create({
  edge: { paddingBottom: layout.scrollEnd },
  tabBar: { paddingBottom: layout.scrollEndTabBar },
  fab: { paddingBottom: layout.fabClearance },
});

const ScreenBottomContext = createContext<ScreenBottom>('edge');

// The bottom padding for the content container of a vertical scroll view inside
// a Screen. Screen itself has no bottom padding, so the content scrolls right
// down to the tab bar; the space after the last item (enough to clear the FAB
// where there is one) is inside the scroll view instead.
export function useScrollEndStyle() {
  return scrollEnds[useContext(ScreenBottomContext)];
}

type ScrollProps = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardShouldPersistTaps?: 'always' | 'never' | 'handled';
};

// A vertical ScrollView with that bottom padding, for a component that renders
// both the Screen and its scroll view (it cannot call the hook itself, because
// it is outside the Screen).
export function ScreenScroll({ children, contentContainerStyle, keyboardShouldPersistTaps }: ScrollProps) {
  const scrollEnd = useScrollEndStyle();
  return (
    <ScrollView
      testID="screen-scroll"
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      contentContainerStyle={[contentContainerStyle, scrollEnd]}
    >
      {children}
    </ScrollView>
  );
}

// The Portal.Host is scoped to the screen so overlays (such as the FAB group)
// render inside the scene, above the tab bar, not over it.
export function Screen({ children, overlay, bottom = 'edge', headerless = false }: Props) {
  // Read from the context (not useSafeAreaInsets) so a missing provider means
  // no inset instead of a crash.
  const insets = useContext(SafeAreaInsetsContext);
  const top = headerless ? { paddingTop: layout.screenTop + (insets?.top ?? 0) } : null;
  return (
    <Portal.Host>
      <ScreenBottomContext.Provider value={bottom}>
        <View style={styles.root}>
          <View testID="screen-content" style={[styles.content, top]}>
            {children}
          </View>
          {overlay}
        </View>
      </ScreenBottomContext.Provider>
    </Portal.Host>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: layout.screenTop,
  },
});
