/**
 * DynamoDB Wallet Repository Implementation
 */

import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Wallet, WalletProps } from '../../../domain/billing/entities/Wallet';
import { WalletRepository, ConcurrencyError } from '../../../domain/billing/repositories';
import { Money } from '../../../domain/billing/value-objects/Money';
import { WalletStatus } from '../../../domain/billing/enums';

export class DynamoDBWalletRepository implements WalletRepository {
  constructor(
    private dynamoDB: DynamoDBClient,
    private tableName: string
  ) {}

  async get(userId: string): Promise<Wallet | null> {
    const result = await this.dynamoDB.send(
      new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({
          PK: `USER#${userId}`,
          SK: 'WALLET',
        }),
      })
    );

    if (!result.Item) {
      return null;
    }

    const item = unmarshall(result.Item);
    return this.toDomain(item);
  }

  async save(wallet: Wallet): Promise<void> {
    const item = wallet.toDynamoDBFormat();
    
    await this.dynamoDB.send(
      new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(item),
      })
    );
  }

  async updateWithVersionCheck(wallet: Wallet, expectedVersion: number): Promise<void> {
    const item = wallet.toDynamoDBFormat();
    
    try {
      await this.dynamoDB.send(
        new PutItemCommand({
          TableName: this.tableName,
          Item: marshall(item),
          ConditionExpression: '#version = :expectedVersion',
          ExpressionAttributeNames: {
            '#version': 'version',
          },
          ExpressionAttributeValues: marshall({
            ':expectedVersion': expectedVersion,
          }),
        })
      );
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw new ConcurrencyError(
          `Wallet version mismatch. Expected ${expectedVersion}, but wallet was modified by another transaction.`
        );
      }
      throw error;
    }
  }

  private toDomain(item: any): Wallet {
    const props: WalletProps = {
      userId: item.userId,
      currency: 'INR',
      balanceTotalPaise: item.balanceTotalPaise,
      balanceReservedPaise: item.balanceReservedPaise,
      balanceOwedPaise: item.balanceOwedPaise,
      minimumBalanceThresholdPaise: item.minimumBalanceThresholdPaise,
      minimumWithdrawalPaise: item.minimumWithdrawalPaise,
      accountStatus: item.accountStatus as WalletStatus,
      gracePeriodUntil: item.gracePeriodUntil || null,
      withdrawalsDisabledUntil: item.withdrawalsDisabledUntil || null,
      version: item.version,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lastDepositAt: item.lastDepositAt || null,
      lastWithdrawalAt: item.lastWithdrawalAt || null,
    };
    
    return Wallet.reconstitute(props);
  }
}
