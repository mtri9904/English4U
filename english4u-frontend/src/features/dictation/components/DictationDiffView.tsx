import React from 'react';
import { Space, Tag, Tooltip, Typography } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import type { SentenceEvaluation } from '../types/dictation.types';

const { Text } = Typography;

export interface DictationDiffViewProps {
    isChecked: boolean;
    evaluation?: SentenceEvaluation | null;
    targetSentence?: string;
}

export const DictationDiffView: React.FC<DictationDiffViewProps> = ({
    isChecked,
    evaluation,
    targetSentence,
}) => {
    return (
        <AnimatePresence>
            {isChecked && evaluation && (
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    style={{
                        padding: '18px 22px',
                        borderRadius: 16,
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        marginBottom: 20,
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: 12,
                        }}
                    >
                        <Space size={8}>
                            <Text strong style={{ fontSize: 14, color: '#334155' }}>
                                Kết quả đối chiếu chi tiết:
                            </Text>
                            <Tag
                                color={
                                    evaluation.accuracyPercent >= 85
                                        ? 'success'
                                        : evaluation.accuracyPercent >= 60
                                        ? 'warning'
                                        : 'error'
                                }
                                style={{ fontWeight: 700, borderRadius: 6 }}
                            >
                                Độ chính xác: {evaluation.accuracyPercent}%
                            </Tag>
                        </Space>

                        <Space size={12} style={{ fontSize: 12 }}>
                            <span style={{ color: '#10b981', fontWeight: 600 }}>● Đúng</span>
                            <span style={{ color: '#ef4444', fontWeight: 600 }}>● Sai / Thiếu từ</span>
                            <span style={{ color: '#d97706', fontWeight: 600 }}>● Điểm mù âm thanh</span>
                        </Space>
                    </div>

                    {/* Diff Tokens Output */}
                    <div style={{ fontSize: 18, lineHeight: 2.2, marginBottom: 12 }}>
                        {evaluation.tokens.map((token) => {
                            if (token.status === 'correct') {
                                return (
                                    <span
                                        key={token.id}
                                        style={{
                                            color: '#10b981',
                                            fontWeight: 700,
                                            marginRight: 8,
                                        }}
                                    >
                                        {token.word}
                                    </span>
                                );
                            }

                            if (token.status === 'blindspot') {
                                return (
                                    <Tooltip
                                        key={token.id}
                                        title={`Điểm mù âm thanh: Bỏ sót mạo từ / từ nối "${token.targetWord}"`}
                                    >
                                        <span
                                            style={{
                                                background: '#fef3c7',
                                                color: '#b45309',
                                                border: '1px dashed #f59e0b',
                                                borderRadius: 6,
                                                padding: '2px 8px',
                                                fontWeight: 700,
                                                marginRight: 8,
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: 4,
                                            }}
                                        >
                                            <WarningOutlined style={{ fontSize: 12 }} />
                                            {token.targetWord}
                                        </span>
                                    </Tooltip>
                                );
                            }

                            if (token.status === 'missing') {
                                return (
                                    <Tooltip key={token.id} title={`Bỏ sót từ: "${token.targetWord}"`}>
                                        <span
                                            style={{
                                                background: '#fee2e2',
                                                color: '#b91c1c',
                                                border: '1px dashed #ef4444',
                                                borderRadius: 6,
                                                padding: '2px 8px',
                                                fontWeight: 700,
                                                marginRight: 8,
                                            }}
                                        >
                                            {token.targetWord}
                                        </span>
                                    </Tooltip>
                                );
                            }

                            // Incorrect / Typo
                            return (
                                <Tooltip
                                    key={token.id}
                                    title={token.suggestion ? `Sửa đúng: "${token.suggestion}"` : 'Từ không khớp'}
                                >
                                    <span
                                        style={{
                                            textDecoration: 'line-through',
                                            color: '#ef4444',
                                            fontWeight: 600,
                                            marginRight: 4,
                                        }}
                                    >
                                        {token.word}
                                    </span>
                                    {token.suggestion && (
                                        <span
                                            style={{
                                                color: '#10b981',
                                                fontWeight: 700,
                                                marginRight: 8,
                                            }}
                                        >
                                            ({token.suggestion})
                                        </span>
                                    )}
                                </Tooltip>
                            );
                        })}
                    </div>

                    {/* Target Sentence Display */}
                    {targetSentence && (
                        <div
                            style={{
                                borderTop: '1px solid #e2e8f0',
                                paddingTop: 10,
                                marginTop: 10,
                            }}
                        >
                            <Text type="secondary" style={{ fontSize: 13, display: 'block' }}>
                                🎯 Câu gốc chuẩn: <strong>{targetSentence}</strong>
                            </Text>
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

