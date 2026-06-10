export * from "./types";
export { PrivacyAggregator } from "./aggregator";
export { HealthMonitor } from "./health/monitor";
export { selectRoute } from "./router/select";
export { scoreBackend } from "./router/scorer";
export { REGISTRY, getMeta } from "./backends/registry";
export { ArciumBackend } from "./backends/arcium";
export { LightProtocolBackend } from "./backends/light";
export { MagicBlockTeeBackend, makeMagicRouterConnection } from "./backends/magicblock";
export { SquadsPlainBackend } from "./backends/squads-plain";
export { Token2022ConfidentialBackend } from "./backends/token2022-confidential";

export {
  detectNetwork,
  isMainnet,
  getRecommendedPriorityFee,
  loadSquadsProgramConfig,
  DEFAULT_SQUADS_PROGRAM_ID,
} from "./utils/network";
export type { SolanaNetwork } from "./utils/network";
