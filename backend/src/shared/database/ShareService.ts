import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

export interface ShareLink {
    shareId: string;
    shareToken: string;
    ownerId: string;
    status: "active" | "paused" | "stopped";
    targetType: "album" | "photo";
    targetId: string;
    archived: boolean;
    accessCount: number;
    lastAccessedAt?: string;
    allowedRes: string[];
    expiresAt?: number;  // Epoch seconds (optional)
    createdAt: string;
    updatedAt: string;
    // Optional metadata
    blockScreenshots?: boolean;
    watermark?: boolean;
    viewTimer?: number;  // seconds
}

export interface VisitLog {
    shareToken: string;
    visitedAt: string;
    ipHash: string;
    userAgent: string;
    purgeAt: number;  // TTL: visitedAt + 90 days
}

export class ShareService {
    private client: DynamoDBDocumentClient;
    private tableName: string;

    constructor(client: DynamoDBDocumentClient, tableName: string) {
        this.client = client;
        this.tableName = tableName;
    }

    /**
     * Create a new share link
     */
    async createShare(
        ownerId: string,
        shareId: string,
        shareToken: string,
        targetType: "album" | "photo",
        targetId: string,
        allowedRes: string[],
        expiresAt?: number,
        metadata?: { blockScreenshots?: boolean; watermark?: boolean; viewTimer?: number }
    ): Promise<ShareLink> {
        const now = new Date().toISOString();
        const share: ShareLink = {
            shareId,
            shareToken,
            ownerId,
            status: "active",
            targetType,
            targetId,
            archived: false,
            accessCount: 0,
            allowedRes,
            expiresAt,
            createdAt: now,
            updatedAt: now,
            ...metadata
        };

        // Store in owner's partition
        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `USER#${ownerId}`,
                SK: `SHARE#${shareId}`,
                ...share,
            },
        });

        await this.client.send(command);

        // Also store a lookup entry for the public token (using GSI1)
        const lookupCommand = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `SHARE_TOKEN#${shareToken}`,
                SK: `METADATA`,
                shareId,
                ownerId,
                targetType,
                targetId,
            },
        });

        await this.client.send(lookupCommand);

        return share;
    }

    /**
     * Get share by token (public access - no user auth required)
     */
    async getShareByToken(shareToken: string): Promise<ShareLink | null> {
        // First, look up the share metadata using the token
        const lookupCommand = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `SHARE_TOKEN#${shareToken}`,
                SK: `METADATA`,
            },
        });

        const lookupResult = await this.client.send(lookupCommand);
        if (!lookupResult.Item) {
            return null;
        }

        const { ownerId, shareId } = lookupResult.Item;

        // Now get the full share object from owner's partition
        const shareCommand = new GetCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${ownerId}`,
                SK: `SHARE#${shareId}`,
            },
        });

        const shareResult = await this.client.send(shareCommand);
        return (shareResult.Item as ShareLink) ?? null;
    }

    /**
     * List all shares for a user (owner-scoped)
     */
    async listShares(ownerId: string, activeOnly = true): Promise<ShareLink[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
                ":pk": `USER#${ownerId}`,
                ":sk": "SHARE#",
            },
        });

        const result = await this.client.send(command);
        const shares = (result.Items || []) as ShareLink[];

        // Filter active shares if requested
        return activeOnly 
            ? shares.filter(s => s.status === "active" && !s.archived)
            : shares.filter(s => !s.archived);
    }

    /**
     * Update share status
     */
    async updateShareStatus(ownerId: string, shareId: string, status: "active" | "paused" | "stopped"): Promise<void> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${ownerId}`,
                SK: `SHARE#${shareId}`,
            },
            UpdateExpression: "SET #status = :status, updatedAt = :updatedAt",
            ExpressionAttributeNames: {
                "#status": "status",
            },
            ExpressionAttributeValues: {
                ":status": status,
                ":updatedAt": new Date().toISOString(),
            },
        });

        await this.client.send(command);
    }

    /**
     * Archive a share (soft delete)
     */
    async archiveShare(ownerId: string, shareId: string): Promise<void> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${ownerId}`,
                SK: `SHARE#${shareId}`,
            },
            UpdateExpression: "SET archived = :archived, updatedAt = :updatedAt",
            ExpressionAttributeValues: {
                ":archived": true,
                ":updatedAt": new Date().toISOString(),
            },
        });

        await this.client.send(command);
    }

    /**
     * Increment access count and update last accessed time
     */
    async incrementAccessCount(ownerId: string, shareId: string): Promise<void> {
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${ownerId}`,
                SK: `SHARE#${shareId}`,
            },
            UpdateExpression: "SET accessCount = if_not_exists(accessCount, :zero) + :inc, lastAccessedAt = :now",
            ExpressionAttributeValues: {
                ":zero": 0,
                ":inc": 1,
                ":now": new Date().toISOString(),
            },
        });

        await this.client.send(command);
    }

    /**
     * Log a visit (for analytics)
     */
    async logVisit(shareToken: string, ipHash: string, userAgent: string): Promise<void> {
        const now = new Date();
        const purgeAt = Math.floor((now.getTime() + 90 * 24 * 60 * 60 * 1000) / 1000); // 90 days TTL

        const command = new PutCommand({
            TableName: this.tableName,
            Item: {
                PK: `SHARE_TOKEN#${shareToken}`,
                SK: `VISIT#${now.toISOString()}`,
                shareToken,
                visitedAt: now.toISOString(),
                ipHash,
                userAgent,
                purgeAt,
            },
        });

        await this.client.send(command);
    }

    /**
     * Get visit logs for a share
     */
    async getVisitLogs(shareToken: string): Promise<VisitLog[]> {
        const command = new QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues: {
                ":pk": `SHARE_TOKEN#${shareToken}`,
                ":sk": "VISIT#",
            },
            ScanIndexForward: false, // Most recent first
        });

        const result = await this.client.send(command);
        return (result.Items || []) as VisitLog[];
    }
}
