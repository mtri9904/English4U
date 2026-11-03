import React from 'react';
import { Button, Tooltip, Divider } from 'antd';
import { CopyOutlined, ExportOutlined } from '@ant-design/icons';

interface NewsDetailFooterProps {
    sourceLink?: string;
    onClose: () => void;
    onCopySummary: () => void;
}

export const NewsDetailFooter: React.FC<NewsDetailFooterProps> = ({
    sourceLink,
    onClose,
    onCopySummary,
}) => {
    return (
        <>
            {/* Learning Tips Callout */}
            <div
                style={{
                    margin: '28px 0 16px',
                    padding: '16px 20px',
                    background: '#f8fafc',
                    borderRadius: '12px',
                    border: '1px dashed #cbd5e1',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                }}
            >
                <div style={{ fontSize: '22px' }}>💡</div>
                <div style={{ fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
                    <strong style={{ color: '#0f172a' }}>Phương pháp học từ vựng hiệu quả:</strong> Bạn có thể{' '}
                    <strong>bấm vào bất kỳ từ tiếng Anh nào</strong> trong bài để tra từ điển học thuật và lưu vào bộ thẻ Flashcard. Bấm nút{' '}
                    <strong>"🌐 Dịch đoạn"</strong> để xem bản dịch đối chiếu song ngữ!
                </div>
            </div>

            <Divider style={{ margin: '16px 0' }} />

            {/* Footer Actions */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                }}
            >
                <Tooltip title="Sao chép tóm tắt bài báo">
                    <Button icon={<CopyOutlined />} onClick={onCopySummary} style={{ borderRadius: '8px' }}>
                        Sao chép
                    </Button>
                </Tooltip>

                <div style={{ display: 'flex', gap: '10px' }}>
                    <Button onClick={onClose} style={{ borderRadius: '8px' }}>
                        Đóng
                    </Button>
                    <Button
                        type="primary"
                        icon={<ExportOutlined />}
                        href={sourceLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            background: '#2563eb',
                            borderColor: '#2563eb',
                            borderRadius: '8px',
                            fontWeight: 600,
                        }}
                    >
                        Mở bài gốc trên The Guardian
                    </Button>
                </div>
            </div>
        </>
    );
};

