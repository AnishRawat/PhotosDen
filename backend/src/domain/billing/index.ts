/**
 * Billing Domain Layer - Public Exports
 * Clean Architecture: Domain layer is the core, dependency-free
 */

// Value Objects
export { Money, CurrencyCode, CURRENCY_METADATA } from './value-objects/Money';

// Enums
export {
  EventType,
  WalletStatus,
  UsageEventStatus,
  InvoiceStatus,
  DepositStatus,
  WithdrawalStatus,
  RefundReason,
  RefundStatus,
  NotificationType,
  NotificationPriority,
  BillingPeriodStatus,
  LedgerEntryType,
  AdjustmentType,
  AdjustmentCategory,
  PricingChangeReason,
  CostSource,
} from './enums';

// Entities
export { Wallet, WalletProps, WalletNotActiveError, InsufficientBalanceError, InvariantViolationError } from './entities/Wallet';
export { UsageEvent, UsageEventProps } from './entities/UsageEvent';
export { BillingPeriod, BillingPeriodProps } from './entities/BillingPeriod';
export { Invoice, InvoiceProps, InvoiceSummaryBreakdown } from './entities/Invoice';
export { PricingConfig, PricingConfigProps, PricingRate, PricingRates } from './entities/PricingConfig';

// Domain Events
export {
  BillingDomainEvent,
  FundsReservedEvent,
  FundsReleasedEvent,
  FundsCapturedEvent,
  InvoiceGeneratedEvent,
  DepositCompletedEvent,
  WithdrawalCompletedEvent,
  PricingChangedEvent,
  ReservationFailedEvent,
  WalletBalanceLowEvent,
  EventPublisher,
} from './events/DomainEvents';
