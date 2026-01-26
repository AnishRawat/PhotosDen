/**
 * PhotosDen - Cold-start config cache.
 * Caches config in-memory for the lifetime of the Lambda execution environment.
 */

import { SSMClient } from "@aws-sdk/client-ssm";
import type { AppConfig, AppEnv } from "./config-types";
import { loadConfigFromParameterStore } from "./parameter-store-config";

interface CacheState {
  loadedAtMs: number;
  config: AppConfig;
}

let cache: CacheState | null = null;

// Default TTL: 10 minutes (can be overridden)
// In most cases you can set TTL very high or rely on redeploys.
// Keeping TTL non-infinite avoids “stuck config” in rare long-lived runtimes.
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function getEnvOrThrow(): AppEnv {
  const env = process.env.APP_ENV;
  if (env !== "dev" && env !== "prod") {
    throw new Error(`APP_ENV must be 'dev' or 'prod'. Got: "${env ?? ""}"`);
  }
  return env;
}

function getParameterPathOrThrow(env: AppEnv): string {
  // Standardize where configs live
  // Example: /photosden/dev/app
  return `/photosden/${env}/app`;
}

function getTtlMs(): number {
  const raw = process.env.CONFIG_CACHE_TTL_SECONDS;
  if (!raw) return DEFAULT_TTL_MS;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_TTL_MS;
  return n * 1000;
}

/**
 * Returns cached configuration. Fetches from SSM only on cold start or TTL expiry.
 */
export async function getConfig(): Promise<AppConfig> {
  const env = getEnvOrThrow();
  const ttlMs = getTtlMs();

  const now = Date.now();
  if (cache && ttlMs > 0 && now - cache.loadedAtMs < ttlMs) {
    return cache.config;
  }

  // Create the SSM client once per cold start (safe and common).
  // If you already have a central AWS client factory, use that instead.
  const ssmClient = new SSMClient({});

  const parameterPath = getParameterPathOrThrow(env);
  const config = await loadConfigFromParameterStore(
    { ssmClient, parameterPath },
    env,
  );

  cache = { loadedAtMs: now, config };
  return config;
}
