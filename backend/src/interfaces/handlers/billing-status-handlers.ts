/**
 * Billing Handlers Extension
 * 
 * Added handlers for billing status.
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Repositories (Assuming these are implemented or interfaces exist)
// We'll need concrete implementations for these.
// For now, I'll assume they are wired up in the main index or a service locator.
import { GetBillingStatusUseCase } from '../../application/billing/use-cases/GetBillingStatusUseCase.js';

// Setup common deps (reusing pattern from billing-handlers.ts)
const verifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  tokenUse: 'id',
  clientId: process.env.COGNITO_CLIENT_ID!,
});

/**
 * Extract user ID from JWT token
 */
async function getUserIdFromToken(event: APIGatewayProxyEventV2): Promise<string> {
  const authHeader = event.headers.authorization || event.headers.Authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }
  const token = authHeader.substring(7);
  const payload = await verifier.verify(token);
  return payload.sub;
}

/**
 * GET /billing/status
 * Get current month bill and projections
 */
export async function getBillingStatusHandler(
  event: APIGatewayProxyEventV2,
  useCase: GetBillingStatusUseCase
): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = await getUserIdFromToken(event);
    const result = await useCase.execute(userId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: result,
      }),
    };
  } catch (error: any) {
    console.error('[GET_BILLING_STATUS_ERROR]:', error);
    return {
      statusCode: error.message.includes('token') ? 401 : 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}
