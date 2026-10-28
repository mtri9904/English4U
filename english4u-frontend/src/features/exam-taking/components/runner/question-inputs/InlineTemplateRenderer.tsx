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

    const isTableLine = (line: string) => {
        const trimmed = line.trim();
        return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2;
    };

    const lines = normalizeDisplayText(template).split('\n');
    const blocks: Array<{ type: 'text'; line: string } | { type: 'table'; rows: string[][] }> = [];
    let currentTableRows: string[][] = [];

    lines.forEach((line) => {
        if (isTableLine(line)) {
            const trimmed = line.trim();
            if (!/^\|[\s\-:|]+\|$/.test(trimmed)) {
                const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim().replace(/\\\|/g, '|'));
                currentTableRows.push(cells);
            }
        } else {
            if (currentTableRows.length > 0) {
                blocks.push({ type: 'table', rows: currentTableRows });
                currentTableRows = [];
            }
            blocks.push({ type: 'text', line });
        }
    });

    if (currentTableRows.length > 0) {
        blocks.push({ type: 'table', rows: currentTableRows });
    }

    return (
        <div style={{ color: '#334155', lineHeight: 2 }}>
            {blocks.map((block, bIdx) => {
                if (block.type === 'table') {
                    return (
                        <div key={`table-block-${bIdx}`} style={{ overflowX: 'auto', margin: '14px 0' }}>
                            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420, border: '1px solid #cbd5e1', background: '#fff' }}>
                                <tbody>
                                    {block.rows.map((row, rIdx) => (
                                        <tr key={`table-row-${rIdx}`} style={{ background: rIdx === 0 ? '#f8fafc' : '#fff' }}>
                                            {row.map((cellText, cIdx) => (
                                                <td
                                                    key={`cell-${rIdx}-${cIdx}`}
                                                    style={{
                                                        border: '1px solid #cbd5e1',
                                                        padding: '10px 12px',
                                                        verticalAlign: 'top',
                                                        fontWeight: rIdx === 0 ? 600 : 400,
                                                    }}
                                                >
                                                    {renderInlineTemplateSegments({
                                                        text: cellText,
                                                        group,
                                                        answerMap,
                                                        onAnswerChange,
                                                        questionByNumber,
                                                        readOnly,
                                                        reviewAnswerMap,
                                                    })}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                }

                return (
                    <div key={`inline-line-${bIdx}`} style={{ minHeight: block.line.trim().length > 0 ? undefined : '1.25em' }}>
                        {renderInlineTemplateSegments({
                            text: block.line,
                            group,
                            answerMap,
                            onAnswerChange,
                            questionByNumber,
                            readOnly,
                            reviewAnswerMap,
                        })}
                    </div>
                );
            })}
        </div>
    );
};

