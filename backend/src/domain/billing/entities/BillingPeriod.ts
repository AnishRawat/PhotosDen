/**
 * BillingPeriod Entity
 * 
 * Represents a monthly billing cycle (calendar month).
 * Tracks current bill, expected bill, and settlement status.
 */

import { Money } from '../value-objects/Money';
import { BillingPeriodStatus } from '../enums';

export interface BillingPeriodProps {
  billingPeriodId: string; // yyyymm format (e.g., '202402')
  userId: string;
  periodStart: number; // First second of month
  periodEnd: number; // Last second of month
  currentBill: Money; // Running total of reserved charges
  expectedBill: Money; // Projected month-end bill
  reserved: Money; // Should match wallet.balanceReserved
  status: BillingPeriodStatus;
  invoiceId: string | null;
  settledAt: number | null;
  usageEventCount: number;
  lastUsageEventAt: number | null;
  lowBalanceWarningsSent: number;
  lastWarningAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export class BillingPeriod {
  private constructor(private props: BillingPeriodProps) {}

  /**
   * Create a new billing period for a month
   */
  static create(userId: string, year: number, month: number): BillingPeriod {
    const periodStart = new Date(year, month - 1, 1, 0, 0, 0, 0).getTime();
    const periodEnd = new Date(year, month, 0, 23, 59, 59, 999).getTime();
    const billingPeriodId = `${year}${month.toString().padStart(2, '0')}`; // '202402'

    return new BillingPeriod({
      billingPeriodId,
      userId,
      periodStart,
      periodEnd,
      currentBill: Money.zero('INR'),
      expectedBill: Money.zero('INR'),
      reserved: Money.zero('INR'),
      status: BillingPeriodStatus.OPEN,
      invoiceId: null,
      settledAt: null,
      usageEventCount: 0,
      lastUsageEventAt: null,
      lowBalanceWarningsSent: 0,
      lastWarningAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  static reconstitute(props: BillingPeriodProps): BillingPeriod {
    return new BillingPeriod(props);
  }

  // ===== Getters =====

  get id(): string {
    return this.props.billingPeriodId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get currentBill(): Money {
    return this.props.currentBill;
  }

  get status(): BillingPeriodStatus {
    return this.props.status;
  }

  get isOpen(): boolean {
    return this.props.status === BillingPeriodStatus.OPEN;
  }

  get isPaid(): boolean {
    return this.props.status === BillingPeriodStatus.PAID;
  }

  // ===== Commands =====

  /**
   * Add usage event to this period (increment bill)
   */
  addUsageEvent(cost: Money): void {
    if (!this.isOpen) {
      throw new Error(
        `Cannot add usage to billing period with status ${this.props.status}`
      );
    }

    this.props.currentBill = this.props.currentBill.add(cost);
    this.props.reserved = this.props.reserved.add(cost);
    this.props.usageEventCount += 1;
    this.props.lastUsageEventAt = Date.now();
    this.props.updatedAt = Date.now();

    // Update expected bill (for now, simple: expected = current)
    this.props.expectedBill = this.props.currentBill;
  }

  /**
   * Remove usage event from this period (release reversal)
   */
  removeUsageEvent(cost: Money): void {
    if (!this.isOpen) {
      throw new Error(
        `Cannot remove usage from billing period with status ${this.props.status}`
      );
    }

    this.props.currentBill = this.props.currentBill.subtract(cost);
    this.props.reserved = this.props.reserved.subtract(cost);
    this.props.usageEventCount -= 1;
    this.props.updatedAt = Date.now();

    // Update expected bill
    this.props.expectedBill = this.props.currentBill;
  }

  /**
   * Mark as closing (settlement in progress)
   */
  markAsClosing(): void {
    if (!this.isOpen) {
      throw new Error(
        `Cannot close billing period with status ${this.props.status}`
      );
    }

    this.props.status = BillingPeriodStatus.CLOSING;
    this.props.updatedAt = Date.now();
  }

  /**
   * Mark as paid (settlement completed)
   */
  markAsPaid(invoiceId: string): void {
    if (this.props.status !== BillingPeriodStatus.CLOSING) {
      throw new Error(
        `Cannot mark as paid: billing period is ${this.props.status}, expected CLOSING`
      );
    }

    this.props.status = BillingPeriodStatus.PAID;
    this.props.invoiceId = invoiceId;
    this.props.settledAt = Date.now();
    this.props.reserved = Money.zero('INR'); // All reserved funds captured
    this.props.updatedAt = Date.now();
  }

  /**
   * Mark as failed (settlement failed)
   */
  markAsFailed(): void {
    this.props.status = BillingPeriodStatus.FAILED;
    this.props.updatedAt = Date.now();
  }

  /**
   * Record low balance warning sent
   */
  recordLowBalanceWarning(): void {
    this.props.lowBalanceWarningsSent += 1;
    this.props.lastWarningAt = Date.now();
    this.props.updatedAt = Date.now();
  }

  // ===== Serialization =====

  toJSON() {
    return {
      ...this.props,
      currentBill: this.props.currentBill.toJSON(),
      expectedBill: this.props.expectedBill.toJSON(),
      reserved: this.props.reserved.toJSON(),
    };
  }

  toDynamoDBFormat() {
    return {
      PK: `USER#${this.props.userId}`,
      SK: `BILL#${this.props.billingPeriodId}`,
      EntityType: 'BillingPeriod',
      GSI1PK: `USER#${this.props.userId}#BILL_STATUS#${this.props.status}`,
      GSI1SK: `BILL#${this.props.periodStart}`,
      billingPeriodId: this.props.billingPeriodId,
      userId: this.props.userId,
      periodStart: this.props.periodStart,
      periodEnd: this.props.periodEnd,
      currentBillPaise: this.props.currentBill.amountInSmallestUnit,
      expectedBillPaise: this.props.expectedBill.amountInSmallestUnit,
      reservedPaise: this.props.reserved.amountInSmallestUnit,
      currency: 'INR',
      status: this.props.status,
      invoiceId: this.props.invoiceId,
      settledAt: this.props.settledAt,
      usageEventCount: this.props.usageEventCount,
      lastUsageEventAt: this.props.lastUsageEventAt,
      lowBalanceWarningsSent: this.props.lowBalanceWarningsSent,
      lastWarningAt: this.props.lastWarningAt,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
    };
  }
}
