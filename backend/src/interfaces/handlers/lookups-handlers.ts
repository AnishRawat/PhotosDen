/**
 * Lookups HTTP Handler
 */

import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LookupsService } from '../../infrastructure/config/LookupsService.js';

const dynamoDB = new DynamoDBClient({});
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'photosden-main';
const lookupsService = new LookupsService(dynamoDB, TABLE_NAME);

/**
 * GET /lookups
 * Returns all runtime configuration values
 */
export async function getLookupsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    const lookups = await lookupsService.getAllLookups();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=1800', // 30 min browser cache
      },
      body: JSON.stringify({
        success: true,
        data: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          lookups,
        },
      }),
    };
  } catch (error: any) {
    console.error('[GET_LOOKUPS_ERROR]:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: 'Failed to fetch configuration',
        message: error.message,
      }),
    };
  }
}

/**
 * POST /lookups/refresh
 * Admin endpoint to clear cache and force refresh
 */
export async function refreshLookupsHandler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    lookupsService.clearCache();
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        message: 'Cache cleared. Next request will fetch fresh configuration.',
      }),
    };
  } catch (error: any) {
    console.error('[REFRESH_LOOKUPS_ERROR]:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: false,
        error: 'Failed to refresh configuration',
        message: error.message,
      }),
    };
  }
}
