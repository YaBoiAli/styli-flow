export const colors = {
  background: '#F6F3EE',
  surface: '#FFFFFF',
  surfaceMuted: '#EFEBE4',
  text: '#121212',
  textSecondary: '#8A8680',
  textMuted: '#B0ABA4',
  border: '#E4DFD7',
  borderSelected: '#121212',
  accent: '#2C2A28',
  accentSoft: '#D9D2C8',
  danger: '#C45C5C',
  overlay: 'rgba(18, 18, 18, 0.04)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
} as const;

export const typography = {
  brand: {
    fontFamily: 'Syne_700Bold',
    fontSize: 48,
    letterSpacing: -1.5,
    lineHeight: 52,
  },
  hero: {
    fontFamily: 'Syne_700Bold',
    fontSize: 36,
    letterSpacing: -1,
    lineHeight: 42,
  },
  title: {
    fontFamily: 'Syne_700Bold',
    fontSize: 28,
    letterSpacing: -0.6,
    lineHeight: 34,
  },
  subtitle: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    lineHeight: 26,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 16,
    lineHeight: 24,
  },
  label: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  caption: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 13,
    lineHeight: 18,
  },
  price: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
  },
  total: {
    fontFamily: 'Syne_700Bold',
    fontSize: 24,
    letterSpacing: -0.4,
  },
} as const;
