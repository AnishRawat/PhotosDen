/**
 * Notification Entity
 */

import { NotificationType, NotificationPriority } from '../enums';

export interface NotificationProps {
  notificationId: string;
  userId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  read: boolean;
  readAt: number | null;
  deletedByUser: boolean;
  deletedAt: number | null;
  metadata: Record<string, any>;
  channels: string[];
  createdAt: number;
  expiresAt: number | null;
}

export class Notification {
  private constructor(private props: NotificationProps) {}

  static create(params: {
    userId: string;
    type: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    relatedEntityId?: string;
    relatedEntityType?: string;
    metadata?: Record<string, any>;
  }): Notification {
    return new Notification({
      notificationId: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      userId: params.userId,
      type: params.type,
      priority: params.priority,
      title: params.title,
      message: params.message,
      relatedEntityId: params.relatedEntityId || null,
      relatedEntityType: params.relatedEntityType || null,
      read: false,
      readAt: null,
      deletedByUser: false,
      deletedAt: null,
      metadata: params.metadata || {},
      channels: ['IN_APP'],
      createdAt: Date.now(),
      expiresAt: null, // Set when read/deleted
    });
  }

  static reconstitute(props: NotificationProps): Notification {
    return new Notification(props);
  }

  get id(): string {
    return this.props.notificationId;
  }

  get isRead(): boolean {
    return this.props.read;
  }

  markAsRead(): void {
    if (this.props.read) return;
    
    this.props.read = true;
    this.props.readAt = Date.now();
    
    // Set TTL for read notifications (30 days) if not critical
    if (this.props.priority !== NotificationPriority.CRITICAL) {
      this.props.expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
    }
  }

  markAsDeleted(): void {
    this.props.deletedByUser = true;
    this.props.deletedAt = Date.now();
    this.props.expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24h grace period
  }

  restore(): void {
    if (!this.props.deletedByUser) {
      throw new Error('Notification is not deleted');
    }
    this.props.deletedByUser = false;
    this.props.deletedAt = null;
    this.props.expiresAt = this.props.read && this.props.priority !== NotificationPriority.CRITICAL
      ? Date.now() + (30 * 24 * 60 * 60 * 1000)
      : null;
  }

  toJSON() {
    return { ...this.props };
  }

  toDynamoDBFormat() {
    return {
      PK: `USER#${this.props.userId}`,
      SK: `NOTIFICATION#${this.props.createdAt}#${this.props.notificationId}`,
      EntityType: 'Notification',
      GSI1PK: `USER#${this.props.userId}#READ#${this.props.read}`,
      GSI1SK: `NOTIFICATION#${this.props.createdAt}`,
      GSI2PK: `USER#${this.props.userId}#PRIORITY#${this.props.priority}`,
      GSI2SK: `NOTIFICATION#${this.props.createdAt}`,
      ...this.props,
    };
  }
}
