/**
 * AWS Price Sync Handler
 * 
 * Scheduled job to sync pricing daily.
 */

import { APIGatewayProxyResultV2 } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { LookupsService } from '../../infrastructure/config/LookupsService.js';
import { AwsPriceSyncService } from '../../infrastructure/config/AwsPriceSyncService.js';

const dynamoDB = new DynamoDBClient({});
const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'photosden-main';
const lookupsService = new LookupsService(dynamoDB, TABLE_NAME);
const priceSyncService = new AwsPriceSyncService(lookupsService);

/**
 * handler for EventBridge scheduled rule
 */
export async function syncAwsPricesHandler(event: any): Promise<void> {
  try {
    console.log('[JOB] Starting scheduled AWS price sync...');
    await priceSyncService.syncAll();
    console.log('[JOB] Scheduled AWS price sync completed successfully.');
  } catch (error) {
    console.error('[JOB] Scheduled AWS price sync failed:', error);
    throw error;
  }
}

/**
 * POST /admin/pricing/sync
 * Manual trigger for admin
 */
export async function manualPriceSyncHandler(event: any): Promise<APIGatewayProxyResultV2> {
  try {
    // TODO: Add Admin Authorization check
    await priceSyncService.syncAll();
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'AWS prices synchronized and lookups updated.',
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
      }),
    };
  }
}
