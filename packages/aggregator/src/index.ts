export * from "./types";
export { PrivacyAggregator } from "./aggregator";
export { HealthMonitor } from "./health/monitor";
export { selectRoute } from "./router/select";
export { scoreBackend } from "./router/scorer";
export { REGISTRY, getMeta } from "./backends/registry";
export { LightProtocolBackend } from "./backends/light";
export { SquadsPlainBackend } from "./backends/squads-plain";

export {
  detectNetwork,
  isMainnet,
  getRecommendedPriorityFee,
  loadSquadsProgramConfig,
  DEFAULT_SQUADS_PROGRAM_ID,
} from "./utils/network";
export type { SolanaNetwork } from "./utils/network";
