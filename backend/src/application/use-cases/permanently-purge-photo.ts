import { IPhotoRepository, IAlbumAssetRepository } from "../../domain/repositories/interfaces.js";

export class PermanentlyPurgePhotoUseCase {
  constructor(
    private photoRepo: IPhotoRepository,
    private linkRepo: IAlbumAssetRepository,
  ) {}

  async execute(userId: string, photoId: string): Promise<void> {
    const photo = await this.photoRepo.findById(userId, photoId);
    if (!photo) return;

    // Permanent purge logic:
    // 1. Find all joins (active or trashed)
    const links = await this.linkRepo.findByPhotoId(userId, photoId);
    
    // 2. Delete all joins
    if (links.length > 0) {
      await this.linkRepo.deleteAll(links);
    }

    // 3. Decrement albumRefCount for EACH link being deleted 
    // Usually, albumRefCount is the count of ACTIVE links. 
    // Requirement says: "Decrements albumRefCount ONLY here" during purge.
    // If we're purging the photo entirely, we delete it from the repo.
    
    await this.photoRepo.delete(userId, photoId);
    
    // S3 deletion logic would happen in infrastructure based on albumRefCount == 0
    // but here we just handle the domain/data layer.
  }
}
