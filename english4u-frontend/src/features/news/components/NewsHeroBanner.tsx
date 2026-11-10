import React from 'react';
import { Button, Tag } from 'antd';
import { BookOutlined, FireOutlined, GlobalOutlined, RightOutlined } from '@ant-design/icons';
import type { NewsItem } from '../types/news.types';
import { NEWS_CATEGORIES } from '../services/news.service';

interface NewsHeroBannerProps {
    item: NewsItem;
    onSelect: (item: NewsItem) => void;
}

export const NewsHeroBanner: React.FC<NewsHeroBannerProps> = ({ item, onSelect }) => {
    const categoryMeta = NEWS_CATEGORIES.find((c) => c.key === item.category) || NEWS_CATEGORIES[0];

    return (
        <div
            onClick={() => onSelect(item)}
            style={{
                position: 'relative',
                borderRadius: '24px',
                overflow: 'hidden',
                cursor: 'pointer',
                minHeight: '380px',
                background: '#0f172a',
                display: 'flex',
                alignItems: 'flex-end',
                boxShadow: '0 12px 30px -10px rgba(15, 23, 42, 0.25)',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 20px 35px -10px rgba(15, 23, 42, 0.35)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 12px 30px -10px rgba(15, 23, 42, 0.25)';
            }}
        >
            {/* Background image with gradient overlay */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage: `url(${item.thumbnail})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    filter: 'brightness(0.85)',
                    transition: 'transform 0.6s ease',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    background:
                        'linear-gradient(180deg, rgba(15, 23, 42, 0.1) 0%, rgba(15, 23, 42, 0.6) 40%, rgba(15, 23, 42, 0.95) 100%)',
                }}
            />

            {/* Content overlay */}
            <div
                style={{
                    position: 'relative',
                    zIndex: 2,
                    padding: '36px',
                    width: '100%',
                    maxWidth: '900px',
                    color: '#fff',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                        marginBottom: '14px',
                    }}
                >
                    <span
                        style={{
                            background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
                            color: '#fff',
                            fontSize: '11px',
                            fontWeight: 800,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '4px 10px',
                            borderRadius: '999px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                        }}
                    >
                        <FireOutlined /> Tin nổi bật
                    </span>
                    <Tag
                        color={categoryMeta.badgeColor}
                        icon={categoryMeta.icon}
                        style={{
                            margin: 0,
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '12px',
                            border: 'none',
                            padding: '3px 10px',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                        }}
                    >
                        {categoryMeta.label}
                    </Tag>
                    <span
                        style={{
                            fontSize: '12px',
                            color: '#cbd5e1',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                        }}
                    >
                        <GlobalOutlined /> {item.source}
                    </span>
                    <span style={{ color: '#64748b' }}>•</span>
                    <span style={{ fontSize: '12px', color: '#cbd5e1' }}>
                        {item.readingTime} phút đọc
                    </span>
                </div>

                <h2
                    style={{
                        fontSize: '28px',
                        fontWeight: 800,
                        lineHeight: 1.3,
                        color: '#ffffff',
                        marginBottom: '12px',
                        textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                    }}
                >
                    {item.title}
                </h2>

                <p
                    style={{
                        fontSize: '15px',
                        lineHeight: 1.6,
                        color: '#e2e8f0',
                        marginBottom: '20px',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        maxWidth: '750px',
                    }}
                >
                    {item.description}
                </p>

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <Button
                        type="primary"
                        size="large"
                        icon={<BookOutlined />}
                        style={{
                            background: '#2563eb',
                            borderColor: '#2563eb',
                            borderRadius: '10px',
                            fontWeight: 700,
                            height: '42px',
                            padding: '0 20px',
                            boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
                        }}
                    >
                        Đọc bài viết & Luyện từ vựng <RightOutlined style={{ fontSize: '12px' }} />
                    </Button>
                </div>
            </div>
        </div>
    );
};

