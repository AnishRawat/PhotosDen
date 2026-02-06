/**
 * Secure Storage Service using IndexedDB
 * 
 * Stores DEK (Data Encryption Key) in browser's IndexedDB.
 * 
 * Security Notes:
 * - IndexedDB is origin-scoped (same-origin policy)
 * - DEK is stored as CryptoKey object (non-extractable after decryption)
 * - Data is NOT encrypted at rest in IndexedDB (browser vulnerability)
 * - For maximum security, consider wrapping with additional encryption layer
 * 
 * Trade-off: Storing DEK locally enables offline decryption but requires
 * trusting the client device. Lost device = potential data compromise.
 * Alternative: Require password on every session (no DEK storage).
 */

export class SecureStorage {
    private readonly DB_NAME = "PhotosDenSecure";
    private readonly STORE_NAME = "keys";
    private readonly DB_VERSION = 1;

    /**
     * Open IndexedDB connection
     */
    private async openDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => {
                reject(new Error(`IndexedDB error: ${request.error}`));
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;

                // Create object store if it doesn't exist
                if (!db.objectStoreNames.contains(this.STORE_NAME)) {
                    db.createObjectStore(this.STORE_NAME, { keyPath: "id" });
                }
            };
        });
    }

    /**
     * Store DEK in IndexedDB
     * 
     * @param userId User ID (key for storage)
     * @param dek Data Encryption Key
     */
    async storeDEK(userId: string, dek: CryptoKey): Promise<void> {
        const db = await this.openDB();

        // Export DEK to raw bytes for storage
        const dekBytes = await crypto.subtle.exportKey("raw", dek);

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_NAME, "readwrite");
            const store = transaction.objectStore(this.STORE_NAME);

            const request = store.put({
                id: `dek_${userId}`,
                key: dekBytes,
                timestamp: Date.now(),
            });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to store DEK: ${request.error}`));

            transaction.oncomplete = () => db.close();
        });
    }

    /**
     * Retrieve DEK from IndexedDB
     * 
     * @param userId User ID
     * @returns DEK or null if not found
     */
    async getDEK(userId: string): Promise<CryptoKey | null> {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_NAME, "readonly");
            const store = transaction.objectStore(this.STORE_NAME);

            const request = store.get(`dek_${userId}`);

            request.onsuccess = async () => {
                const record = request.result;

                if (!record || !record.key) {
                    resolve(null);
                    return;
                }

                // Import DEK from raw bytes
                try {
                    const dek = await crypto.subtle.importKey(
                        "raw",
                        record.key,
                        {
                            name: "AES-GCM",
                            length: 256,
                        },
                        false, // DEK is NOT extractable
                        ["encrypt", "decrypt"]
                    );
                    resolve(dek);
                } catch (err) {
                    reject(new Error(`Failed to import DEK: ${err}`));
                }
            };

            request.onerror = () => reject(new Error(`Failed to retrieve DEK: ${request.error}`));

            transaction.oncomplete = () => db.close();
        });
    }

    /**
     * Delete DEK from IndexedDB (logout)
     * 
     * @param userId User ID
     */
    async clearDEK(userId: string): Promise<void> {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_NAME, "readwrite");
            const store = transaction.objectStore(this.STORE_NAME);

            const request = store.delete(`dek_${userId}`);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to delete DEK: ${request.error}`));

            transaction.oncomplete = () => db.close();
        });
    }

    /**
     * Clear ALL stored keys (use with caution)
     */
    async clearAll(): Promise<void> {
        const db = await this.openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(this.STORE_NAME, "readwrite");
            const store = transaction.objectStore(this.STORE_NAME);

            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(new Error(`Failed to clear storage: ${request.error}`));

            transaction.oncomplete = () => db.close();
        });
    }

    /**
     * Check if DEK exists for user
     * 
     * @param userId User ID
     * @returns true if DEK exists, false otherwise
     */
    async hasDEK(userId: string): Promise<boolean> {
        const dek = await this.getDEK(userId);
        return dek !== null;
    }
}

// Export singleton instance
export const secureStorage = new SecureStorage();
