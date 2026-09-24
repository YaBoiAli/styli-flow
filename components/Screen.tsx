import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, tabBarLayout } from '@/constants/theme';

type ScreenProps = {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  footerStyle?: ViewStyle;
  /** Lets a screen-level wallpaper show through. Used only on Get Started. */
  transparent?: boolean;
  /** Extra space so content and footers clear the floating tab pill. */
  overTabs?: boolean;
};

export function Screen({
  children,
  footer,
  scroll = true,
  style,
  contentStyle,
  footerStyle,
  transparent = false,
  overTabs = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const tabClearance =
    Math.max(insets.bottom, tabBarLayout.minSafe) +
    tabBarLayout.lift +
    tabBarLayout.height +
    tabBarLayout.gap;
  const aboveTabs = overTabs ? { paddingBottom: tabClearance } : null;

  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, aboveTabs, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, aboveTabs, contentStyle]}>{children}</View>
  );

  const content = (
    <View style={styles.column}>
      <View style={styles.body}>{body}</View>
      {footer ? (
        <View
          style={[
            styles.footer,
            transparent && styles.footerTransparent,
            aboveTabs,
            footerStyle,
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, transparent && styles.safeTransparent, style]}
      edges={overTabs || transparent ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']}
    >
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.fill} behavior="padding">
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  fill: {
    flex: 1,
  },
  column: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.lg,
  },
  footer: {
    zIndex: 20,
    elevation: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  safeTransparent: {
    backgroundColor: 'transparent',
  },
  footerTransparent: {
    backgroundColor: 'transparent',
    borderTopWidth: 0,
  },
});
