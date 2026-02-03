import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export interface UserProfile {
    userId: string;
    email: string;
    phone?: string;
    avatarUrl?: string;
    createdAt: string;
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
        const command = new UpdateCommand({
            TableName: this.tableName,
            Key: {
                PK: `USER#${userId}`,
                SK: "PROFILE",
            },
            UpdateExpression: "SET avatarUrl = :avatarUrl, phone = :phone",
            ExpressionAttributeValues: {
                ":avatarUrl": updates.avatarUrl ?? null,
                ":phone": updates.phone ?? null,
            },
        });

        await this.client.send(command);
    }
}
