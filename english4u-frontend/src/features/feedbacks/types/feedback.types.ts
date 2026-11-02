export type FeedbackType = 'BUG' | 'IMPROVEMENT' | 'QUESTION' | 'OTHER';
export type FeedbackPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type FeedbackStatus = 'RECEIVED' | 'IN_PROGRESS' | 'RESOLVED' | 'REJECTED';

export interface CreateFeedbackRequest {
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    description: string;
    suggestedSolution?: string;
    attachmentUrls?: string[];
    browserInfo?: string;
    currentPageUrl?: string;
}

export interface FeedbackListItem {
    id: string;
    code: string;
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    status: FeedbackStatus;
    currentPageUrl?: string;
    createdAt: string;
    senderName: string;
    senderRole: string;
}

export interface FeedbackActivityLog {
    id: string;
    status: FeedbackStatus;
    note: string;
    actorName: string;
    createdAt: string;
    isCurrent: boolean;
}

export interface FeedbackDetail {
    id: string;
    code: string;
    type: FeedbackType;
    priority: FeedbackPriority;
    title: string;
    description: string;
    suggestedSolution?: string;
    attachments: string[];
    browserInfo?: string;
    currentPageUrl?: string;
    status: FeedbackStatus;
    senderName: string;
    senderRole: string;
    senderEmail?: string;
    assignedAdminName?: string;
    createdAt: string;
    updatedAt: string;
    activityLogs: FeedbackActivityLog[];
}

export interface UpdateFeedbackStatusRequest {
    status: FeedbackStatus;
    note?: string;
    assignedAdminId?: string;
}

export interface FeedbackPagedRequest {
    pageNumber?: number;
    pageSize?: number;
    search?: string;
    searchTerm?: string;
    status?: string;
    type?: string;
    priority?: string;
}

export interface FeedbackPagedResult {
    items: FeedbackListItem[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
    totalPages: number;
}

export interface FeedbackStats {
    total: number;
    received: number;
    inProgress: number;
    resolved: number;
    rejected: number;
}

