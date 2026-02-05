import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export interface Upload {
    uploadId: string;
    userId: string;
    status: "pending" | "in-progress" | "completed" | "failed";
    totalPhotos: number;
    uploadedPhotos: number;
    isDeleted: boolean;
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}

export interface UploadPhoto {
    uploadId: string;
    photoId: string;
    s3Key: string;
    presignedUrl?: string;
    uploadCompleted: boolean;
    uploadedAt?: string;
}

export class UploadService {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
    }

    /**
     * Create a new upload batch
     */
    async createUpload(userId: string, uploadId: string, photoCount: number): Promise<Upload> {
        const now = new Date().toISOString();
        const upload: Upload = {
            uploadId,
            userId,
            status: "pending",
            totalPhotos: photoCount,
            uploadedPhotos: 0,
            isDeleted: false,
            createdAt: now,
            updatedAt: now,
        };

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `USER#${userId}`,
                SK: `UPLOAD#${uploadId}`,
                ...upload,
            },
        });

        await this.client.send(command);
        return upload;
    }

    /**
     * List all uploads for a user
     */
    async listUploads(userId: string, includeDeleted = false): Promise<Upload[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
                ":pk": `USER#${userId}`,
                ":sk": "UPLOAD#",
            },
            ScanIndexForward: false,  // Most recent first
        });

        const result = await this.client.send(command);
        const uploads = (result.Items || []) as Upload[];

        return includeDeleted ? uploads : uploads.filter(u => !u.isDeleted);
    }

    /**
     * Get a specific upload for a user
     */
    async getUpload(userId: string, uploadId: string): Promise<Upload | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `UPLOAD#${uploadId}`,
            },
        });

        const result = await this.client.send(command);
        return (result.Item as Upload) ?? null;
    }

    /**
     * Add photo to upload (with presigned URL for S3 upload)
     */
    async addPhotoToUpload(userId: string, uploadId: string, photoId: string, s3Key: string, presignedUrl: string): Promise<void> {
        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `USER#${userId}`,
                SK: `UPLOAD#${uploadId}#PHOTO#${photoId}`,
                uploadId,
                photoId,
                s3Key,
                presignedUrl,
                uploadCompleted: false,
            },
        });

        await this.client.send(command);
    }

    /**
     * Get photos in an upload
     */
    async getUploadPhotos(userId: string, uploadId: string): Promise<UploadPhoto[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
                ":pk": `USER#${userId}`,
                ":sk": `UPLOAD#${uploadId}#PHOTO#`,
            },
        });

        const result = await this.client.send(command);
        return (result.Items || []) as UploadPhoto[];
    }

    /**
     * Complete an upload
     */
    async completeUpload(userId: string, uploadId: string): Promise<void> {
        const now = new Date().toISOString();

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `UPLOAD#${uploadId}`,
            },
            UpdateExpression: "SET #status = :status, completedAt = :completedAt, updatedAt = :updatedAt",
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: {
                ":status": "completed",
                ":completedAt": now,
                ":updatedAt": now,
            },
        });

        await this.client.send(command);
    }

    /**
     * Soft delete an upload
     */
    async deleteUpload(userId: string, uploadId: string): Promise<void> {
        const now = new Date();
        const purgeAt = Math.floor((now.getTime() + 30 * 24 * 60 * 60 * 1000) / 1000); // 30 days

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `UPLOAD#${uploadId}`,
            },
            UpdateExpression: "SET isDeleted = :deleted, deletedAt = :deletedAt, purgeAt = :purgeAt, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":deleted": true,
                ":deletedAt": now.toISOString(),
                ":purgeAt": purgeAt,
                ":updatedAt": now.toISOString(),
            },
        });

        await this.client.send(command);
    }
}
