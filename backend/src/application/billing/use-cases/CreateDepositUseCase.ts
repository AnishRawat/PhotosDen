/**
 * Create Deposit Use Case
 */

import { Wallet } from '../../../domain/billing/entities/Wallet';
import { Deposit } from '../../../domain/billing/entities/Deposit';
import { Money } from '../../../domain/billing/value-objects/Money';
import { WalletRepository, DepositRepository } from '../../../domain/billing/repositories';
import { EventPublisher, DepositCompletedEvent } from '../../../domain/billing/events/DomainEvents';

export class CreateDepositUseCase {
  constructor(
    private walletRepo: WalletRepository,
    private depositRepo: DepositRepository,
    private eventPublisher: EventPublisher
  ) {}

  async execute(params: {
    userId: string;
    amountPaise: number;
    method: 'MANUAL_CREDIT' | 'PAYMENT_GATEWAY' | 'ADMIN_ADJUSTMENT';
    createdBy: string;
    notes?: string;
  }): Promise<{ depositId: string; newBalancePaise: number }> {
    // Get wallet
    const wallet = await this.walletRepo.get(params.userId);
    if (!wallet) {
      throw new Error(`Wallet not found for user ${params.userId}`);
    }

    // Create deposit
    const amount = Money.fromSmallestUnit(params.amountPaise, 'INR');
    const deposit = Deposit.create({
      userId: params.userId,
      amount,
      method: params.method,
      createdBy: params.createdBy,
      notes: params.notes,
    });

    // Mark as completed immediately for manual credits
    if (params.method === 'MANUAL_CREDIT' || params.method === 'ADMIN_ADJUSTMENT') {
      deposit.markAsCompleted();
    }

    // Save deposit
    await this.depositRepo.save(deposit);

    // If completed, credit wallet
    if (deposit.status === 'COMPLETED') {
      wallet.deposit(amount);
      await this.walletRepo.save(wallet);

      // Publish event
      await this.eventPublisher.publish({
        eventId: `evt_${Date.now()}`,
        eventType: 'DEPOSIT_COMPLETED',
        occurredAt: Date.now(),
        userId: params.userId,
        depositId: deposit.id,
        amount,
        newBalance: wallet.balanceTotal,
      });
    }

    return {
      depositId: deposit.id,
      newBalancePaise: wallet.balanceTotal.amountInSmallestUnit,
    };
  }
}
