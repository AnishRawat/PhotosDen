/**
 * Zero-Knowledge Photo Service
 * 
 * Handles fetching and decrypting photos from S3.
 * Manages thumbnail/full-res loading strategy.
 */

import { cryptoService } from "./crypto-service";
import { secureStorage } from "./secure-storage";

const API_BASE_URL = process.env.REACT_APP_API_URL || "https://api.photosden.com/dev";

export interface Photo {
    photoId: string;
    s3Key: string;
    thumbnailS3Key?: string;
    iv: string;
    thumbnailIV?: string;
    originalFilename: string;
    mimeType: string;
    encryptedSize: number;
    capturedAt: string;
    createdAt: string;
}

export interface DecryptedPhoto {
    photoId: string;
    url: string; // Object URL to decrypted blob
    thumbnailUrl?: string;
    filename: string;
    mimeType: string;
    capturedAt: string;
}

export class PhotoService {
    private accessToken: string | null = null;
    private userId: string | null = null;
    
    // Cache decrypted photos to avoid re-decryption
    private photoCache: Map<string, DecryptedPhoto> = new Map();

    /**
     * Set authentication credentials
     */
    setAuth(accessToken: string, userId: string): void {
        this.accessToken = accessToken;
        this.userId = userId;
    }

    /**
     * Fetch photos list (metadata only, not encrypted blobs)
     */
    async fetchPhotos(albumId?: string): Promise<Photo[]> {
        if (!this.accessToken) {
            throw new Error("Not authenticated");
        }

        const url = albumId
            ? `${API_BASE_URL}/albums/${albumId}/photos`
            : `${API_BASE_URL}/photos`;

        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to fetch photos");
        }

        const data = await response.json();
        return data.photos || [];
    }

    /**
     * Decrypt and display photo
     * 
     * Strategy:
     * 1. Load thumbnail first (fast, small)
     * 2. Load full-res on demand (slower, large)
     * 
     * @param photo Photo metadata
     * @param loadFullRes Load full resolution (default: false, thumbnail only)
     * @returns Decrypted photo with Object URLs
     */
    async decryptPhoto(photo: Photo, loadFullRes: boolean = false): Promise<DecryptedPhoto> {
        if (!this.userId) {
            throw new Error("Not authenticated");
        }

        // Check cache
        const cacheKey = `${photo.photoId}_${loadFullRes ? "full" : "thumb"}`;
        if (this.photoCache.has(cacheKey)) {
            return this.photoCache.get(cacheKey)!;
        }

        try {
            // Get DEK
            const dek = await secureStorage.getDEK(this.userId);
            if (!dek) {
                throw new Error("DEK not found. Please login again.");
            }

            let thumbnailUrl: string | undefined;
            let fullResUrl: string | undefined;

            // Decrypt thumbnail (if exists)
            if (photo.thumbnailS3Key && photo.thumbnailIV) {
                const thumbnailBlob = await this.fetchEncryptedBlob(photo.thumbnailS3Key);
                const decryptedThumbnail = await cryptoService.decryptFile(
                    thumbnailBlob,
                    photo.thumbnailIV,
                    dek
                );
                thumbnailUrl = URL.createObjectURL(
                    new Blob([decryptedThumbnail], { type: photo.mimeType })
                );
            }

            // Decrypt full-res (if requested or no thumbnail)
            if (loadFullRes || !thumbnailUrl) {
                const fullResBlob = await this.fetchEncryptedBlob(photo.s3Key);
                const decryptedFullRes = await cryptoService.decryptFile(
                    fullResBlob,
                    photo.iv,
                    dek
                );
                fullResUrl = URL.createObjectURL(
                    new Blob([decryptedFullRes], { type: photo.mimeType })
                );
            }

            const decrypted: DecryptedPhoto = {
                photoId: photo.photoId,
                url: fullResUrl || thumbnailUrl!,
                thumbnailUrl,
                filename: photo.originalFilename,
                mimeType: photo.mimeType,
                capturedAt: photo.capturedAt,
            };

            // Cache result
            this.photoCache.set(cacheKey, decrypted);

            return decrypted;
        } catch (error: any) {
            console.error(`Failed to decrypt photo ${photo.photoId}:`, error);
            throw new Error(`Decryption failed: ${error.message}`);
        }
    }

    /**
     * Fetch encrypted blob from S3 via presigned URL
     */
    private async fetchEncryptedBlob(s3Key: string): Promise<Blob> {
        if (!this.accessToken) {
            throw new Error("Not authenticated");
        }

        // Get presigned download URL from backend
        const response = await fetch(
            `${API_BASE_URL}/photos/download?s3Key=${encodeURIComponent(s3Key)}`,
            {
                headers: {
                    Authorization: `Bearer ${this.accessToken}`,
                },
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get download URL");
        }

        const { downloadUrl } = await response.json();

        // Fetch encrypted blob from S3
        const blobResponse = await fetch(downloadUrl);
        if (!blobResponse.ok) {
            throw new Error("Failed to download from S3");
        }

        return await blobResponse.blob();
    }

    /**
     * Revoke Object URLs to free memory
     */
    revokePhotoUrl(photoId: string, fullRes: boolean = false): void {
        const cacheKey = `${photoId}_${fullRes ? "full" : "thumb"}`;
        const photo = this.photoCache.get(cacheKey);
        
        if (photo) {
            URL.revokeObjectURL(photo.url);
            if (photo.thumbnailUrl) {
                URL.revokeObjectURL(photo.thumbnailUrl);
            }
            this.photoCache.delete(cacheKey);
        }
    }

    /**
     * Clear all cached photos
     */
    clearCache(): void {
        // Revoke all Object URLs
        for (const photo of this.photoCache.values()) {
            URL.revokeObjectURL(photo.url);
            if (photo.thumbnailUrl) {
                URL.revokeObjectURL(photo.thumbnailUrl);
            }
        }
        
        this.photoCache.clear();
    }

    /**
     * Delete photo (move to trash)
     */
    async deletePhoto(photoId: string): Promise<void> {
        if (!this.accessToken) {
            throw new Error("Not authenticated");
        }

        const response = await fetch(`${API_BASE_URL}/photos/${photoId}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to delete photo");
        }

        // Remove from cache
        this.revokePhotoUrl(photoId, false);
        this.revokePhotoUrl(photoId, true);
    }

    /**
     * Download photo (decrypted)
     */
    async downloadPhoto(photo: Photo): Promise<void> {
        // Decrypt full-res
        const decrypted = await this.decryptPhoto(photo, true);

        // Trigger browser download
        const a = document.createElement("a");
        a.href = decrypted.url;
        a.download = decrypted.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}

// Export singleton instance
export const photoService = new PhotoService();
