import React from 'react';
import { Button, Image, Spin, Tag, Input, Form } from 'antd';
import {
    ReloadOutlined,
    PictureOutlined,
    LoadingOutlined,
} from '@ant-design/icons';

interface FlashcardImageCyclerProps {
    imageUrl?: string;
    candidateImages: string[];
    currentImageIndex: number;
    isAiLoading: boolean;
    isChangingImage: boolean;
    onCycleNextImage: () => void;
    onChangeImageUrl: (url: string) => void;
}

export const FlashcardImageCycler: React.FC<FlashcardImageCyclerProps> = ({
    imageUrl,
    candidateImages,
    currentImageIndex,
    isAiLoading,
    isChangingImage,
    onCycleNextImage,
    onChangeImageUrl,
}) => {
    return (
        <div style={{ marginBottom: 12 }}>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 6,
                }}
            >
                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.88rem' }}>
                    Hình ảnh minh họa trực quan
                </span>
                {candidateImages.length > 1 && (
                    <Tag color="blue" style={{ borderRadius: 6, margin: 0, fontSize: '0.75rem' }}>
                        Ảnh {currentImageIndex + 1}/{candidateImages.length}
                    </Tag>
                )}
            </div>

            <div
                style={{
                    height: 165,
                    borderRadius: 14,
                    background: '#f8fafc',
                    border: imageUrl ? '1px solid #e2e8f0' : '2px dashed #cbd5e1',
                    overflow: 'hidden',
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: imageUrl ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
                }}
            >
                {isAiLoading ? (
                    <div style={{ textAlign: 'center', color: '#2563eb', padding: '16px' }}>
                        <Spin indicator={<LoadingOutlined style={{ fontSize: 28, color: '#2563eb' }} spin />} />
                        <div style={{ fontSize: '0.82rem', marginTop: 8, fontWeight: 600 }}>
                            AI đang tra cứu hình ảnh mới...
                        </div>
                    </div>
                ) : imageUrl ? (
                    <>
                        <Image
                            key={`${imageUrl}-${currentImageIndex}`}
                            src={imageUrl}
                            alt="Hình minh họa"
                            preview={false}
                            width="100%"
                            height="100%"
                            wrapperStyle={{ width: '100%', height: '100%' }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            placeholder={
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '100%',
                                        height: '100%',
                                        background: '#f8fafc',
                                    }}
                                >
                                    <Spin indicator={<LoadingOutlined style={{ fontSize: 24, color: '#2563eb' }} spin />} />
                                </div>
                            }
                            fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100%25' height='100%25' viewBox='0 0 100 100' fill='%23f1f5f9'><rect width='100' height='100' fill='%23f1f5f9'/><text x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-family='sans-serif' font-size='10' fill='%2394a3b8'>Ảnh lỗi - Bấm đổi hình</text></svg>"
                        />
                        <Button
                            size="small"
                            type="primary"
                            icon={<ReloadOutlined />}
                            loading={isChangingImage}
                            onClick={onCycleNextImage}
                            style={{
                                position: 'absolute',
                                bottom: 8,
                                right: 8,
                                background: 'rgba(15, 23, 42, 0.85)',
                                backdropFilter: 'blur(4px)',
                                border: 'none',
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: '0.78rem',
                                zIndex: 2,
                            }}
                        >
                            Đổi hình khác
                        </Button>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', color: '#94a3b8', padding: '12px' }}>
                        <PictureOutlined style={{ fontSize: 32, marginBottom: 4 }} />
                        <div style={{ fontSize: '0.8rem' }}>Chưa có hình ảnh minh họa</div>
                        <div style={{ fontSize: '0.72rem', color: '#cbd5e1' }}>
                            Bấm "AI Tự điền" hoặc dán URL ảnh bên dưới
                        </div>
                    </div>
                )}
            </div>

            <Form.Item name="imageUrl" style={{ marginTop: 8, marginBottom: 12 }}>
                <Input
                    size="small"
                    placeholder="Link URL ảnh (https://...)"
                    style={{ borderRadius: 8, fontSize: '0.8rem', color: '#64748b' }}
                    onChange={(e) => onChangeImageUrl(e.target.value)}
                />
            </Form.Item>
        </div>
    );
};

