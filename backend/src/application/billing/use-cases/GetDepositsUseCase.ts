import { DepositRepository } from '../../../domain/billing/repositories';
import { Deposit } from '../../../domain/billing/entities/Deposit';

export class GetDepositsUseCase {
  constructor(private depositRepo: DepositRepository) {}

  async execute(userId: string, limit: number = 20): Promise<Deposit[]> {
    if (!userId) {
      throw new Error('User ID is required');
    }

    return await this.depositRepo.findByUser(userId, limit);
  }
}
