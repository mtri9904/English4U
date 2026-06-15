export interface BillingOverviewDto {
    totalPackages: number;
    activePackages: number;
    totalTransactions: number;
    successfulTransactions: number;
    pendingTransactions: number;
    totalRevenue: number;
}

export interface SubscriptionListItemDto {
    id: string;
    name: string;
    price: number;
    durationDays: number;
    features: string | null;
    isActive: boolean;
    activeUsers: number;
}

export interface SubscriptionUpsertRequest {
    name: string;
    price: number;
    durationDays: number;
    features?: string;
    isActive: boolean;
}

export interface PaymentListItemDto {
    id: string;
    userId: string;
    userDisplayName: string;
    userEmail: string;
    subscriptionName: string | null;
    amount: number;
    paymentMethod: string | null;
    status: string | null;
    transactionId: string | null;
    createdAt: string;
}

export interface PaymentPagedRequest {
    pageNumber?: number;
    pageSize?: number;
    searchTerm?: string;
    status?: string;
    method?: string;
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}

export interface ToggleSubscriptionStatusRequest {
    isActive: boolean;
}
