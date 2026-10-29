import React from 'react';
import { Card, Space, Typography } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import type { DictationItem, SentenceEvaluation } from '../types/dictation.types';

const { Paragraph } = Typography;

export interface DictationParagraphAssemblyProps {
    items: DictationItem[];
    currentIndex: number;
    evaluations: Array<SentenceEvaluation | null>;
    inputs: string[];
}

export const DictationParagraphAssembly: React.FC<DictationParagraphAssemblyProps> = ({
    items,
    currentIndex,
    evaluations,
    inputs,
}) => {
    return (
        <Card
            title={
                <Space>
                    <GlobalOutlined style={{ color: '#4f46e5' }} />
                    <span>Đoạn văn hoàn chỉnh được ghép lại</span>
                </Space>
            }
            style={{
                borderRadius: 20,
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
            }}
        >
            <Paragraph style={{ fontSize: 15, lineHeight: 1.8, color: '#334155', margin: 0 }}>
                {items.map((item, idx) => {
                    const isDone = evaluations[idx] != null;
                    const isCurrent = idx === currentIndex;
                    return (
                        <span
                            key={item.id}
                            style={{
                                background: isCurrent
                                    ? '#ede9fe'
                                    : isDone
                                    ? 'rgba(16, 185, 129, 0.08)'
                                    : 'transparent',
                                padding: '2px 4px',
                                borderRadius: 4,
                                fontWeight: isCurrent ? 700 : 400,
                                color: isCurrent ? '#4f46e5' : '#334155',
                                marginRight: 4,
                            }}
                        >
                            {isDone ? inputs[idx] || item.sentence : isCurrent ? '(...đang nghe...)' : '......'}
                        </span>
                    );
                })}
            </Paragraph>
        </Card>
    );
};
