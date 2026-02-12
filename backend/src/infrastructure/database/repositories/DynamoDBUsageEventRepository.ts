/**
 * DynamoDB Usage Event Repository
 */

import { DynamoDBClient, QueryCommand, GetItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { UsageEventRepository } from "../../../domain/billing/repositories/index.js";
import { UsageEvent } from "../../../domain/billing/entities/UsageEvent.js";

export class DynamoDBUsageEventRepository implements UsageEventRepository {
  constructor(
    private dynamoDB: DynamoDBClient,
    private tableName: string
  ) {}

  async get(usageEventId: string, userId: string): Promise<UsageEvent | null> {
    const result = await this.dynamoDB.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `USER#${userId}`,
          SK: `USAGE_EVENT#${usageEventId}`,
        }),
      })
    );

    if (!result.Item) return null;
    const data = unmarshall(result.Item);
    return { props: data } as any;
  }

  async findByPeriod(userId: string, periodId: string): Promise<UsageEvent[]> {
    const result = await this.dynamoDB.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: marshall({
          ":pk": `USER#${userId}`,
          ":sk": `USAGE#${periodId}`,
        }),
      })
    );

    if (!result.Items) return [];

    return result.Items.map(item => {
      const data = unmarshall(item);
      return { props: data } as any; 
    });
  }

  async findReservedByPeriod(userId: string, periodId: string): Promise<UsageEvent[]> {
    // In a real app, this would use a GSI or filter
    const all = await this.findByPeriod(userId, periodId);
    return all.filter((e: any) => e.props.status === 'RESERVED');
  }

  async save(event: UsageEvent): Promise<void> {
    const item = (event as any).toDynamoDBFormat ? (event as any).toDynamoDBFormat() : event;
    await this.dynamoDB.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item),
      })
    );
  }
}
