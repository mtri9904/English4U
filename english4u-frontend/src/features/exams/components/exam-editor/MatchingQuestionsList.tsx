import React from 'react';
import { Button, Input, Select, Tag, Tooltip } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { CreateQuestionDto, CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { getCleanPastedInputValue } from '@/shared/utils/input';
import { emptyQuestion } from './examEditor.helpers';
import { AlternativeAnswersInput, splitCorrectAnswers, joinCorrectAnswers } from './AlternativeAnswersInput';
import { buildBlankOptions, closeActiveSelectDropdown } from './questionGroupEditor.utils';

interface MatchingQuestionsListProps {
    group: CreateQuestionGroupDto;
    groupStartNum: number;
    isComplexLayout: boolean;
    isClassificationMatchingType: boolean;
    isMatchingHeadingsType: boolean;
    showOptionsBox: boolean;
    allowsMultipleCorrectAnswers: boolean;
    isSummaryType: boolean;
    matchingHeadingAnswerOptions: Array<{ label: string; value: string }>;
    sharedQuestionOptions: CreateQuestionDto['options'];
    matchingHeadingOptionCount: number;
    canAddQuestion: boolean;
    warnQuestionLimit: () => void;
    onUpdateQuestion: (questionIdx: number, partial: Partial<CreateQuestionDto>) => void;
    onAddQuestion: (newQuestion: CreateQuestionDto) => void;
    onRemoveQuestionAt: (questionIdx: number, questionNumber: number) => void;
}

export const MatchingQuestionsList: React.FC<MatchingQuestionsListProps> = ({
    group,
    groupStartNum,
    isComplexLayout,
    isClassificationMatchingType,
    isMatchingHeadingsType,
    showOptionsBox,
    allowsMultipleCorrectAnswers,
    isSummaryType,
    matchingHeadingAnswerOptions,
    sharedQuestionOptions,
    matchingHeadingOptionCount,
    canAddQuestion,
    warnQuestionLimit,
    onUpdateQuestion,
    onAddQuestion,
    onRemoveQuestionAt,
}) => {
    return (
        <div style={{ flex: 6, minWidth: '300px' }}>
            {group.questions.map((question, questionIdx) => {
                const questionNumber = question.questionNumber || groupStartNum + questionIdx;
                return (
                    <div
                        key={questionIdx}
                        style={{
                            display: 'flex',
                            gap: '10px',
                            alignItems: 'flex-start',
                            marginBottom: '10px',
                            padding: '10px',
                            border: '1px solid #f1f5f9',
                            borderRadius: '8px',
                            background: '#ffffff',
                            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.03)',
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

                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 }}>
                            {!isComplexLayout && (
                                <Input
                                    size="middle"
                                    placeholder={isClassificationMatchingType ? 'Tên người / nhóm / đối tượng...' : 'Nội dung item...'}
                                    title="Nội dung câu hỏi"
                                    value={question.content ?? ''}
                                    style={{ flex: 1, height: '38px', borderRadius: '6px' }}
                                    onPaste={(event) => {
                                        const nextValue = getCleanPastedInputValue(event, question.content ?? '');
                                        if (nextValue === null) return;
                                        onUpdateQuestion(questionIdx, { content: nextValue });
                                    }}
                                    onChange={(event) => {
                                        onUpdateQuestion(questionIdx, { content: event.target.value });
                                    }}
                                />
                            )}

                            <div style={{ width: '100%' }}>
                                {isMatchingHeadingsType ? (
                                    <Select
                                        size="middle"
                                        placeholder="Đáp án"
                                        value={question.correctAnswer || undefined}
                                        style={{ width: '120px', border: '1px solid #10b981', borderRadius: '4px' }}
                                        onChange={(value) => onUpdateQuestion(questionIdx, { correctAnswer: value })}
                                        options={matchingHeadingAnswerOptions}
                                    />
                                ) : showOptionsBox ? (
                                    allowsMultipleCorrectAnswers ? (
                                        <Select
                                            mode="multiple"
                                            size="middle"
                                            placeholder="Đáp án (1-3)"
                                            value={splitCorrectAnswers(question.correctAnswer)}
                                            maxTagCount={3}
                                            style={{ width: '100%', maxWidth: '200px', border: '1px solid #10b981', borderRadius: '4px' }}
                                            onChange={(values: string[]) => {
                                                onUpdateQuestion(questionIdx, {
                                                    correctAnswer: joinCorrectAnswers(values.slice(0, 3)),
                                                });
                                                closeActiveSelectDropdown();
                                            }}
                                            options={sharedQuestionOptions.map((_, index) => {
                                                const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                                                return { label, value: label };
                                            })}
                                        />
                                    ) : (
                                        <Select
                                            size="middle"
                                            placeholder="Đáp án"
                                            value={question.correctAnswer || undefined}
                                            style={{ width: '100%', maxWidth: isSummaryType ? '140px' : '110px', border: '1px solid #10b981', borderRadius: '4px' }}
                                            onChange={(value) => {
                                                onUpdateQuestion(questionIdx, { correctAnswer: value });
                                                closeActiveSelectDropdown();
                                            }}
                                            options={sharedQuestionOptions.map((_, index) => {
                                                const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                                                return { label, value: label };
                                            })}
                                        />
                                    )
                                ) : (
                                    <AlternativeAnswersInput
                                        placeholder="Đáp án"
                                        value={question.correctAnswer ?? ''}
                                        style={{ width: '100%', maxWidth: isSummaryType ? '240px' : '180px' }}
                                        isInline={true}
                                        onChange={(value) => onUpdateQuestion(questionIdx, { correctAnswer: value })}
                                    />
                                )}
                            </div>
                        </div>

                        <Tooltip title={`Xóa câu hỏi Q${questionNumber}`}>
                            <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined style={{ fontSize: '14px' }} />}
                                size="small"
                                onClick={() => onRemoveQuestionAt(questionIdx, questionNumber)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: '#fff1f2',
                                    border: '1px solid #fecdd3',
                                    height: '28px',
                                    width: '28px',
                                    borderRadius: '6px',
                                    padding: 0,
                                }}
                            />
                        </Tooltip>
                    </div>
                );
            })}
            {!isComplexLayout && (
                <Button
                    type="default"
                    size="small"
                    icon={<PlusOutlined />}
                    block
                    disabled={!canAddQuestion}
                    style={{
                        background: '#f0f9ff',
                        borderColor: '#bae6fd',
                        color: '#0369a1',
                        fontWeight: 600,
                        height: '32px',
                        borderRadius: '6px',
                        marginTop: '8px',
                    }}
                    onClick={() => {
                        if (!canAddQuestion) {
                            warnQuestionLimit();
                            return;
                        }

                        const newQuestion = {
                            ...emptyQuestion(),
                            options: sharedQuestionOptions.length > 0 ? sharedQuestionOptions : buildBlankOptions(matchingHeadingOptionCount),
                        };
                        onAddQuestion(newQuestion);
                    }}
                >
                    Thêm Item mới vào danh sách
                </Button>
            )}
        </div>
    );
};

