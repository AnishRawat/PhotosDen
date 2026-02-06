/**
 * Zero-Knowledge Upload Service
 * 
 * Handles client-side encryption before uploading to S3.
 * Generates thumbnails and encrypts them separately.
 */

import { cryptoService } from "./crypto-service";
import { secureStorage } from "./secure-storage";
import { ulid } from "ulid";

const API_BASE_URL = process.env.REACT_APP_API_URL || "https://api.photosden.com/dev";

interface PhotoMetadata {
    file: File;
    originalFilename: string;
    mimeType: string;
    capturedAt?: string;
}

interface EncryptedPhoto {
    photoId: string;
    encryptedBlob: Blob;
    iv: string;
    encryptedSize: number;
    thumbnailBlob?: Blob;
    thumbnailIV?: string;
    originalFilename: string;
    mimeType: string;
    capturedAt: string;
}

interface PresignedUrlResponse {
    uploadId: string;
    photos: Array<{
        photoId: string;
        presignedUrl: string;
        thumbnailPresignedUrl?: string;
        s3Key: string;
        thumbnailS3Key?: string;
    }>;
}

export class UploadService {
    private accessToken: string | null = null;
    private userId: string | null = null;

    /**
     * Set authentication credentials
     */
    setAuth(accessToken: string, userId: string): void {
        this.accessToken = accessToken;
        this.userId = userId;
    }

    /**
     * Upload photos with zero-knowledge encryption
     * 
     * Steps:
     * 1. Get DEK from local storage
     * 2. For each photo:
     *    - Generate thumbnail
     *    - Encrypt full-res photo
     *    - Encrypt thumbnail
     * 3. Request presigned URLs from backend
     * 4. Upload encrypted blobs directly to S3
     * 5. Mark upload complete
     */
    async uploadPhotos(photos: PhotoMetadata[]): Promise<void> {
        if (!this.accessToken || !this.userId) {
            throw new Error("Not authenticated");
        }

        try {
            // Step 1: Get DEK
            const dek = await secureStorage.getDEK(this.userId);
            if (!dek) {
                throw new Error("DEK not found. Please login again.");
            }

            // Step 2: Encrypt all photos
            const encryptedPhotos: EncryptedPhoto[] = [];
            for (const photo of photos) {
                const encrypted = await this.encryptPhoto(photo.file, dek, photo);
                encryptedPhotos.push(encrypted);
            }

            // Step 3: Request presigned URLs
            const presignedResponse = await this.requestPresignedUrls(encryptedPhotos);

            // Step 4: Upload to S3
            await this.uploadToS3(encryptedPhotos, presignedResponse);

            // Step 5: Mark complete
            await this.completeUpload(presignedResponse.uploadId);

        } catch (error: any) {
            console.error("Upload error:", error);
            throw new Error(`Upload failed: ${error.message}`);
        }
    }

    /**
     * Encrypt photo and generate encrypted thumbnail
     */
    private async encryptPhoto(
        file: File,
        dek: CryptoKey,
        metadata: PhotoMetadata
    ): Promise<EncryptedPhoto> {
        // Generate thumbnail (if image)
        let thumbnailBlob: Blob | undefined;
        let thumbnailIV: string | undefined;

        if (file.type.startsWith("image/")) {
            try {
                const thumbnail = await cryptoService.generateThumbnail(file);
                const encryptedThumb = await cryptoService.encryptFile(thumbnail, dek);
                thumbnailBlob = encryptedThumb.encryptedBlob;
                thumbnailIV = encryptedThumb.iv;
            } catch (err) {
                console.warn("Thumbnail generation failed, continuing without:", err);
            }
        }

        // Encrypt full-res photo
        const encrypted = await cryptoService.encryptFile(file, dek);

        return {
            photoId: ulid(),
            encryptedBlob: encrypted.encryptedBlob,
            iv: encrypted.iv,
            encryptedSize: encrypted.encryptedSize,
            thumbnailBlob,
            thumbnailIV,
            originalFilename: metadata.originalFilename,
            mimeType: metadata.mimeType,
            capturedAt: metadata.capturedAt || new Date().toISOString(),
        };
    }

    /**
     * Request presigned URLs from backend
     */
    private async requestPresignedUrls(
        encryptedPhotos: EncryptedPhoto[]
    ): Promise<PresignedUrlResponse> {
        const response = await fetch(`${API_BASE_URL}/uploads/initiate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${this.accessToken}`,
            },
            body: JSON.stringify({
                photos: encryptedPhotos.map((p) => ({
                    originalFilename: p.originalFilename,
                    mimeType: p.mimeType,
                    encryptedSize: p.encryptedSize,
                    iv: p.iv,
                    hasThumbnail: !!p.thumbnailBlob,
                    thumbnailIV: p.thumbnailIV,
                    capturedAt: p.capturedAt,
                })),
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || "Failed to get presigned URLs");
        }

        return await response.json();
    }

    /**
     * Upload encrypted blobs to S3 using presigned URLs
     */
    private async uploadToS3(
        encryptedPhotos: EncryptedPhoto[],
        presignedResponse: PresignedUrlResponse
    ): Promise<void> {
        const uploadPromises: Promise<void>[] = [];

        for (let i = 0; i < encryptedPhotos.length; i++) {
            const photo = encryptedPhotos[i];
            const urls = presignedResponse.photos[i];

            // Upload full-res
            uploadPromises.push(
                fetch(urls.presignedUrl, {
                    method: "PUT",
                    body: photo.encryptedBlob,
                    headers: {
                        "Content-Type": "application/octet-stream",
                    },
                }).then((res) => {
                    if (!res.ok) {
                        throw new Error(`S3 upload failed for ${photo.originalFilename}`);
                    }
                })
            );

            // Upload thumbnail if exists
            if (photo.thumbnailBlob && urls.thumbnailPresignedUrl) {
                uploadPromises.push(
                    fetch(urls.thumbnailPresignedUrl, {
                        method: "PUT",
                        body: photo.thumbnailBlob,
                        headers: {
                            "Content-Type": "application/octet-stream",
                        },
                    }).then((res) => {
                        if (!res.ok) {
                            throw new Error(`Thumbnail upload failed for ${photo.originalFilename}`);
                        }
                    })
                );
            }
        }

        // Wait for all uploads
        await Promise.all(uploadPromises);
    }

    /**
     * Mark upload as complete
     */
    private async completeUpload(uploadId: string): Promise<void> {
        const response = await fetch(`${API_BASE_URL}/uploads/${uploadId}/complete`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
            },
        });

        if (!response.ok) {
            const error = await response.json();
throw new Error(error.message || "Failed to complete upload");
        }
    }
}

// Export singleton instance
export const uploadService = new UploadService();
