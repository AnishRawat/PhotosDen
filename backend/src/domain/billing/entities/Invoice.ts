/**
 * Invoice Entity
 * 
 * Immutable record of a settled billing period.
 * Generated at month-end after capturing all reserved funds.
 */

import { Money } from '../value-objects/Money';
import { InvoiceStatus, EventType } from '../enums';

export interface InvoiceSummaryBreakdown {
  [eventType: string]: {
    count: number;
    totalCost: Money;
  };
}

export interface InvoiceProps {
  invoiceId: string;
  userId: string;
  billingPeriodId: string; // yyyymm
  total: Money;
  currency: 'INR';
  periodStart: number;
  periodEnd: number;
  paidAt: number; // Settlement timestamp
  status: InvoiceStatus;
  lineItemCount: number; // Total usage events
  summaryBreakdown: InvoiceSummaryBreakdown; // Aggregated by eventType
  failureReason: string | null;
  createdAt: number;
}

export class Invoice {
  private constructor(private props: InvoiceProps) {}

  /**
   * Create invoice from billing period
   */
  static create(params: {
    userId: string;
    billingPeriodId: string;
    total: Money;
    periodStart: number;
    periodEnd: number;
    lineItemCount: number;
    summaryBreakdown: InvoiceSummaryBreakdown;
  }): Invoice {
    return new Invoice({
      invoiceId: this.generateId(),
      userId: params.userId,
      billingPeriodId: params.billingPeriodId,
      total: params.total,
      currency: 'INR',
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      paidAt: Date.now(),
      status: InvoiceStatus.PAID,
      lineItemCount: params.lineItemCount,
      summaryBreakdown: params.summaryBreakdown,
      failureReason: null,
      createdAt: Date.now(),
    });
  }

  static reconstitute(props: InvoiceProps): Invoice {
    return new Invoice(props);
  }

  private static generateId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `INV-${timestamp}-${random}`;
  }

  // ===== Getters =====

  get id(): string {
    return this.props.invoiceId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get total(): Money {
    return this.props.total;
  }

  get status(): InvoiceStatus {
    return this.props.status;
  }

  get formattedPeriod(): string {
    const start = new Date(this.props.periodStart);
    const end = new Date(this.props.periodEnd);
    return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
  }

  // ===== Commands =====

  /**
   * Mark as failed (settlement failed)
   */
  markAsFailed(reason: string): void {
    this.props.status = InvoiceStatus.FAILED;
    this.props.failureReason = reason;
  }

  /**
   * Mark as partial (some events couldn't be captured)
   */
  markAsPartial(reason: string): void {
    this.props.status = InvoiceStatus.PARTIAL;
    this.props.failureReason = reason;
  }

  // ===== Serialization =====

  toJSON() {
    return {
      ...this.props,
      total: this.props.total.toJSON(),
      summaryBreakdown: Object.fromEntries(
        Object.entries(this.props.summaryBreakdown).map(([key, value]) => [
          key,
          { count: value.count, totalCost: value.totalCost.toJSON() },
        ])
      ),
    };
  }

  toDynamoDBFormat() {
    return {
      PK: `USER#${this.props.userId}`,
      SK: `INVOICE#${this.props.paidAt}#${this.props.invoiceId}`,
      EntityType: 'Invoice',
      GSI1PK: `USER#${this.props.userId}#INVOICES`,
      GSI1SK: `INVOICE#${this.props.paidAt}#${this.props.invoiceId}`,
      invoiceId: this.props.invoiceId,
      userId: this.props.userId,
      billingPeriodId: this.props.billingPeriodId,
      totalPaise: this.props.total.amountInSmallestUnit,
      currency: this.props.currency,
      periodStart: this.props.periodStart,
      periodEnd: this.props.periodEnd,
      paidAt: this.props.paidAt,
      status: this.props.status,
      lineItemCount: this.props.lineItemCount,
      summaryBreakdown: Object.fromEntries(
        Object.entries(this.props.summaryBreakdown).map(([key, value]) => [
          key,
          {
            count: value.count,
            totalCostPaise: value.totalCost.amountInSmallestUnit,
          },
        ])
      ),
      failureReason: this.props.failureReason,
      createdAt: this.props.createdAt,
    };
  }
}
