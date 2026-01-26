/**
 * PhotosDen - Parameter Store config loader.
 * Loads configuration from AWS SSM Parameter Store and validates it.
 */

import { SSMClient, GetParametersByPathCommand } from "@aws-sdk/client-ssm";
import { z } from "zod";
import type { AppConfig, AppEnv } from "./config-types";

const AppConfigSchema = z.object({
  env: z.enum(["dev", "prod"]),
  usdToInrRate: z.number().positive(),
  cognitoUserPoolId: z.string().min(5),
  cognitoUserPoolClientId: z.string().min(5),
  enableCostDashboard: z.boolean(),
});

type AppConfigInput = z.infer<typeof AppConfigSchema>;

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (v === "true") return true;
  if (v === "false") return false;
  throw new Error(`Invalid boolean value: "${value}"`);
}

function parseNumber(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`Invalid number value: "${value}"`);
  return n;
}

export interface ParameterStoreConfigLoaderDeps {
  ssmClient: SSMClient;
  parameterPath: string; // e.g. /photosden/dev/app
}

/**
 * Loads all parameters under a given path and returns a validated AppConfig.
 * Expected parameter naming (example):
 *  /photosden/dev/app/usdToInrRate
 *  /photosden/dev/app/cognitoUserPoolId
 *  /photosden/dev/app/cognitoUserPoolClientId
 *  /photosden/dev/app/enableCostDashboard
 */
export async function loadConfigFromParameterStore(
  deps: ParameterStoreConfigLoaderDeps,
  env: AppEnv,
): Promise<AppConfig> {
  const { ssmClient, parameterPath } = deps;

  const result: Record<string, string> = {};
  let nextToken: string | undefined;

  do {
    const resp = await ssmClient.send(
      new GetParametersByPathCommand({
        Path: parameterPath,
        Recursive: true,
        WithDecryption: true,
        NextToken: nextToken,
      }),
    );

    for (const p of resp.Parameters ?? []) {
      if (!p.Name || p.Value == null) continue;

      // Convert full path into leaf key
      // /photosden/dev/app/usdToInrRate -> usdToInrRate
      const parts = p.Name.split("/");
      const leafKey = parts[parts.length - 1] ?? "";
      if (!leafKey) continue;

      result[leafKey] = p.Value;
    }

    nextToken = resp.NextToken;
  } while (nextToken);

  // Convert raw strings into typed values
  const input: AppConfigInput = {
    env,
    usdToInrRate: parseNumber(result.usdToInrRate ?? "85.0"),
    cognitoUserPoolId: result.cognitoUserPoolId ?? "",
    cognitoUserPoolClientId: result.cognitoUserPoolClientId ?? "",
    enableCostDashboard: parseBoolean(result.enableCostDashboard ?? "true"),
  };

  const parsed = AppConfigSchema.safeParse(input);
  if (!parsed.success) {
    // Keep this error message concise; log details in your error handler
    throw new Error(`Config validation failed: ${parsed.error.message}`);
  }

  return parsed.data;
}
