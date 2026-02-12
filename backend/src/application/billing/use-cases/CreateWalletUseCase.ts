/**
 * Create Wallet Use Case
 */

import { Wallet } from '../../../domain/billing/entities/Wallet';
import { WalletRepository } from '../../../domain/billing/repositories';

export class CreateWalletUseCase {
  constructor(private walletRepo: WalletRepository) {}

  async execute(userId: string): Promise<Wallet> {  
    // Check if wallet already exists
    const existing = await this.walletRepo.get(userId);
    if (existing) {
      throw new Error(`Wallet already exists for user ${userId}`);
    }

    // Create new wallet
    const wallet = Wallet.create(userId);
    
    // Save
    await this.walletRepo.save(wallet);
    
    return wallet;
  }
}
