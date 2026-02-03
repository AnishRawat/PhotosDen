import { IPhotoRepository, IAlbumAssetRepository } from "../../domain/repositories/interfaces.js";

export class RestorePhotoUseCase {
  constructor(
    private photoRepo: IPhotoRepository,
    private linkRepo: IAlbumAssetRepository,
  ) {}

  async execute(userId: string, photoId: string): Promise<void> {
    const photo = await this.photoRepo.findById(userId, photoId);
    if (!photo || !photo.deletion.isDeleted) return;

    photo.restore();
    const links = await this.linkRepo.findByPhotoId(userId, photoId);
    
    links.forEach(link => link.restore());

    await Promise.all([
      this.photoRepo.save(photo),
      this.linkRepo.saveAll(links)
    ]);
  }
}
