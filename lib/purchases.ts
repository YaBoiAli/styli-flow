import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';

import {
  PREMIUM_ENTITLEMENT_ID,
  PRODUCT_IDS,
} from '@/constants/subscriptions';

let configured = false;

/**
 * Resolve the RevenueCat public SDK key for the current build.
 * Prefer Test Store (`test_…`) in development; platform keys in release.
 */
export function getRevenueCatApiKey(): string | null {
  const testOrShared = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
  const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
  const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;
  const webKey = process.env.EXPO_PUBLIC_REVENUECAT_WEB_API_KEY;

  const pick = (...candidates: Array<string | undefined>) => {
    for (const key of candidates) {
      if (!key) continue;
      if (key.includes('YOUR_') || key === 'your-revenuecat-api-key') continue;
      return key;
    }
    return null;
  };

  if (__DEV__) {
    return pick(testOrShared, webKey, iosKey, androidKey);
  }

  if (Platform.OS === 'ios') {
    return pick(iosKey, testOrShared);
  }
  if (Platform.OS === 'android') {
    return pick(androidKey, testOrShared);
  }
  return pick(webKey, testOrShared);
}

export function isRevenueCatConfigured(): boolean {
  return Boolean(getRevenueCatApiKey());
}

export async function configurePurchases(
  appUserId?: string | null,
): Promise<void> {
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    throw new Error(
      'RevenueCat is not configured. Set EXPO_PUBLIC_REVENUECAT_API_KEY (Test Store key for development).',
    );
  }

  if (__DEV__) {
    Purchases.setLogLevel(LOG_LEVEL.DEBUG);
  }

  if (!configured) {
    Purchases.configure({
      apiKey,
      appUserID: appUserId ?? undefined,
    });
    configured = true;
    return;
  }

  if (appUserId) {
    await Purchases.logIn(appUserId);
  }
}

export function hasPremiumEntitlement(
  info: CustomerInfo | null | undefined,
): boolean {
  if (!info) return false;
  return Boolean(info.entitlements.active[PREMIUM_ENTITLEMENT_ID]);
}

export async function getCustomerInfo(): Promise<CustomerInfo> {
  return Purchases.getCustomerInfo();
}

export async function getOfferings(): Promise<PurchasesOfferings> {
  return Purchases.getOfferings();
}

export function pickPremiumPackages(offerings: PurchasesOfferings): {
  monthly: PurchasesPackage | null;
  yearly: PurchasesPackage | null;
} {
  const current = offerings.current;
  const packages = current?.availablePackages ?? [];

  const byProductId = (id: string) =>
    packages.find((pkg) => pkg.product.identifier === id) ?? null;

  const monthly =
    byProductId(PRODUCT_IDS.monthly) ??
    packages.find((pkg) => pkg.packageType === 'MONTHLY') ??
    packages.find((pkg) =>
      pkg.product.identifier.toLowerCase().includes('month'),
    ) ??
    null;

  const yearly =
    byProductId(PRODUCT_IDS.yearly) ??
    packages.find((pkg) => pkg.packageType === 'ANNUAL') ??
    packages.find((pkg) =>
      pkg.product.identifier.toLowerCase().includes('year'),
    ) ??
    null;

  return { monthly, yearly };
}

export async function purchasePackage(
  pkg: PurchasesPackage,
): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}

export async function logInPurchases(appUserId: string): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.logIn(appUserId);
  return customerInfo;
}

export async function logOutPurchases(): Promise<CustomerInfo | null> {
  if (!configured) return null;
  try {
    return await Purchases.logOut();
  } catch {
    return null;
  }
}

export function purchasesSupportedOnPlatform(): boolean {
  return (
    Platform.OS === 'ios' || Platform.OS === 'android' || Platform.OS === 'web'
  );
}
