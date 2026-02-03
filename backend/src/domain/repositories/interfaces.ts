import { Photo } from "../entities/photo.js";
import { Album } from "../entities/album.js";
import { AlbumAssetLink } from "../entities/album-asset-link.js";

export interface IPhotoRepository {
  findById(userId: string, photoId: string): Promise<Photo | null>;
  save(photo: Photo): Promise<void>;
  delete(userId: string, photoId: string): Promise<void>;
}

export interface IAlbumRepository {
  findById(userId: string, albumId: string): Promise<Album | null>;
  save(album: Album): Promise<void>;
  delete(userId: string, albumId: string): Promise<void>;
}

export interface IAlbumAssetRepository {
  findByPhotoId(userId: string, photoId: string): Promise<AlbumAssetLink[]>;
  findByAlbumId(userId: string, albumId: string): Promise<AlbumAssetLink[]>;
  save(link: AlbumAssetLink): Promise<void>;
  saveAll(links: AlbumAssetLink[]): Promise<void>;
  delete(userId: string, albumId: string, photoId: string): Promise<void>;
  deleteAll(links: AlbumAssetLink[]): Promise<void>;
}
