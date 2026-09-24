import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
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
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import { APPROVED_BRANDS, NO_PREFERENCE_LABEL } from '@/constants/brands';
import { FREE_GENERATION_LIMIT } from '@/constants/subscriptions';
import { colors, radii, spacing, typography } from '@/constants/theme';
import {
  getBudgetRange,
  premiumStatusLabel,
  trackEvent,
} from '@/lib/analytics';
import { submitBrandRequest } from '@/lib/brandRequests';
import { normalizeWebUrl } from '@/lib/urls';

export default function BrandsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    inspirationSources,
    selectedBrands,
    brandRequests,
    toggleBrand,
    clearBrands,
    addBrandRequest,
    removeBrandRequest,
  } = usePreferences();
  const { isPremium, checkCanGenerate, generationsRemaining } = useSubscription();
  const [checking, setChecking] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    if (!selectedStyle) {
      router.replace('/style');
    } else if (!selectedOccasion) {
      router.replace('/occasion');
    } else if (!selectedBudget) {
      router.replace('/budget');
    }
  }, [selectedStyle, selectedOccasion, selectedBudget, router]);

  const noPreference = selectedBrands.length === 0;

  function handleBrandPress(brand: string) {
    const selecting = !selectedBrands.includes(brand);
    toggleBrand(brand);
    if (selecting) {
      trackEvent('brand_preference_selected', { brand });
    }
  }

  function handleNoPreference() {
    clearBrands();
    trackEvent('brand_preference_selected', { brand: 'no_preference' });
  }

  async function handleBuild() {
    setChecking(true);
    try {
      const allowed = await checkCanGenerate();
      if (!allowed) {
        router.push('/paywall?redirect=/generation');
        return;
      }
      trackEvent('onboarding_completed', {
        style: selectedStyle ?? undefined,
        occasion: selectedOccasion ?? undefined,
        budget: selectedBudget ?? undefined,
        budget_range: selectedBudget
          ? getBudgetRange(selectedBudget)
          : undefined,
        premium_status: premiumStatusLabel(isPremium),
        inspiration_count: inspirationSources.length,
        brand_count: selectedBrands.length,
        requested_brand_count: brandRequests.length,
      });
      router.push('/generation');
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        <View style={styles.footer}>
          {!isPremium ? (
            <Text style={styles.quota} testID="generation-quota">
              {generationsRemaining === Number.POSITIVE_INFINITY
                ? 'Unlimited AI fits'
                : `${Math.min(generationsRemaining, FREE_GENERATION_LIMIT)} of ${FREE_GENERATION_LIMIT} free fits left`}
            </Text>
          ) : (
            <Text style={styles.quota}>Unlimited AI fits with Vibe Pro</Text>
          )}
          <PrimaryButton
            label="Build My Fit"
            testID="btn-build-fit"
            loading={checking}
            onPress={() => void handleBuild()}
          />
        </View>
      }
    >
      <View style={styles.top}>
        <BackButton fallbackHref="/inspiration" />
        <OnboardingProgress step="Brands" />
        <Text style={styles.title}>Where should we shop?</Text>
        <Text style={styles.subtitle}>
          Choose the brands you&apos;d like us to use.
        </Text>
      </View>

      <View style={styles.chips}>
        <BrandChip
          label={NO_PREFERENCE_LABEL}
          selected={noPreference}
          onPress={handleNoPreference}
        />
        {APPROVED_BRANDS.map((brand) => (
          <BrandChip
            key={brand}
            label={brand}
            selected={selectedBrands.includes(brand)}
            onPress={() => handleBrandPress(brand)}
          />
        ))}
      </View>

      <Text style={styles.selectionNote}>
        {noPreference
          ? 'Shopping every brand on the list.'
          : `Shopping ${selectedBrands.length} ${selectedBrands.length === 1 ? 'brand' : 'brands'}.`}
      </Text>

      <PrimaryButton
        label="+ Add a brand"
        variant="secondary"
        onPress={() => setFormOpen(true)}
        testID="btn-add-brand"
      />

      {brandRequests.length > 0 ? (
        <View style={styles.requests}>
          <Text style={styles.sectionLabel}>Your requests</Text>
          {brandRequests.map((request) => (
            <View key={request.id} style={styles.requestRow}>
              <View style={styles.requestCopy}>
                <Text style={styles.requestName}>{request.name}</Text>
                <Text style={styles.requestUrl} numberOfLines={1}>
                  {request.website}
                </Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeLabel}>Requested</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${request.name}`}
                hitSlop={12}
                onPress={() => removeBrandRequest(request.id)}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
          <Text style={styles.requestNote}>
            We&apos;ll review requested brands before styling with them. Your fit
            uses the brands above for now.
          </Text>
        </View>
      ) : null}

      <View style={styles.suggest}>
        <Text style={styles.suggestTitle}>Can&apos;t find your brand?</Text>
        <Text style={styles.suggestBody}>
          Tell us which brand you want and we&apos;ll look into adding it.
        </Text>
        <PrimaryButton
          label="Suggest another brand"
          variant="ghost"
          onPress={() => setFormOpen(true)}
          testID="btn-suggest-brand"
        />
      </View>

      <BrandRequestModal
        visible={formOpen}
        onCancel={() => setFormOpen(false)}
        existingNames={[
          ...APPROVED_BRANDS,
          ...brandRequests.map((request) => request.name),
        ]}
        onSubmit={(name, website) => {
          const request = {
            id: makeUuid(),
            name,
            website,
            status: 'requested' as const,
            createdAt: new Date().toISOString(),
          };
          addBrandRequest(request);
          void submitBrandRequest(request, user?.id);
          trackEvent('brand_requested', { brand: name });
          setFormOpen(false);
        }}
      />
    </Screen>
  );
}

function BrandChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
      testID={`brand-chip-${label}`}
    >
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={18}
        color={selected ? colors.text : colors.textMuted}
      />
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function BrandRequestModal({
  visible,
  onCancel,
  onSubmit,
  existingNames,
}: {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (name: string, website: string) => void;
  existingNames: string[];
}) {
  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setName('');
      setWebsite('');
      setError(null);
    }
  }, [visible]);

  function handleSubmit() {
    const trimmedName = name.trim().replace(/\s+/g, ' ');
    if (!trimmedName) {
      setError('Add the brand name.');
      return;
    }
    if (trimmedName.length > 80) {
      setError('Keep the brand name under 80 characters.');
      return;
    }
    const lower = trimmedName.toLowerCase();
    if (existingNames.some((existing) => existing.toLowerCase() === lower)) {
      setError(`${trimmedName} is already on the list.`);
      return;
    }
    const url = normalizeWebUrl(website);
    if (!url) {
      setError('Enter a valid website, like https://fearofgod.com.');
      return;
    }
    onSubmit(trimmedName, url.toString());
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          style={styles.backdrop}
          accessibilityLabel="Close"
          onPress={onCancel}
        />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Add another brand</Text>
            <Text style={styles.subtitle}>Have a brand you want us to use?</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Brand Name</Text>
            <TextInput
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) setError(null);
              }}
              placeholder="Fear of God"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              style={styles.input}
              testID="input-brand-name"
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Brand Website</Text>
            <TextInput
              value={website}
              onChangeText={(text) => {
                setWebsite(text);
                if (error) setError(null);
              }}
              placeholder="https://fearofgod.com"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
              style={styles.input}
              testID="input-brand-website"
            />
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.sheetActions}>
            <PrimaryButton
              label="Cancel"
              variant="secondary"
              style={styles.sheetAction}
              onPress={onCancel}
              testID="btn-cancel-brand"
            />
            <PrimaryButton
              label="Add Brand"
              style={styles.sheetAction}
              onPress={handleSubmit}
              testID="btn-submit-brand"
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  chipSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  chipPressed: {
    opacity: 0.75,
  },
  chipLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  chipLabelSelected: {
    color: colors.text,
  },
  selectionNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  requests: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  requestCopy: {
    flex: 1,
    gap: 2,
  },
  requestName: {
    ...typography.label,
    color: colors.text,
  },
  requestUrl: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  badge: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  requestNote: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  suggest: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  suggestTitle: {
    ...typography.label,
    color: colors.text,
  },
  suggestBody: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  footer: {
    gap: spacing.sm,
  },
  quota: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(18, 18, 18, 0.35)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  sheetHeader: {
    gap: spacing.xs,
  },
  sheetTitle: {
    ...typography.title,
    color: colors.text,
  },
  field: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sheetAction: {
    flex: 1,
  },
});
