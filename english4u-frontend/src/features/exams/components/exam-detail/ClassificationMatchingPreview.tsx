import React from 'react';
import { Tag } from 'antd';
import type { QuestionGroupDto } from '@/features/exams/types/exam.types';
import { inferQuestionGroupOptionLabelType as inferOptionLabelType } from '@/shared/lib/examDisplay';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import {
    getSharedGroupOptions,
    normalizeAnswerTokenForLabelType,
    renderFormattedText,
} from '../../utils/examDetail.utils';

export const ClassificationMatchingPreview: React.FC<{ group: QuestionGroupDto }> = ({ group }) => {
    const options = getSharedGroupOptions(group);
    const optionLabelType = inferOptionLabelType(group);

    if (group.questions.length === 0 || options.length === 0) {
        return null;
    }

    return (
        <div style={{ background: '#fff', padding: '12px', border: '2px solid #0ea5e9', borderRadius: '12px', marginBottom: '15px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {options.map((option, index) => {
                    const label = getOptionLabel(index, optionLabelType);
                    return (
                        <Tag key={`${option.id}-${label}`} color="blue" style={{ marginInlineEnd: 0 }}>
                            {label}{option.optionText?.trim() ? ` = ${option.optionText.trim()}` : ''}
                        </Tag>
                    );
                })}
            </div>

            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', background: '#fff' }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', border: '1px solid #cbd5e1', padding: '12px', background: '#f8fafc', width: '60%' }}>
                            Đối tượng
                        </th>
                        {options.map((option, index) => {
                            const label = getOptionLabel(index, optionLabelType);
                            return (
                                <th
                                    key={`${option.id}-${label}`}
                                    style={{
                                        textAlign: 'center',
                                        border: '1px solid #cbd5e1',
                                        padding: '12px',
                                        background: '#f8fafc',
                                        minWidth: 110,
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>{label}</div>
                                    {option.optionText?.trim() ? (
                                        <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#64748b' }}>
                                            {renderFormattedText(option.optionText)}
                                        </div>
                                    ) : null}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {group.questions.map((question, index) => {
                        const correctTokens = new Set(
                            (question.correctAnswer ?? '')
                                .split('|')
                                .map((item) => normalizeAnswerTokenForLabelType(item, optionLabelType))
                                .filter((item) => item.length > 0),
                        );

                        return (
                            <tr key={question.id}>
                                <td style={{ border: '1px solid #cbd5e1', padding: '12px', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: question.content?.trim() ? '8px' : 0 }}>
                                        <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                                            Câu {question.questionNumber ?? index + 1}
                                        </Tag>
                                    </div>
                                    <div style={{ color: '#334155', lineHeight: 1.6 }}>
                                        {question.content?.trim() ? (
                                            renderFormattedText(question.content)
                                        ) : (
                                            <span style={{ color: '#94a3b8' }}>Chưa có nội dung item.</span>
                                        )}
                                    </div>
                                </td>
                                {options.map((option, optionIndex) => {
                                    const label = getOptionLabel(optionIndex, optionLabelType);
                                    const isCorrect = correctTokens.has(label);
                                    return (
                                        <td
                                            key={`${question.id}-${option.id}`}
                                            style={{
                                                border: '1px solid #cbd5e1',
                                                padding: '12px',
                                                textAlign: 'center',
                                                background: isCorrect ? '#dcfce7' : '#fff',
                                                color: isCorrect ? '#15803d' : '#94a3b8',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {isCorrect ? '✓' : ''}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

