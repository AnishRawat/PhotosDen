/**
 * UsageEvent Entity
 * 
 * Represents a single billable action.
 * Tracks the lifecycle: RESERVED → INVOICED or REVERSED
 */

import { Money } from '../value-objects/Money';
import { EventType, UsageEventStatus, CostSource } from '../enums';

export interface UsageEventProps {
  usageEventId: string;
  userId: string;
  eventType: EventType;
  resourceRef: string | null; // fileId, albumId, shareId, etc.
  estimatedCost: Money; // Price locked at reservation time
  actualCost: Money | null; // May differ if reconciled (e.g., actual bandwidth)
  costSource: CostSource;
  pricingVersion: string; // Which pricing config was used
  status: UsageEventStatus;
  invoiceId: string | null; // Set when status = INVOICED
  reversedAt: number | null;
  reversalReason: string | null;
  idempotencyKey: string;
  billingPeriodId: string; // yyyymm format (e.g., '202402')
  metadata: Record<string, any>; // Event-specific data
  createdAt: number;
}

export class UsageEvent {
  private constructor(private props: UsageEventProps) {}

  static create(params: {
    userId: string;
    eventType: EventType;
    resourceRef: string | null;
    estimatedCost: Money;
    pricingVersion: string;
    idempotencyKey: string;
    billingPeriodId: string;
    metadata?: Record<string, any>;
  }): UsageEvent {
    return new UsageEvent({
      usageEventId: this.generateId(),
      userId: params.userId,
      eventType: params.eventType,
      resourceRef: params.resourceRef,
      estimatedCost: params.estimatedCost,
      actualCost: null,
      costSource: CostSource.ESTIMATED,
      pricingVersion: params.pricingVersion,
      status: UsageEventStatus.RESERVED,
      invoiceId: null,
      reversedAt: null,
      reversalReason: null,
      idempotencyKey: params.idempotencyKey,
      billingPeriodId: params.billingPeriodId,
      metadata: params.metadata || {},
      createdAt: Date.now(),
    });
  }

  static reconstitute(props: UsageEventProps): UsageEvent {
    return new UsageEvent(props);
  }

  private static generateId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  // ===== Getters =====

  get id(): string {
    return this.props.usageEventId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get eventType(): EventType {
    return this.props.eventType;
  }

  get cost(): Money {
    return this.props.actualCost || this.props.estimatedCost;
  }

  get status(): UsageEventStatus {
    return this.props.status;
  }

  get isReserved(): boolean {
    return this.props.status === UsageEventStatus.RESERVED;
  }

  get isInvoiced(): boolean {
    return this.props.status === UsageEventStatus.INVOICED;
  }

  get isReversed(): boolean {
    return this.props.status === UsageEventStatus.REVERSED;
  }

  // ===== Commands =====

  /**
   * Mark as invoiced (called during settlement)
   */
  markAsInvoiced(invoiceId: string): void {
    if (!this.isReserved) {
      throw new Error(
        `Cannot invoice usage event with status ${this.props.status}`
      );
    }

    this.props.status = UsageEventStatus.INVOICED;
    this.props.invoiceId = invoiceId;
  }

  /**
   * Reverse (release funds due to action failure)
   */
  reverse(reason: string): void {
    if (!this.isReserved) {
      throw new Error(
        `Cannot reverse usage event with status ${this.props.status}`
      );
    }

    this.props.status = UsageEventStatus.REVERSED;
    this.props.reversedAt = Date.now();
    this.props.reversalReason = reason;
  }

  /**
   * Set actual cost (for reconciliation)
   */
  setActualCost(actualCost: Money): void {
    this.props.actualCost = actualCost;
    this.props.costSource = CostSource.ACTUAL;
  }

  // ===== Serialization =====

  /**
   * Convert to plain object for serialization
   */
  toJSON() {
    return {
      ...this.props,
      estimatedCostPaise: this.props.estimatedCost.amountInSmallestUnit,
      actualCostPaise: this.props.actualCost?.amountInSmallestUnit || null,
    };
  }

  toDynamoDBFormat() {
    return {
      PK: `USER#${this.props.userId}`,
      SK: `USAGE#${this.props.createdAt}#${this.props.usageEventId}`,
      EntityType: 'UsageEvent',
      GSI1PK: `USER#${this.props.userId}#PERIOD#${this.props.billingPeriodId}`,
      GSI1SK: `USAGE#${this.props.createdAt}#${this.props.usageEventId}`,
      GSI2PK: `USER#${this.props.userId}#STATUS#${this.props.status}`,
      GSI2SK: `USAGE#${this.props.createdAt}`,
      ...this.props,
      estimatedCostPaise: this.props.estimatedCost.amountInSmallestUnit,
      actualCostPaise: this.props.actualCost?.amountInSmallestUnit || null,
      currency: this.props.estimatedCost.currency,
    };
  }
}
