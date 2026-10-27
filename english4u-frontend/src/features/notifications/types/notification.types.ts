export interface NotificationListItemDto {
    id: string;
    userId: string;
    userDisplayName: string;
    userEmail: string;
    userRole: string;
    title: string;
    message: string | null;
    isRead: boolean;
    createdAt: string;
}

export interface NotificationPagedRequest {
    pageNumber?: number;
    pageSize?: number;
    searchTerm?: string;
    isRead?: boolean;
    role?: string;
}

export interface NotificationPagedResult {
    items: NotificationListItemDto[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}

export interface NotificationStatsDto {
    total: number;
    unread: number;
    createdToday: number;
}

export interface BroadcastNotificationRequest {
    title: string;
    message?: string;
    targetRole?: string;
    userIds?: string[];
}

export interface UpdateNotificationRequest {
    title: string;
    message?: string;
}

export interface NotificationMutationResult {
    message: string;
    createdCount?: number;
    updatedCount?: number;
    deletedCount?: number;
}

// Client Notification DTOs
export interface ClientNotificationItemDto {
    id: string;
    title: string;
    message: string | null;
    isRead: boolean;
    createdAt: string;
}

export interface ClientNotificationPagedRequest {
    pageNumber?: number;
    pageSize?: number;
}

export interface ClientNotificationPagedResult {
    items: ClientNotificationItemDto[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}

export interface ClientNotificationStatsDto {
    total: number;
    unread: number;
}
