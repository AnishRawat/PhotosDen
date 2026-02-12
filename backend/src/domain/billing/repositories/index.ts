/**
 * Repository Interfaces (Ports)
 * Domain layer defines what it needs, infrastructure implements it
 */

import { Wallet } from '../entities/Wallet';
import { UsageEvent } from '../entities/UsageEvent';
import { BillingPeriod } from '../entities/BillingPeriod';
import { Invoice } from '../entities/Invoice';
import { PricingConfig } from '../entities/PricingConfig';
import { Deposit } from '../entities/Deposit';
import { Notification } from '../entities/Notification';

/**
 * Wallet Repository
 */
export interface WalletRepository {
  get(userId: string): Promise<Wallet | null>;
  save(wallet: Wallet): Promise<void>;
  /**
   * Update with optimistic locking (version check)
   * Throws ConcurrencyError if version mismatch
   */
  updateWithVersionCheck(wallet: Wallet, expectedVersion: number): Promise<void>;
}

/**
 * Usage Event Repository
 */
export interface UsageEventRepository {
  save(event: UsageEvent): Promise<void>;
  get(usageEventId: string, userId: string): Promise<UsageEvent | null>;
  findByPeriod(userId: string, billingPeriodId: string): Promise<UsageEvent[]>;
  findReservedByPeriod(userId: string, billingPeriodId: string): Promise<UsageEvent[]>;
}

/**
 * Billing Period Repository
 */
export interface BillingPeriodRepository {
  save(period: BillingPeriod): Promise<void>;
  get(userId: string, billingPeriodId: string): Promise<BillingPeriod | null>;
  getCurrentPeriod(userId: string): Promise<BillingPeriod | null>;
  findByStatus(userId: string, status: string): Promise<BillingPeriod[]>;
}

/**
 * Invoice Repository
 */
export interface InvoiceRepository {
  save(invoice: Invoice): Promise<void>;
  get(invoiceId: string, userId: string): Promise<Invoice | null>;
  findByUser(userId: string, limit?: number): Promise<Invoice[]>;
}

/**
 * Pricing Config Repository
 */
export interface PricingConfigRepository {
  save(config: PricingConfig): Promise<void>;
  getActive(): Promise<PricingConfig | null>;
  getByVersion(version: string): Promise<PricingConfig | null>;
}

/**
 * Deposit Repository
 */
export interface DepositRepository {
  save(deposit: Deposit): Promise<void>;
  get(depositId: string, userId: string): Promise<Deposit | null>;
  findByUser(userId: string, limit?: number): Promise<Deposit[]>;
}

/**
 * Notification Repository
 */
export interface NotificationRepository {
  save(notification: Notification): Promise<void>;
  get(notificationId: string, userId: string): Promise<Notification | null>;
  findByUser(userId: string, includeDeleted?: boolean, limit?: number): Promise<Notification[]>;
  countUnread(userId: string): Promise<number>;
}

/**
 * Concurrency Error (thrown when optimistic lock fails)
 */
export class ConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConcurrencyError';
  }
}
