/**
 * Lookups Service
 * 
 * Manages runtime configuration stored in DynamoDB.
 * Enables zero-deployment updates to pricing, messages, and settings.
 */

import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

export interface LookupItem {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object';
  category: 'billing' | 'ui' | 'features' | 'limits';
  description?: string;
  updatedAt: number;
}

export class LookupsService {
  private cache: Map<string, any> = new Map();
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    private dynamoDB: DynamoDBClient,
    private tableName: string
  ) {}

  /**
   * Get all lookups (with caching)
   */
  async getAllLookups(): Promise<Record<string, any>> {
    const now = Date.now();
    
    // Return cached if still fresh
    if (this.cache.size > 0 && now < this.cacheExpiry) {
      console.log('[LOOKUPS] Returning cached config');
      return this.mapToObject(this.cache);
    }

    console.log('[LOOKUPS] Fetching fresh config from DynamoDB');
    
    // Query all config items
    const result = await this.dynamoDB.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: marshall({
          ':pk': 'SYSTEM#CONFIG',
        }),
      })
    );

    // Build cache
    this.cache.clear();
    
    if (result.Items) {
      for (const item of result.Items) {
        const unmarshalled = unmarshall(item);
        this.cache.set(unmarshalled.key, unmarshalled.value);
      }
    }

    // Set cache expiry
    this.cacheExpiry = now + this.CACHE_TTL_MS;

    return this.mapToObject(this.cache);
  }

  /**
   * Get single lookup value
   */
  async get<T = any>(key: string, defaultValue: T): Promise<T> {
    const allLookups = await this.getAllLookups();
    return (allLookups[key] as T) ?? defaultValue;
  }

  /**
   * Set lookup value (invalidates cache)
   */
  async set(params: {
    key: string;
    value: any;
    type?: 'string' | 'number' | 'boolean' | 'object';
    category?: 'billing' | 'ui' | 'features' | 'limits';
    description?: string;
  }): Promise<void> {
    const item: LookupItem = {
      key: params.key,
      value: params.value,
      type: params.type || this.inferType(params.value),
      category: params.category || this.inferCategory(params.key),
      description: params.description,
      updatedAt: Date.now(),
    };

    await this.dynamoDB.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall({
          PK: 'SYSTEM#CONFIG',
          SK: params.key,
          EntityType: 'Lookup',
          ...item,
        }),
      })
    );

    // Invalidate cache
    this.cache.clear();
    this.cacheExpiry = 0;
  }

  /**
   * Clear cache (force refresh on next get)
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheExpiry = 0;
  }

  private mapToObject(map: Map<string, any>): Record<string, any> {
    const obj: Record<string, any> = {};
    for (const [key, value] of map.entries()) {
      obj[key] = value;
    }
    return obj;
  }

  private inferType(value: any): 'string' | 'number' | 'boolean' | 'object' {
    if (typeof value === 'string') return 'string';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'object';
  }

  private inferCategory(key: string): 'billing' | 'ui' | 'features' | 'limits' {
    if (key.startsWith('billing.')) return 'billing';
    if (key.startsWith('ui.')) return 'ui';
    if (key.startsWith('features.')) return 'features';
    if (key.startsWith('limits.')) return 'limits';
    return 'billing';
  }
}
