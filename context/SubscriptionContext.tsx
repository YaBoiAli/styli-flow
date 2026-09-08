import type { CustomerInfo, PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/context/AuthContext';
import {
  configurePurchases,
  getCustomerInfo,
  getOfferings,
  hasPremiumEntitlement,
  isRevenueCatConfigured,
  logInPurchases,
  logOutPurchases,
  pickPremiumPackages,
  purchasePackage,
  restorePurchases,
} from '@/lib/purchases';
import {
  canGenerateOutfit,
  getGenerationCount,
  incrementGenerationCount,
} from '@/lib/generationQuota';
import { FREE_GENERATION_LIMIT } from '@/constants/subscriptions';

type SubscriptionContextValue = {
  isPremium: boolean;
  loading: boolean;
  configured: boolean;
  customerInfo: CustomerInfo | null;
  monthlyPackage: PurchasesPackage | null;
  yearlyPackage: PurchasesPackage | null;
  generationsUsed: number;
  generationsRemaining: number;
  refreshCustomerInfo: () => Promise<void>;
  refreshQuota: () => Promise<void>;
  purchaseMonthly: () => Promise<boolean>;
  purchaseYearly: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  consumeGeneration: () => Promise<void>;
  checkCanGenerate: () => Promise<boolean>;
  error: string | null;
};

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [monthlyPackage, setMonthlyPackage] = useState<PurchasesPackage | null>(
    null,
  );
  const [yearlyPackage, setYearlyPackage] = useState<PurchasesPackage | null>(
    null,
  );
  const [generationsUsed, setGenerationsUsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configured = isRevenueCatConfigured();

  const refreshQuota = useCallback(async () => {
    const used = await getGenerationCount(user?.id);
    setGenerationsUsed(used);
  }, [user?.id]);

  const refreshCustomerInfo = useCallback(async () => {
    if (!configured) {
      setCustomerInfo(null);
      return;
    }
    const info = await getCustomerInfo();
    setCustomerInfo(info);
  }, [configured]);

  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!configured) {
        setCustomerInfo(null);
        setMonthlyPackage(null);
        setYearlyPackage(null);
        await refreshQuota();
        return;
      }

      await configurePurchases(user?.id ?? null);
      if (user?.id) {
        await logInPurchases(user.id);
      }

      const [info, offerings] = await Promise.all([
        getCustomerInfo(),
        getOfferings(),
      ]);
      setCustomerInfo(info);
      const picked = pickPremiumPackages(offerings);
      setMonthlyPackage(picked.monthly);
      setYearlyPackage(picked.yearly);
      await refreshQuota();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not load subscription status.',
      );
    } finally {
      setLoading(false);
    }
  }, [configured, user?.id, refreshQuota]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (!configured || loading) return;
    const onUpdate = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };
    try {
      Purchases.addCustomerInfoUpdateListener(onUpdate);
    } catch {
      return;
    }
    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(onUpdate);
      } catch {
        // ignore
      }
    };
  }, [configured, loading]);

  useEffect(() => {
    if (!user) {
      void logOutPurchases();
    }
  }, [user]);

  const isPremium = hasPremiumEntitlement(customerInfo);

  const purchaseMonthly = useCallback(async () => {
    if (!monthlyPackage) {
      throw new Error('Monthly Premium is not available right now.');
    }
    const info = await purchasePackage(monthlyPackage);
    setCustomerInfo(info);
    return hasPremiumEntitlement(info);
  }, [monthlyPackage]);

  const purchaseYearly = useCallback(async () => {
    if (!yearlyPackage) {
      throw new Error('Yearly Premium is not available right now.');
    }
    const info = await purchasePackage(yearlyPackage);
    setCustomerInfo(info);
    return hasPremiumEntitlement(info);
  }, [yearlyPackage]);

  const restore = useCallback(async () => {
    const info = await restorePurchases();
    setCustomerInfo(info);
    return hasPremiumEntitlement(info);
  }, []);

  const consumeGeneration = useCallback(async () => {
    if (isPremium) return;
    const next = await incrementGenerationCount(user?.id);
    setGenerationsUsed(next);
  }, [isPremium, user?.id]);

  const checkCanGenerate = useCallback(async () => {
    const result = await canGenerateOutfit({
      isPremium,
      userId: user?.id,
    });
    setGenerationsUsed(result.used);
    return result.allowed;
  }, [isPremium, user?.id]);

  const generationsRemaining = isPremium
    ? Number.POSITIVE_INFINITY
    : Math.max(0, FREE_GENERATION_LIMIT - generationsUsed);

  const value = useMemo(
    () => ({
      isPremium,
      loading,
      configured,
      customerInfo,
      monthlyPackage,
      yearlyPackage,
      generationsUsed,
      generationsRemaining,
      refreshCustomerInfo,
      refreshQuota,
      purchaseMonthly,
      purchaseYearly,
      restore,
      consumeGeneration,
      checkCanGenerate,
      error,
    }),
    [
      isPremium,
      loading,
      configured,
      customerInfo,
      monthlyPackage,
      yearlyPackage,
      generationsUsed,
      generationsRemaining,
      refreshCustomerInfo,
      refreshQuota,
      purchaseMonthly,
      purchaseYearly,
      restore,
      consumeGeneration,
      checkCanGenerate,
      error,
    ],
  );

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return context;
}
