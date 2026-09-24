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
  GenderPreference,
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
  setShoesInBudget: (included: boolean) => void;
  setShoeBudget: (budget: number | null) => void;
  setBodyMeasurements: (measurements: BodyMeasurements) => void;
  setGender: (gender: GenderPreference) => void;
  setAge: (age: number) => void;
  addInspirationSource: (source: InspirationSource) => void;
  replaceInspirationSource: (id: string, source: InspirationSource) => void;
  removeInspirationSource: (id: string) => void;
  toggleBrand: (brand: string) => void;
  clearBrands: () => void;
  addBrandRequest: (request: BrandRequest) => void;
  updateBrandRequest: (id: string, changes: Partial<BrandRequest>) => void;
  removeBrandRequest: (id: string) => void;
  resetPreferences: () => void;
  generatedOutfit: Outfit | null;
  generationError: string | null;
  /** Server error code for the last failed generation (e.g. `brands_unavailable`). */
  generationErrorCode: string | null;
  excludeProductIds: string[];
  setGeneratedOutfit: (outfit: Outfit | null) => void;
  setGenerationError: (message: string | null, code?: string | null) => void;
  prepareRebuild: () => void;
  clearGeneration: () => void;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [selectedStyle, setSelectedStyle] = useState<Style | null>(null);
  const [selectedOccasion, setSelectedOccasion] = useState<Occasion | null>(null);
  const [selectedBudget, setSelectedBudget] = useState<number | null>(null);
  const [shoesInBudget, setShoesInBudget] = useState(true);
  const [shoeBudget, setShoeBudgetState] = useState<number | null>(null);
  const [bodyMeasurements, setBodyMeasurementsState] =
    useState<BodyMeasurements | null>(null);
  const [gender, setGenderState] = useState<GenderPreference | null>(null);
  const [age, setAgeState] = useState<number | null>(null);
  const [inspirationSources, setInspirationSources] = useState<
    InspirationSource[]
  >([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brandRequests, setBrandRequests] = useState<BrandRequest[]>([]);
  const [generatedOutfit, setGeneratedOutfit] = useState<Outfit | null>(null);
  const [generationError, setGenerationErrorState] = useState<string | null>(null);
  const [generationErrorCode, setGenerationErrorCode] = useState<string | null>(null);
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

  const setShoeBudget = useCallback((budget: number | null) => {
    setShoeBudgetState(budget);
  }, []);

  const setBodyMeasurements = useCallback((measurements: BodyMeasurements) => {
    setBodyMeasurementsState(measurements);
  }, []);

  const setGender = useCallback((next: GenderPreference) => {
    setGenderState(next);
  }, []);

  const setAge = useCallback((next: number) => {
    setAgeState(next);
  }, []);

  const setGenerationError = useCallback(
    (message: string | null, code: string | null = null) => {
      setGenerationErrorState(message);
      setGenerationErrorCode(message ? code : null);
    },
    [],
  );

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

  const updateBrandRequest = useCallback(
    (id: string, changes: Partial<BrandRequest>) => {
      setBrandRequests((current) =>
        current.map((existing) =>
          existing.id === id ? { ...existing, ...changes, id } : existing,
        ),
      );
    },
    [],
  );

  const removeBrandRequest = useCallback((id: string) => {
    setBrandRequests((current) =>
      current.filter((existing) => existing.id !== id),
    );
  }, []);

  const clearGeneration = useCallback(() => {
    setGeneratedOutfit(null);
    setGenerationError(null);
  }, [setGenerationError]);

  const prepareRebuild = useCallback(() => {
    setExcludeProductIds((current) => {
      const fromOutfit = generatedOutfit?.products.map((product) => product.id) ?? [];
      return [...new Set([...current, ...fromOutfit])];
    });
    setGeneratedOutfit(null);
    setGenerationError(null);
  }, [generatedOutfit, setGenerationError]);

  const resetPreferences = useCallback(() => {
    setSelectedStyle(null);
    setSelectedOccasion(null);
    setSelectedBudget(null);
    setShoesInBudget(true);
    setShoeBudgetState(null);
    setBodyMeasurementsState(null);
    setGenderState(null);
    setAgeState(null);
    setInspirationSources([]);
    setSelectedBrands([]);
    setBrandRequests([]);
    setGeneratedOutfit(null);
    setGenerationError(null);
    setExcludeProductIds([]);
  }, [setGenerationError]);

  const value = useMemo(
    () => ({
      selectedStyle,
      selectedOccasion,
      selectedBudget,
      shoesInBudget,
      shoeBudget,
      bodyMeasurements,
      gender,
      age,
      inspirationSources,
      selectedBrands,
      brandRequests,
      setStyle,
      setOccasion,
      setBudget,
      setShoesInBudget,
      setShoeBudget,
      setBodyMeasurements,
      setGender,
      setAge,
      addInspirationSource,
      replaceInspirationSource,
      removeInspirationSource,
      toggleBrand,
      clearBrands,
      addBrandRequest,
      updateBrandRequest,
      removeBrandRequest,
      resetPreferences,
      generatedOutfit,
      generationError,
      generationErrorCode,
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
      shoesInBudget,
      shoeBudget,
      bodyMeasurements,
      gender,
      age,
      inspirationSources,
      selectedBrands,
      brandRequests,
      setStyle,
      setOccasion,
      setBudget,
      setShoeBudget,
      setBodyMeasurements,
      setGender,
      setAge,
      addInspirationSource,
      replaceInspirationSource,
      removeInspirationSource,
      toggleBrand,
      clearBrands,
      addBrandRequest,
      updateBrandRequest,
      removeBrandRequest,
      resetPreferences,
      generatedOutfit,
      generationError,
      generationErrorCode,
      excludeProductIds,
      setGenerationError,
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
