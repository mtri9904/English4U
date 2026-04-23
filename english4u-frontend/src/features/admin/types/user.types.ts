export interface UserProfileDto {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    phone: string | null;
    department: string | null;
    position: string | null;
    notes: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
    lastSeenAt?: string | null;
    isOnline?: boolean;
    role: string | null;
    createdAt: string;
}

export interface UpdateProfileRequest {
    displayName: string;
    avatarUrl?: string;
    phone?: string;
    department?: string;
    position?: string;
    notes?: string;
    bio?: string;
}

export interface ChangePasswordRequest {
    oldPassword: string;
    newPassword: string;
}

export interface UserOverviewDto {
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    phone: string | null;
    isActive: boolean;
    isOnline: boolean;
    createdAt: string;
    lastLoginAt: string | null;
    lastSeenAt: string | null;
    roleName: string;
    subscriptionName: string | null;
    currentLevel: string | null;
    averageScore: number;
}

export interface UserDetailDto extends UserOverviewDto {
    department: string | null;
    position: string | null;
    notes: string | null;
    totalExamsTaken: number;
    recentSessions: UserSessionHistoryDto[];
}

export interface UserSessionHistoryDto {
    sessionId: string;
    examTitle: string;
    completedAt: string;
    score: number;
}

export interface UserManagementStatsDto {
    totalUsers: number;
    activeUsers: number;
    onlineUsers: number;
    globalAverageScore: number;
    premiumUsers: number;
}

export interface UserPagedRequest {
    pageNumber?: number;
    pageSize?: number;
    searchTerm?: string;
    isActive?: boolean;
    subscriptionId?: string;
    sortBy?: string;
    sortDescending?: boolean;
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}
