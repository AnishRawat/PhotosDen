import { IAlbumRepository, IAlbumAssetRepository, IPhotoRepository } from "../../domain/repositories/interfaces.js";

export class PermanentlyPurgeAlbumUseCase {
  constructor(
    private albumRepo: IAlbumRepository,
    private linkRepo: IAlbumAssetRepository,
    private photoRepo: IPhotoRepository,
  ) {}

  async execute(userId: string, albumId: string): Promise<void> {
    const album = await this.albumRepo.findById(userId, albumId);
    if (!album) return;

    // 1. Find all joins associated with this album
    const links = await this.linkRepo.findByAlbumId(userId, albumId);

    // 2. For each link, we must decrement the albumRefCount of the associated photo
    for (const link of links) {
      const photo = await this.photoRepo.findById(userId, link.photoId);
      if (photo) {
        photo.decrementRefCount();
        await this.photoRepo.save(photo);
      }
    }

    // 3. Delete all joins
    if (links.length > 0) {
      await this.linkRepo.deleteAll(links);
    }

    // 4. Delete the album record
    await this.albumRepo.delete(userId, albumId);
  }
}
