import { IAlbumRepository } from "../../domain/repositories/interfaces.js";

export class SoftDeleteAlbumUseCase {
  constructor(private albumRepo: IAlbumRepository) {}

  async execute(userId: string, albumId: string): Promise<void> {
    const album = await this.albumRepo.findById(userId, albumId);
    if (!album || album.deletion.isDeleted) return;

    album.softDelete();
    await this.albumRepo.save(album);
  }
}
