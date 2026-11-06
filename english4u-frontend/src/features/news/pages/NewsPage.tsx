import React, { useState, useEffect, useCallback } from 'react';
import { Input, Button, Spin, Empty, Tag } from 'antd';
import {
    SearchOutlined,
    GlobalOutlined,
    BookOutlined,
    ThunderboltOutlined,
    ReadOutlined,
    DownOutlined,
} from '@ant-design/icons';
import type { NewsCategory, NewsItem } from '../types/news.types';
import { fetchNewsFromBackend, NEWS_CATEGORIES } from '../services/news.service';
import { NewsCard } from '../components/NewsCard';
import { NewsHeroBanner } from '../components/NewsHeroBanner';
import { NewsDetailModal } from '../components/NewsDetailModal';
import { PageErrorState } from '@/components';

export const NewsPage: React.FC = () => {
    const [selectedCategory, setSelectedCategory] = useState<NewsCategory>('all');
    const [searchKeyword, setSearchKeyword] = useState<string>('');
    const [debouncedKeyword, setDebouncedKeyword] = useState<string>('');
    const [articles, setArticles] = useState<NewsItem[]>([]);
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [hasMore, setHasMore] = useState<boolean>(true);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
    const [isError, setIsError] = useState<boolean>(false);
    const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
    const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

    // Debounce search input to avoid redundant API queries while typing
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedKeyword(searchKeyword);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchKeyword]);

    const PAGE_SIZE = 10;

    const loadInitialNews = useCallback(async (category: NewsCategory, search: string) => {
        setIsLoading(true);
        setIsError(false);
        setCurrentPage(1);
        try {
            // First page: 10 articles (1 Hero featured article + 9 grid articles)
            const newsData = await fetchNewsFromBackend(category, 1, PAGE_SIZE, search);
            const items = newsData.items || [];
            setArticles(items);
            setHasMore(items.length >= PAGE_SIZE);
        } catch {
            setArticles([]);
            setHasMore(false);
            setIsError(true);
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadInitialNews(selectedCategory, debouncedKeyword);
    }, [selectedCategory, debouncedKeyword, loadInitialNews]);

    const handleLoadMore = async () => {
        if (isLoadingMore || !hasMore) return;
        setIsLoadingMore(true);
        const nextPage = currentPage + 1;

        try {
            // Fetch next page from backend API
            const newsData = await fetchNewsFromBackend(selectedCategory, nextPage, PAGE_SIZE, debouncedKeyword);
            const newItems = newsData.items || [];

            if (newItems.length < PAGE_SIZE) {
                setHasMore(false);
            }

            if (newItems.length > 0) {
                setArticles((prev) => {
                    const existingIds = new Set(prev.map((a) => a.id));
                    const uniqueNewItems = newItems.filter((a) => !existingIds.has(a.id));
                    return [...prev, ...uniqueNewItems];
                });
                setCurrentPage(nextPage);
            }
        } catch {
            setHasMore(false);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleSelectArticle = (article: NewsItem) => {
        setSelectedArticle(article);
        setIsModalOpen(true);
    };

    const isSearching = Boolean(debouncedKeyword.trim());
    const heroArticle = !isSearching && articles.length > 0 ? articles[0] : null;
    const gridArticles = !isSearching ? articles.slice(1) : articles;

    const activeCategoryMeta =
        NEWS_CATEGORIES.find((c) => c.key === selectedCategory) || NEWS_CATEGORIES[0];

    return (
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 20px 48px' }}>
            {/* Header Hero Section */}
            <div
                style={{
                    background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #0369a1 100%)',
                    borderRadius: '24px',
                    padding: '36px 32px',
                    color: '#fff',
                    marginBottom: '28px',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 16px 36px -10px rgba(15, 23, 42, 0.4)',
                }}
            >
                <div style={{ position: 'relative', zIndex: 2, maxWidth: '840px' }}>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <Tag
                            style={{
                                background: 'rgba(255, 255, 255, 0.18)',
                                backdropFilter: 'blur(8px)',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                borderRadius: '999px',
                                padding: '4px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                            }}
                        >
                            <GlobalOutlined /> Nguồn độc quyền: The Guardian (UK)
                        </Tag>
                        <Tag
                            style={{
                                background: 'rgba(255, 255, 255, 0.18)',
                                backdropFilter: 'blur(8px)',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                borderRadius: '999px',
                                padding: '4px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                            }}
                        >
                            <ReadOutlined /> Toàn văn bài báo & Hình ảnh gốc
                        </Tag>
                        <Tag
                            style={{
                                background: 'rgba(255, 255, 255, 0.18)',
                                backdropFilter: 'blur(8px)',
                                color: '#fff',
                                border: '1px solid rgba(255, 255, 255, 0.25)',
                                borderRadius: '999px',
                                padding: '4px 12px',
                                fontSize: '12px',
                                fontWeight: 700,
                            }}
                        >
                            <ThunderboltOutlined /> Giọng đọc bản xứ AI (British English)
                        </Tag>
                    </div>

                    <h1
                        style={{
                            fontSize: '32px',
                            fontWeight: 800,
                            color: '#ffffff',
                            lineHeight: 1.25,
                            marginBottom: '10px',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        Báo Quốc Tế & Đọc Hiểu Tiếng Anh Hàng Ngày
                    </h1>
                    <p style={{ fontSize: '15px', color: '#e2e8f0', lineHeight: 1.6, margin: 0 }}>
                        Đọc toàn bộ các bài viết thời sự, chuyên đề chuẩn ngữ pháp từ nhật báo uy tín hàng đầu nước Anh — <strong>The Guardian</strong>.
                        Tích hợp 6 chuyên mục đời sống: <em>Du lịch, Văn hóa, Đời sống, Kinh tế & Thị trường, Khoa học & Công nghệ</em> cùng tính năng phát âm bản xứ giúp bạn luyện phản xạ đọc - nghe tự nhiên nhất.
                    </p>
                </div>
            </div>

            {/* Search Bar */}
            <div
                style={{
                    background: '#ffffff',
                    padding: '16px 20px',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
                    marginBottom: '20px',
                }}
            >
                <Input
                    placeholder="Tìm kiếm bài viết (VD: travel, market, culture, economy, AI)..."
                    prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                    value={searchKeyword}
                    onChange={(e) => setSearchKeyword(e.target.value)}
                    allowClear
                    size="large"
                    style={{ borderRadius: '10px' }}
                />
            </div>

            {/* Category Pills Navigation */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    overflowX: 'auto',
                    paddingBottom: '12px',
                    marginBottom: '24px',
                }}
            >
                {NEWS_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.key;
                    return (
                        <button
                            key={cat.key}
                            type="button"
                            onClick={() => setSelectedCategory(cat.key)}
                            style={{
                                border: isSelected ? `2px solid ${cat.badgeColor}` : '1px solid #e2e8f0',
                                background: isSelected ? '#f8fafc' : '#ffffff',
                                color: isSelected ? cat.badgeColor : '#475569',
                                fontWeight: isSelected ? 700 : 500,
                                fontSize: '13px',
                                padding: '8px 16px',
                                borderRadius: '999px',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s ease',
                                boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
                            }}
                        >
                            <span>{cat.icon}</span>
                            <span>{cat.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content Section */}
            {isLoading ? (
                <div
                    style={{
                        padding: '80px 0',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '16px',
                    }}
                >
                    <Spin size="large" />
                    <div style={{ color: '#64748b', fontSize: '14px', fontWeight: 600 }}>
                        Đang lấy toàn văn bài viết từ The Guardian Content API...
                    </div>
                </div>
            ) : isError && articles.length === 0 ? (
                <div style={{ padding: '30px 0' }}>
                    <PageErrorState
                        title="Không thể tải tin tức"
                        subTitle="Đã có lỗi khi kết nối tới dịch vụ tin tức The Guardian. Vui lòng bấm thử lại."
                        status="warning"
                        onRetry={() => loadInitialNews(selectedCategory, debouncedKeyword)}
                    />
                </div>
            ) : articles.length === 0 ? (
                <div style={{ padding: '60px 0', background: '#fff', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                    <Empty
                        description={
                            <div style={{ color: '#64748b' }}>
                                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
                                    Không tìm thấy bài viết nào
                                </div>
                                <div style={{ fontSize: '13px' }}>
                                    Hãy thử tìm kiếm với từ khóa khác hoặc chuyển sang chuyên mục khác.
                                </div>
                            </div>
                        }
                    >
                        <Button
                            type="primary"
                            onClick={() => {
                                setSearchKeyword('');
                                setSelectedCategory('all');
                            }}
                        >
                            Xem tất cả tin tức
                        </Button>
                    </Empty>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                    {/* Featured Top Story */}
                    {heroArticle && (
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                <div style={{ width: '4px', height: '18px', background: activeCategoryMeta.badgeColor, borderRadius: '2px' }} />
                                <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                    Tiêu điểm {activeCategoryMeta.label}
                                </h3>
                            </div>
                            <NewsHeroBanner item={heroArticle} onSelect={handleSelectArticle} />
                        </div>
                    )}

                    {/* Articles Grid */}
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <div style={{ width: '4px', height: '18px', background: '#0284c7', borderRadius: '2px' }} />
                            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                                {isSearching ? `Kết quả tìm kiếm cho "${debouncedKeyword.trim()}"` : 'Bài viết mới cập nhật'}
                            </h3>
                        </div>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                                gap: '20px',
                            }}
                        >
                            {gridArticles.map((item) => (
                                <NewsCard key={item.id} item={item} onSelect={handleSelectArticle} />
                            ))}
                        </div>

                        {/* Load More Button - Trang tiếp theo */}
                        {hasMore && (
                            <div style={{ textAlign: 'center', marginTop: '36px' }}>
                                <Button
                                    type="default"
                                    size="large"
                                    icon={<DownOutlined />}
                                    loading={isLoadingMore}
                                    onClick={handleLoadMore}
                                    style={{
                                        borderRadius: '12px',
                                        height: '46px',
                                        padding: '0 36px',
                                        fontWeight: 700,
                                        color: '#1e3a8a',
                                        borderColor: '#bfdbfe',
                                        background: '#ffffff',
                                        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.04)',
                                    }}
                                >
                                    Xem thêm bài viết
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Bottom Learning Tips Box */}
            <div
                style={{
                    marginTop: '48px',
                    padding: '24px 28px',
                    background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                    borderRadius: '16px',
                    border: '1px solid #e2e8f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                }}
            >
                <div style={{ maxWidth: '750px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                        <BookOutlined style={{ color: '#2563eb', fontSize: '18px' }} />
                        <h4 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: 0 }}>
                            Phương pháp học từ vựng hiệu quả qua báo The Guardian
                        </h4>
                    </div>
                    <p style={{ fontSize: '13px', color: '#64748b', margin: 0, lineHeight: 1.6 }}>
                        Mỗi bài viết bạn đọc có thời lượng trung bình 3 - 6 phút và được viết bởi các phóng viên bản ngữ chuẩn Anh Quốc. Mở bài viết để xem toàn bộ hình ảnh minh họa chất lượng cao và bật tính năng phát âm bản xứ để luyện ngữ điệu (Shadowing)!
                    </p>
                </div>
                <Button
                    type="primary"
                    onClick={() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    style={{ borderRadius: '8px', fontWeight: 600 }}
                >
                    Khám phá thêm bài viết
                </Button>
            </div>

            {/* Article Detail Modal */}
            <NewsDetailModal
                item={selectedArticle}
                open={isModalOpen}
                onClose={() => {
                    setIsModalOpen(false);
                    setSelectedArticle(null);
                }}
            />
        </div>
    );
};
