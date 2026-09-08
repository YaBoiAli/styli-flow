import { type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/constants/theme';

type ScreenProps = {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
};

export function Screen({
  children,
  footer,
  scroll = true,
  style,
  contentStyle,
}: ScreenProps) {
  const body = scroll ? (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, styles.fill, contentStyle]}>{children}</View>
  );

  const content = (
    <View style={styles.column}>
      <View style={styles.body}>{body}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.safe, style]}
      edges={['top', 'left', 'right', 'bottom']}
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
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    paddingTop: spacing.md,
  },
  footer: {
    zIndex: 20,
    elevation: 8,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
});
