/**
 * Zero-Knowledge Cryptography Service
 * 
 * This service implements client-side encryption using WebCrypto API.
 * Server NEVER sees plaintext data or decryption keys.
 * 
 * Encryption Architecture:
 * 1. Password → PBKDF2 → Master Key (never stored)
 * 2. Master Key + DEK → Encrypted DEK (stored in DB)
 * 3. DEK + File → Encrypted File (stored in S3)
 * 
 * Security Requirements:
 * - AES-256-GCM for all encryption
 * - PBKDF2-HMAC-SHA256 with 100,000+ iterations
 * - 96-bit random IVs (never reused)
 * - 32-byte random salts
 */

export class CryptoService {
    // Security constants - DO NOT WEAKEN
    private readonly KDF_ITERATIONS = 100_000;  // PBKDF2 iterations (minimum)
    private readonly KEY_LENGTH = 256;           // AES key length in bits
    private readonly IV_LENGTH = 12;             // 96 bits for GCM mode
    private readonly SALT_LENGTH = 32;           // 256 bits for KDF salt
    private readonly KDF_ALGORITHM = "PBKDF2";
    private readonly ENCRYPTION_ALGORITHM = "AES-GCM";
    private readonly HASH_ALGORITHM = "SHA-256";

    /**
     * Generate cryptographically secure random salt for key derivation
     * @returns 32-byte random salt
     */
    generateSalt(): Uint8Array {
        return crypto.getRandomValues(new Uint8Array(this.SALT_LENGTH));
    }

    /**
     * Generate cryptographically secure random IV for encryption
     * @returns 12-byte random IV (96 bits for GCM)
     */
    generateIV(): Uint8Array {
        return crypto.getRandomValues(new Uint8Array(this.IV_LENGTH));
    }

    /**
     * Derive Master Key from password using PBKDF2
     * 
     * Master Key is NEVER stored - only exists in memory during session
     * 
     * @param password User's password
     * @param salt  Random salt (from signup or login)
     * @param iterations PBKDF2 iterations (default: 100,000)
     * @returns Master Key (AES-256 key)
     */
    async deriveMasterKey(
        password: string,
        salt: Uint8Array,
        iterations: number = this.KDF_ITERATIONS
    ): Promise<CryptoKey> {
        if (iterations < this.KDF_ITERATIONS) {
            throw new Error(`Iterations must be >= ${this.KDF_ITERATIONS} for security`);
        }

        const encoder = new TextEncoder();
        const passwordBytes = encoder.encode(password);

        // Import password as key material
        const passwordKey = await crypto.subtle.importKey(
            "raw",
            passwordBytes,
            this.KDF_ALGORITHM,
            false,
            ["deriveBits", "deriveKey"]
        );

        // Derive  Master Key using PBKDF2
        const masterKey = await crypto.subtle.deriveKey(
            {
                name: this.KDF_ALGORITHM,
                salt: salt,
                iterations,
                hash: this.HASH_ALGORITHM,
            },
            passwordKey,
            {
                name: this.ENCRYPTION_ALGORITHM,
                length: this.KEY_LENGTH,
            },
            false, // Master Key is NOT extractable
            ["encrypt", "decrypt"]
        );

        return masterKey;
    }

