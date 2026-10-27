/**
 * API Types - Standardized API Response and Request Contracts
 * Follows the enterprise pattern from Mebifarm CMS (web)
 */

export interface PaginatedResponse<T> {
    pageNumber?: number;
    pageSize?: number;
    totalCount?: number;
    totalPages?: number;
    items: T[];
}

export interface PagedResult<T> {
    items: T[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
}

export interface ApiResponse<T = unknown> {
    data: T;
    success?: boolean;
    message?: string | null;
    statusCode?: number | string;
    traceId?: string | null;
}

export interface ApiErrorResponse {
    type?: string | null;
    title?: string | null;
    status?: number | string;
    detail?: string | null;
    instance?: string | null;
    errors?: Record<string, string[]>;
    message?: string | null;
}

export interface PaginationParams {
    pageNumber?: number;
    pageSize?: number;
    search?: string;
    sortBy?: string;
    sortDescending?: boolean;
}
