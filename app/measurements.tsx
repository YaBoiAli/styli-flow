import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BackButton } from '@/components/BackButton';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { usePreferences } from '@/context/PreferencesContext';
import { colors, radii, spacing, typography } from '@/constants/theme';
import {
  SKIN_TONES,
  type BodyMeasurements,
  type GenderPreference,
  type MeasurementUnit,
  type SkinTone,
} from '@/types';

const GENDER_OPTIONS: Array<{ value: GenderPreference; label: string }> = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'any', label: 'Any' },
];

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.45359237;

const ADVANCED_FIELDS = [
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'chest', label: 'Chest' },
  { key: 'waist', label: 'Waist' },
  { key: 'hips', label: 'Hips' },
  { key: 'thigh', label: 'Thighs' },
  { key: 'inseam', label: 'Inseam' },
] as const;

type AdvancedKey = (typeof ADVANCED_FIELDS)[number]['key'];

type AdvancedDraft = Record<AdvancedKey, string>;

const EMPTY_ADVANCED: AdvancedDraft = {
  shoulders: '',
  chest: '',
  waist: '',
  hips: '',
  thigh: '',
  inseam: '',
};

export default function MeasurementsScreen() {
  const router = useRouter();
  const { bodyMeasurements, setBodyMeasurements, gender, setGender, skinTone, setSkinTone } =
    usePreferences();
  const initial = draftFromSaved(bodyMeasurements);

  const [unit, setUnit] = useState<MeasurementUnit>(initial.unit);
  const [feet, setFeet] = useState(initial.feet);
  const [inches, setInches] = useState(initial.inches);
  const [height, setHeight] = useState(initial.height);
  const [weight, setWeight] = useState(initial.weight);
  const [advanced, setAdvanced] = useState<AdvancedDraft>(initial.advanced);
  const [showAdvanced, setShowAdvanced] = useState(initial.hasAdvanced);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
  }, [feet, inches, height, weight, advanced]);

  function switchUnit(next: MeasurementUnit) {
    if (next === unit) return;
    if (next === 'metric') {
      const totalInches =
        (feet.trim() ? toNumber(feet) : 0) * 12 +
        (inches.trim() ? toNumber(inches) : 0);
      if (feet.trim() || inches.trim()) {
        setHeight(formatNumber(totalInches * CM_PER_INCH));
      }
      if (weight.trim()) {
        setWeight(formatNumber(toNumber(weight) * KG_PER_LB));
      }
    } else {
      if (height.trim()) {
        const totalInches = toNumber(height) / CM_PER_INCH;
        const wholeFeet = Math.floor(totalInches / 12);
        const remain = Math.round(totalInches - wholeFeet * 12);
        setFeet(String(wholeFeet));
        setInches(String(remain === 12 ? 0 : remain));
        if (remain === 12) setFeet(String(wholeFeet + 1));
      }
      if (weight.trim()) {
        setWeight(formatNumber(toNumber(weight) / KG_PER_LB));
      }
    }

    setAdvanced((current) => {
      const converted = { ...current };
      for (const field of ADVANCED_FIELDS) {
        const raw = current[field.key].trim();
        if (!raw) continue;
        const value = toNumber(raw);
        converted[field.key] =
          next === 'metric'
            ? formatNumber(value * CM_PER_INCH)
            : formatNumber(value / CM_PER_INCH);
      }
      return converted;
    });
    setUnit(next);
    setError(null);
  }

  function handleContinue() {
    const parsed = parseDraft({ unit, feet, inches, height, weight, advanced });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setBodyMeasurements(parsed.measurements);
    router.push('/style');
  }

  const lengthUnit = unit === 'imperial' ? 'in' : 'cm';
  const weightUnit = unit === 'imperial' ? 'lb' : 'kg';

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <PrimaryButton
          label="Continue"
          testID="btn-continue-measurements"
          disabled={!gender || !skinTone}
          onPress={handleContinue}
        />
      }
    >
      <View style={styles.top}>
        <BackButton fallbackHref="/you" />
        <OnboardingProgress step="Fit" />
        <Text style={styles.title}>How should it fit?</Text>
        <Text style={styles.subtitle}>
          Height and weight are enough to start. Advanced metrics tighten the cut.
        </Text>
      </View>

      <View style={styles.fields}>
        <Text style={styles.sectionLabel}>Shop for</Text>
        <View style={styles.unitRow}>
          {GENDER_OPTIONS.map((option) => (
            <UnitChip
              key={option.value}
              label={option.label}
              selected={gender === option.value}
              onPress={() => setGender(option.value)}
              testID={`chip-gender-${option.value}`}
            />
          ))}
        </View>
        <Text style={styles.fieldLabel}>Skin tone</Text>
        <Text style={styles.skinHint}>
          Helps the stylist pick colors that sit well on you.
        </Text>
        <View style={styles.skinRow}>
          {SKIN_TONES.map((option) => (
            <SkinToneSwatch
              key={option.value}
              option={option}
              selected={skinTone === option.value}
              onPress={() => setSkinTone(option.value)}
            />
          ))}
        </View>
      </View>

      <View style={styles.fields}>
        <Text style={styles.sectionLabel}>Basics</Text>
        {unit === 'imperial' ? (
          <View style={styles.split}>
            <Field
              label="Height"
              value={feet}
              onChange={setFeet}
              suffix="ft"
              testID="input-height-feet"
            />
            <Field
              label=" "
              value={inches}
              onChange={setInches}
              suffix="in"
              testID="input-height-inches"
            />
          </View>
        ) : (
          <Field
            label="Height"
            value={height}
            onChange={setHeight}
            suffix="cm"
            testID="input-height-cm"
          />
        )}
        <Field
          label="Weight"
          value={weight}
          onChange={setWeight}
          suffix={weightUnit}
          testID="input-weight"
        />
        <View style={styles.unitRow}>
          <UnitChip
            label="ft / lb"
            selected={unit === 'imperial'}
            onPress={() => switchUnit('imperial')}
          />
          <UnitChip
            label="cm / kg"
            selected={unit === 'metric'}
            onPress={() => switchUnit('metric')}
          />
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: showAdvanced }}
        onPress={() => setShowAdvanced((open) => !open)}
        style={styles.advancedToggle}
      >
        <View style={styles.advancedCopy}>
          <Text style={styles.advancedTitle}>Advanced metrics</Text>
          <Text style={styles.advancedHint}>
            Shoulders, waist, thighs, and the rest. Optional.
          </Text>
        </View>
        <Ionicons
          name={showAdvanced ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.text}
        />
      </Pressable>

      {showAdvanced ? (
        <View style={styles.fields}>
          {ADVANCED_FIELDS.map((field) => (
            <Field
              key={field.key}
              label={field.label}
              value={advanced[field.key]}
              onChange={(text) =>
                setAdvanced((current) => ({ ...current, [field.key]: text }))
              }
              suffix={lengthUnit}
              testID={`input-${field.key}`}
            />
          ))}
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </Screen>
  );
}

