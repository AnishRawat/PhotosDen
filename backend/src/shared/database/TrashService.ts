import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export interface TrashItem {
    itemType: "album" | "photo" | "upload";
    id: string;
    userId: string;
    isDeleted: boolean;
    deletedAt: string;
    purgeAt: number;  // Epoch seconds (TTL)
    title?: string;
    [key: string]: any;  // Other properties from the original item
}

export class TrashService {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
    }

    /**
     * List all deleted items for a user
     */
    async listTrash(userId: string): Promise<TrashItem[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk",
            FilterExpression: "isDeleted = :deleted",
            ExpressionAttributeValues: {
                ":pk": `USER#${userId}`,
                ":deleted": true,
            },
        });

        const result = await this.client.send(command);
        const items = result.Items || [];

        // Transform items to TrashItem format
        return items.map(item => {
            let itemType: "album" | "photo" | "upload" = "album";
            let id = "";

            if (item.SK.startsWith("ALBUM#")) {
                itemType = "album";
                id = item.albumId;
            } else if (item.SK.startsWith("PHOTO#")) {
                itemType = "photo";
                id = item.photoId;
            } else if (item.SK.startsWith("UPLOAD#")) {
                itemType = "upload";
                id = item.uploadId;
            }

            return {
                itemType,
                id,
                userId: item.userId,
                isDeleted: item.isDeleted,
                deletedAt: item.deletedAt,
                purgeAt: item.purgeAt,
                title: item.title,
                ...item
            } as TrashItem;
        });
    }

    /**
     * Restore an item from trash (handled by specific service - AlbumService, etc.)
     * This is a pass-through that delegates to the appropriate service
     */
    // Note: Restore logic is in AlbumService.restoreAlbum(), PhotoService.restorePhoto(), etc.
    // This service mainly provides list/query functionality

    /**
     * Get items about to be purged (within next N days)
     */
    async getItemsNearPurge(userId: string, daysUntilPurge: number): Promise<TrashItem[]> {
        const threshold = Math.floor((Date.now() + daysUntilPurge * 24 * 60 * 60 * 1000) / 1000);
        
        const allTrash = await this.listTrash(userId);
        return allTrash.filter(item => item.purgeAt && item.purgeAt <= threshold);
    }
}
