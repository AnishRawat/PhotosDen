export class DeletionMetadata {
  constructor(
    public readonly isDeleted: boolean = false,
    public readonly deletedAt: string | null = null,
    public readonly purgeAt: number | null = null,
  ) {}

  static createForSoftDelete(): DeletionMetadata {
    const now = new Date();
    // purgeAt = now + 30 days in epoch seconds
    const thirtyDaysInSeconds = 30 * 24 * 60 * 60;
    const purgeAt = Math.floor(now.getTime() / 1000) + thirtyDaysInSeconds;

    return new DeletionMetadata(true, now.toISOString(), purgeAt);
  }

  static createActive(): DeletionMetadata {
    return new DeletionMetadata(false, null, null);
  }

  get isActive(): boolean {
    return !this.isDeleted;
  }
}
