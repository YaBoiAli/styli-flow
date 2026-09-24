import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
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
import { trackEvent } from '@/lib/analytics';
import { validateInspirationUrl } from '@/lib/urls';
import type {
  InspirationImage,
  InspirationLinkKind,
  InspirationSource,
} from '@/types';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCES = 6;
const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];

type LinkOption = {
  kind: InspirationLinkKind;
  label: string;
  hint: string;
  placeholder: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const LINK_OPTIONS: LinkOption[] = [
  {
    kind: 'link',
    label: 'Paste Link',
    hint: 'A product, outfit, or inspiration page',
    placeholder: 'https://',
    icon: 'link-outline',
  },
  {
    kind: 'pinterest',
    label: 'Pinterest',
    hint: 'A pin or board you love',
    placeholder: 'https://pinterest.com/pin/…',
    icon: 'logo-pinterest',
  },
  {
    kind: 'instagram',
    label: 'Instagram',
    hint: 'A Reel or photo post',
    placeholder: 'https://instagram.com/reel/…',
    icon: 'logo-instagram',
  },
];

const KIND_LABELS: Record<InspirationSource['kind'], string> = {
  image: 'Image',
  link: 'Link',
  pinterest: 'Pinterest',
  instagram: 'Instagram',
};

export default function InspirationScreen() {
  const router = useRouter();
  const {
    selectedStyle,
    selectedOccasion,
    selectedBudget,
    inspirationSources,
    addInspirationSource,
    replaceInspirationSource,
    removeInspirationSource,
  } = usePreferences();
  const [activeLink, setActiveLink] = useState<InspirationLinkKind | null>(null);
  const [linkText, setLinkText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!selectedStyle) {
      router.replace('/style');
    } else if (!selectedOccasion) {
      router.replace('/occasion');
    } else if (!selectedBudget) {
      router.replace('/budget');
    }
  }, [selectedStyle, selectedOccasion, selectedBudget, router]);

  const imageSource = inspirationSources.find(
    (source): source is Extract<InspirationSource, { kind: 'image' }> =>
      source.kind === 'image',
  );
  const linkSources = inspirationSources.filter(
    (source): source is Extract<InspirationSource, { kind: InspirationLinkKind }> =>
      source.kind !== 'image',
  );
  const atLimit = inspirationSources.length >= MAX_SOURCES;
  const hasSources = inspirationSources.length > 0;

  async function handlePickImage() {
    setError(null);
    if (!imageSource && atLimit) {
      setError(`You can add up to ${MAX_SOURCES} inspiration sources.`);
      return;
    }
    setPicking(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const checked = checkImageAsset(asset);
      if (!checked.ok) {
        setError(checked.message);
        return;
      }

      const next: InspirationSource = {
        id: imageSource?.id ?? makeId('image'),
        kind: 'image',
        image: checked.image,
      };
      if (imageSource) {
        replaceInspirationSource(imageSource.id, next);
      } else {
        addInspirationSource(next);
        trackEvent('inspiration_added', { kind: 'image' });
      }
    } catch {
      setError("Couldn't open your photos. Check photo access and try again.");
    } finally {
      setPicking(false);
    }
  }

  function openLink(kind: InspirationLinkKind) {
    setError(null);
    setLinkText('');
    setActiveLink((current) => (current === kind ? null : kind));
  }

  function handleAddLink() {
    if (!activeLink) return;
    if (atLimit) {
      setError(`You can add up to ${MAX_SOURCES} inspiration sources.`);
      return;
    }
    const result = validateInspirationUrl(activeLink, linkText);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (linkSources.some((source) => source.url === result.url)) {
      setError('You already added that link.');
      return;
    }
    addInspirationSource({ id: makeId(activeLink), kind: activeLink, url: result.url });
    trackEvent('inspiration_added', { kind: activeLink });
    setLinkText('');
    setActiveLink(null);
    setError(null);
  }

  const activeOption = LINK_OPTIONS.find((option) => option.kind === activeLink);

  return (
    <Screen
      contentStyle={styles.content}
      footer={
        hasSources ? (
          <PrimaryButton
            label="Continue"
            testID="btn-continue-inspiration"
            onPress={() => router.push('/brands')}
          />
        ) : (
          <PrimaryButton
            label="Skip"
            variant="secondary"
            testID="btn-skip-inspiration"
            onPress={() => router.push('/brands')}
          />
        )
      }
    >
      <View style={styles.top}>
        <BackButton fallbackHref="/budget" />
        <OnboardingProgress step="Inspiration" />
        <Text style={styles.title}>Got some inspiration?</Text>
        <Text style={styles.subtitle}>
          Show us what you&apos;re going for and we&apos;ll build around it.
        </Text>
      </View>

      <View style={styles.options}>
        {imageSource ? (
          <View style={styles.imageCard}>
            <Image
              source={{ uri: imageSource.image.uri }}
              style={styles.preview}
              resizeMode="cover"
              accessibilityLabel="Inspiration image preview"
            />
            <View style={styles.imageActions}>
              <PrimaryButton
                label="Replace"
                variant="secondary"
                style={styles.imageAction}
                loading={picking}
                onPress={() => void handlePickImage()}
                testID="btn-replace-image"
              />
              <PrimaryButton
                label="Remove"
                variant="ghost"
                style={styles.imageAction}
                onPress={() => removeInspirationSource(imageSource.id)}
                testID="btn-remove-image"
              />
            </View>
          </View>
        ) : (
          <SourceOption
            icon="image-outline"
            label="Upload an Image"
            hint="JPG, PNG, WEBP, or HEIC up to 10 MB"
            onPress={() => void handlePickImage()}
            disabled={picking}
            testID="option-upload-image"
          />
        )}

        {LINK_OPTIONS.map((option) => (
          <SourceOption
            key={option.kind}
            icon={option.icon}
            label={option.label}
            hint={option.hint}
            selected={activeLink === option.kind}
            onPress={() => openLink(option.kind)}
            testID={`option-${option.kind}`}
          />
        ))}
      </View>

      {activeOption ? (
        <View style={styles.linkPanel}>
          <Text style={styles.fieldLabel}>{activeOption.label} URL</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={linkText}
              onChangeText={(text) => {
                setLinkText(text);
                if (error) setError(null);
              }}
              placeholder={activeOption.placeholder}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              returnKeyType="done"
              onSubmitEditing={handleAddLink}
              style={styles.input}
              testID={`input-${activeOption.kind}-url`}
            />
          </View>
          <PrimaryButton
            label="Add"
            variant="secondary"
            disabled={!linkText.trim()}
            onPress={handleAddLink}
            testID="btn-add-link"
          />
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {linkSources.length > 0 ? (
        <View style={styles.added}>
          <Text style={styles.sectionLabel}>Added</Text>
          {linkSources.map((source) => (
            <View key={source.id} style={styles.addedRow}>
              <View style={styles.addedCopy}>
                <Text style={styles.addedKind}>{KIND_LABELS[source.kind]}</Text>
                <Text style={styles.addedUrl} numberOfLines={1}>
                  {source.url}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${KIND_LABELS[source.kind]} link`}
                hitSlop={12}
                onPress={() => removeInspirationSource(source.id)}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

function SourceOption({
  icon,
  label,
  hint,
  onPress,
  selected = false,
  disabled = false,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        (pressed || disabled) && styles.optionPressed,
      ]}
      testID={testID}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <View style={styles.optionCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionHint}>{hint}</Text>
      </View>
      <Ionicons
        name={selected ? 'chevron-up' : 'add'}
        size={20}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}

function checkImageAsset(
  asset: ImagePicker.ImagePickerAsset,
): { ok: true; image: InspirationImage } | { ok: false; message: string } {
  const mimeType = (asset.mimeType ?? mimeFromUri(asset.uri))?.toLowerCase() ?? null;
  const extension = (asset.fileName ?? '').split('.').pop()?.toLowerCase() ?? '';
  const knownType =
    (mimeType && IMAGE_MIME_TYPES.includes(mimeType)) ||
    IMAGE_EXTENSIONS.includes(extension);

  if (!knownType) {
    return {
      ok: false,
      message: 'Use a JPG, PNG, WEBP, or HEIC image.',
    };
  }

  if (asset.fileSize != null && asset.fileSize > MAX_IMAGE_BYTES) {
    return { ok: false, message: 'That image is over 10 MB. Try a smaller one.' };
  }

  return {
    ok: true,
    image: {
      uri: asset.uri,
      fileName: asset.fileName ?? null,
      mimeType,
      fileSize: asset.fileSize ?? null,
      width: asset.width,
      height: asset.height,
    },
  };
}

function mimeFromUri(uri: string): string | null {
  const match = uri.match(/^data:([^;,]+)[;,]/);
  return match ? match[1] : null;
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionSelected: {
    borderColor: colors.borderSelected,
    backgroundColor: colors.surfaceMuted,
  },
  optionPressed: {
    opacity: 0.75,
  },
  optionCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  optionLabel: {
    ...typography.label,
    color: colors.text,
  },
  optionHint: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  imageCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 5,
    borderRadius: radii.md,
    backgroundColor: colors.surfaceMuted,
  },
  imageActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  imageAction: {
    flex: 1,
  },
  linkPanel: {
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    minHeight: 56,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
  added: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
  },
  addedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  addedCopy: {
    flex: 1,
    gap: 2,
  },
  addedKind: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  addedUrl: {
    ...typography.body,
    color: colors.text,
  },
});
