import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export interface UserProfile {
    userId: string;
    email: string;
    name: string; // Added name field
    phone?: string;
    avatarUrl?: string;
    
    // Zero-Knowledge Encryption Parameters
    // The Data Encryption Key (DEK) encrypted with the user's Master Key
    // Master Key is derived from password via PBKDF2, never stored
    encryptedDEK: string;        // Base64-encoded AES-256-GCM encrypted DEK
    kdfSalt: string;             // Base64-encoded 32-byte random salt for PBKDF2
    kdfIterations: number;       // PBKDF2 iterations (minimum 100,000)
    kdfAlgorithm: string;        // "PBKDF2-HMAC-SHA256" (for future algorithm updates)
    
    createdAt: string;
    updatedAt?: string;
}

export class UserService {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
    }

    async getProfile(userId: string): Promise<UserProfile | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: "PROFILE",
            },
        });

        const result = await this.client.send(command);
        return result.Item as UserProfile ?? null;
    }

    async createProfile(profile: UserProfile): Promise<void> {
        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `USER#${profile.userId}`,
                SK: "PROFILE",
                ...profile,
            },
        });

        await this.client.send(command);
    }

    async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<void> {
        // Build dynamic update expression
        const updateParts: string[] = [];
        const attrValues: Record<string, any> = {};
        
        if (updates.avatarUrl !== undefined) {
            updateParts.push("avatarUrl = :avatarUrl");
            attrValues[":avatarUrl"] = updates.avatarUrl;
        }
        if (updates.phone !== undefined) {
            updateParts.push("phone = :phone");
            attrValues[":phone"] = updates.phone;
        }
        
        // Always update timestamp
        updateParts.push("updatedAt = :updatedAt");
        attrValues[":updatedAt"] = new Date().toISOString();
        
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: "PROFILE",
            },
            UpdateExpression: `SET ${updateParts.join(", ")}`,
            ExpressionAttributeValues: attrValues,
            ConditionExpression: "attribute_exists(PK)", // Ensure user exists
        });

        await this.client.send(command);
    }
    
    /**
     * Update encryption parameters (for password change)
     * Uses conditional write to prevent race conditions
     */
    async updateEncryptionParams(
        userId: string,
        encryptedDEK: string,
        kdfSalt: string,
        kdfIterations: number
    ): Promise<void> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: "PROFILE",
            },
            UpdateExpression: "SET encryptedDEK = :dek, kdfSalt = :salt, kdfIterations = :iterations, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":dek": encryptedDEK,
                ":salt": kdfSalt,
                ":iterations": kdfIterations,
                ":updatedAt": new Date().toISOString(),
            },
            ConditionExpression: "attribute_exists(PK)", // Atomic: only update if user exists
        });

        await this.client.send(command);
    }
}
