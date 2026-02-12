/**
 * DynamoDB Deposit Repository Implementation
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Deposit, DepositProps } from '../../../domain/billing/entities/Deposit';
import { DepositRepository } from '../../../domain/billing/repositories';
import { Money } from '../../../domain/billing/value-objects/Money';
import { DepositStatus } from '../../../domain/billing/enums';

export class DynamoDBDepositRepository implements DepositRepository {
  constructor(
    private dynamoDB: DynamoDBClient,
    private tableName: string
  ) {}

  async save(deposit: Deposit): Promise<void> {
    const item = deposit.toDynamoDBFormat();
    
    await this.dynamoDB.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item),
      })
    );
  }

  async get(depositId: string, userId: string): Promise<Deposit | null> {
    // We need to query by depositId since we don't know the timestamp
    // This is inefficient - in production, you'd want a GSI on depositId
    const result = await this.dynamoDB.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: marshall({
          ':pk': `USER#${userId}`,
          ':sk': 'DEPOSIT#',
        }),
      })
    );

    if (!result.Items || result.Items.length === 0) {
      return null;
    }

    const items = result.Items.map(i => unmarshall(i));
    const item = items.find(i => i.depositId === depositId);
    
    return item ? this.toDomain(item) : null;
  }

  async findByUser(userId: string, limit: number = 50): Promise<Deposit[]> {
    const result = await this.dynamoDB.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: marshall({
          ':pk': `USER#${userId}`,
          ':sk': 'DEPOSIT#',
        }),
        Limit: limit,
        ScanIndexForward: false, // Most recent first
      })
    );

    if (!result.Items) {
      return [];
    }

    return result.Items.map(i => this.toDomain(unmarshall(i)));
  }

  private toDomain(item: any): Deposit {
    const props: DepositProps = {
      depositId: item.depositId,
      userId: item.userId,
      amount: Money.fromSmallestUnit(item.amountPaise, 'INR'),
      currency: 'INR',
      method: item.method,
      status: item.status as DepositStatus,
      referenceId: item.referenceId || null,
      notes: item.notes || null,
      createdAt: item.createdAt,
      completedAt: item.completedAt || null,
      createdBy: item.createdBy,
    };
    
    return Deposit.reconstitute(props);
  }
}
