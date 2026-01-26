/**
 * PhotosDen - Application configuration types.
 * This file contains typed configuration used across the backend.
 */

export type AppEnv = "dev" | "prod";

export interface AppConfig {
  env: AppEnv;

  // Billing
  usdToInrRate: number; // fixed conversion rate used for UI reporting

  // Cognito / Auth (example—add fields you actually need)
  cognitoUserPoolId: string;
  cognitoUserPoolClientId: string;

  // Optional feature flags
  enableCostDashboard: boolean;
}
