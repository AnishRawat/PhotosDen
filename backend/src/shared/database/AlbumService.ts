import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export interface Album {
    albumId: string;
    userId: string;
    title: string;
    description?: string;
    isDeleted: boolean;
    deletedAt?: string;
    purgeAt?: number;  // TTL in epoch seconds
    createdAt: string;
    updatedAt: string;
}

export interface AlbumPhoto {
    albumId: string;
    photoId: string;
    addedAt: string;
}

export class AlbumService {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
    }

    /**
     * Create a new album for a user
     */
    async createAlbum(userId: string, albumId: string, title: string, description?: string): Promise<Album> {
        const now = new Date().toISOString();
        const album: Album = {
            albumId,
            userId,
            title,
            description: description || "",
            isDeleted: false,
            createdAt: now,
            updatedAt: now
        };

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `USER#${userId}`,
                SK: `ALBUM#${albumId}`,
                ...album,
            },
        });

        await this.client.send(command);
        return album;
    }

    /**
     * List all albums for a user (excluding deleted ones)
     */
    async listAlbums(userId: string, includeDeleted = false): Promise<Album[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
                ":pk": `USER#${userId}`,
                ":sk": "ALBUM#",
            },
        });

        const result = await this.client.send(command);
        const albums = (result.Items || []) as Album[];

        // Filter out deleted albums unless requested
        return includeDeleted ? albums : albums.filter(a => !a.isDeleted);
    }

    /**
     * Get a specific album for a user (with ownership check)
     */
    async getAlbum(userId: string, albumId: string): Promise<Album | null> {
        const command = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `ALBUM#${albumId}`,
            },
        });

        const result = await this.client.send(command);
        return (result.Item as Album) ?? null;
    }

    /**
     * Soft delete an album (set isDeleted flag and TTL)
     */
    async deleteAlbum(userId: string, albumId: string): Promise<void> {
        const now = new Date();
        const purgeAt = Math.floor((now.getTime() + 30 * 24 * 60 * 60 * 1000) / 1000); // 30 days from now

        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `ALBUM#${albumId}`,
            },
            UpdateExpression: "SET isDeleted = :deleted, deletedAt = :deletedAt, purgeAt = :purgeAt, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":deleted": true,
                ":deletedAt": now.toISOString(),
                ":purgeAt": purgeAt,
                ":updatedAt": now.toISOString(),
            },
            ConditionExpression: "attribute_exists(PK)", // Ensures album exists
        });

        await this.client.send(command);
    }

    /**
     * Restore an album from trash
     */
    async restoreAlbum(userId: string, albumId: string): Promise<void> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `ALBUM#${albumId}`,
            },
            UpdateExpression: "SET isDeleted = :deleted, updatedAt = :updatedAt REMOVE deletedAt, purgeAt",
            ExpressionAttributeValues: {
                ":deleted": false,
                ":updatedAt": new Date().toISOString(),
            },
        });

        await this.client.send(command);
    }

    /**
     * Permanently delete an album (hard delete)
     */
    async permanentlyDeleteAlbum(userId: string, albumId: string): Promise<void> {
        const command = new DeleteCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `ALBUM#${albumId}`,
            },
        });

        await this.client.send(command);
    }

    /**
     * Add photos to an album
     */
    async addPhotosToAlbum(userId: string, albumId: string, photoIds: string[]): Promise<void> {
        // Store album-photo associations
        const now = new Date().toISOString();
        
        for (const photoId of photoIds) {
            const command = new PutCommand({
                TableName: this.tableName,
                Item: {
                    PK: `USER#${userId}`,
                    SK: `ALBUM#${albumId}#PHOTO#${photoId}`,
                    albumId,
                    photoId,
                    addedAt: now,
                },
            });
            await this.client.send(command);
        }

        // Update album's updatedAt timestamp
        const updateCommand = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `ALBUM#${albumId}`,
            },
            UpdateExpression: "SET updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":updatedAt": now,
            },
        });
        await this.client.send(updateCommand);
    }

    /**
     * Remove photos from an album
     */
    async removePhotosFromAlbum(userId: string, albumId: string, photoIds: string[]): Promise<void> {
        // Delete album-photo associations
        for (const photoId of photoIds) {
            const command = new DeleteCommand({
                TableName: this.tableName,
                Key: {
                    PK: `USER#${userId}`,
                    SK: `ALBUM#${albumId}#PHOTO#${photoId}`,
                },
            });
            await this.client.send(command);
        }

        // Update album's updatedAt timestamp
        const updateCommand = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: `ALBUM#${albumId}`,
            },
            UpdateExpression: "SET updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":updatedAt": new Date().toISOString(),
            },
        });
        await this.client.send(updateCommand);
    }
}
