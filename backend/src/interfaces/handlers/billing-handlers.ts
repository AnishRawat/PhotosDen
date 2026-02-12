/**
 * Billing HTTP Handlers
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Repositories
import { DynamoDBWalletRepository } from '../../infrastructure/database/repositories/DynamoDBWalletRepository';
import { DynamoDBDepositRepository } from '../../infrastructure/database/repositories/DynamoDBDepositRepository';

// Use Cases
import { CreateWalletUseCase } from '../../application/billing/use-cases/CreateWalletUseCase';
import { GetWalletBalanceUseCase } from '../../application/billing/use-cases/GetWalletBalanceUseCase';
import { CreateDepositUseCase } from '../../application/billing/use-cases/CreateDepositUseCase';

// Events
import { InMemoryEventPublisher } from '../../infrastructure/events/InMemoryEventPublisher';

// Initialize dependencies
const dynamoDB = new DynamoDBClient({});
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'photosden-main';

const walletRepo = new DynamoDBWalletRepository(dynamoDB, TABLE_NAME);
const depositRepo = new DynamoDBDepositRepository(dynamoDB, TABLE_NAME);
const eventPublisher = new InMemoryEventPublisher();

const createWalletUseCase = new CreateWalletUseCase(walletRepo);
const getWalletBalanceUseCase = new GetWalletBalanceUseCase(walletRepo);
const createDepositUseCase = new CreateDepositUseCase(walletRepo, depositRepo, eventPublisher);

// Cognito JWT Verifier
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
  
  try {
    const payload = await verifier.verify(token);
    return payload.sub;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
}

/**
 * GET /wallet
 * Get wallet balance and status
 */
export async function getWalletHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = await getUserIdFromToken(event);
    
    const wallet = await getWalletBalanceUseCase.execute(userId);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: {
          userId: wallet.userId,
          balanceTotal: wallet.balanceTotalPaise / 100,
          balanceReserved: wallet.balanceReservedPaise / 100,
          balanceOwed: wallet.balanceOwedPaise / 100,
          balanceAvailable: wallet.balanceAvailablePaise / 100,
          currency: 'INR',
          currencySymbol: '₹',
          accountStatus: wallet.accountStatus,
          isInGracePeriod: wallet.isInGracePeriod,
          gracePeriodUntil: wallet.gracePeriodUntil,
          minimumBalanceThreshold: wallet.minimumBalanceThresholdPaise / 100,
        },
      }),
    };
  } catch (error: any) {
    console.error('[GET_WALLET_ERROR]:', error);
    
    if (error.message.includes('not found')) {
      // Auto-create wallet if it doesn't exist
      try {
        const userId = await getUserIdFromToken(event);
        const wallet = await createWalletUseCase.execute(userId);
        
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: true,
            data: {
              userId,
              balanceTotal: 0,
              balanceReserved: 0,
              balanceOwed: 0,
              balanceAvailable: 0,
              currency: 'INR',
              currencySymbol: '₹',
              accountStatus: 'ACTIVE',
              isInGracePeriod: false,
              gracePeriodUntil: null,
              minimumBalanceThreshold: 10,
            },
          }),
        };
      } catch (createError: any) {
        return {
          statusCode: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            success: false,
            error: 'Failed to create wallet',
            message: createError.message,
          }),
        };
      }
    }
    
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

/**
 * POST /wallet/deposits
 * Add funds to wallet
 */
export async function createDepositHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const userId = await getUserIdFromToken(event);
    
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Request body is required',
        }),
      };
    }

    const body = JSON.parse(event.body);
    const { amount, notes } = body;

    if (!amount || amount <= 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          success: false,
          error: 'Amount must be greater than 0',
        }),
      };
    }

    // Convert rupees to paise
    const amountPaise = Math.round(amount * 100);

    const result = await createDepositUseCase.execute({
      userId,
      amountPaise,
      method: 'MANUAL_CREDIT',
      createdBy: userId,
      notes,
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        data: {
          depositId: result.depositId,
          amount: amountPaise / 100,
          newBalance: result.newBalancePaise / 100,
          currency: 'INR',
          currencySymbol: '₹',
        },
      }),
    };
  } catch (error: any) {
    console.error('[CREATE_DEPOSIT_ERROR]:', error);
    
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
