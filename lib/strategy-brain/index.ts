// =============================================================================
// Arrowhead 7 — Strategy Brain (Pillar 3) — Public entry point
// =============================================================================
// Re-export the engine surface for callers (API routes, components, tests).

export {
  analyzePerformance,
  computeHealthScore,
  engagementRate,
  completionRate,
} from './analyzer';

export {
  HOOK_LIBRARY,
  filterHooks,
  getHook,
  pickHookForSlot,
} from './hooks';

export {
  getTrends,
  curatedBaselineTrends,
  fetchLiveTrends,
} from './trends';

export {
  generateCalendarSuggestions,
  bucketByDay,
} from './calendar';

export {
  buildRecommendations,
  recommendPostingPlan,
} from './recommendations';

export { requireStrategyAccess, getUserTier } from './gating';
