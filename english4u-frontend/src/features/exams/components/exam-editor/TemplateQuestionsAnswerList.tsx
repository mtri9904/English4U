import React from 'react';
import { Button, Select, Tag, Tooltip } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { CreateQuestionDto, CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { AlternativeAnswersInput } from './AlternativeAnswersInput';

interface TemplateQuestionsAnswerListProps {
    group: CreateQuestionGroupDto;
    groupStartNum: number;
    isFlowchartOptionBank: boolean;
    sharedQuestionOptions: CreateQuestionDto['options'];
    onUpdateQuestionAnswer: (questionIdx: number, newAnswer: string | undefined) => void;
    onRemoveQuestionAt: (questionIdx: number, questionNumber: number) => void;
}

export const TemplateQuestionsAnswerList: React.FC<TemplateQuestionsAnswerListProps> = ({
    group,
    groupStartNum,
    isFlowchartOptionBank,
    sharedQuestionOptions,
    onUpdateQuestionAnswer,
    onRemoveQuestionAt,
}) => {
    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '8px' }}>
            <div style={{ fontWeight: 600, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                Đáp án cho các ô trống
            </div>
            {group.questions.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                    {isFlowchartOptionBank
                        ? 'Tăng số ô đáp án ở phần flowchart để tạo danh sách đáp án.'
                        : 'Thêm [Qx] trong template để tạo danh sách đáp án.'}
                </div>
            ) : (
                group.questions.map((question, questionIdx) => {
                    const questionNumber = question.questionNumber || groupStartNum + questionIdx;
                    return (
                        <div
                            key={questionIdx}
                            style={{
                                display: 'flex',
                                gap: '12px',
                                alignItems: 'flex-start',
                                marginBottom: '12px',
                                padding: '12px',
                                border: '1px solid #f1f5f9',
                                borderRadius: '8px',
                                background: '#ffffff',
                                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                            }}
                        >
                            <Tag
                                color="blue"
                                style={{
                                    margin: 0,
                                    height: '24px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    fontWeight: 600,
                                    fontSize: '12px',
                                }}
                            >
                                Q{questionNumber}
                            </Tag>

                            <div style={{ flex: 1 }}>
                                {isFlowchartOptionBank ? (
                                    <Select
                                        size="middle"
                                        placeholder="Đáp án"
                                        value={question.correctAnswer || undefined}
                                        style={{ width: '100%', maxWidth: '240px', border: '1px solid #10b981', borderRadius: '4px' }}
                                        onChange={(value) => onUpdateQuestionAnswer(questionIdx, value)}
                                        options={sharedQuestionOptions.map((_, index) => {
                                            const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                                            return { label, value: label };
                                        })}
                                        allowClear
                                    />
                                ) : (
                                    <AlternativeAnswersInput
                                        placeholder="Đáp án đúng"
                                        value={question.correctAnswer ?? ''}
                                        style={{ width: '100%', maxWidth: '360px' }}
                                        onChange={(value) => onUpdateQuestionAnswer(questionIdx, value)}
                                    />
                                )}
                            </div>

                            <Tooltip title={`Xóa câu hỏi Q${questionNumber}`}>
                                <Button
                                    type="text"
                                    danger
                                    icon={<DeleteOutlined style={{ fontSize: '15px' }} />}
                                    size="middle"
                                    onClick={() => onRemoveQuestionAt(questionIdx, questionNumber)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: '#fff1f2',
                                        border: '1px solid #fecdd3',
                                        height: '32px',
                                        width: '32px',
                                        borderRadius: '6px',
                                    }}
                                />
                            </Tooltip>
                        </div>
                    );
                })
            )}
        </div>
    );
};

