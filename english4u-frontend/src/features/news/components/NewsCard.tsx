import React from 'react';
import { Card, Tag, Button } from 'antd';
import { ClockCircleOutlined, BookOutlined, GlobalOutlined } from '@ant-design/icons';
import type { NewsItem } from '../types/news.types';
import { NEWS_CATEGORIES } from '../services/news.service';

interface NewsCardProps {
    item: NewsItem;
    onSelect: (item: NewsItem) => void;
}

export const NewsCard: React.FC<NewsCardProps> = ({ item, onSelect }) => {
    const categoryMeta = NEWS_CATEGORIES.find((c) => c.key === item.category) || NEWS_CATEGORIES[0];

    const formatRelativeTime = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            const now = new Date();
            const diffHours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));

            if (Number.isNaN(diffHours) || diffHours < 1) return 'Vừa đăng';
            if (diffHours < 24) return `${diffHours} giờ trước`;
            const diffDays = Math.floor(diffHours / 24);
            if (diffDays < 7) return `${diffDays} ngày trước`;
            return date.toLocaleDateString('vi-VN');
        } catch {
            return 'Gần đây';
        }
    };

    return (
        <Card
            hoverable
            onClick={() => onSelect(item)}
            style={{
                borderRadius: '16px',
                overflow: 'hidden',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)',
            }}
            bodyStyle={{
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
            }}
            cover={
                <div style={{ position: 'relative', height: '190px', overflow: 'hidden', background: '#f1f5f9' }}>
                    <img
                        alt={item.title}
                        src={item.thumbnail}
                        loading="lazy"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            transition: 'transform 0.4s ease',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'scale(1.05)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'scale(1)';
                        }}
                        onError={(e) => {
                            // Fallback if image fails to load
                            e.currentTarget.src =
                                'https://images.unsplash.com/photo-1504711434969-e33886168f5c?auto=format&fit=crop&w=800&q=80';
                        }}
                    />
                    <div
                        style={{
                            position: 'absolute',
                            top: '12px',
                            left: '12px',
                            display: 'flex',
                            gap: '6px',
                        }}
                    >
                        <Tag
                            color={categoryMeta.badgeColor}
                            icon={categoryMeta.icon}
                            style={{
                                margin: 0,
                                borderRadius: '8px',
                                fontWeight: 600,
                                fontSize: '11px',
                                border: 'none',
                                padding: '2px 8px',
                                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                            }}
                        >
                            {categoryMeta.label.split('&')[0].trim()}
                        </Tag>
                    </div>
                    <div
                        style={{
                            position: 'absolute',
                            bottom: '10px',
                            right: '12px',
                            background: 'rgba(15, 23, 42, 0.75)',
                            backdropFilter: 'blur(4px)',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '6px',
                        }}
                    >
                        {item.readingTime} phút đọc
                    </div>
                </div>
            }
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span
                    style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                    }}
                >
                    <GlobalOutlined style={{ color: '#3b82f6' }} />
                    {item.source}
                </span>
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span
                    style={{
                        fontSize: '11px',
                        color: '#94a3b8',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}
                >
                    <ClockCircleOutlined />
                    {formatRelativeTime(item.pubDate)}
                </span>
            </div>

            <h3
                style={{
                    fontSize: '15px',
                    fontWeight: 700,
                    lineHeight: 1.4,
                    color: '#0f172a',
                    marginBottom: '8px',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
                title={item.title}
            >
                {item.title}
            </h3>

            <p
                style={{
                    fontSize: '13px',
                    lineHeight: 1.5,
                    color: '#64748b',
                    marginBottom: '16px',
                    flex: 1,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}
            >
                {item.description}
            </p>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: 'auto',
                    paddingTop: '12px',
                    borderTop: '1px solid #f1f5f9',
                }}
            >
                <span style={{ fontSize: '12px', color: '#6366f1', fontWeight: 600 }}>
                    Tiếng Anh thực tế
                </span>
                <Button
                    type="link"
                    size="small"
                    icon={<BookOutlined />}
                    style={{
                        padding: 0,
                        fontWeight: 600,
                        color: '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}
                >
                    Luyện đọc
                </Button>
            </div>
        </Card>
    );
};

