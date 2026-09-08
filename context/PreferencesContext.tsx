import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { Occasion, Style, UserPreferences } from '@/types';

type PreferencesContextValue = UserPreferences & {
  setStyle: (style: Style) => void;
  setOccasion: (occasion: Occasion) => void;
  setBudget: (budget: number) => void;
  resetPreferences: () => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const initialState: UserPreferences = {
  selectedStyle: null,
  selectedOccasion: null,
  selectedBudget: null,
};

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [selectedStyle, setSelectedStyle] = useState<Style | null>(null);
  const [selectedOccasion, setSelectedOccasion] = useState<Occasion | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<number | null>(null);

  const setStyle = useCallback((style: Style) => {
    setSelectedStyle(style);
  }, []);

  const setOccasion = useCallback((occasion: Occasion) => {
    setSelectedOccasion(occasion);
  }, []);

  const setBudget = useCallback((budget: number) => {
    setSelectedBudget(budget);
  }, []);

  const resetPreferences = useCallback(() => {
    setSelectedStyle(null);
    setSelectedOccasion(null);
    setSelectedBudget(null);
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
    }),
    [
      selectedStyle,
      selectedOccasion,
      selectedBudget,
      setStyle,
      setOccasion,
      setBudget,
      resetPreferences,
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
