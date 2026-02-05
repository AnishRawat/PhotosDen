/**
 * PhotosDen - CORS Configuration
 * Centralized CORS headers for consistent API responses.
 */

export const CORS_METHODS = "OPTIONS,GET,POST,PUT,PATCH,DELETE";
export const CORS_HEADERS = "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Correlation-Id";

export const DEFAULT_CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": CORS_METHODS,
    "Access-Control-Allow-Headers": CORS_HEADERS,
} as const;
