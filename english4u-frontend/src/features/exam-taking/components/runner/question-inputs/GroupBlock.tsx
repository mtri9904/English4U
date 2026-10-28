import {
    Alert,
    Card,
    Checkbox,
    Image,
    Space,
    Tag,
    Typography,
} from 'antd';
import { getEffectiveMcqGroupType } from '@/shared/lib/examDisplay';
import { areAllOptionsLabelOnly, getOptionLabel, stripOptionLeadingLabel } from '@/shared/utils/optionLabel.utils';
import { TruthValueDefinitionTable } from '@/shared/components/TruthValueDefinitionTable';
import type { HighlightableProps } from '../../../constants/highlight.constants';
import {
    MAX_MCQ_MULTIPLE_SELECTIONS,
    TABLE_TYPES,
    type ObjectiveReviewAnswerMap,
    type RenderQuestionAction,
} from '../../../constants/objectiveRunner.constants';
import type { PracticeSessionQuestionGroupDto } from '../../../types/session.types';
import {
    formatReviewCorrectAnswer,
    formatTemplateText,
    getGroupOptionLabelType,
    getQuestionInputType,
    getReviewAnswerBackground,
    getReviewAnswerBorderColor,
    getReviewAnswerState,
    getReviewCorrectAnswerLabel,
    getSharedOptions,
    hasTemplateQuestionTokens,
    isClassificationMatchingGroup,
    isMatchingVisualsGroup,
    parseFlowchartAssets,
    parseSharedPromptContent,
    parseTableContent,
} from '../../../utils/objectiveRunner.utils';
import {
    compactMarkdownComponents,
    HighlightableMarkdown,
    markdownComponents,
} from '../highlight/HighlightableMarkdown';
import { parseMixedNoteTableData } from '@/shared/lib/mixedNoteTable';
import { ClassificationMatchingTable } from './ClassificationMatchingTable';
import { InlineTemplateRenderer } from './InlineTemplateRenderer';
import { MatchingVisualsOptionBank } from './MatchingVisualsOptionBank';
import { QuestionBlock } from './QuestionBlock';
import { renderSelectableOptionContent } from './QuestionInput';
import { SummaryWordBankTable } from './SummaryWordBankTable';

const { Text } = Typography;

export interface GroupBlockProps extends HighlightableProps {
    group: PracticeSessionQuestionGroupDto;
    skillType: string;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}

