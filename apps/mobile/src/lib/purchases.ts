// In-app purchases through RevenueCat, on the same `pro` entitlement as Stripe on the web.
// RevenueCat's webhook updates `subscriptions` on our server; the app then refreshes /me.

import { Platform } from "react-native";
import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { config } from "./config";

let configuredFor: string | null = null;

export async function configurePurchases(userId: string | null): Promise<boolean> {
  if (!config.revenueCatKey || Platform.OS === "web") return false;
  if (configuredFor === null) {
    Purchases.configure({ apiKey: config.revenueCatKey, appUserID: userId ?? undefined });
    configuredFor = userId ?? "";
  } else if (userId && configuredFor !== userId) {
    await Purchases.logIn(userId);
    configuredFor = userId;
  }
  return true;
}

export async function proPackages(): Promise<PurchasesPackage[]> {
  const offerings = await Purchases.getOfferings();
  return offerings.current?.availablePackages ?? [];
}

export async function buy(pkg: PurchasesPackage): Promise<boolean> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return Boolean(customerInfo.entitlements.active.pro);
}

export async function restore(): Promise<boolean> {
  const info = await Purchases.restorePurchases();
  return Boolean(info.entitlements.active.pro);
}
