export type NewsCategory = 'all' | 'travel' | 'culture' | 'lifestyle' | 'business' | 'science' | 'technology';

export type NewsSource = 'theguardian';

export interface NewsItem {
    id: string;
    title: string;
    description: string;
    content?: string;
    bodyHtml?: string;
    link: string;
    author?: string;
    pubDate: string;
    thumbnail: string;
    mainImageUrl?: string;
    mainImageCaption?: string;
    category: NewsCategory;
    categoryLabel: string;
    source: string;
    readingTime: number;
}

export interface NewsListResponse {
    items: NewsItem[];
    category: string;
    total: number;
    page: number;
    pageSize: number;
    isCached: boolean;
    dailyQuotaUsed: number;
    dailyQuotaRemaining: number;
}

export interface NewsQuotaStatus {
    usedToday: number;
    maxDailyLimit: number;
    safeDailyLimit: number;
    remainingToday: number;
    resetTimeUtc: string;
}

export interface CategoryOption {
    key: NewsCategory;
    label: string;
    icon: string;
    description: string;
    badgeColor: string;
}

export type NewsCategoryMeta = CategoryOption;

