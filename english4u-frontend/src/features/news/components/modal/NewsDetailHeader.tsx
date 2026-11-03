import React from 'react';
import { Tag, Tooltip, Button } from 'antd';
import { GlobalOutlined, ClockCircleOutlined, FontSizeOutlined } from '@ant-design/icons';
import type { NewsCategoryMeta } from '../../types/news.types';

export interface NewsDetailHeaderProps {
    categoryMeta: NewsCategoryMeta;
    pubDate?: string;
    readingTime?: number;
    fontSizeLevel: 'normal' | 'large' | 'xlarge';
    onFontSizeChange: (level: 'normal' | 'large' | 'xlarge') => void;
}

export const NewsDetailHeader: React.FC<NewsDetailHeaderProps> = ({
    categoryMeta,
    pubDate,
    readingTime = 3,
    fontSizeLevel,
    onFontSizeChange,
}) => {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '16px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <Tag
                    color={categoryMeta.badgeColor}
                    style={{
                        margin: 0,
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '12px',
                        border: 'none',
                        padding: '3px 12px',
                    }}
                >
                    {categoryMeta.icon} {categoryMeta.label}
                </Tag>
                <Tag
                    style={{
                        margin: 0,
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: '#1e3a8a',
                        background: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                    }}
                >
                    <GlobalOutlined style={{ color: '#2563eb' }} />
                    The Guardian (UK)
                </Tag>
                {pubDate && (
                    <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <ClockCircleOutlined />
                        {new Date(pubDate).toLocaleDateString('vi-VN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                        })}
                    </span>
                )}
                <span style={{ color: '#cbd5e1' }}>•</span>
                <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 600 }}>
                    {readingTime} phút đọc
                </span>
            </div>

            {/* Toolbar: Font size control */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Tooltip title="Cỡ chữ">
                    <FontSizeOutlined style={{ color: '#64748b', marginRight: '4px' }} />
                </Tooltip>
                <Button
                    size="small"
                    type={fontSizeLevel === 'normal' ? 'primary' : 'default'}
                    onClick={() => onFontSizeChange('normal')}
                    style={{ fontSize: '11px', padding: '0 8px' }}
                >
                    A
                </Button>
                <Button
                    size="small"
                    type={fontSizeLevel === 'large' ? 'primary' : 'default'}
                    onClick={() => onFontSizeChange('large')}
                    style={{ fontSize: '13px', padding: '0 8px' }}
                >
                    A+
                </Button>
                <Button
                    size="small"
                    type={fontSizeLevel === 'xlarge' ? 'primary' : 'default'}
                    onClick={() => onFontSizeChange('xlarge')}
                    style={{ fontSize: '15px', padding: '0 8px' }}
                >
                    A++
                </Button>
            </div>
        </div>
    );
};

