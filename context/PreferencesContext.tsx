import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  BodyMeasurements,
  BrandRequest,
  InspirationSource,
  Occasion,
  Outfit,
  Style,
  UserPreferences,
} from '@/types';

type PreferencesContextValue = UserPreferences & {
  setStyle: (style: Style) => void;
  setOccasion: (occasion: Occasion) => void;
  setBudget: (budget: number) => void;
  setBodyMeasurements: (measurements: BodyMeasurements) => void;
  addInspirationSource: (source: InspirationSource) => void;
  replaceInspirationSource: (id: string, source: InspirationSource) => void;
  removeInspirationSource: (id: string) => void;
  toggleBrand: (brand: string) => void;
  clearBrands: () => void;
  addBrandRequest: (request: BrandRequest) => void;
  removeBrandRequest: (id: string) => void;
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
  const [bodyMeasurements, setBodyMeasurementsState] =
    useState<BodyMeasurements | null>(null);
  const [inspirationSources, setInspirationSources] = useState<
    InspirationSource[]
  >([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandRequests, setBrandRequests] = useState<BrandRequest[]>([]);
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

  const setBodyMeasurements = useCallback((measurements: BodyMeasurements) => {
    setBodyMeasurementsState(measurements);
  }, []);

  const addInspirationSource = useCallback((source: InspirationSource) => {
    setInspirationSources((current) => [...current, source]);
  }, []);

  const replaceInspirationSource = useCallback(
    (id: string, source: InspirationSource) => {
      setInspirationSources((current) =>
        current.map((existing) => (existing.id === id ? source : existing)),
      );
    },
    [],
  );

  const removeInspirationSource = useCallback((id: string) => {
    setInspirationSources((current) =>
      current.filter((existing) => existing.id !== id),
    );
  }, []);

  const toggleBrand = useCallback((brand: string) => {
    setSelectedBrands((current) =>
      current.includes(brand)
        ? current.filter((existing) => existing !== brand)
        : [...current, brand],
    );
  }, []);

  const clearBrands = useCallback(() => {
    setSelectedBrands([]);
  }, []);

  const addBrandRequest = useCallback((request: BrandRequest) => {
    setBrandRequests((current) => [...current, request]);
  }, []);

  const removeBrandRequest = useCallback((id: string) => {
    setBrandRequests((current) =>
      current.filter((existing) => existing.id !== id),
    );
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
    setBodyMeasurementsState(null);
    setInspirationSources([]);
    setSelectedBrands([]);
    setBrandRequests([]);
    setGeneratedOutfit(null);
    setGenerationError(null);
    setExcludeProductIds([]);
  }, []);

  const value = useMemo(
    () => ({
      selectedStyle,
      selectedOccasion,
      selectedBudget,
      bodyMeasurements,
      inspirationSources,
      selectedBrands,
      brandRequests,
      setStyle,
      setOccasion,
      setBudget,
      setBodyMeasurements,
      addInspirationSource,
      replaceInspirationSource,
      removeInspirationSource,
      toggleBrand,
      clearBrands,
      addBrandRequest,
      removeBrandRequest,
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
      bodyMeasurements,
      inspirationSources,
      selectedBrands,
      brandRequests,
      setStyle,
      setOccasion,
      setBudget,
      setBodyMeasurements,
      addInspirationSource,
      replaceInspirationSource,
      removeInspirationSource,
      toggleBrand,
      clearBrands,
      addBrandRequest,
      removeBrandRequest,
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
