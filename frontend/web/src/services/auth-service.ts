/**
 * Zero-Knowledge Authentication Service
 * 
 * Integrates CryptoService with backend authentication endpoints.
 * Handles client-side key derivation and DEK management.
 * 
 * Flow:
 * - Signup: Generate DEK, derive Master Key, encrypt DEK, send to backend
 * - Login: Retrieve encrypted DEK, derive Master Key, decrypt DEK, store locally
 * - Logout: Clear DEK from local storage
 */

import { cryptoService } from "./crypto-service";
import { secureStorage } from "./secure-storage";

// Configuration
const API_BASE_URL = process.env.REACT_APP_API_URL || "https://api.photosden.com/dev";

interface SignupRequest {
    email: string;
    password: string;
}

interface SignupResponse {
    verificationRequired: boolean;
    userId: string;
    correlationId: string;
}

interface LoginRequest {
    email: string;
    password: string;
}

interface LoginResponse {
    idToken: string;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    userId: string;
    
    // Encryption parameters
    encryptedDEK: string;
    kdfSalt: string;
    kdfIterations: number;
    kdfAlgorithm: string;
    
    correlationId: string;
}

interface PasswordChangeRequest {
    oldPassword: string;
    newPassword: string;
}

export class AuthService {
    private currentUserId: string | null = null;
    private accessToken: string | null = null;

    /**
     * Signup with zero-knowledge encryption
     * 
     * Steps:
     * 1. Generate random DEK
     * 2. Generate random salt
     * 3. Derive Master Key from password
     * 4. Encrypt DEK with Master Key
     * 5. Send encrypted DEK + salt to backend
     * 6. Store DEK locally (only after successful signup)
     */
    async signup(request: SignupRequest): Promise<SignupResponse> {
        try {
            // Step 1: Generate DEK (this will encrypt ALL user files)
            const dek = await cryptoService.generateDEK();

            // Step 2: Generate random salt for PBKDF2
            const salt = cryptoService.generateSalt();

            // Step 3: Derive Master Key from password
            const masterKey = await cryptoService.deriveMasterKey(
                request.password,
                salt
            );

            // Step 4: Encrypt DEK with Master Key
            const { encryptedDEK } = await cryptoService.encryptDEK(dek, masterKey);

            // Step 5: Send to backend
            const response = await fetch(`${API_BASE_URL}/auth/signup`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    identifier: request.email,
                    password: request.password,
                    encryptedDEK,
                    kdfSalt: cryptoService.arrayBufferToBase64(salt),
                    kdfIterations: 100_000,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Signup failed");
            }

            const data: SignupResponse = await response.json();

            // Step 6: Store DEK locally for future use
            // NOTE: Only store AFTER successful backend response
            await secureStorage.storeDEK(data.userId, dek);

            return data;
        } catch (error: any) {
            console.error("Signup error:", error);
            throw new Error(`Signup failed: ${error.message}`);
        }
    }

    /**
     * Login with zero-knowledge encryption
     * 
     * Steps:
     * 1. Authenticate with backend (get encrypted DEK + salt)
     * 2. Derive Master Key from password
     * 3. Decrypt DEK with Master Key
     * 4. Store DEK locally for session
     */
    async login(request: LoginRequest): Promise<LoginResponse> {
        try {
            // Step 1: Authenticate with backend
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    identifier: request.email,
                    password: request.password,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || "Login failed");
            }

            const data: LoginResponse = await response.json();

            // Step 2: Derive Master Key from password
            const salt = this.base64ToUint8Array(data.kdfSalt);
            const masterKey = await cryptoService.deriveMasterKey(
                request.password,
                salt,
                data.kdfIterations
            );

            // Step 3: Decrypt DEK with Master Key
            const dek = await cryptoService.decryptDEK(
                data.encryptedDEK,
                masterKey
            );

            // Step 4: Store DEK locally
            await secureStorage.storeDEK(data.userId, dek);

            // Store tokens for API calls
            this.currentUserId = data.userId;
            this.accessToken = data.accessToken;

            return data;
        } catch (error: any) {
            console.error("Login error:", error);
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    /**
     * Change password with DEK re-encryption
     * 
     * Steps:
     * 1. Get current DEK from local storage
     * 2. Generate new salt
     * 3. Derive NEW Master Key from new password
     * 4. Re-encrypt SAME DEK with NEW Master Key
     * 5. Send to backend
     * 
     * CRITICAL: DEK never changes, only its encryption wrapper
     */
    async changePassword(request: PasswordChangeRequest): Promise<void> {
        if (!this.currentUserId || !this.accessToken) {
            throw new Error("Not authenticated");
        }

        try {
            // Step 1: Get current DEK
            const dek = await secureStorage.getDEK(this.currentUserId);
            if (!dek) {
                throw new Error("DEK not found. Please login again.");
            }

            // Step 2: Generate new salt
            const newSalt = cryptoService.generateSalt();

            // Step 3: Derive NEW Master Key from new password
            const newMasterKey = await cryptoService.deriveMasterKey(
                request.newPassword,
                newSalt
            );

            // Step 4: Re-encrypt SAME DEK with NEW Master Key
            const { encryptedDEK: newEncryptedDEK } = await cryptoService.encryptDEK(
                dek,
                newMasterKey
            );

            // Step 5: Send to backend
            const response = await fetch(`${API_BASE_URL}/profile/password`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${this.accessToken}`,
                },
                body: JSON.stringify({
                    oldPassword: request.oldPassword,
                    newPassword: request.newPassword,
                    newEncryptedDEK,
                    newKdfSalt: cryptoService.arrayBufferToBase64(newSalt),
                    newKdfIterations: 100_000,
                }),
            });

            if (!response.ok) {
                const error = await response.json();
                
                // Handle critical partial failure
                if (error.error === "PartialFailure") {
                    throw new Error(
                        "CRITICAL: Password changed but encryption update failed. Contact support immediately!  UserId: " +
                            error.userId
                    );
                }
                
                throw new Error(error.message || "Password change failed");
            }

            // Success - DEK remains the same, just re-encrypted
        } catch (error: any) {
            console.error("Password change error:", error);
            throw error;
        }
    }

    /**
     * Logout - clear DEK from local storage
     */
    async logout(): Promise<void> {
        if (this.currentUserId) {
            await secureStorage.clearDEK(this.currentUserId);
        }

        this.currentUserId = null;
        this.accessToken = null;
    }

    /**
     * Check if user has valid session (DEK available)
     */
    async hasValidSession(userId: string): Promise<boolean> {
        return await secureStorage.hasDEK(userId);
    }

    /**
     * Get current user ID
     */
    getCurrentUserId(): string | null {
        return this.currentUserId;
    }

    /**
     * Get access token for API calls
     */
    getAccessToken(): string | null {
        return this.accessToken;
    }

    /**
     * Set access token (for page refresh scenarios)
     */
    setAccessToken(token: string, userId: string): void {
        this.accessToken = token;
        this.currentUserId = userId;
    }

    /**
     * Helper: Convert Base64 to Uint8Array
     */
    private base64ToUint8Array(base64: string): Uint8Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}

// Export singleton instance
export const authService = new AuthService();
