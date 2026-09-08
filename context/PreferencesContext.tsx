import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Occasion, Outfit, Style, UserPreferences } from '@/types';

type PreferencesContextValue = UserPreferences & {
  setStyle: (style: Style) => void;
  setOccasion: (occasion: Occasion) => void;
  setBudget: (budget: number) => void;
  resetPreferences: () => void;
  generatedOutfit: Outfit | null;
  generationError: string | null;
  excludeProductIds: string[];
  setGeneratedOutfit: (outfit: Outfit | null) => void;
  setGenerationError: (message: string | null) => void;
  prepareRebuild: () => void;
  clearGeneration: () => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [selectedStyle, setSelectedStyle] = useState<Style | null>(null);
  const [selectedOccasion, setSelectedOccasion] = useState<Occasion | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<number | null>(null);
  const [generatedOutfit, setGeneratedOutfit] = useState<Outfit | null>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [excludeProductIds, setExcludeProductIds] = useState<string[]>([]);

  const setStyle = useCallback((style: Style) => {
    setSelectedStyle(style);
  }, []);

  const setOccasion = useCallback((occasion: Occasion) => {
    setSelectedOccasion(occasion);
  }, []);

  const setBudget = useCallback((budget: number) => {
    setSelectedBudget(budget);
  }, []);

  const clearGeneration = useCallback(() => {
    setGeneratedOutfit(null);
    setGenerationError(null);
  }, []);

  const prepareRebuild = useCallback(() => {
    setExcludeProductIds((current) => {
      const fromOutfit = generatedOutfit?.products.map((product) => product.id) ?? [];
      return [...new Set([...current, ...fromOutfit])];
    });
    setGeneratedOutfit(null);
    setGenerationError(null);
  }, [generatedOutfit]);

  const resetPreferences = useCallback(() => {
    setSelectedStyle(null);
    setSelectedOccasion(null);
    setSelectedBudget(null);
    setGeneratedOutfit(null);
    setGenerationError(null);
    setExcludeProductIds([]);
  }, []);

  const value = useMemo(
    () => ({
      selectedStyle,
      selectedOccasion,
      selectedBudget,
      setStyle,
      setOccasion,
      setBudget,
      resetPreferences,
      generatedOutfit,
      generationError,
      excludeProductIds,
      setGeneratedOutfit,
      setGenerationError,
      prepareRebuild,
      clearGeneration,
    }),
    [
      selectedStyle,
      selectedOccasion,
      selectedBudget,
      setStyle,
      setOccasion,
      setBudget,
      resetPreferences,
      generatedOutfit,
      generationError,
      excludeProductIds,
      prepareRebuild,
      clearGeneration,
    ],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return context;
}