function SkinToneSwatch({
  option,
  selected,
  onPress,
}: {
  option: { value: SkinTone; label: string; swatch: string };
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={option.label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.skinOption}
      testID={`chip-skin-${option.value}`}
    >
      <View
        style={[
          styles.skinSwatch,
          { backgroundColor: option.swatch },
          selected && styles.skinSwatchSelected,
        ]}
      />
      <Text style={[styles.skinLabel, selected && styles.skinLabelSelected]}>
        {option.label}
      </Text>
    </Pressable>
  );
}

function UnitChip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
      testID={testID}
    >
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChange,
  suffix,
  testID,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  suffix: string;
  testID: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(sanitizeNumber(text))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          testID={testID}
        />
        <Text style={styles.suffix}>{suffix}</Text>
      </View>
    </View>
  );
}

function sanitizeNumber(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, '');
  const [whole, ...rest] = cleaned.split('.');
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, 1)}`;
}

function toNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatNumber(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function lengthToCm(value: number, unit: MeasurementUnit): number {
  return unit === 'imperial' ? value * CM_PER_INCH : value;
}

function weightToKg(value: number, unit: MeasurementUnit): number {
  return unit === 'imperial' ? value * KG_PER_LB : value;
}

function parseOptionalCm(
  raw: string,
  unit: MeasurementUnit,
): { ok: true; value: number | null } | { ok: false } {
  if (!raw.trim()) return { ok: true, value: null };
  const value = toNumber(raw);
  if (!Number.isFinite(value) || value <= 0) return { ok: false };
  const cm = lengthToCm(value, unit);
  if (cm < 20 || cm > 200) return { ok: false };
  return { ok: true, value: Math.round(cm * 10) / 10 };
}

function parseDraft(draft: {
  unit: MeasurementUnit;
  feet: string;
  inches: string;
  height: string;
  weight: string;
  advanced: AdvancedDraft;
}):
  | { ok: true; measurements: BodyMeasurements }
  | { ok: false; message: string } {
  let heightCm = NaN;
  if (draft.unit === 'imperial') {
    const ft = toNumber(draft.feet);
    const inch = draft.inches.trim() ? toNumber(draft.inches) : 0;
    if (!draft.feet.trim() || !Number.isFinite(ft) || !Number.isFinite(inch)) {
      return { ok: false, message: 'Add your height and weight to continue.' };
    }
    if (inch < 0 || inch >= 12) {
      return { ok: false, message: 'Inches should be between 0 and 11.' };
    }
    heightCm = (ft * 12 + inch) * CM_PER_INCH;
  } else if (!draft.height.trim()) {
    return { ok: false, message: 'Add your height and weight to continue.' };
  } else {
    heightCm = toNumber(draft.height);
  }

  if (!draft.weight.trim()) {
    return { ok: false, message: 'Add your height and weight to continue.' };
  }

  const weightKg = weightToKg(toNumber(draft.weight), draft.unit);
  if (heightCm < 120 || heightCm > 230) {
    return { ok: false, message: 'That height looks off. Check the number.' };
  }
  if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 250) {
    return { ok: false, message: 'That weight looks off. Check the number.' };
  }

  const advancedCm: Record<AdvancedKey, number | null> = {
    shoulders: null,
    chest: null,
    waist: null,
    hips: null,
    thigh: null,
    inseam: null,
  };

  for (const field of ADVANCED_FIELDS) {
    const parsed = parseOptionalCm(draft.advanced[field.key], draft.unit);
    if (!parsed.ok) {
      return {
        ok: false,
        message: `Check the ${field.label.toLowerCase()} measurement.`,
      };
    }
    advancedCm[field.key] = parsed.value;
  }

  return {
    ok: true,
    measurements: {
      unit: draft.unit,
      heightCm: Math.round(heightCm * 10) / 10,
      weightKg: Math.round(weightKg * 10) / 10,
      shouldersCm: advancedCm.shoulders,
      chestCm: advancedCm.chest,
      waistCm: advancedCm.waist,
      hipsCm: advancedCm.hips,
      thighCm: advancedCm.thigh,
      inseamCm: advancedCm.inseam,
    },
  };
}

function draftFromSaved(saved: BodyMeasurements | null): {
  unit: MeasurementUnit;
  feet: string;
  inches: string;
  height: string;
  weight: string;
  advanced: AdvancedDraft;
  hasAdvanced: boolean;
} {
  if (!saved) {
    return {
      unit: 'imperial',
      feet: '',
      inches: '',
      height: '',
      weight: '',
      advanced: EMPTY_ADVANCED,
      hasAdvanced: false,
    };
  }

  const advanced: AdvancedDraft = {
    shoulders: displayLength(saved.shouldersCm, saved.unit),
    chest: displayLength(saved.chestCm, saved.unit),
    waist: displayLength(saved.waistCm, saved.unit),
    hips: displayLength(saved.hipsCm, saved.unit),
    thigh: displayLength(saved.thighCm, saved.unit),
    inseam: displayLength(saved.inseamCm, saved.unit),
  };

  const totalInches = saved.heightCm / CM_PER_INCH;
  const wholeFeet = Math.floor(totalInches / 12);
  let remain = Math.round(totalInches - wholeFeet * 12);
  let feet = wholeFeet;
  if (remain === 12) {
    feet += 1;
    remain = 0;
  }

  return {
    unit: saved.unit,
    feet: saved.unit === 'imperial' ? String(feet) : '',
    inches: saved.unit === 'imperial' ? String(remain) : '',
    height: saved.unit === 'metric' ? formatNumber(saved.heightCm) : '',
    weight: formatNumber(
      saved.unit === 'imperial' ? saved.weightKg / KG_PER_LB : saved.weightKg,
    ),
    advanced,
    hasAdvanced: Object.values(advanced).some((value) => value.length > 0),
  };
}

function displayLength(
  cm: number | null,
  unit: MeasurementUnit,
): string {
  if (cm == null) return '';
  return formatNumber(unit === 'imperial' ? cm / CM_PER_INCH : cm);
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  top: {
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.text,
  },
  subtitle: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  unitRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexShrink: 0,
  },
  chipSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  chipLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  chipLabelSelected: {
    color: colors.text,
  },
  skinHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  skinRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  skinOption: {
    alignItems: 'center',
    gap: spacing.xs,
    width: 52,
  },
  skinSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  skinSwatchSelected: {
    borderColor: colors.borderSelected,
  },
  skinLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
  skinLabelSelected: {
    color: colors.text,
  },
  fields: {
    gap: spacing.md,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  split: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  field: {
    flex: 1,
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    minHeight: 18,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 56,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  suffix: {
    ...typography.label,
    color: colors.textMuted,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  advancedCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  advancedTitle: {
    ...typography.label,
    color: colors.text,
  },
  advancedHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
