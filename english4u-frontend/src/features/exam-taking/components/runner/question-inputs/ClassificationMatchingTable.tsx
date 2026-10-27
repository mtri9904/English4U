import { Radio, Space, Tag, Typography } from 'antd';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import type { HighlightableProps } from '../../../constants/highlight.constants';
import type {
    ObjectiveReviewAnswerMap,
    RenderQuestionAction,
} from '../../../constants/objectiveRunner.constants';
import type { PracticeSessionQuestionGroupDto } from '../../../types/session.types';
import {
    formatReviewCorrectAnswer,
    formatTemplateText,
    getGroupOptionLabelType,
    getReviewAnswerBackground,
    getReviewAnswerState,
    getSharedOptions,
    normalizeChoiceToken,
} from '../../../utils/objectiveRunner.utils';
import {
    compactMarkdownComponents,
    HighlightableMarkdown,
} from '../highlight/HighlightableMarkdown';

const { Text } = Typography;

export interface ClassificationMatchingTableProps extends HighlightableProps {
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}

export const ClassificationMatchingTable = ({
    group,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
    highlights,
    onCreateHighlight,
    onDeleteHighlight,
}: ClassificationMatchingTableProps) => {
    const options = getSharedOptions(group);
    const optionLabelType = getGroupOptionLabelType(group);

    if (group.questions.length === 0 || options.length === 0) {
        return null;
    }

    return (
        <div
            style={{
                border: '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 14,
                background: '#eff6ff',
                overflowX: 'auto',
            }}
        >
            <Space wrap size={8} style={{ marginBottom: 12 }}>
                {options.map((option, index) => {
                    const label = getOptionLabel(index, optionLabelType);
                    return (
                        <Tag key={`${option.id}-${label}`} color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>
                            {label}{option.optionText?.trim() ? ` = ${option.optionText.trim()}` : ''}
                        </Tag>
                    );
                })}
            </Space>

            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                <thead>
                    <tr>
                        <th
                            style={{
                                textAlign: 'left',
                                padding: '12px 14px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                color: '#0f172a',
                                width: '60%',
                            }}
                        >
                            Đối tượng
                        </th>
                        {options.map((option, index) => {
                            const label = getOptionLabel(index, optionLabelType);
                            return (
                                <th
                                    key={`${option.id}-${label}`}
                                    style={{
                                        textAlign: 'center',
                                        padding: '12px 10px',
                                        border: '1px solid #cbd5e1',
                                        background: '#f8fafc',
                                        color: '#0f172a',
                                        minWidth: 110,
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>{label}</div>
                                    {option.optionText?.trim() ? (
                                        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 500, color: '#64748b' }}>
                                            {option.optionText.trim()}
                                        </div>
                                    ) : null}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {group.questions.map((question) => {
                        const reviewAnswer = getReviewAnswerState(question.id, reviewAnswerMap);
                        const selectedToken = normalizeChoiceToken(answerMap[question.id] ?? '');
                        const correctTokens = new Set(
                            formatReviewCorrectAnswer(group, question, reviewAnswer)
                                .split('|')
                                .map((token) => normalizeChoiceToken(token))
                                .filter((token) => token.length > 0),
                        );

                        return (
                            <tr key={question.id} id={`question-${question.questionNumber ?? question.id}`}>
                                <td
                                    style={{
                                        border: '1px solid #cbd5e1',
                                        padding: '12px 14px',
                                        verticalAlign: 'top',
                                        background: readOnly ? getReviewAnswerBackground(reviewAnswer) : '#fff',
                                    }}
                                >
                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                            <Space wrap>
                                                <Tag color="blue">Câu {question.questionNumber ?? 'N/A'}</Tag>
                                                {readOnly && reviewAnswer?.isCorrect != null ? (
                                                    <Tag color={reviewAnswer.isCorrect ? 'success' : 'error'}>
                                                        {reviewAnswer.isCorrect ? 'Đúng' : 'Sai'}
                                                    </Tag>
                                                ) : null}
                                            </Space>
                                            {readOnly ? renderQuestionAction?.({ group, question, reviewAnswer, compact: true }) : null}
                                        </Space>

                                        {question.content?.trim() ? (
                                            <div style={{ color: '#334155', lineHeight: 1.7 }}>
                                                <HighlightableMarkdown
                                                    sourceKey={`question:${question.id}:content`}
                                                    text={formatTemplateText(question.content)}
                                                    components={compactMarkdownComponents}
                                                    highlights={highlights}
                                                    onCreateHighlight={onCreateHighlight}
                                                    onDeleteHighlight={onDeleteHighlight}
                                                />
                                            </div>
                                        ) : (
                                            <Text type="secondary">Chưa có nội dung item.</Text>
                                        )}

                                        {readOnly && !selectedToken ? (
                                            <Text type="secondary" style={{ fontSize: 13 }}>
                                                Bạn chưa chọn đáp án.
                                            </Text>
                                        ) : null}
                                    </Space>
                                </td>
                                {options.map((option, index) => {
                                    const optionValue = getOptionLabel(index, optionLabelType);
                                    const normalizedOptionValue = normalizeChoiceToken(optionValue);
                                    const isSelected = selectedToken === normalizedOptionValue;
                                    const isCorrectOption = correctTokens.has(normalizedOptionValue);
                                    const background = readOnly
                                        ? (isCorrectOption ? '#dcfce7' : isSelected ? '#fef2f2' : '#fff')
                                        : (isSelected ? '#dbeafe' : '#fff');
                                    const borderColor = readOnly
                                        ? (isCorrectOption ? '#86efac' : isSelected ? '#fca5a5' : '#cbd5e1')
                                        : (isSelected ? '#60a5fa' : '#cbd5e1');

                                    return (
                                        <td
                                            key={`${question.id}-${option.id}`}
                                            onClick={readOnly ? undefined : () => onAnswerChange(question.id, optionValue)}
                                            style={{
                                                border: `1px solid ${borderColor}`,
                                                padding: '12px 10px',
                                                textAlign: 'center',
                                                verticalAlign: 'middle',
                                                background,
                                                cursor: readOnly ? 'default' : 'pointer',
                                                transition: 'background 0.2s ease, border-color 0.2s ease',
                                            }}
                                        >
                                            <Space direction="vertical" size={6} align="center" style={{ width: '100%' }}>
                                                <Radio checked={isSelected} disabled={readOnly} />
                                                {readOnly && isCorrectOption ? (
                                                    <Text style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>Đáp án</Text>
                                                ) : readOnly && isSelected ? (
                                                    <Text style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>Bạn chọn</Text>
                                                ) : null}
                                            </Space>
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

