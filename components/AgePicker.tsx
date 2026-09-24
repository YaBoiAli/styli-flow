import { useEffect, useMemo, useRef } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, radii, typography } from '@/constants/theme';

const MIN_AGE = 0;
const MAX_AGE = 80;
const ITEM_HEIGHT = 52;
const VISIBLE = 5;
const SNAP_MS = 220;

type AgePickerProps = {
  value: number;
  onChange: (age: number) => void;
};

export function AgePicker({ value, onChange }: AgePickerProps) {
  const ages = useMemo(
    () => Array.from({ length: MAX_AGE - MIN_AGE + 1 }, (_, i) => MIN_AGE + i),
    [],
  );
  const list = useRef<ScrollView>(null);
  const lastEmitted = useRef(value);
  const snapping = useRef(false);
  const snapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pad = ITEM_HEIGHT * Math.floor(VISIBLE / 2);

  useEffect(() => {
    lastEmitted.current = value;
  }, [value]);

  useEffect(() => {
    requestAnimationFrame(() => {
      list.current?.scrollTo({ y: value * ITEM_HEIGHT, animated: false });
    });
    return () => {
      if (snapTimer.current) clearTimeout(snapTimer.current);
    };
    // Position once on mount so the wheel starts at 0 without fighting later scrolls.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ageFromOffset(offsetY: number): number {
    const index = Math.round(offsetY / ITEM_HEIGHT);
    return ages[Math.max(0, Math.min(ages.length - 1, index))];
  }

  function emit(age: number) {
    if (age === lastEmitted.current) return;
    lastEmitted.current = age;
    onChange(age);
  }

  function handleScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (snapping.current) return;
    emit(ageFromOffset(event.nativeEvent.contentOffset.y));
  }

  function snapTo(age: number, fromOffset?: number) {
    const target = age * ITEM_HEIGHT;
    if (fromOffset !== undefined && Math.abs(fromOffset - target) < 1.5) {
      emit(age);
      return;
    }
    emit(age);
    snapping.current = true;
    list.current?.scrollTo({ y: target, animated: true });
    if (snapTimer.current) clearTimeout(snapTimer.current);
    snapTimer.current = setTimeout(() => {
      snapping.current = false;
    }, SNAP_MS);
  }

  function handleSettle(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (snapping.current) return;
    const y = event.nativeEvent.contentOffset.y;
    snapTo(ageFromOffset(y), y);
  }

  return (
    <View style={styles.frame} testID="age-picker">
      <View pointerEvents="none" style={styles.highlight} />
      <ScrollView
        ref={list}
        style={styles.list}
        nestedScrollEnabled
        snapToInterval={Platform.OS === 'web' ? undefined : ITEM_HEIGHT}
        snapToAlignment="start"
        disableIntervalMomentum
        decelerationRate="fast"
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        onMomentumScrollEnd={handleSettle}
        onScrollEndDrag={Platform.OS === 'web' ? handleSettle : undefined}
      >
        <View style={{ height: pad }} />
        {ages.map((age) => {
          const selected = age === value;
          return (
            <Pressable
              key={age}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${age} years old`}
              onPress={() => snapTo(age)}
              style={styles.item}
              testID={`age-${age}`}
            >
              <Text style={[styles.age, selected && styles.ageSelected]}>{age}</Text>
            </Pressable>
          );
        })}
        <View style={{ height: pad }} />
      </ScrollView>
    </View>
  );
}

export const DEFAULT_AGE = 0;
export const MIN_SELECTABLE_AGE = 13;

const styles = StyleSheet.create({
  frame: {
    height: ITEM_HEIGHT * VISIBLE,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  highlight: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: ITEM_HEIGHT * 2,
    height: ITEM_HEIGHT,
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1.5,
    borderColor: colors.borderSelected,
  },
  list: {
    zIndex: 1,
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  age: {
    fontFamily: typography.body.fontFamily,
    fontSize: 24,
    lineHeight: 30,
    color: colors.textMuted,
  },
  ageSelected: {
    fontFamily: typography.title.fontFamily,
    fontSize: 24,
    lineHeight: 30,
    color: colors.text,
  },
});
