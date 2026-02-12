/**
 * Billing Guard Service
 * 
 * The gateway for all billable actions. Ensures users have enough balance
 * and handles the reservation/capture lifecycle.
 */

import { Money } from '../../domain/billing/value-objects/Money.js';
import { EventType } from '../../domain/billing/enums.js';
import { WalletRepository, UsageEventRepository } from '../../domain/billing/repositories/index.js';
import { LookupsService } from '../config/LookupsService.js';
import { UsageEvent } from '../../domain/billing/entities/UsageEvent.js';

export class BillingGuard {
  constructor(
    private walletRepo: WalletRepository,
    private usageRepo: UsageEventRepository,
    private lookupsService: LookupsService
  ) {}

  /**
   * Check if user is allowed to perform a billable action
   * and reserve the estimated cost.
   * 
   * @returns reservationId or null (if free)
   */
  async checkAndReserve(userId: string, eventType: EventType, quantity: number = 1): Promise<string | null> {
    // 1. Get current pricing from Lookups
    const costKey = this.getLookupKeyForEvent(eventType);
    if (!costKey) return null; // Action is free

    const unitPrice = await this.lookupsService.get<number>(costKey, 0);
    if (unitPrice <= 0) return null; // Pricing set to 0 (free)

    const totalCost = Money.fromMajorUnit(unitPrice * quantity, 'INR');

    // 2. Fetch Wallet
    const wallet = await this.walletRepo.get(userId);
    if (!wallet) {
      throw new Error('Wallet not found. Please initialize your account.');
    }

    if (wallet.accountStatus === 'SUSPENDED') {
      throw new Error('Account suspended due to insufficient funds. Please add funds to proceed.');
    }

    // 3. Check Balance (Available = Total - Reserved - Owed)
    // We allow usage if balanceAvailable covers the cost + minimum threshold (if set)
    const available = wallet.balanceAvailable;
    if (available.isLessThan(totalCost)) {
      throw new Error(`Insufficient balance. Action requires ₹${totalCost.amountInMajorUnit}, but you have ₹${available.amountInMajorUnit} available.`);
    }

    // 4. Create Usage Event (Reserved)
    const now = new Date();
    const billingPeriodId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const idempotencyKey = `IDEM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const usageEvent = UsageEvent.create({
      userId,
      eventType,
      resourceRef: null, // To be linked later if needed
      estimatedCost: totalCost,
      pricingVersion: 'v1', // Should ideally fetch current version from Lookups
      idempotencyKey,
      billingPeriodId,
      metadata: { quantity }
    });

    // 5. Update Wallet (Reserve Balance)
    wallet.reserveFunds(totalCost);

    // 6. Persist both (Optimistic Locking on Wallet)
    await this.walletRepo.updateWithVersionCheck(wallet, wallet.version);
    await this.usageRepo.save(usageEvent);

    return usageEvent.id;
  }

  /**
   * Release reserved funds if the action failed
   */
  async release(usageEventId: string, userId: string): Promise<void> {
    const event = await this.usageRepo.get(usageEventId, userId);
    if (!event || !event.isReserved) return;

    const wallet = await this.walletRepo.get(userId);
    if (!wallet) return;

    wallet.releaseFunds(event.cost);
    
    // Update event status
    event.reverse('Action failed');

    await this.walletRepo.updateWithVersionCheck(wallet, wallet.version);
    await this.usageRepo.save(event);
  }

  /**
   * Finalize the cost after the action succeeds
   */
  async capture(usageEventId: string, userId: string, actualQuantity?: number): Promise<void> {
    const event = await this.usageRepo.get(usageEventId, userId);
    if (!event || !event.isReserved) return;

    // For some actions (like bandwidth), the actual cost might differ from estimate
    if (actualQuantity !== undefined && (event.toJSON() as any).metadata?.quantity !== actualQuantity) {
      // Re-calculate actual cost
      const costKey = this.getLookupKeyForEvent(event.eventType);
      const unitPrice = await this.lookupsService.get<number>(costKey || '', 0);
      const actualCost = Money.fromMajorUnit(unitPrice * actualQuantity, 'INR');
      event.setActualCost(actualCost);
    } else {
      event.setActualCost(event.cost);
    }

    // Capture/Invoice the event
    // In our simplified flow, we'll mark as INVOICED if captured immediately
    // or keep as RESERVED for month-end settlement.
    // For now, let's mark as INVOICED to indicate it's finalized.
    event.markAsInvoiced('PENDING_SETTLEMENT');

    await this.usageRepo.save(event);
  }

  private getLookupKeyForEvent(eventType: EventType): string | null {
    switch (eventType) {
      case EventType.RETRIEVE_PHOTO: return 'billing.pricing.photoView';
      case EventType.DOWNLOAD_ZIP: return 'billing.pricing.zipDownload';
      case EventType.SHARE_LINK_CREATE: return 'billing.pricing.shareLink';
      case EventType.UPLOAD_STORE_GB_MONTH: return 'billing.pricing.storagePerGBPerMonth';
      default: return null;
    }
  }
}
