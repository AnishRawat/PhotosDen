/**
 * Domain Events for Billing
 * 
 * Events published when important billing actions occur.
 * Event handlers listen to these to trigger notifications, emails, etc.
 */

import { Money } from '../value-objects/Money';
import { EventType } from '../enums';

export interface DomainEvent {
  eventId: string;
  eventType: string;
  occurredAt: number;
  userId: string;
}

/**
 * Published when funds are reserved for a billable action
 */
export interface FundsReservedEvent extends DomainEvent {
  eventType: 'FUNDS_RESERVED';
  usageEventId: string;
  billableEventType: EventType;
  amountReserved: Money;
  availableBalanceAfter: Money;
}

/**
 * Published when reserved funds are released (action failed)
 */
export interface FundsReleasedEvent extends DomainEvent {
  eventType: 'FUNDS_RELEASED';
  usageEventId: string;
  amountReleased: Money;
  reason: string;
}

/**
 * Published when reserved funds are captured (settlement)
 */
export interface FundsCapturedEvent extends DomainEvent {
  eventType: 'FUNDS_CAPTURED';
  invoiceId: string;
  amountCaptured: Money;
}

/**
 * Published when invoice is generated
 */
export interface InvoiceGeneratedEvent extends DomainEvent {
  eventType: 'INVOICE_GENERATED';
  invoiceId: string;
  billingPeriodId: string;
  totalAmount: Money;
  lineItemCount: number;
}

/**
 * Published when deposit is completed
 */
export interface DepositCompletedEvent extends DomainEvent {
  eventType: 'DEPOSIT_COMPLETED';
  depositId: string;
  amount: Money;
  newBalance: Money;
}

/**
 * Published when withdrawal is completed
 */
export interface WithdrawalCompletedEvent extends DomainEvent {
  eventType: 'WITHDRAWAL_COMPLETED';
  withdrawalId: string;
  amount: Money;
  fee: Money;
  newBalance: Money;
}

/**
 * Published when pricing changes
 */
export interface PricingChangedEvent extends DomainEvent {
  eventType: 'PRICING_CHANGED';
  userId: 'SYSTEM'; // Broadcast event
  newPricingVersion: string;
  oldPricingVersion: string;
  effectiveFrom: number;
  changes: Array<{
    eventType: EventType;
    oldPrice: Money;
    newPrice: Money;
    percentChange: number;
  }>;
}

/**
 * Published when reservation fails due to insufficient balance
 */
export interface ReservationFailedEvent extends DomainEvent {
  eventType: 'RESERVATION_FAILED';
  reason: 'INSUFFICIENT_BALANCE' | 'ACCOUNT_SUSPENDED' | 'RATE_LIMIT_EXCEEDED';
  attemptedCost: Money;
  availableBalance: Money;
}

/**
 * Published when wallet balance is low
 */
export interface WalletBalanceLowEvent extends DomainEvent {
  eventType: 'WALLET_BALANCE_LOW';
  currentBalance: Money;
  threshold: Money;
}

// Type union of all domain events
export type BillingDomainEvent =
  | FundsReservedEvent
  | FundsReleasedEvent
  | FundsCapturedEvent
  | InvoiceGeneratedEvent
  | DepositCompletedEvent
  | WithdrawalCompletedEvent
  | PricingChangedEvent
  | ReservationFailedEvent
  | WalletBalanceLowEvent;

/**
 * Event publisher interface (implemented in infrastructure layer)
 */
export interface EventPublisher {
  publish(event: BillingDomainEvent): Promise<void>;
}
