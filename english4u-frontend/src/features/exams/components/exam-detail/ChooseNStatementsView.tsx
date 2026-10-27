import React from 'react';
import { Tag } from 'antd';
import ReactMarkdown from 'react-markdown';
import type { QuestionGroupDto } from '@/features/exams/types/exam.types';
import { inferQuestionGroupOptionLabelType as inferOptionLabelType } from '@/shared/lib/examDisplay';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import {
    formatCorrectAnswerForDisplay,
    getSharedGroupOptions,
    markdownComponents,
    normalizeAnswerTokenForLabelType,
    normalizeBlockMarkdownText,
    parseMultiSelectContent,
    renderFormattedText,
} from '../../utils/examDetail.utils';

export const ChooseNStatementsView: React.FC<{ group: QuestionGroupDto }> = ({ group }) => {
    const parsedPrompt = parseMultiSelectContent(group.contentData).prompt;
    const startQuestion = group.startQuestion ?? group.questions[0]?.questionNumber ?? 1;
    const endQuestion = group.endQuestion ?? group.questions[group.questions.length - 1]?.questionNumber ?? startQuestion;
    const optionLabelType = inferOptionLabelType(group);
    const answerMap = group.questions.map((question, index) => ({
        questionNumber: question.questionNumber ?? startQuestion + index,
        answer: formatCorrectAnswerForDisplay(question.correctAnswer || ''),
    }));
    const selectedLetters = new Set(
        group.questions
            .map((question) => question.correctAnswer ?? '')
            .flatMap((answer) => answer.split('|'))
            .map((answer) => normalizeAnswerTokenForLabelType(answer, optionLabelType))
            .filter((item) => item.length > 0),
    );
    const sharedOptions = getSharedGroupOptions(group);

    return (
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                Questions {startQuestion}-{endQuestion}
            </div>
            {parsedPrompt && (
                <div style={{ color: '#1e293b', fontSize: '1rem', lineHeight: 1.6, marginBottom: '10px' }}>
                    <ReactMarkdown components={markdownComponents}>
                        {normalizeBlockMarkdownText(parsedPrompt)}
                    </ReactMarkdown>
                </div>
            )}
            {sharedOptions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {sharedOptions.map((option, index) => {
                        const label = getOptionLabel(index, optionLabelType);
                        const isSelected = selectedLetters.has(label);

                        return (
                            <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <span
                                    style={{
                                        width: '22px',
                                        height: '22px',
                                        borderRadius: '999px',
                                        background: '#e2e8f0',
                                        color: '#1e293b',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 700,
                                        fontSize: '0.8125rem',
                                        flexShrink: 0,
                                    }}
                                >
                                    {label}
                                </span>
                                <span
                                    style={{
                                        width: '16px',
                                        height: '16px',
                                        border: `1px solid ${isSelected ? '#16a34a' : '#94a3b8'}`,
                                        borderRadius: '2px',
                                        background: isSelected ? '#dcfce7' : '#fff',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '0.6875rem',
                                        color: '#16a34a',
                                        marginTop: '3px',
                                        flexShrink: 0,
                                    }}
                                >
                                    {isSelected ? '✓' : ''}
                                </span>
                                <span style={{ color: '#334155', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                                    {renderFormattedText(option.optionText || '')}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                    Answer boxes
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {answerMap.map((item) => (
                        <Tag key={item.questionNumber} color="blue" style={{ marginInlineEnd: 0 }}>
                            Q{item.questionNumber}: {item.answer || '—'}
                        </Tag>
                    ))}
                </div>
            </div>
        </div>
    );
};

