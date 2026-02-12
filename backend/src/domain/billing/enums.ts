/**
 * Event Types for Billable Actions
 * Source of truth for all pricing calculations
 */

export enum EventType {
  // File Operations
  UPLOAD_INIT = 'UPLOAD_INIT', // Free (we absorb S3 PUT cost)
  UPLOAD_STORE_GB_MONTH = 'UPLOAD_STORE_GB_MONTH', // ₹6/GB/month (accrued daily)
  RETRIEVE_PHOTO = 'RETRIEVE_PHOTO', // ₹1 per retrieval
  DOWNLOAD_ZIP = 'DOWNLOAD_ZIP', // ₹5 per zip generation
  
  // Sharing
  SHARE_LINK_CREATE = 'SHARE_LINK_CREATE', // ₹2 per link creation (one-time)
  SHARE_LINK_VISIT = 'SHARE_LINK_VISIT', // ₹0.5 per unique visit (owner pays)
  
  // Processing (Future)
  GENERATE_VARIANT_1080P = 'GENERATE_VARIANT_1080P', // ₹3 per variant
  GENERATE_VARIANT_4K = 'GENERATE_VARIANT_4K', // ₹10 per variant
  
  // Bandwidth
  BANDWIDTH_GB = 'BANDWIDTH_GB', // ₹20 per GB transferred
}

/**
 * Wallet Account Status
 */
export enum WalletStatus {
  ACTIVE = 'ACTIVE', // Normal operations
  GRACE_PERIOD = 'GRACE_PERIOD', // Negative balance, time to add funds
  SUSPENDED = 'SUSPENDED', // No billable actions allowed
  FROZEN = 'FROZEN', // User-initiated freeze (e.g., during investigation)
}

/**
 * Usage Event Status (Reservation Lifecycle)
 */
export enum UsageEventStatus {
  RESERVED = 'RESERVED', // Funds locked, action in progress
  INVOICED = 'INVOICED', // Captured at month-end, part of invoice
  REVERSED = 'REVERSED', // Released due to action failure
}

/**
 * Invoice Status
 */
export enum InvoiceStatus {
  PAID = 'PAID', // Successfully settled
  FAILED = 'FAILED', // Settlement failed (partial payment)
  PARTIAL = 'PARTIAL', // Some events couldn't be captured
}

/**
 * Deposit Status
 */
export enum DepositStatus {
  PENDING = 'PENDING', // Awaiting payment gateway confirmation
  COMPLETED = 'COMPLETED', // Successfully credited to wallet
  FAILED = 'FAILED', // Payment failed
}

/**
 * Withdrawal Status
 */
export enum WithdrawalStatus {
  PENDING = 'PENDING', // User requested, not processed yet
  PROCESSING = 'PROCESSING', // Bank transfer in progress
  COMPLETED = 'COMPLETED', // Successfully withdrawn
  FAILED = 'FAILED', // Bank transfer failed
  CANCELLED = 'CANCELLED', // User cancelled
}

/**
 * Refund Reason
 */
export enum RefundReason {
  SYSTEM_ERROR = 'SYSTEM_ERROR', // Our bug (auto-approved)
  DOUBLE_CHARGE = 'DOUBLE_CHARGE', // Idempotency failure (auto-approved)
  ACTION_FAILED = 'ACTION_FAILED', // User claims action didn't complete (manual review)
  USER_REQUEST = 'USER_REQUEST', // General user request (manual review)
}

/**
 * Refund Status
 */
export enum RefundStatus {
  PENDING = 'PENDING', // Awaiting approval
  APPROVED = 'APPROVED', // Admin approved, will be processed
  REJECTED = 'REJECTED', // Admin rejected
  COMPLETED = 'COMPLETED', // Refund credited to wallet
  FAILED = 'FAILED', // Processing failed
}

/**
 * Notification Type
 */
export enum NotificationType {
  // Critical (Immediate)
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  RESERVATION_FAILED = 'RESERVATION_FAILED',
  SETTLEMENT_FAILED = 'SETTLEMENT_FAILED',
  ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED',
  
  // High Priority (Within 1 hour)
  LOW_BALANCE_WARNING = 'LOW_BALANCE_WARNING',
  INVOICE_GENERATED = 'INVOICE_GENERATED',
  WITHDRAWAL_COMPLETED = 'WITHDRAWAL_COMPLETED',
  WITHDRAWAL_FAILED = 'WITHDRAWAL_FAILED',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PRICING_CHANGE_UPCOMING = 'PRICING_CHANGE_UPCOMING',
  
  // Medium Priority (Within 24 hours)
  DEPOSIT_CONFIRMED = 'DEPOSIT_CONFIRMED',
  REFUND_PROCESSED = 'REFUND_PROCESSED',
  SHARE_LINK_CREATED = 'SHARE_LINK_CREATED',
  PREFERENCE_UPDATED = 'PREFERENCE_UPDATED',
  
  // Low Priority (Batched weekly)
  WEEKLY_USAGE_SUMMARY = 'WEEKLY_USAGE_SUMMARY',
  MONTHLY_BILL_PREVIEW = 'MONTHLY_BILL_PREVIEW',
}

/**
 * Notification Priority
 */
export enum NotificationPriority {
  CRITICAL = 'CRITICAL', // Immediate action required
  HIGH = 'HIGH', // Important, read soon
  MEDIUM = 'MEDIUM', // Informational
  LOW = 'LOW', // FYI, can be ignored
}

/**
 * Billing Period Status
 */
export enum BillingPeriodStatus {
  OPEN = 'OPEN', // Current period, accepting charges
  CLOSING = 'CLOSING', // Settlement in progress
  PAID = 'PAID', // Successfully settled
  FAILED = 'FAILED', // Settlement failed
}

/**
 * Wallet Ledger Entry Type
 */
export enum LedgerEntryType {
  DEPOSIT = 'DEPOSIT', // User added funds
  RESERVE = 'RESERVE', // Funds locked for usage
  CAPTURE = 'CAPTURE', // Reserved funds moved to invoice
  RELEASE = 'RELEASE', // Reserved funds returned (action failed)
  WITHDRAW = 'WITHDRAW', // User withdrew funds
  ADJUSTMENT = 'ADJUSTMENT', // Admin manual adjustment
}

/**
 * Admin Adjustment Type
 */
export enum AdjustmentType {
  CREDIT = 'CREDIT', // Add funds to wallet
  DEBIT = 'DEBIT', // Remove funds from wallet
}

/**
 * Admin Adjustment Category
 */
export enum AdjustmentCategory {
  COMPENSATION = 'COMPENSATION', // Compensate for downtime/bug
  CORRECTION = 'CORRECTION', // Fix billing error
  PROMOTION = 'PROMOTION', // Marketing credit
  PENALTY = 'PENALTY', // Abuse/TOS violation
}

/**
 * Pricing Change Reason
 */
export enum PricingChangeReason {
  AWS_COST_INCREASE = 'AWS_COST_INCREASE',
  AWS_COST_DECREASE = 'AWS_COST_DECREASE',
  MANUAL_ADJUSTMENT = 'MANUAL_ADJUSTMENT',
  MARKET_ANALYSIS = 'MARKET_ANALYSIS',
}

/**
 * Cost Source (for reconciliation)
 */
export enum CostSource {
  ESTIMATED = 'ESTIMATED', // Price locked at reservation time
  ACTUAL = 'ACTUAL', // Measured after action (e.g., actual bandwidth used)
  RECONCILED = 'RECONCILED', // Adjusted after review
}
