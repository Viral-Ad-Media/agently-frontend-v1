import { useSyncExternalStore } from "react";

/*
 * Platform feature switches (Super Admin → Features). The API decides the
 * values: in production it returns what the Super Admin set; a local API
 * returns every feature as on. They arrive with /api/auth/config (before
 * sign-in) and /api/bootstrap (after), and App.tsx feeds them in here.
 *
 * Until the first response, finished features show and unfinished ones (sms)
 * stay hidden, so the live app never flashes an unfinished feature.
 */

export type FeatureKey = "gmail" | "calendar" | "sms";
export type FeatureFlags = Record<FeatureKey, boolean>;

const DEFAULTS: FeatureFlags = { gmail: true, calendar: true, sms: false };

let current: FeatureFlags = { ...DEFAULTS };
const listeners = new Set<() => void>();

export function setFeatureFlags(next: Partial<Record<string, unknown>> | null | undefined) {
  if (!next || typeof next !== "object") return;
  const merged: FeatureFlags = { ...current };
  let changed = false;
  for (const key of Object.keys(DEFAULTS) as FeatureKey[]) {
    if (typeof next[key] === "boolean" && next[key] !== merged[key]) {
      merged[key] = next[key] as boolean;
      changed = true;
    }
  }
  if (!changed) return;
  current = merged;
  listeners.forEach((listener) => listener());
}

export function getFeatureFlags(): FeatureFlags {
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFeatureFlag(key: FeatureKey): boolean {
  return useSyncExternalStore(subscribe, () => current[key], () => DEFAULTS[key]);
}
