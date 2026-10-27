import React from 'react';
import { Tag } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import type { QuestionDto } from '@/features/exams/types/exam.types';
import { getQuestionTypeLabel } from '@/shared/lib/examDisplay';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { typeColorMap } from '../../constants/examDetail.constants';
import {
    formatCorrectAnswerForDisplay,
    normalizeAnswerTokenForLabelType,
    renderFormattedText,
    renderStandardOptionContent,
} from '../../utils/examDetail.utils';

interface QuestionItemProps {
    q: QuestionDto;
    qIdx: number;
    groupType: string | null;
    skillType?: string;
    optionLabelType?: 'alpha' | 'roman';
}

export const QuestionItem: React.FC<QuestionItemProps> = ({
    q,
    qIdx,
    groupType,
    skillType,
    optionLabelType = 'alpha',
}) => {
    const gType = groupType ?? '';
    const color = typeColorMap[gType] || '#64748b';
    const isMatchingType = new Set([
        'MATCHING_HEADINGS',
        'MATCHING_INFO',
        'MATCHING_FEATURES',
        'MATCHING_CLASSIFICATION',
        'MATCHING_VISUALS',
        'MATCHING_TABLE',
        'MAP_LABELLING',
        'FLOWCHART_COMPLETION',
        'ORDERING_INFORMATION',
    ]).has(gType);
    const isSummaryCompletion = gType === 'SUMMARY_COMPLETION';
    const correctAnswerTokens = new Set(
        (q.correctAnswer ?? '')
            .split('|')
            .map((item) => normalizeAnswerTokenForLabelType(item, optionLabelType))
            .filter((item) => item.length > 0),
    );

    return (
        <div style={{ padding: '16px', background: '#fff', borderRadius: '10px', marginBottom: '8px', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <QuestionCircleOutlined style={{ color: '#0ea5e9', fontSize: '1.125rem' }} />
                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '1rem' }}>Câu {q.questionNumber ?? qIdx + 1}</span>
                {gType && (
                    <Tag style={{ background: `${color}15`, color, border: 'none', borderRadius: '6px', fontSize: '0.875rem' }}>
                        {getQuestionTypeLabel(gType, skillType)}
                    </Tag>
                )}
            </div>
            {q.content?.trim() ? (
                <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
                    {renderFormattedText(q.content || '')}
                </p>
            ) : null}
            {q.correctAnswer && (
                <div style={{ marginTop: '8px', padding: '6px 12px', background: '#dcfce7', borderRadius: '6px', color: '#16a34a', fontWeight: 600, fontSize: '0.875rem' }}>
                    Đáp án: {renderFormattedText(formatCorrectAnswerForDisplay(q.correctAnswer))}
                </div>
            )}
            {q.options.length > 0 && !isMatchingType && !isSummaryCompletion && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {q.options.map((opt, oIdx) => {
                        const optionLabel = getOptionLabel(oIdx, optionLabelType);
                        const isCorrect = opt.isCorrect || correctAnswerTokens.has(optionLabel);

                        return (
                            <div
                                key={oIdx}
                                style={{
                                    fontSize: '0.9375rem',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    background: isCorrect ? '#dcfce7' : 'transparent',
                                    color: isCorrect ? '#16a34a' : '#64748b',
                                    fontWeight: isCorrect ? 600 : 400,
                                    border: isCorrect ? '1px solid #bbf7d0' : '1px solid transparent',
                                }}
                            >
                                {renderStandardOptionContent(opt, optionLabel)}
                                {isCorrect && ' ✓'}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

