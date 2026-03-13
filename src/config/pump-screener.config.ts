export type PumpScreenerRuntimeConfig = {
  aggregationWindowMinutes: number;
  maxRuleWindowMinutes: number;
  warmupMinutes: number;
  evaluationGracePeriodMs: number;
  oiPollIntervalMs: number;
  oiMaxRequestsPerSecond: number;
};

export const pumpScreenerRuntimeConfig: PumpScreenerRuntimeConfig = {
  aggregationWindowMinutes: 60,
  maxRuleWindowMinutes: 30,
  warmupMinutes: 60,
  evaluationGracePeriodMs: 5_000,
  oiPollIntervalMs:
    process.env.OI_POLL_INTERVAL_MS && Number(process.env.OI_POLL_INTERVAL_MS) > 0
      ? Number(process.env.OI_POLL_INTERVAL_MS)
      : 60_000,
  oiMaxRequestsPerSecond:
    process.env.OI_MAX_REQUESTS_PER_SECOND &&
    Number(process.env.OI_MAX_REQUESTS_PER_SECOND) > 0
      ? Number(process.env.OI_MAX_REQUESTS_PER_SECOND)
      : 15,
};
