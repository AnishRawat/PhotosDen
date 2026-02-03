export enum AlbumAssetStatus {
  ACTIVE = "ACTIVE",
  TRASHED = "TRASHED",
}

export class AlbumAssetLink {
  constructor(
    public readonly userId: string,
    public readonly albumId: string,
    public readonly photoId: string,
    public status: AlbumAssetStatus = AlbumAssetStatus.ACTIVE,
    public readonly createdAt: string = new Date().toISOString(),
  ) {}

  softDelete(): void {
    this.status = AlbumAssetStatus.TRASHED;
  }

  restore(): void {
    this.status = AlbumAssetStatus.ACTIVE;
  }

  get isTrashed(): boolean {
    return this.status === AlbumAssetStatus.TRASHED;
  }
}
