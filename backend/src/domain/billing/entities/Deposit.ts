/**
 * Deposit Entity
 */

import { Money } from '../value-objects/Money';
import { DepositStatus } from '../enums';

export interface DepositProps {
  depositId: string;
  userId: string;
  amount: Money;
  currency: 'INR';
  method: 'MANUAL_CREDIT' | 'PAYMENT_GATEWAY' | 'ADMIN_ADJUSTMENT';
  status: DepositStatus;
  referenceId: string | null;
  notes: string | null;
  createdAt: number;
  completedAt: number | null;
  createdBy: string; // userId or 'SYSTEM' or adminId
}

export class Deposit {
  private constructor(private props: DepositProps) {}

  static create(params: {
    userId: string;
    amount: Money;
    method: 'MANUAL_CREDIT' | 'PAYMENT_GATEWAY' | 'ADMIN_ADJUSTMENT';
    createdBy: string;
    notes?: string;
  }): Deposit {
    return new Deposit({
      depositId: `dep_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: params.userId,
      amount: params.amount,
      currency: 'INR',
      method: params.method,
      status: DepositStatus.PENDING,
      referenceId: null,
      notes: params.notes || null,
      createdAt: Date.now(),
      completedAt: null,
      createdBy: params.createdBy,
    });
  }

  static reconstitute(props: DepositProps): Deposit {
    return new Deposit(props);
  }

  get id(): string {
    return this.props.depositId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get status(): DepositStatus {
    return this.props.status;
  }

  markAsCompleted(referenceId?: string): void {
    if (this.props.status !== DepositStatus.PENDING) {
      throw new Error(`Cannot complete deposit with status ${this.props.status}`);
    }
    this.props.status = DepositStatus.COMPLETED;
    this.props.completedAt = Date.now();
    if (referenceId) {
      this.props.referenceId = referenceId;
    }
  }

  markAsFailed(): void {
    if (this.props.status !== DepositStatus.PENDING) {
      throw new Error(`Cannot fail deposit with status ${this.props.status}`);
    }
    this.props.status = DepositStatus.FAILED;
  }

  toJSON() {
    return { ...this.props, amount: this.props.amount.toJSON() };
  }

  toDynamoDBFormat() {
    return {
      PK: `USER#${this.props.userId}`,
      SK: `DEPOSIT#${this.props.createdAt}#${this.props.depositId}`,
      EntityType: 'Deposit',
      GSI1PK: `USER#${this.props.userId}#DEPOSIT#${this.props.status}`,
      GSI1SK: `DEPOSIT#${this.props.createdAt}`,
      ...this.props,
      amountPaise: this.props.amount.amountInSmallestUnit,
    };
  }
}
