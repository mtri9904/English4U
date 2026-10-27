import React from 'react';
import { motion } from 'framer-motion';
import { Button } from 'antd';
import {
    InboxOutlined,
    PlusOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';

interface ExamManagementHeaderProps {
    isPdfGenerationLocked: boolean;
    pdfJobPercent: number;
    onGenerateAi: () => void;
    onOpenPdfModal: () => void;
    onCreateExam: () => void;
}

export const ExamManagementHeader: React.FC<ExamManagementHeaderProps> = ({
    isPdfGenerationLocked,
    pdfJobPercent,
    onGenerateAi,
    onOpenPdfModal,
    onCreateExam,
}) => {
    return (
        <div
            style={{
                borderRadius: 18,
                padding: 22,
                background: 'radial-gradient(circle at 0% 0%, #0ea5e9 0%, #1d4ed8 52%, #0f172a 100%)',
                border: '1px solid rgba(148, 163, 184, 0.35)',
                color: '#fff',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <div>
                    <div style={{ fontSize: '1.55rem', fontWeight: 800, marginBottom: 6 }}>
                        Quản lý Đề thi
                    </div>
                    <div style={{ color: 'rgba(226, 232, 240, 0.92)' }}>
                        Theo dõi, xuất bản và quản lý kho đề theo từng kỹ năng trong CMS.
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button
                            icon={<ThunderboltOutlined />}
                            onClick={onGenerateAi}
                            style={{
                                borderRadius: 10,
                                border: '1px solid rgba(255, 255, 255, 0.45)',
                                height: 40,
                                paddingInline: 16,
                                fontWeight: 700,
                                color: '#e2e8f0',
                                background: 'rgba(99, 102, 241, 0.35)',
                            }}
                        >
                            Sinh đề bằng AI
                        </Button>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button
                            icon={<InboxOutlined />}
                            onClick={onOpenPdfModal}
                            disabled={isPdfGenerationLocked}
                            style={{
                                borderRadius: 10,
                                border: isPdfGenerationLocked
                                    ? '1px solid rgba(148, 163, 184, 0.35)'
                                    : '1px solid rgba(255, 255, 255, 0.45)',
                                height: 40,
                                paddingInline: 16,
                                fontWeight: 700,
                                color: isPdfGenerationLocked ? 'rgba(226, 232, 240, 0.6)' : '#e2e8f0',
                                background: isPdfGenerationLocked
                                    ? 'rgba(15, 23, 42, 0.18)'
                                    : 'rgba(15, 23, 42, 0.35)',
                            }}
                        >
                            {isPdfGenerationLocked ? `Đang generate ${pdfJobPercent}%` : 'Gen đề từ PDF'}
                        </Button>
                    </motion.div>

                    <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                        <Button
                            icon={<PlusOutlined />}
                            onClick={onCreateExam}
                            style={{
                                borderRadius: 10,
                                border: 'none',
                                height: 40,
                                paddingInline: 16,
                                fontWeight: 700,
                                color: '#fff',
                                background: 'linear-gradient(135deg, #22d3ee 0%, #2563eb 58%, #4338ca 100%)',
                                boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
                            }}
                        >
                            Tạo đề thi mới
                        </Button>
                    </motion.div>
                </div>
            </div>
        </div>
    );
};

