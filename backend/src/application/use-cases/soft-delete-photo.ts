import { IPhotoRepository, IAlbumAssetRepository } from "../../domain/repositories/interfaces.js";

export class SoftDeletePhotoUseCase {
  constructor(
    private photoRepo: IPhotoRepository,
    private linkRepo: IAlbumAssetRepository,
  ) {}

  async execute(userId: string, photoId: string): Promise<void> {
    const photo = await this.photoRepo.findById(userId, photoId);
    if (!photo || photo.deletion.isDeleted) return;

    photo.softDelete();
    const links = await this.linkRepo.findByPhotoId(userId, photoId);
    
    links.forEach(link => link.softDelete());

    await Promise.all([
      this.photoRepo.save(photo),
      this.linkRepo.saveAll(links)
    ]);
  }
}