export const GroupBlock = ({
    group,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
    highlights,
    onCreateHighlight,
    onDeleteHighlight,
}: GroupBlockProps) => {
    const parsedPrompt = parseSharedPromptContent(group.contentData);
    const flowchartAssets = parseFlowchartAssets(group.assetsData);
    const sharedOptions = getSharedOptions(group);
    const inputType = getQuestionInputType(group);
    const optionLabelType = getGroupOptionLabelType(group);
    const isTableLayout = TABLE_TYPES.has((group.groupType ?? '').toUpperCase());
    const mixedNoteTableContent = parseMixedNoteTableData(group.contentData);
    const isSummaryCompletion = (group.groupType ?? '').toUpperCase() === 'SUMMARY_COMPLETION';
    const isMatchingVisuals = isMatchingVisualsGroup(group);
    const isClassificationMatching = isClassificationMatchingGroup(group);
    const isMapLabelling = (group.groupType ?? '').toUpperCase() === 'MAP_LABELLING';
    const tableContent = isTableLayout ? parseTableContent(group.contentData) : { title: '', rows: [] as string[][] };
    const rendersInlineTemplateAnswers = hasTemplateQuestionTokens(group.contentData)
        && (inputType === 'text' || inputType === 'shared-select');
    const isDiagramType = (group.groupType ?? '').toUpperCase() === 'FLOWCHART_COMPLETION' || (group.groupType ?? '').toUpperCase() === 'MAP_LABELLING';
    const hasGroupVisualImage = !!flowchartAssets.imageUrl;

    const isMeaningfulPrompt = (promptText?: string | null) => {
        if (!promptText) return false;
        const words = promptText
            .toLowerCase()
            .replace(/\[q\d+\]/gi, '')
            .replace(/[^a-z\s]/gi, ' ')
            .split(/\s+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 2);
        const stopWords = new Set(['example', 'question', 'questions', 'q']);
        const meaningfulWords = words.filter((w) => !stopWords.has(w));
        return meaningfulWords.length >= 2;
    };

    const baseShouldShowPrompt = !!parsedPrompt.prompt && inputType !== 'shared-select' ? true : !!parsedPrompt.prompt;
    const shouldShowPrompt = baseShouldShowPrompt && (
        !(isDiagramType && hasGroupVisualImage) || isMeaningfulPrompt(parsedPrompt.prompt)
    );

    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
    });

    const shouldShowSharedOptionsBox = (inputType === 'shared-select' || (group.groupType ?? '').toUpperCase() === 'SUMMARY_COMPLETION')
        && sharedOptions.length > 0
        && !isClassificationMatching
        && !isMapLabelling
        && !areAllOptionsLabelOnly(sharedOptions);

    const shouldShowQuestionActionList = readOnly
        && !!renderQuestionAction
        && (rendersInlineTemplateAnswers || effectiveGroupType === 'MCQ_CHOOSE_N');

    return (
        <Card
            size="small"
            style={{
                borderRadius: 18,
                border: '1px solid #dbeafe',
                background: '#f8fbff',
            }}
        >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                {group.startQuestion != null && group.endQuestion != null ? (
                    <Space wrap>
                        <Tag>Câu {group.startQuestion}-{group.endQuestion}</Tag>
                    </Space>
                ) : null}

                {group.instruction ? (
                    <Alert
                        type="info"
                        showIcon
                        message={(
                            <HighlightableMarkdown
                                sourceKey={`group:${group.id}:instruction`}
                                text={formatTemplateText(group.instruction)}
                                components={markdownComponents}
                                highlights={highlights}
                                onCreateHighlight={onCreateHighlight}
                                onDeleteHighlight={onDeleteHighlight}
                            />
                        )}
                    />
                ) : null}
                <TruthValueDefinitionTable groupType={group.groupType} />

                {mixedNoteTableContent ? (
                    <div
                        style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 14,
                            padding: 14,
                            background: '#fff',
                        }}
                    >
                        {mixedNoteTableContent.topText ? (
                            <div style={{ marginBottom: 14 }}>
                                {rendersInlineTemplateAnswers ? (
                                    <InlineTemplateRenderer
                                        template={mixedNoteTableContent.topText}
                                        group={group}
                                        answerMap={answerMap}
                                        onAnswerChange={onAnswerChange}
                                        readOnly={readOnly}
                                        reviewAnswerMap={reviewAnswerMap}
                                    />
                                ) : (
                                    <HighlightableMarkdown
                                        sourceKey={`group:${group.id}:mixed-top`}
                                        text={formatTemplateText(mixedNoteTableContent.topText)}
                                        components={markdownComponents}
                                        highlights={highlights}
                                        onCreateHighlight={onCreateHighlight}
                                        onDeleteHighlight={onDeleteHighlight}
                                    />
                                )}
                            </div>
                        ) : null}

                        {mixedNoteTableContent.tableData.length > 0 ? (
                            <div style={{ overflowX: 'auto', marginBottom: mixedNoteTableContent.bottomText ? 14 : 0 }}>
                                <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
                                    <tbody>
                                        {mixedNoteTableContent.tableData.map((row, rowIndex) => (
                                            <tr key={`mixed-row-${rowIndex}`} style={{ background: rowIndex === 0 ? '#f8fafc' : '#fff' }}>
                                                {row.map((cell, cellIndex) => (
                                                    <td
                                                        key={`mixed-cell-${rowIndex}-${cellIndex}`}
                                                        style={{
                                                            border: '1px solid #cbd5e1',
                                                            padding: '10px 12px',
                                                            verticalAlign: 'top',
                                                            minWidth: 110,
                                                            fontWeight: rowIndex === 0 ? 600 : 400,
                                                        }}
                                                    >
                                                        {rendersInlineTemplateAnswers ? (
                                                            <InlineTemplateRenderer
                                                                template={cell}
                                                                group={group}
                                                                answerMap={answerMap}
                                                                onAnswerChange={onAnswerChange}
                                                                readOnly={readOnly}
                                                                reviewAnswerMap={reviewAnswerMap}
                                                            />
                                                        ) : (
                                                            <HighlightableMarkdown
                                                                sourceKey={`group:${group.id}:mixed-table:${rowIndex}:${cellIndex}`}
                                                                text={formatTemplateText(cell)}
                                                                components={compactMarkdownComponents}
                                                                highlights={highlights}
                                                                onCreateHighlight={onCreateHighlight}
                                                                onDeleteHighlight={onDeleteHighlight}
                                                            />
                                                        )}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}

                        {mixedNoteTableContent.bottomText ? (
                            <div style={{ marginTop: 14 }}>
                                {rendersInlineTemplateAnswers ? (
                                    <InlineTemplateRenderer
                                        template={mixedNoteTableContent.bottomText}
                                        group={group}
                                        answerMap={answerMap}
                                        onAnswerChange={onAnswerChange}
                                        readOnly={readOnly}
                                        reviewAnswerMap={reviewAnswerMap}
                                    />
                                ) : (
                                    <HighlightableMarkdown
                                        sourceKey={`group:${group.id}:mixed-bottom`}
                                        text={formatTemplateText(mixedNoteTableContent.bottomText)}
                                        components={markdownComponents}
                                        highlights={highlights}
                                        onCreateHighlight={onCreateHighlight}
                                        onDeleteHighlight={onDeleteHighlight}
                                    />
                                )}
                            </div>
                        ) : null}
                    </div>
                ) : isTableLayout && tableContent.rows.length > 0 ? (
                    <div
                        style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 14,
                            padding: 14,
                            background: '#fff',
                            overflowX: 'auto',
                        }}
                    >
                        {tableContent.title ? (
                            <div style={{ marginBottom: 12, color: '#0f172a' }}>
                                <HighlightableMarkdown
                                    sourceKey={`group:${group.id}:table-title`}
                                    text={formatTemplateText(tableContent.title)}
                                    components={compactMarkdownComponents}
                                    highlights={highlights}
                                    onCreateHighlight={onCreateHighlight}
                                    onDeleteHighlight={onDeleteHighlight}
                                />
                            </div>
                        ) : null}
                        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 420 }}>
                            <tbody>
                                {tableContent.rows.map((row, rowIndex) => (
                                    <tr key={`row-${rowIndex}`}>
                                        {row.map((cell, cellIndex) => (
                                            <td
                                                key={`cell-${rowIndex}-${cellIndex}`}
                                                style={{
                                                    border: '1px solid #cbd5e1',
                                                    padding: '10px 12px',
                                                    verticalAlign: 'top',
                                                    minWidth: 110,
                                                }}
                                            >
                                                {rendersInlineTemplateAnswers ? (
                                                    <InlineTemplateRenderer
                                                        template={cell}
                                                        group={group}
                                                        answerMap={answerMap}
                                                        onAnswerChange={onAnswerChange}
                                                        readOnly={readOnly}
                                                        reviewAnswerMap={reviewAnswerMap}
                                                    />
                                                ) : (
                                                    <HighlightableMarkdown
                                                        sourceKey={`group:${group.id}:table:${rowIndex}:${cellIndex}`}
                                                        text={formatTemplateText(cell)}
                                                        components={compactMarkdownComponents}
                                                        highlights={highlights}
                                                        onCreateHighlight={onCreateHighlight}
                                                        onDeleteHighlight={onDeleteHighlight}
                                                    />
                                                )}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : shouldShowPrompt && parsedPrompt.prompt ? (
                    <div
                        style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 14,
                            padding: 14,
                            background: '#fff',
                        }}
                    >
                        {rendersInlineTemplateAnswers ? (
                            <InlineTemplateRenderer
                                template={parsedPrompt.prompt}
                                group={group}
                                answerMap={answerMap}
                                onAnswerChange={onAnswerChange}
                                readOnly={readOnly}
                                reviewAnswerMap={reviewAnswerMap}
                            />
                        ) : (
                            <HighlightableMarkdown
                                sourceKey={`group:${group.id}:prompt`}
                                text={formatTemplateText(parsedPrompt.prompt)}
                                components={markdownComponents}
                                highlights={highlights}
                                onCreateHighlight={onCreateHighlight}
                                onDeleteHighlight={onDeleteHighlight}
                            />
                        )}
                    </div>
                ) : null}

                {flowchartAssets.imageUrl ? (
                    <div
                        style={{
                            border: '1px solid #e2e8f0',
                            borderRadius: 14,
                            padding: 12,
                            background: '#fff',
                            textAlign: 'center',
                        }}
                    >
                        <Image
                            src={flowchartAssets.imageUrl}
                            alt="Group visual"
                            style={{
                                maxHeight: 320,
                                maxWidth: '100%',
                                objectFit: 'contain',
                                borderRadius: 12,
                                display: 'block',
                                margin: '0 auto',
                                cursor: 'zoom-in',
                            }}
                            preview={{
                                mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                            }}
                        />
                    </div>
                ) : null}

                {shouldShowSharedOptionsBox ? (
                    isSummaryCompletion ? (
                        <SummaryWordBankTable options={sharedOptions} optionLabelType={optionLabelType} />
                    ) : isMatchingVisuals ? (
                        <MatchingVisualsOptionBank options={sharedOptions} optionLabelType={optionLabelType} />
                    ) : (
                        <div
                            style={{
                                border: '1px solid #bfdbfe',
                                borderRadius: 14,
                                padding: 14,
                                background: '#eff6ff',
                            }}
                        >
                            <Text strong style={{ display: 'block', marginBottom: 10 }}>Danh sách lựa chọn</Text>
                            <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                {sharedOptions.map((option, index) => (
                                    <div key={option.id} style={{ color: '#1e293b' }}>
                                        {stripOptionLeadingLabel(option.optionText, index, optionLabelType) ? (
                                            <><b>{getOptionLabel(index, optionLabelType)}.</b> {stripOptionLeadingLabel(option.optionText, index, optionLabelType)}</>
                                        ) : (
                                            <b>{getOptionLabel(index, optionLabelType)}</b>
                                        )}
                                    </div>
                                ))}
                            </Space>
                        </div>
                    )
                ) : null}

                {isClassificationMatching ? (
                    <ClassificationMatchingTable
                        group={group}
                        answerMap={answerMap}
                        onAnswerChange={onAnswerChange}
                        readOnly={readOnly}
                        reviewAnswerMap={reviewAnswerMap}
                        renderQuestionAction={renderQuestionAction}
                        highlights={highlights}
                        onCreateHighlight={onCreateHighlight}
                        onDeleteHighlight={onDeleteHighlight}
                    />
                ) : !rendersInlineTemplateAnswers && effectiveGroupType === 'MCQ_MULTIPLE' ? (() => {
                    const sharedQuestionOptions = getSharedOptions(group);

                    return (
                        <Space direction="vertical" size={12} style={{ width: '100%' }}>
                            {group.questions.map((question) => {
                                const options = question.options.length > 0 ? question.options : sharedQuestionOptions;
                                const checkedValues = (answerMap[question.id] ?? '')
                                    .split('|')
                                    .map((item) => item.trim())
                                    .filter(Boolean);

                                return (
                                    <div
                                        key={question.id}
                                        id={`question-${question.questionNumber ?? question.id}`}
                                        style={{
                                            border: `1px solid ${readOnly ? getReviewAnswerBorderColor(getReviewAnswerState(question.id, reviewAnswerMap)) : '#e2e8f0'}`,
                                            borderRadius: 16,
                                            padding: 14,
                                            background: readOnly ? getReviewAnswerBackground(getReviewAnswerState(question.id, reviewAnswerMap)) : '#fff',
                                        }}
                                    >
                                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                                <Tag color="blue" style={{ width: 'fit-content' }}>Câu {question.questionNumber ?? 'N/A'}</Tag>
                                                <Space wrap>
                                                    {readOnly ? renderQuestionAction?.({
                                                        group,
                                                        question,
                                                        reviewAnswer: getReviewAnswerState(question.id, reviewAnswerMap),
                                                    }) : null}
                                                    {readOnly && getReviewAnswerState(question.id, reviewAnswerMap)?.isCorrect != null ? (
                                                        <Tag color={getReviewAnswerState(question.id, reviewAnswerMap)?.isCorrect ? 'success' : 'error'}>
                                                            {getReviewAnswerState(question.id, reviewAnswerMap)?.isCorrect ? 'Đúng' : 'Sai'}
                                                        </Tag>
                                                    ) : null}
                                                </Space>
                                            </Space>

                                            {question.content ? (
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
                                            ) : null}

                                            <Checkbox.Group
                                                disabled={readOnly}
                                                style={{ display: 'grid', gap: 8 }}
                                                value={checkedValues}
                                                onChange={(nextValues) => {
                                                    const nextCheckedValues = nextValues as string[];
                                                    if (nextCheckedValues.length > MAX_MCQ_MULTIPLE_SELECTIONS) {
                                                        return;
                                                    }

                                                    onAnswerChange(question.id, nextCheckedValues.join('|'));
                                                }}
                                            >
                                                {options.map((option, index) => {
                                                    const optionValue = getOptionLabel(index, optionLabelType);
                                                    const isChecked = checkedValues.includes(optionValue);
                                                    const isDisabled = readOnly
                                                        || (!isChecked && checkedValues.length >= MAX_MCQ_MULTIPLE_SELECTIONS);
                                                    return (
                                                        <Checkbox key={option.id} value={optionValue} disabled={isDisabled}>
                                                            {renderSelectableOptionContent({
                                                                label: optionValue,
                                                                text: option.optionText,
                                                                imageUrl: option.imageUrl,
                                                            })}
                                                        </Checkbox>
                                                    );
                                                })}
                                            </Checkbox.Group>
                                            {readOnly && getReviewAnswerState(question.id, reviewAnswerMap)?.isCorrect === false && formatReviewCorrectAnswer(group, question, getReviewAnswerState(question.id, reviewAnswerMap)) ? (
                                                <Text style={{ color: '#15803d', fontSize: 13 }}>
                                                    {getReviewCorrectAnswerLabel()}: <b>{formatReviewCorrectAnswer(group, question, getReviewAnswerState(question.id, reviewAnswerMap))}</b>
                                                </Text>
                                            ) : null}
                                        </Space>
                                    </div>
                                );
                            })}
                        </Space>
                    );
                })() : !rendersInlineTemplateAnswers && effectiveGroupType === 'MCQ_CHOOSE_N' ? (() => {
                    const options = getSharedOptions(group);
                    const isSingleQuestionN = group.questions.length === 1;
                    const optionOrder = new Map(
                        options.map((_, index) => [getOptionLabel(index, optionLabelType), index]),
                    );

                    let checkedValues: string[] = [];
                    if (isSingleQuestionN) {
                        checkedValues = (answerMap[group.questions[0]?.id] ?? '').split('|').map((s) => s.trim()).filter(Boolean);
                    } else {
                        checkedValues = group.questions
                            .map((q) => answerMap[q.id])
                            .filter(Boolean)
                            .sort((left, right) => (optionOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (optionOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
                    }

                    const handleChange = (nextChecked: string[]) => {
                        const orderedChecked = [...nextChecked].sort((left, right) => (
                            (optionOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (optionOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
                        ));
                        if (isSingleQuestionN) {
                            if (group.questions[0]) {
                                onAnswerChange(group.questions[0].id, orderedChecked.join('|'));
                            }
                        } else {
                            if (orderedChecked.length > group.questions.length) return;

                            group.questions.forEach((q, idx) => {
                                onAnswerChange(q.id, orderedChecked[idx] ?? '');
                            });
                        }
                    };

                    return (
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: '#fff' }}>
                            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                                <Checkbox.Group
                                    disabled={readOnly}
                                    style={{ display: 'grid', gap: 8 }}
                                    value={checkedValues}
                                    onChange={(nextValues) => handleChange(nextValues as string[])}
                                >
                                    {options.map((option, idx) => {
                                        const optionValue = getOptionLabel(idx, optionLabelType);
                                        return (
                                            <Checkbox key={option.id} value={optionValue}>
                                                {renderSelectableOptionContent({
                                                    label: optionValue,
                                                    text: option.optionText,
                                                    imageUrl: option.imageUrl,
                                                })}
                                            </Checkbox>
                                        );
                                    })}
                                </Checkbox.Group>
                            </Space>
                        </div>
                    );
                })() : !rendersInlineTemplateAnswers && (
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        {group.questions.map((question) => (
                            <QuestionBlock
                                key={question.id}
                                group={group}
                                question={question}
                                value={answerMap[question.id] ?? ''}
                                onChange={(nextValue) => onAnswerChange(question.id, nextValue)}
                                readOnly={readOnly}
                                reviewAnswerMap={reviewAnswerMap}
                                renderQuestionAction={renderQuestionAction}
                                highlights={highlights}
                                onCreateHighlight={onCreateHighlight}
                                onDeleteHighlight={onDeleteHighlight}
                            />
                        ))}
                    </Space>
                )}

                {shouldShowQuestionActionList ? (
                    <div
                        style={{
                            border: '1px solid #dbeafe',
                            borderRadius: 14,
                            padding: 14,
                            background: '#ffffff',
                        }}
                    >
                        <Space direction="vertical" size={10} style={{ width: '100%' }}>
                            <Text strong>AI Copilot theo từng câu</Text>
                            {group.questions.map((question) => {
                                const reviewAnswer = getReviewAnswerState(question.id, reviewAnswerMap);
                                const submittedAnswer = answerMap[question.id] ?? '';
                                const correctAnswer = formatReviewCorrectAnswer(group, question, reviewAnswer);

                                return (
                                    <div
                                        key={`copilot-${question.id}`}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 12,
                                            padding: 12,
                                            background: '#f8fafc',
                                        }}
                                    >
                                        <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    gap: 12,
                                                    flexWrap: 'wrap',
                                                }}
                                            >
                                                <Space wrap>
                                                    <Tag color="blue">Câu {question.questionNumber ?? 'N/A'}</Tag>
                                                    {reviewAnswer?.isCorrect != null ? (
                                                        <Tag color={reviewAnswer.isCorrect ? 'success' : 'error'}>
                                                            {reviewAnswer.isCorrect ? 'Đúng' : 'Sai'}
                                                        </Tag>
                                                    ) : null}
                                                </Space>
                                                {renderQuestionAction?.({
                                                    group,
                                                    question,
                                                    reviewAnswer,
                                                    compact: true,
                                                })}
                                            </div>
                                            {reviewAnswer?.isCorrect === false && correctAnswer ? (
                                                <Space direction="vertical" size={2}>
                                                    {submittedAnswer ? (
                                                        <Text style={{ color: '#b91c1c', fontSize: 13 }}>
                                                            Bạn đã nhập: <b>{submittedAnswer}</b>
                                                        </Text>
                                                    ) : null}
                                                    <Text style={{ color: '#15803d', fontSize: 13 }}>
                                                        {getReviewCorrectAnswerLabel()}: <b>{correctAnswer}</b>
                                                    </Text>
                                                </Space>
                                            ) : null}
                                            {!submittedAnswer ? (
                                                <Text type="secondary" style={{ fontSize: 13 }}>
                                                    Bạn chưa trả lời câu này.
                                                </Text>
                                            ) : null}
                                        </Space>
                                    </div>
                                );
                            })}
                        </Space>
                    </div>
                ) : null}
            </Space>
        </Card>
    );
};

