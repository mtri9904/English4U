import React from 'react';
import { Input, InputNumber, Radio, Select, Tag } from 'antd';
import type { CreateQuestionGroupDto, CreateQuestionOptionDto } from '@/features/exams/types/exam.types';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import {
    MIN_ANSWER_COUNT,
    MAX_ANSWER_COUNT,
    MIN_OPTION_COUNT,
    MAX_OPTION_COUNT,
} from './flowchartCompletion.utils';

interface FlowchartOptionBankEditorProps {
    group: CreateQuestionGroupDto;
    groupStartNum: number;
    isOrderingInformation: boolean;
    sharedOptions: CreateQuestionOptionDto[];
    optionLabelType: 'alpha' | 'roman';
    answerCount: number;
    onUpdateOptionLabelType: (nextType: 'alpha' | 'roman') => void;
    onUpdateSharedOptionCount: (count?: number | null) => void;
    onUpdateSharedOptionText: (optionIndex: number, value: string) => void;
    onUpdateAnswerCount: (count?: number | null) => void;
    onUpdateQuestionAnswer: (questionIndex: number, value?: string) => void;
}

export const FlowchartOptionBankEditor: React.FC<FlowchartOptionBankEditorProps> = ({
    group,
    groupStartNum,
    isOrderingInformation,
    sharedOptions,
    optionLabelType,
    answerCount,
    onUpdateOptionLabelType,
    onUpdateSharedOptionCount,
    onUpdateSharedOptionText,
    onUpdateAnswerCount,
    onUpdateQuestionAnswer,
}) => {
    return (
        <>
            <div style={{ background: '#f8fbff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.8125rem' }}>Answer Bank</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {!isOrderingInformation && (
                            <>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Kiểu nhãn:</span>
                                <Radio.Group
                                    size="small"
                                    value={optionLabelType}
                                    onChange={(event) => onUpdateOptionLabelType(event.target.value)}
                                >
                                    <Radio.Button value="alpha">A, B, C</Radio.Button>
                                    <Radio.Button value="roman">i, ii, iii</Radio.Button>
                                </Radio.Group>
                            </>
                        )}
                        <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Số lượng options</span>
                        <InputNumber
                            value={sharedOptions.length}
                            min={MIN_OPTION_COUNT}
                            max={MAX_OPTION_COUNT}
                            size="middle"
                            style={{ width: 110 }}
                            onChange={onUpdateSharedOptionCount}
                        />
                    </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                    {sharedOptions.map((option, optionIdx) => (
                        <div
                            key={optionIdx}
                            style={{
                                background: '#fff',
                                padding: '10px',
                                borderRadius: '8px',
                                border: '1px solid #dbeafe',
                                display: 'flex',
                                gap: '8px',
                                alignItems: 'center',
                            }}
                        >
                            <Tag color="cyan" style={{ marginInlineEnd: 0 }}>
                                {getOptionLabel(optionIdx, optionLabelType)}
                            </Tag>
                            <Input
                                size="middle"
                                value={option.optionText ?? ''}
                                placeholder="Nhập nội dung lựa chọn"
                                style={{ flex: 1 }}
                                onChange={(event) => onUpdateSharedOptionText(optionIdx, event.target.value)}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Số ô đáp án</span>
                    <InputNumber
                        min={MIN_ANSWER_COUNT}
                        max={MAX_ANSWER_COUNT}
                        value={answerCount}
                        size="middle"
                        style={{ width: 110 }}
                        onChange={onUpdateAnswerCount}
                    />
                </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                    Đáp án cho từng ô
                </div>
                {group.questions.length === 0 ? (
                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                        Tăng số ô đáp án để bắt đầu map đáp án đúng.
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: '8px' }}>
                        {group.questions.map((question, questionIndex) => {
                            const selectedAnswers = new Set(
                                group.questions
                                    .map((item, index) => (index === questionIndex ? null : item.correctAnswer))
                                    .filter((item): item is string => !!item),
                            );

                            const selectableOptions = sharedOptions
                                .map((_, optionIndex) => {
                                    const label = getOptionLabel(optionIndex, optionLabelType);
                                    return { label, value: label };
                                })
                                .filter(
                                    (option) =>
                                        option.value === question.correctAnswer || !selectedAnswers.has(option.value),
                                );

                            return (
                                <div
                                    key={question.questionNumber ?? questionIndex}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
                                >
                                    <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                                        Q{question.questionNumber ?? groupStartNum + questionIndex}
                                    </Tag>
                                    <Select
                                        allowClear
                                        size="middle"
                                        placeholder="Chọn đáp án"
                                        value={question.correctAnswer || undefined}
                                        style={{ width: 180 }}
                                        onChange={(value) => onUpdateQuestionAnswer(questionIndex, value)}
                                        options={selectableOptions}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </>
    );
};

