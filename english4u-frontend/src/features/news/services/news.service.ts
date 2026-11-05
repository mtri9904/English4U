import { axiosInstance } from '@/apis/axios.instance';
import { ApiRouters } from '@/constants/api-routes';
import type {
    NewsCategory,
    NewsItem,
    CategoryOption,
    NewsListResponse,
    NewsQuotaStatus,
} from '../types/news.types';

export const NEWS_CATEGORIES: CategoryOption[] = [
    {
        key: 'all',
        label: 'Tất cả tin tức',
        icon: '🌍',
        description: 'Tin tức tổng hợp từ The Guardian thế giới',
        badgeColor: '#2563eb',
    },
    {
        key: 'travel',
        label: 'Du lịch & Khám phá',
        icon: '✈️',
        description: 'Văn hóa du lịch, điểm đến hấp dẫn và cẩm nang khám phá',
        badgeColor: '#059669',
    },
    {
        key: 'culture',
        label: 'Văn hóa & Nghệ thuật',
        icon: '🎭',
        description: 'Điện ảnh, sách báo, phong cách sống và nghệ thuật thế giới',
        badgeColor: '#9333ea',
    },
    {
        key: 'lifestyle',
        label: 'Đời sống & Sức khỏe',
        icon: '🌿',
        description: 'Sức khỏe, tinh thần, thói quen sống và phát triển bản thân',
        badgeColor: '#e11d48',
    },
    {
        key: 'business',
        label: 'Kinh tế & Thị trường',
        icon: '💼',
        description: 'Kinh tế toàn cầu, tài chính, thị trường và khởi nghiệp',
        badgeColor: '#d97706',
    },
    {
        key: 'science',
        label: 'Khoa học & Tự nhiên',
        icon: '🔬',
        description: 'Khám phá vũ trụ, môi trường, khí hậu và tự nhiên',
        badgeColor: '#0284c7',
    },
    {
        key: 'technology',
        label: 'Công nghệ & Tương lai',
        icon: '💻',
        description: 'Trí tuệ nhân tạo, thiết bị thông minh và xu hướng tương lai',
        badgeColor: '#4f46e5',
    },
];

// In-flight request deduplication map to prevent double-firing in React 18 StrictMode
const inFlightRequests = new Map<string, Promise<NewsListResponse>>();
const inFlightArticleRequests = new Map<string, Promise<NewsItem | null>>();

export const fetchNewsFromBackend = async (
    category: NewsCategory = 'all',
    page = 1,
    pageSize = 20,
    search?: string
): Promise<NewsListResponse> => {
    const dedupeKey = `${category}_${page}_${pageSize}_${search || ''}`;
    const existing = inFlightRequests.get(dedupeKey);
    if (existing) {
        return existing;
    }

    const requestPromise = (async () => {
        try {
            const response = await axiosInstance.get<NewsListResponse>(ApiRouters.NEWS.BASE, {
                params: {
                    category,
                    page,
                    pageSize,
                    search: search?.trim() || undefined,
                },
            });

            if (response.data && Array.isArray(response.data.items)) {
                return response.data;
            }
        } catch {
            // Handled below
        } finally {
            inFlightRequests.delete(dedupeKey);
        }

        return {
            items: [],
            category,
            total: 0,
            page,
            pageSize,
            isCached: false,
            dailyQuotaUsed: 0,
            dailyQuotaRemaining: 480,
        };
    })();

    inFlightRequests.set(dedupeKey, requestPromise);
    return requestPromise;
};

export const fetchArticleDetail = async (articleId: string): Promise<NewsItem | null> => {
    if (inFlightArticleRequests.has(articleId)) {
        return inFlightArticleRequests.get(articleId)!;
    }

    const promise = (async () => {
        try {
            const response = await axiosInstance.get<NewsItem>(ApiRouters.NEWS.ARTICLE, {
                params: { id: articleId },
            });

            if (response.data && response.data.id) {
                return response.data;
            }
        } catch {
            return null;
        } finally {
            inFlightArticleRequests.delete(articleId);
        }

        return null;
    })();

    inFlightArticleRequests.set(articleId, promise);
    return promise;
};

export const fetchQuotaStatus = async (): Promise<NewsQuotaStatus | null> => {
    try {
        const response = await axiosInstance.get<NewsQuotaStatus>(ApiRouters.NEWS.QUOTA);
        return response.data;
    } catch {
        return null;
    }
};

export interface NewsTranslateResponse {
    translatedText: string;
    isCached: boolean;
    modelUsed: string;
}

export const cleanTranslationText = (text: string): string => {
    if (!text) return '';
    let cleaned = text.trim();

    // 1. Remove reasoning tags: <think>, <thought>, <reasoning>
    cleaned = cleaned.replace(/<(think|thought|reasoning)>[\s\S]*?(<\/(think|thought|reasoning)>|$)/gi, '').trim();

    // 2. Strip orphaned closing tag if present
    const lastClose = Math.max(cleaned.lastIndexOf('</thought>'), cleaned.lastIndexOf('</think>'));
    if (lastClose >= 0) {
        cleaned = cleaned.substring(lastClose + (cleaned.slice(lastClose, lastClose + 10).toLowerCase().startsWith('</thought>') ? 10 : 8)).trim();
    }

    // 3. Extract translation if model returns raw JSON string
    if (cleaned.startsWith('{') && cleaned.includes('}')) {
        try {
            const parsed = JSON.parse(cleaned);
            if (parsed.translation) return String(parsed.translation).trim();
            if (parsed.meaningVi) return String(parsed.meaningVi).trim();
        } catch {
            const match = cleaned.match(/"(?:translation|meaningVi)"\s*:\s*"((?:\\.|[^"\\])*)"/);
            if (match && match[1]) {
                return match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').trim();
            }
        }
    }

    // 4. Strip common translation prefixes
    cleaned = cleaned.replace(/^(?:Translation|Bản dịch|Dịch nghĩa|Vietnamese translation):\s*/i, '');

    return cleaned.replace(/^["'`]|["'`]$/g, '').trim();
};

export const translateParagraph = async (
    text: string,
    articleId?: string,
    paragraphIndex?: number
): Promise<string> => {
    if (!text?.trim()) return '';
    try {
        const response = await axiosInstance.post<NewsTranslateResponse>(ApiRouters.NEWS.TRANSLATE, {
            text,
            articleId,
            paragraphIndex,
        });
        if (response.data && response.data.translatedText) {
            return cleanTranslationText(response.data.translatedText);
        }
    } catch {
        // Fallback directly to Google GTX
        try {
            const gtxUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t&q=${encodeURIComponent(text)}`;
            const gtxRes = await fetch(gtxUrl);
            const data = await gtxRes.json();
            if (Array.isArray(data) && Array.isArray(data[0])) {
                return cleanTranslationText(data[0].map((item: any) => item[0]).filter(Boolean).join(''));
            }
        } catch {
            // ignore
        }
    }
    return text;
};

export interface NewsDictionaryResult {
    word: string;
    phonetic?: string;
    partOfSpeech?: string;
    meaningVi?: string;
    definitionEn?: string;
    audioUrl?: string;
    example?: string;
}

export const lookupWordDictionary = async (word: string, context?: string): Promise<NewsDictionaryResult | null> => {
    if (!word?.trim()) return null;
    try {
        const response = await axiosInstance.get<NewsDictionaryResult>(ApiRouters.NEWS.DICTIONARY, {
            params: {
                word: word.trim(),
                context: context?.trim() || undefined,
            },
        });
        if (response.data && response.data.word) {
            return response.data;
        }
    } catch {
        // ignore
    }
    return null;
};
