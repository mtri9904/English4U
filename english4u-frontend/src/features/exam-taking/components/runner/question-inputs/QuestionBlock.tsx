import { Space, Tag, Typography } from 'antd';
import type { HighlightableProps } from '../../../constants/highlight.constants';
import {
    INLINE_TEMPLATE_INPUT_TYPES,
    type ObjectiveReviewAnswerMap,
    type RenderQuestionAction,
} from '../../../constants/objectiveRunner.constants';
import type {
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../../../types/session.types';
import {
    formatReviewCorrectAnswer,
    formatTemplateText,
    getQuestionInputType,
    getReviewAnswerBackground,
    getReviewAnswerBorderColor,
    getReviewAnswerState,
    hasTemplateQuestionTokens,
} from '../../../utils/objectiveRunner.utils';
import {
    compactMarkdownComponents,
    HighlightableMarkdown,
} from '../highlight/HighlightableMarkdown';
import { InlineTemplateRenderer } from './InlineTemplateRenderer';
import { QuestionInput } from './QuestionInput';

const { Text } = Typography;

export interface QuestionBlockProps extends HighlightableProps {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}

export const QuestionBlock = ({
    group,
    question,
    value,
    onChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
    highlights,
    onCreateHighlight,
    onDeleteHighlight,
}: QuestionBlockProps) => {
    const reviewAnswer = getReviewAnswerState(question.id, reviewAnswerMap);
    const correctAnswer = formatReviewCorrectAnswer(group, question, reviewAnswer);
    const rendersInlineAnswer = hasTemplateQuestionTokens(question.content)
        && INLINE_TEMPLATE_INPUT_TYPES.has(getQuestionInputType(group));
    const inlineTemplate = rendersInlineAnswer && typeof question.questionNumber === 'number'
        ? (question.content ?? '').replace(/\[Q\d+\]/g, `[Q${question.questionNumber}]`)
        : question.content ?? '';

    return (
        <div
            id={`question-${question.questionNumber ?? question.id}`}
            style={{
                border: `1px solid ${readOnly ? getReviewAnswerBorderColor(reviewAnswer) : '#e2e8f0'}`,
                borderRadius: 16,
                padding: 14,
                background: readOnly ? getReviewAnswerBackground(reviewAnswer) : '#fff',
            }}
        >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space wrap>
                        <Tag color="blue">Câu {question.questionNumber ?? 'N/A'}</Tag>
                    </Space>
                    <Space wrap>
                        {readOnly ? renderQuestionAction?.({ group, question, reviewAnswer }) : null}
                        {readOnly && reviewAnswer?.isCorrect != null ? (
                            <Tag color={reviewAnswer.isCorrect ? 'success' : 'error'}>
                                {reviewAnswer.isCorrect ? 'Đúng' : 'Sai'}
                            </Tag>
                        ) : null}
                    </Space>
                </Space>

                {question.content ? (
                    <div style={{ color: '#334155', lineHeight: 1.7 }}>
                        {rendersInlineAnswer ? (
                            <InlineTemplateRenderer
                                template={inlineTemplate}
                                group={group}
                                answerMap={{ [question.id]: value }}
                                onAnswerChange={(questionId, nextValue) => {
                                    if (questionId === question.id) {
                                        onChange(nextValue);
                                    }
                                }}
                                readOnly={readOnly}
                                reviewAnswerMap={reviewAnswerMap}
                            />
                        ) : (
                            <HighlightableMarkdown
                                sourceKey={`question:${question.id}:content`}
                                text={formatTemplateText(question.content)}
                                components={compactMarkdownComponents}
                                highlights={highlights}
                                onCreateHighlight={onCreateHighlight}
                                onDeleteHighlight={onDeleteHighlight}
                            />
                        )}
                    </div>
                ) : null}

                {!rendersInlineAnswer && (
                    <QuestionInput
                        group={group}
                        question={question}
                        value={value}
                        onChange={onChange}
                        readOnly={readOnly}
                        reviewAnswer={reviewAnswer}
                    />
                )}

                {readOnly && reviewAnswer?.isCorrect === false && correctAnswer ? (
                    <Text style={{ color: '#15803d', fontSize: 13 }}>
                        Đáp án đúng: <b>{correctAnswer}</b>
                    </Text>
                ) : null}

                {readOnly && !value ? (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        Bạn chưa trả lời câu này.
                    </Text>
                ) : null}
            </Space>
        </div>
    );
};