    /**
     * Generate random Data Encryption Key (DEK)
     * 
     * DEK is used to encrypt all user files.
     * DEK itself is encrypted with Master Key and stored in database.
     * 
     * @returns DEK (AES-256 key)
     */
    async generateDEK(): Promise<CryptoKey> {
        return await crypto.subtle.generateKey(
            {
                name: this.ENCRYPTION_ALGORITHM,
                length: this.KEY_LENGTH,
            },
            true, // DEK must be extractable to encrypt with Master Key
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Encrypt DEK with Master Key
     * 
     * @param dek Data Encryption Key
     * @param masterKey Master Key (derived from password)
     * @returns Encrypted DEK (Base64) and IV
     */
    async encryptDEK(
        dek: CryptoKey,
        masterKey: CryptoKey
    ): Promise<{ encryptedDEK: string; iv: string }> {
        const iv = this.generateIV();

        // Export DEK to raw bytes
        const dekBytes = await crypto.subtle.exportKey("raw", dek);

        // Encrypt DEK with Master Key
        const encryptedDEKBytes = await crypto.subtle.encrypt(
            {
                name: this.ENCRYPTION_ALGORITHM,
                iv: iv.buffer as ArrayBuffer,
            },
            masterKey,
            dekBytes
        );

        // Combine IV + ciphertext for storage
        const combined = new Uint8Array(this.IV_LENGTH + encryptedDEKBytes.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encryptedDEKBytes), this.IV_LENGTH);

        return {
            encryptedDEK: this.arrayBufferToBase64(combined),
            iv: this.arrayBufferToBase64(iv),
        };
    }

    /**
     * Decrypt DEK with Master Key
     * 
     * @param encryptedDEK Base64-encoded encrypted DEK (IV + ciphertext)
     * @param masterKey Master Key (derived from password)
     * @returns DEK (AES-256 key)
     */
    async decryptDEK(
        encryptedDEK: string,
        masterKey: CryptoKey
    ): Promise<CryptoKey> {
        const combined = this.base64ToArrayBuffer(encryptedDEK);

        // Extract IV and ciphertext
        const iv = combined.slice(0, this.IV_LENGTH);
        const ciphertext = combined.slice(this.IV_LENGTH);

        // Decrypt DEK
        const dekBytes = await crypto.subtle.decrypt(
            {
                name: this.ENCRYPTION_ALGORITHM,
                iv: iv.buffer as ArrayBuffer,
            },
            masterKey,
            ciphertext.buffer as ArrayBuffer
        );

        // Import DEK as crypto key
        return await crypto.subtle.importKey(
            "raw",
            dekBytes,
            {
                name: this.ENCRYPTION_ALGORITHM,
                length: this.KEY_LENGTH,
            },
            false, // DEK is NOT extractable after decryption (stays in memory)
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Encrypt file with DEK
     * 
     * @param file File blob to encrypt
     * @param dek Data Encryption Key
     * @param additionalData Optional additional authenticated data
     * @returns Encrypted blob and  IV (Base64)
     */
    async encryptFile(
        file: Blob,
        dek: CryptoKey,
        additionalData?: string
    ): Promise<{ encryptedBlob: Blob; iv: string; encryptedSize: number }> {
        const iv = this.generateIV();
        const fileBytes = await file.arrayBuffer();

        // Encrypt file
        const encryptedBytes = await crypto.subtle.encrypt(
            {
                name: this.ENCRYPTION_ALGORITHM,
                iv: iv.buffer as ArrayBuffer,
                additionalData: additionalData
                    ? new TextEncoder().encode(additionalData).buffer as ArrayBuffer
                    : undefined,
            },
            dek,
            fileBytes
        );

        const encryptedBlob = new Blob([encryptedBytes], {
            type: "application/octet-stream",
        });

        return {
            encryptedBlob,
            iv: this.arrayBufferToBase64(iv),
            encryptedSize: encryptedBytes.byteLength,
        };
    }

    /**
     * Decrypt file with DEK
     * 
     * @param encryptedBlob Encrypted file blob
     * @param iv Base64-encoded IV
     * @param dek Data Encryption Key
     * @param additionalData Optional additional authenticated data
     * @returns Decrypted blob
     */
    async decryptFile(
        encryptedBlob: Blob,
        iv: string,
        dek: CryptoKey,
        additionalData?: string
    ): Promise<Blob> {
        const encryptedBytes = await encryptedBlob.arrayBuffer();
        const ivBytes = this.base64ToArrayBuffer(iv);

        // Decrypt file
        const decryptedBytes = await crypto.subtle.decrypt(
            {
                name: this.ENCRYPTION_ALGORITHM,
                iv: ivBytes,
                additionalData: additionalData
                    ? new TextEncoder().encode(additionalData)
                    : undefined,
            },
            dek,
            encryptedBytes
        );

        return new Blob([decryptedBytes]);
    }

    /**
     * Generate low-resolution thumbnail from image file
     * 
     * Client-side thumbnail generation eliminates need for server processing
     * 
     * @param imageFile Image file blob
     * @param maxWidth Maximum width (default: 300px)
     * @param maxHeight Maximum height (default: 300px)
     * @param quality JPEG quality 0-1 (default: 0.7)
     * @returns Thumbnail blob (JPEG)
     */
    async generateThumbnail(
        imageFile: Blob,
        maxWidth: number = 300,
        maxHeight: number = 300,
        quality: number = 0.7
    ): Promise<Blob> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            if (!ctx) {
                reject(new Error("Canvas 2D context not supported"));
                return;
            }

            img.onload = () => {
                // Calculate scaled dimensions (maintain aspect ratio)
                let { width, height } = img;

                if (width > height) {
                    if (width > maxWidth) {
                        height = (height * maxWidth) / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = (width * maxHeight) / height;
                        height = maxHeight;
                    }
                }

                // Draw scaled image
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Convert to JPEG blob
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error("Thumbnail generation failed"));
                        }
                    },
                    "image/jpeg",
                    quality
                );
            };

            img.onerror = () => reject(new Error("Image load failed"));
            img.src = URL.createObjectURL(imageFile);
        });
    }

    /**
     * Convert ArrayBuffer to Base64 string
     */
    arrayBufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
        const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 string to Uint8Array
     */
    base64ToArrayBuffer(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    /**
     * Securely clear sensitive data from memory (best effort)
     * Note: JavaScript doesn't provide guaranteed memory wiping
     */
    clearSensitiveData(data: Uint8Array): void {
        crypto.getRandomValues(data); // Overwrite with random data
    }
}

// Export singleton instance
export const cryptoService = new CryptoService();
