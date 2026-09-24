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
  TouchableOpacity,
  View,
} from 'react-native';

import { BackButton } from '@/components/BackButton';
import { BrandCard } from '@/components/BrandCard';
import { OnboardingProgress } from '@/components/OnboardingProgress';
import { PrimaryButton } from '@/components/PrimaryButton';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/context/AuthContext';
import { usePreferences } from '@/context/PreferencesContext';
import { useSubscription } from '@/context/SubscriptionContext';
import {
  APPROVED_BRAND_DETAILS,
  APPROVED_BRANDS,
  NO_PREFERENCE_LABEL,
} from '@/constants/brands';
import { FREE_GENERATION_LIMIT } from '@/constants/subscriptions';
import { colors, radii, spacing, typography } from '@/constants/theme';
import {
  getBudgetRange,
  premiumStatusLabel,
  trackEvent,
} from '@/lib/analytics';
import { type BrandStatus, fetchBrandStatuses, resolveBrand } from '@/lib/brandCatalog';
import { submitBrandRequest } from '@/lib/brandRequests';
import { normalizeWebUrl } from '@/lib/urls';
import type { BrandRequest } from '@/types';

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
    updateBrandRequest,
    removeBrandRequest,
  } = usePreferences();
  const { isPremium, checkCanGenerate, generationsRemaining } = useSubscription();
  const [checking, setChecking] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [brandsOpen, setBrandsOpen] = useState(selectedBrands.length > 0);
  const [statuses, setStatuses] = useState<Map<string, BrandStatus> | null>(null);

  useEffect(() => {
    let active = true;
    void fetchBrandStatuses().then((result) => {
      if (active) setStatuses(result);
    });
    return () => {
      active = false;
    };
  }, []);

  // Without catalog info (offline / not deployed) every brand stays selectable.
  const isUnavailable = (name: string) =>
    statuses !== null && statuses.get(name)?.status !== 'supported';
  const orderedBrands = statuses
    ? [...APPROVED_BRAND_DETAILS].sort(
        (a, b) => Number(isUnavailable(a.name)) - Number(isUnavailable(b.name)),
      )
    : APPROVED_BRAND_DETAILS;
  const unavailableCount = statuses
    ? APPROVED_BRAND_DETAILS.filter((brand) => isUnavailable(brand.name)).length
    : 0;
  const selectedUnsupported =
    statuses !== null &&
    selectedBrands.length > 0 &&
    selectedBrands.every((name) => isUnavailable(name));
  const hasSupportedRequest = brandRequests.some((request) => request.status === 'supported');
  // Never send the user to generation when every picked store is still unsupported.
  const canBuild = !selectedUnsupported || hasSupportedRequest;

  async function checkBrand(request: BrandRequest) {
    updateBrandRequest(request.id, { status: 'checking', statusReason: null });
    const result = await resolveBrand({
      name: request.name,
      website: request.website,
      requestId: request.id,
    });
    updateBrandRequest(request.id, {
      status: result.status,
      productCount: result.productCount,
      statusReason: result.reason,
    });
    trackEvent('brand_request_checked', { brand: request.name, status: result.status });
  }

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
          {selectedUnsupported && !hasSupportedRequest ? (
            <Text style={styles.quota} testID="brands-unavailable-hint">
              Those stores aren&apos;t available yet. Pick a ready brand or use No Preference.
            </Text>
          ) : !isPremium ? (
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
            disabled={!canBuild}
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
          Shop everywhere, or just your favorites.
        </Text>
      </View>

      <NoPreferenceCard selected={noPreference} onPress={handleNoPreference} />

      <View style={styles.brandsSection}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ expanded: brandsOpen }}
          activeOpacity={0.9}
          onPress={() => setBrandsOpen((open) => !open)}
          style={[styles.brandsToggle, !noPreference && styles.brandsToggleActive]}
          testID="btn-toggle-brands"
        >
          <View style={styles.brandsToggleCopy}>
            <Text style={styles.brandsToggleTitle}>Pick your brands</Text>
            <Text style={styles.brandsToggleHint}>
              {noPreference
                ? 'Only shop the labels you love.'
                : `${selectedBrands.length} ${selectedBrands.length === 1 ? 'brand' : 'brands'} selected`}
            </Text>
          </View>
          <Ionicons
            name={brandsOpen ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={colors.textSecondary}
          />
        </TouchableOpacity>

        {brandsOpen ? (
          <>
            <View style={styles.grid}>
              {orderedBrands.map((brand) => (
                <View key={brand.name} style={styles.gridItem}>
                  <BrandCard
                    brand={brand}
                    selected={selectedBrands.includes(brand.name)}
                    unavailable={isUnavailable(brand.name)}
                    onPress={() => handleBrandPress(brand.name)}
                  />
                </View>
              ))}
            </View>
            {unavailableCount > 0 ? (
              <Text style={styles.requestNote}>
                We only shop stores whose real catalog we can read. Faded brands
                aren&apos;t available yet.
              </Text>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={styles.suggest}>
        <Text style={styles.suggestTitle}>Didn&apos;t find it here?</Text>
        <Text style={styles.suggestBody}>
          Add a store&apos;s website and we&apos;ll check if we can shop its catalog.
        </Text>
        <PrimaryButton
          label="+ Add a brand"
          variant="secondary"
          style={styles.suggestButton}
          onPress={() => setFormOpen(true)}
          testID="btn-add-brand"
        />
      </View>

      {brandRequests.length > 0 ? (
        <View style={styles.requests}>
          <Text style={styles.sectionLabel}>Your brands</Text>
          {brandRequests.map((request) => (
            <View
              key={request.id}
              style={styles.requestRow}
              testID={`brand-request-${request.name}`}
            >
              <View style={styles.requestCopy}>
                <Text style={styles.requestName}>{request.name}</Text>
                <Text style={styles.requestUrl} numberOfLines={2}>
                  {requestDetail(request)}
                </Text>
              </View>
              {request.status === 'error' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Check ${request.name} again`}
                  hitSlop={8}
                  onPress={() => void checkBrand(request)}
                  style={styles.badge}
                >
                  <Text style={styles.badgeLabel}>Retry</Text>
                </Pressable>
              ) : (
                <View
                  style={[
                    styles.badge,
                    request.status === 'supported' && styles.badgeSupported,
                  ]}
                >
                  <Text style={styles.badgeLabel}>{requestBadge(request)}</Text>
                </View>
              )}
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
            Supported brands are shopped along with your picks. We never make up
            products for stores we can&apos;t read.
          </Text>
        </View>
      ) : null}

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
          trackEvent('brand_requested', { brand: name });
          setFormOpen(false);
          void submitBrandRequest(request, user?.id).then(() => checkBrand(request));
        }}
      />
    </Screen>
  );
}

function requestBadge(request: BrandRequest): string {
  switch (request.status) {
    case 'supported':
      return 'Supported';
    case 'unsupported':
      return 'Not supported';
    case 'requested':
    case 'pending':
    case 'checking':
      return 'Checking…';
    default:
      return 'Retry';
  }
}

function requestDetail(request: BrandRequest): string {
  if (request.status === 'supported') {
    return `${request.productCount ?? 0} products ready to shop`;
  }
  if ((request.status === 'unsupported' || request.status === 'error') && request.statusReason) {
    return request.statusReason;
  }
  if (request.status === 'checking' || request.status === 'requested') {
    return 'Looking for their catalog. This can take up to a minute.';
  }
  return request.website;
}

function NoPreferenceCard({
  selected,
  onPress,
}: {
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.noPref, selected && styles.noPrefSelected]}
      testID="btn-no-preference"
    >
      <View style={[styles.noPrefIcon, selected && styles.noPrefIconSelected]}>
        <Ionicons
          name="sparkles-outline"
          size={20}
          color={selected ? colors.background : colors.text}
        />
      </View>
      <View style={styles.noPrefCopy}>
        <Text style={[styles.noPrefLabel, selected && styles.noPrefLabelSelected]}>
          {NO_PREFERENCE_LABEL}
        </Text>
        <Text style={styles.noPrefHint}>
          We&apos;ll shop every available brand for the best fit.
        </Text>
      </View>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={selected ? colors.text : colors.textMuted}
      />
    </TouchableOpacity>
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
  noPref: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 72,
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  noPrefSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  noPrefIcon: {
    width: 44,
    height: 44,
    borderRadius: radii.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noPrefIconSelected: {
    backgroundColor: colors.accent,
  },
  noPrefCopy: {
    flex: 1,
    gap: 2,
  },
  noPrefLabel: {
    ...typography.label,
    fontSize: 16,
    color: colors.text,
  },
  noPrefLabelSelected: {
    fontFamily: typography.label.fontFamily,
  },
  noPrefHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  brandsSection: {
    gap: spacing.sm,
  },
  brandsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  brandsToggleActive: {
    borderColor: colors.borderSelected,
  },
  brandsToggleCopy: {
    flex: 1,
    gap: 2,
  },
  brandsToggleTitle: {
    ...typography.label,
    color: colors.text,
  },
  brandsToggleHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.sm,
  },
  gridItem: {
    width: '49%',
  },
  suggestButton: {
    marginTop: spacing.sm,
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
  badgeSupported: {
    backgroundColor: colors.accentSoft,
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
