"use client";
// Bridges the Settings → Privacy tab preferences into the aggregator's Policy
// shape. Activity → IntentType → user's picked backend → allowList policy.
//
// If the user hasn't set a preference for an activity, returns a balanced
// policy so the router picks the best available backend on its own.

import type { Policy } from "@redacted-usd/aggregator";
import { BALANCED_POLICY, PRIVACY_PRIORITY, SPEED_PRIORITY } from "@redacted-usd/aggregator";
import {
  ACTIVITIES,
  getBackendIdFor,
  type ActivityKey,
} from "@/lib/privacy-prefs";

// Build a Policy that hard-pins to the user's pick. allowList=[id] means the
// router will only consider that backend. If no pick exists, fall back to a
// weights-only policy tuned to the activity's default priority.
export function policyForActivity(vaultAddr: string, activity: ActivityKey): Policy {
  const def = ACTIVITIES.find((a) => a.key === activity);
  const pick = getBackendIdFor(vaultAddr, activity);
  const baseWeights =
    def?.priority === "Privacy" ? PRIVACY_PRIORITY :
    def?.priority === "Speed"   ? SPEED_PRIORITY   :
    BALANCED_POLICY;
  return {
    weights: baseWeights,
    allowList: pick ? [pick as any] : undefined,
  };
}

// Used by UI components that just need a fallback policy (no allowList) when
// the user's pick can't be served by any active backend for this intent.
export function fallbackPolicy(activity: ActivityKey): Policy {
  const def = ACTIVITIES.find((a) => a.key === activity);
  const baseWeights =
    def?.priority === "Privacy" ? PRIVACY_PRIORITY :
    def?.priority === "Speed"   ? SPEED_PRIORITY   :
    BALANCED_POLICY;
  return { weights: baseWeights };
}
