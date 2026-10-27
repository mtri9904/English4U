import type { ObjectiveReviewAnswerMap } from '../../../constants/objectiveRunner.constants';
import type {
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../../../types/session.types';
import {
    getReviewAnswerState,
    normalizeDisplayText,
    normalizeMarkdownBoldText,
} from '../../../utils/objectiveRunner.utils';
import { InlineAnswerControl } from './InlineAnswerControl';

interface RenderInlineSegmentsParams {
    text: string;
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    questionByNumber: Map<number, PracticeSessionQuestionDto>;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
}

const renderInlineTemplateSegments = ({
    text,
    group,
    answerMap,
    onAnswerChange,
    questionByNumber,
    readOnly = false,
    reviewAnswerMap,
}: RenderInlineSegmentsParams) => {
    const normalizedText = normalizeMarkdownBoldText(text);
    const segments: Array<{ text: string; bold: boolean }> = [];
    const marker = '**';
    let cursor = 0;
    let isBold = false;

    while (cursor < normalizedText.length) {
        const markerIndex = normalizedText.indexOf(marker, cursor);
        if (markerIndex === -1) {
            segments.push({ text: normalizedText.slice(cursor), bold: isBold });
            break;
        }

        if (markerIndex > cursor) {
            segments.push({ text: normalizedText.slice(cursor, markerIndex), bold: isBold });
        }

        isBold = !isBold;
        cursor = markerIndex + marker.length;
    }

    return segments.flatMap((segment, segmentIndex) => {
        if (!segment.text) {
            return [];
        }

        return segment.text.split(/(\[Q\d+\]|\n)/g).map((part, partIndex) => {
            if (!part) {
                return null;
            }

            const key = `${segmentIndex}-${partIndex}`;
            if (part === '\n') {
                return <br key={key} />;
            }
            const questionTokenMatch = part.match(/^\[Q(\d+)\]$/);
            if (questionTokenMatch) {
                const questionNumber = Number.parseInt(questionTokenMatch[1], 10);
                const question = questionByNumber.get(questionNumber);
                if (!question) {
                    return <span key={key}>{part}</span>;
                }

                return (
                    <span
                        key={key}
                        id={`question-${question.questionNumber ?? question.id}`}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            margin: '0 6px',
                            verticalAlign: 'middle',
                        }}
                    >
                        <InlineAnswerControl
                            group={group}
                            question={question}
                            value={answerMap[question.id] ?? ''}
                            onChange={(nextValue) => onAnswerChange(question.id, nextValue)}
                            readOnly={readOnly}
                            reviewAnswer={getReviewAnswerState(question.id, reviewAnswerMap)}
                        />
                    </span>
                );
            }

            if (segment.bold) {
                return <strong key={key} style={{ color: '#0f172a' }}>{part}</strong>;
            }

            return <span key={key}>{part}</span>;
        });
    });
};

export interface InlineTemplateRendererProps {
    template: string;
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
}

export const InlineTemplateRenderer = ({
    template,
    group,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
}: InlineTemplateRendererProps) => {
    const questionByNumber = new Map<number, PracticeSessionQuestionDto>(
        group.questions
            .filter((question): question is PracticeSessionQuestionDto & { questionNumber: number } => typeof question.questionNumber === 'number')
            .map((question) => [question.questionNumber, question]),
    );

    return (
        <div style={{ color: '#334155', lineHeight: 2 }}>
            {normalizeDisplayText(template)
                .split('\n')
                .map((line, lineIndex) => (
                    <div key={`inline-line-${lineIndex}`} style={{ minHeight: line.trim().length > 0 ? undefined : '1.25em' }}>
                        {renderInlineTemplateSegments({
                            text: line,
                            group,
                            answerMap,
                            onAnswerChange,
                            questionByNumber,
                            readOnly,
                            reviewAnswerMap,
                        })}
                    </div>
                ))}
        </div>
    );
};

