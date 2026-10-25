// Decides whether the on-device classifier is trusted on its own or the LLM is asked.
export type TierMode = "local" | "tiered" | "llm";
export interface TierOptions {
  mode: TierMode; low: number; high: number; llmReady: boolean;
  // When the rage-bait filter is on, a post is only settled locally if the rage scorer is sure too.
  rage?: { on: boolean; score: number };
}
export const RAGE_SURE = { low: 25, high: 85 };
export const TIER_DEFAULTS = { mode: "tiered" as TierMode, low: 20, high: 90 };

export type Route = { use: "local"; reason: "no-llm" | "local-only" | "confident-ok" | "confident-slop" } | { use: "llm" };

export function route(localScore: number, o: TierOptions): Route {
  if (!o.llmReady) return { use: "local", reason: "no-llm" };
  if (o.mode === "local") return { use: "local", reason: "local-only" };
  if (o.mode === "tiered") {
    const rageSure = !o.rage?.on || o.rage.score <= RAGE_SURE.low || o.rage.score >= RAGE_SURE.high;
    if (rageSure && localScore <= o.low) return { use: "local", reason: "confident-ok" };
    if (localScore >= o.high) return { use: "local", reason: "confident-slop" };
  }
  return { use: "llm" };
}
