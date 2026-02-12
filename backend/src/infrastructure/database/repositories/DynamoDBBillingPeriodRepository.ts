/**
 * DynamoDB Billing Period Repository
 */

import { DynamoDBClient, GetItemCommand, QueryCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { BillingPeriodRepository } from "../../../domain/billing/repositories/index.js";
import { BillingPeriod } from "../../../domain/billing/entities/BillingPeriod.js";
import { Money } from "../../../domain/billing/value-objects/Money.js";

export class DynamoDBBillingPeriodRepository implements BillingPeriodRepository {
  constructor(
    private dynamoDB: DynamoDBClient,
    private tableName: string
  ) {}

  async get(userId: string, periodId: string): Promise<BillingPeriod | null> {
    const result = await this.dynamoDB.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `USER#${userId}`,
          SK: `PERIOD#${periodId}`,
        }),
      })
    );

    if (!result.Item) return null;

    const data = unmarshall(result.Item);
    
    // Minimal reconstruction for MVP Billing Status
    return {
      userId: data.userId,
      periodId: data.periodId,
      currentBill: Money.fromSmallestUnit(data.currentBillPaise || 0),
      expectedBill: Money.fromSmallestUnit(data.expectedBillPaise || data.currentBillPaise || 0),
      props: data
    } as any;
  }

  async getCurrentPeriod(userId: string): Promise<BillingPeriod | null> {
    const now = new Date();
    const periodId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.get(userId, periodId);
  }

  async findByStatus(userId: string, status: string): Promise<BillingPeriod[]> {
    const result = await this.dynamoDB.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: "GSI1", // Assuming GSI1 supports this
        KeyConditionExpression: "GSI1PK = :pk AND GSI1SK = :sk",
        ExpressionAttributeValues: marshall({
          ":pk": `USER#${userId}#PERIODS`,
          ":sk": `STATUS#${status}`,
        }),
      })
    );

    if (!result.Items) return [];
    return result.Items.map(item => unmarshall(item) as any);
  }

  async save(period: BillingPeriod): Promise<void> {
    const item = (period as any).toDynamoDBFormat ? (period as any).toDynamoDBFormat() : period;
    await this.dynamoDB.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item),
      })
    );
  }
}
