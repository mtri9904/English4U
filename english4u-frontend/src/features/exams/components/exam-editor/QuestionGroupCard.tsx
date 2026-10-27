import React, { type MutableRefObject } from 'react';
import { Button, InputNumber, Radio, Select } from 'antd';
import {
    AppstoreOutlined,
    BoldOutlined,
    DownOutlined,
    MinusCircleOutlined,
    PlusOutlined,
} from '@ant-design/icons';
import type { CreateQuestionDto, CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import {
    COMPLEX_LAYOUT_GROUP_TYPES,
    MATCHING_TYPES,
    QUESTION_TYPES,
    TABLE_LAYOUT_GROUP_TYPES,
    emptyQuestion,
} from './examEditor.helpers';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { getEffectiveMcqGroupType } from '@/shared/lib/examDisplay';
import { TruthValueDefinitionTable } from '@/shared/components/TruthValueDefinitionTable';
import { TiptapQxEditor, type TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';
import { GenericTableEditor } from './GenericTableEditor';
import { MapLabellingEditor } from './MapLabellingEditor';
import { FlowchartCompletionEditor } from './FlowchartCompletionEditor';
import { ListeningMultiSelectEditor } from './ListeningMultiSelectEditor';
import { SingleQuestionEditor } from './SingleQuestionEditor';
import { SharedMatchingOptionsEditor } from './SharedMatchingOptionsEditor';
import { MatchingQuestionsList } from './MatchingQuestionsList';
import { TemplateQuestionsAnswerList } from './TemplateQuestionsAnswerList';
import {
    MULTI_CORRECT_MATCHING_TYPES,
    applySharedOptionsToQuestions,
    buildBlankOptions,
    extractTemplateQuestionNumbers,
    getFlowchartAnswerMode,
    getSharedQuestionOptions,
    getTemplatePlaceholder,
    hasMultiSelectLayout,
    isFlowchartLikeType,
    remapCorrectAnswerTokens,
    transitionGroupType,
} from './questionGroupEditor.utils';

interface QuestionGroupCardProps {
    group: CreateQuestionGroupDto;
    groupIdx: number;
    groups: CreateQuestionGroupDto[];
    groupStartNum: number;
    skill: 'Reading' | 'Listening';
    typeOptions: Array<{ label: string; value: string }>;
    canAddQuestion: boolean;
    warnQuestionLimit: () => void;
    wouldExceedQuestionLimit: (currentCount: number, nextCount: number) => boolean;
    onUpdateGroups: (nextGroups: CreateQuestionGroupDto[]) => void;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    instructionEditorRefs: MutableRefObject<Record<number, TiptapQxEditorRef | null>>;
    templateEditorRefs: MutableRefObject<Record<number, TiptapQxEditorRef | null>>;
    shortAnswerEditorRefs: MutableRefObject<Record<string, TiptapQxEditorRef | null>>;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
    getSkillOptionsForType: (groupType?: string) => CreateQuestionDto['options'];
}

export const QuestionGroupCard: React.FC<QuestionGroupCardProps> = ({
    group,
    groupIdx,
    groups,
    groupStartNum,
    skill,
    typeOptions,
    canAddQuestion,
    warnQuestionLimit,
    wouldExceedQuestionLimit,
    onUpdateGroups,
    activeEditorRef,
    instructionEditorRefs,
    templateEditorRefs,
    shortAnswerEditorRefs,
    uploading,
    handleUploadFile,
    getSkillOptionsForType,
}) => {
    const groupType =
        getEffectiveMcqGroupType({
            groupType: group.groupType,
            contentData: group.contentData,
            questionCount: group.questions.length,
            hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
        }) || (group.groupType ?? '');

    const isComplexLayout = COMPLEX_LAYOUT_GROUP_TYPES.has(groupType);
    const isMatchingType = MATCHING_TYPES.has(groupType);
    const isMatchingHeadingsType = groupType === QUESTION_TYPES.MATCHING_HEADINGS;
    const isClassificationMatchingType = groupType === QUESTION_TYPES.MATCHING_CLASSIFICATION;
    const isSummaryType = groupType === QUESTION_TYPES.SUMMARY_COMPLETION;
    const allowsMultipleCorrectAnswers = MULTI_CORRECT_MATCHING_TYPES.has(groupType);
    const isTableType = TABLE_LAYOUT_GROUP_TYPES.has(groupType);
    const isFlowchartType = isFlowchartLikeType(groupType);
    const flowchartAnswerMode = isFlowchartType ? getFlowchartAnswerMode(groupType, group.assetsData) : 'text_input';
    const isFlowchartOptionBank = isFlowchartType && flowchartAnswerMode === 'shared_option_bank';
    const isMapLabellingType = groupType === QUESTION_TYPES.MAP_LABELLING;
    const isVisualMatchingType = groupType === QUESTION_TYPES.MATCHING_VISUALS;
    const usesLegacySharedMultiSelectLayout =
        groupType === QUESTION_TYPES.MCQ_CHOOSE_N ||
        (groupType === QUESTION_TYPES.MCQ_MULTIPLE && hasMultiSelectLayout(group.contentData));
    const showOptionsBox = isMatchingType || isSummaryType;
    const sharedQuestionOptions = getSharedQuestionOptions(group);
    const matchingHeadingOptionCount = Math.max(1, sharedQuestionOptions.length || 4);
    const matchingHeadingAnswerOptions = Array.from({ length: matchingHeadingOptionCount }, (_, index) => {
        const label = getOptionLabel(index, group.optionLabelType || 'alpha');
        return { label, value: label };
    });

    const questionsForSharedOptions = () =>
        group.questions.length > 0 ? group.questions : [{ ...emptyQuestion(), questionNumber: groupStartNum }];

    const updateSharedOptionCount = (countValue?: number | null) => {
        const nextCount = Math.max(1, Math.min(26, countValue ?? matchingHeadingOptionCount));
        const existingOptions = sharedQuestionOptions;
        const nextOptions = buildBlankOptions(nextCount, existingOptions);
        const allowedAnswers = new Set(nextOptions.map((_, index) => getOptionLabel(index, group.optionLabelType || 'alpha')));
        const updatedGroups = [...groups];
        updatedGroups[groupIdx] = {
            ...group,
            questions: applySharedOptionsToQuestions(group.questions, nextOptions).map((question) => ({
                ...question,
                correctAnswer: remapCorrectAnswerTokens(question.correctAnswer, (token) =>
                    allowedAnswers.has(token) ? token : null,
                ),
            })),
        };
        onUpdateGroups(updatedGroups);
    };

    const templateQuestionNumbers = isComplexLayout ? extractTemplateQuestionNumbers(group.contentData) : [];
    const numberedQuestions = isComplexLayout
        ? templateQuestionNumbers
        : group.questions
              .map((question) => question.questionNumber)
              .filter((questionNumber): questionNumber is number => typeof questionNumber === 'number');
    const nextQToInsert = numberedQuestions.length > 0 ? Math.max(...numberedQuestions) + 1 : groupStartNum;

    const handleContentChange = (newContent: string) => {
        const regex = /\[Q(\d+)\]/g;
        const foundNumbers = new Set<number>();
        let match: RegExpExecArray | null;

        while ((match = regex.exec(newContent)) !== null) {
            foundNumbers.add(Number.parseInt(match[1], 10));
        }

        const sortedNumbers = Array.from(foundNumbers).sort((a, b) => a - b);
        const sharedOptions = getSharedQuestionOptions(group);
        const newQuestions = sortedNumbers.map((number) => {
            const existing = group.questions.find((question) => question.questionNumber === number);
            return existing || { ...emptyQuestion(), questionNumber: number, options: sharedOptions };
        });

        if (wouldExceedQuestionLimit(group.questions.length, newQuestions.length)) {
            warnQuestionLimit();
            return;
        }

        const updatedGroups = [...groups];
        updatedGroups[groupIdx] = { ...group, contentData: newContent, questions: newQuestions };
        onUpdateGroups(updatedGroups);
    };

    const getActiveTemplateEditor = () => {
        const templateEditor = templateEditorRefs.current[groupIdx] ?? null;
        if (templateEditor) {
            activeEditorRef.current = templateEditor;
            return templateEditor;
        }

        return activeEditorRef.current;
    };

    const insertBlankAtCursor = () => {
        if (!canAddQuestion) {
            warnQuestionLimit();
            return;
        }

        getActiveTemplateEditor()?.insertQ(nextQToInsert);
    };

    const removeQuestionAt = (questionIdx: number, questionNumber: number) => {
        let nextQuestions = group.questions.filter((_, index) => index !== questionIdx);
        const updatedGroups = [...groups];

        if (isComplexLayout) {
            const removeTokenRegex = new RegExp(`\\[Q${questionNumber}\\]`, 'g');
            const shiftedContent = (group.contentData ?? '')
                .replace(removeTokenRegex, '')
                .replace(/\[Q(\d+)\]/g, (match, numText: string) => {
                    const num = Number.parseInt(numText, 10);
                    return num > questionNumber ? `[Q${num - 1}]` : match;
                });

            nextQuestions = nextQuestions.map((item) => {
                if (typeof item.questionNumber === 'number' && item.questionNumber > questionNumber) {
                    return { ...item, questionNumber: item.questionNumber - 1 };
                }
                return item;
            });

            updatedGroups[groupIdx] = {
                ...group,
                contentData: shiftedContent,
                questions: nextQuestions,
            };
        } else {
            updatedGroups[groupIdx] = {
                ...group,
                questions: nextQuestions,
            };
        }

        onUpdateGroups(updatedGroups);
    };

    return (
        <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px', gap: '8px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', background: 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)', border: '1px solid #dbeafe', borderRadius: '10px', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 8px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '999px' }}>
                        <AppstoreOutlined style={{ color: '#1d4ed8', fontSize: '0.75rem' }} />
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#1e40af', whiteSpace: 'nowrap' }}>Dạng câu:</span>
                    </div>
                    <Select
                        value={groupType}
                        size="large"
                        style={{ width: 320, maxWidth: '72vw' }}
                        popupMatchSelectWidth={false}
                        showSearch
                        optionFilterProp="label"
                        title="Chọn dạng câu hỏi cho nhóm này"
                        suffixIcon={<DownOutlined style={{ color: '#475569', fontSize: '0.75rem' }} />}
                        onChange={(value) => {
                            const transitioned = transitionGroupType({
                                value,
                                group,
                                groupStartNum,
                                skill,
                            });
                            const updatedGroups = [...groups];
                            updatedGroups[groupIdx] = {
                                ...group,
                                ...transitioned,
                            };
                            onUpdateGroups(updatedGroups);
                        }}
                        options={typeOptions}
                    />
                    {(isMatchingType || isSummaryType) && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Kiểu nhãn:</span>
                            <Radio.Group
                                size="small"
                                value={group.optionLabelType || 'alpha'}
                                onChange={(e) => {
                                    const nextType = e.target.value as 'alpha' | 'roman';
                                    const prevType = group.optionLabelType || 'alpha';
                                    if (nextType === prevType) return;

                                    const updatedGroups = [...groups];
                                    const nextQuestions = group.questions.map((q) => {
                                        const migratedAns = remapCorrectAnswerTokens(q.correctAnswer, (token) => {
                                            if (prevType === 'alpha' && nextType === 'roman') {
                                                const upperToken = token.toUpperCase();
                                                const charCode = upperToken.charCodeAt(0);
                                                if (charCode >= 65 && charCode <= 90 && upperToken.length === 1) {
                                                    return getOptionLabel(charCode - 65, 'roman');
                                                }
                                            } else if (prevType === 'roman' && nextType === 'alpha') {
                                                for (let i = 0; i < 26; i++) {
                                                    if (getOptionLabel(i, 'roman') === token.toLowerCase()) {
                                                        return getOptionLabel(i, 'alpha');
                                                    }
                                                }
                                            }

                                            return token;
                                        });

                                        return { ...q, correctAnswer: migratedAns };
                                    });

                                    updatedGroups[groupIdx] = { ...group, optionLabelType: nextType, questions: nextQuestions };
                                    onUpdateGroups(updatedGroups);
                                }}
                            >
                                <Radio.Button value="alpha">A, B, C</Radio.Button>
                                <Radio.Button value="roman">i, ii, iii</Radio.Button>
                            </Radio.Group>
                        </div>
                    )}
                    {isMatchingHeadingsType && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                            <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Số đáp án:</span>
                            <InputNumber
                                size="small"
                                min={1}
                                max={26}
                                value={matchingHeadingOptionCount}
                                onChange={updateSharedOptionCount}
                                style={{ width: 72 }}
                            />
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                    {(skill === 'Listening' || skill === 'Reading') && (
                        <Button
                            size="small"
                            icon={<BoldOutlined />}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                instructionEditorRefs.current[groupIdx]?.toggleBold();
                            }}
                        >
                            In đậm
                        </Button>
                    )}
                    {groups.length > 1 && (
                        <Button
                            type="text"
                            danger
                            icon={<MinusCircleOutlined />}
                            size="small"
                            onClick={() => onUpdateGroups(groups.filter((_, index) => index !== groupIdx))}
                        />
                    )}
                </div>
            </div>
            <div style={{ marginBottom: '8px' }} title="Nhập hướng dẫn cho nhóm câu hỏi">
                <TiptapQxEditor
                    ref={(instance) => {
                        instructionEditorRefs.current[groupIdx] = instance;
                    }}
                    value={group.instruction ?? ''}
                    placeholder="Instruction cho group này..."
                    minHeight="84px"
                    enableMarkdownBold
                    onChange={(value) => {
                        const updatedGroups = [...groups];
                        updatedGroups[groupIdx] = { ...group, instruction: value };
                        onUpdateGroups(updatedGroups);
                    }}
                />
            </div>
            <TruthValueDefinitionTable groupType={group.groupType} />

            {isMapLabellingType && (
                <MapLabellingEditor
                    group={group}
                    groups={groups}
                    groupIdx={groupIdx}
                    groupStartNum={groupStartNum}
                    onUpdate={onUpdateGroups}
                    uploading={uploading}
                    handleUploadFile={handleUploadFile}
                />
            )}

            {isFlowchartType && (
                <FlowchartCompletionEditor
                    group={group}
                    groups={groups}
                    groupIdx={groupIdx}
                    groupStartNum={groupStartNum}
                    nextQNum={nextQToInsert}
                    activeEditorRef={activeEditorRef}
                    onUpdate={onUpdateGroups}
                    uploading={uploading}
                    handleUploadFile={handleUploadFile}
                />
            )}

            {usesLegacySharedMultiSelectLayout && (
                <ListeningMultiSelectEditor
                    group={group}
                    groups={groups}
                    groupIdx={groupIdx}
                    groupStartNum={groupStartNum}
                    onUpdate={onUpdateGroups}
                />
            )}

            {isComplexLayout && !isMapLabellingType && !isFlowchartType && (
                <div style={{ marginBottom: '10px' }}>
                    {!isTableType && !isFlowchartType && (
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                            <Button
                                size="small"
                                type="primary"
                                disabled={!canAddQuestion}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    insertBlankAtCursor();
                                }}
                            >
                                Thêm ô trống [Q{nextQToInsert}]
                            </Button>
                            {skill === 'Listening' && groupType === QUESTION_TYPES.SENTENCE_COMPLETION && (
                                <Button
                                    size="small"
                                    icon={<BoldOutlined />}
                                    onMouseDown={(event) => {
                                        event.preventDefault();
                                        getActiveTemplateEditor()?.toggleBold();
                                    }}
                                >
                                    In đậm
                                </Button>
                            )}
                        </div>
                    )}
                    {isTableType ? (
                        <GenericTableEditor
                            contentData={group.contentData}
                            nextQNum={nextQToInsert}
                            onChange={handleContentChange}
                        />
                    ) : (
                        <TiptapQxEditor
                            ref={(instance) => {
                                templateEditorRefs.current[groupIdx] = instance;
                            }}
                            value={group.contentData ?? ''}
                            placeholder={getTemplatePlaceholder(groupType)}
                            enableMarkdownBold
                            onFocus={() => {
                                activeEditorRef.current = templateEditorRefs.current[groupIdx] ?? null;
                            }}
                            onChange={handleContentChange}
                        />
                    )}
                </div>
            )}

            {(isMatchingType || isSummaryType) && (
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <MatchingQuestionsList
                        group={group}
                        groupStartNum={groupStartNum}
                        isComplexLayout={isComplexLayout}
                        isClassificationMatchingType={isClassificationMatchingType}
                        isMatchingHeadingsType={isMatchingHeadingsType}
                        showOptionsBox={showOptionsBox}
                        allowsMultipleCorrectAnswers={allowsMultipleCorrectAnswers}
                        isSummaryType={isSummaryType}
                        matchingHeadingAnswerOptions={matchingHeadingAnswerOptions}
                        sharedQuestionOptions={sharedQuestionOptions}
                        matchingHeadingOptionCount={matchingHeadingOptionCount}
                        canAddQuestion={canAddQuestion}
                        warnQuestionLimit={warnQuestionLimit}
                        onUpdateQuestion={(questionIdx, partial) => {
                            const updatedGroups = [...groups];
                            const updatedQuestions = [...group.questions];
                            updatedQuestions[questionIdx] = { ...updatedQuestions[questionIdx], ...partial };
                            updatedGroups[groupIdx] = { ...group, questions: updatedQuestions };
                            onUpdateGroups(updatedGroups);
                        }}
                        onAddQuestion={(newQuestion) => {
                            const updatedGroups = [...groups];
                            updatedGroups[groupIdx] = {
                                ...group,
                                questions: [...group.questions, newQuestion],
                            };
                            onUpdateGroups(updatedGroups);
                        }}
                        onRemoveQuestionAt={removeQuestionAt}
                    />

                    {showOptionsBox && (
                        <div style={{ flex: 4, minWidth: '250px', background: '#fff', border: '2px solid #bae6fd', borderRadius: '12px', padding: '12px', alignSelf: 'stretch' }}>
                            <SharedMatchingOptionsEditor
                                group={group}
                                sharedQuestionOptions={sharedQuestionOptions}
                                isSummaryType={isSummaryType}
                                isVisualMatchingType={isVisualMatchingType}
                                isClassificationMatchingType={isClassificationMatchingType}
                                groupType={groupType}
                                handleUploadFile={handleUploadFile}
                                onUpdateOptions={(newOptions) => {
                                    const updatedGroups = [...groups];
                                    updatedGroups[groupIdx] = {
                                        ...group,
                                        questions: applySharedOptionsToQuestions(questionsForSharedOptions(), newOptions),
                                    };
                                    onUpdateGroups(updatedGroups);
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {isComplexLayout && !isMatchingType && !isSummaryType && !isFlowchartType && (
                <TemplateQuestionsAnswerList
                    group={group}
                    groupStartNum={groupStartNum}
                    isFlowchartOptionBank={isFlowchartOptionBank}
                    sharedQuestionOptions={sharedQuestionOptions}
                    onUpdateQuestionAnswer={(questionIdx, newAnswer) => {
                        const updatedGroups = [...groups];
                        updatedGroups[groupIdx].questions[questionIdx] = {
                            ...group.questions[questionIdx],
                            correctAnswer: newAnswer,
                        };
                        onUpdateGroups(updatedGroups);
                    }}
                    onRemoveQuestionAt={removeQuestionAt}
                />
            )}

            {!isComplexLayout && !isMatchingType && !isSummaryType && !isMapLabellingType && !isFlowchartType && !usesLegacySharedMultiSelectLayout && (
                <div style={{ marginTop: '10px' }}>
                    {group.questions.map((question, questionIdx) => (
                        <SingleQuestionEditor
                            key={(question as any).id || question.questionNumber || questionIdx}
                            question={question}
                            questionIdx={questionIdx}
                            group={group}
                            groupIdx={groupIdx}
                            groupStartNum={groupStartNum}
                            skill={skill}
                            onUpdateQuestion={(partial) => {
                                const updatedGroups = [...groups];
                                const updatedQuestions = [...group.questions];
                                updatedQuestions[questionIdx] = { ...question, ...partial };
                                updatedGroups[groupIdx] = { ...group, questions: updatedQuestions };
                                onUpdateGroups(updatedGroups);
                            }}
                            onDeleteQuestion={() => {
                                const updatedGroups = [...groups];
                                updatedGroups[groupIdx] = {
                                    ...group,
                                    questions: group.questions.filter((_, index) => index !== questionIdx),
                                };
                                onUpdateGroups(updatedGroups);
                            }}
                            onUpdateGroupAssets={(newAssetsData) => {
                                const updatedGroups = [...groups];
                                updatedGroups[groupIdx] = { ...group, assetsData: newAssetsData };
                                onUpdateGroups(updatedGroups);
                            }}
                            activeEditorRef={activeEditorRef}
                            shortAnswerEditorRefs={shortAnswerEditorRefs}
                            uploading={uploading}
                            handleUploadFile={handleUploadFile}
                        />
                    ))}
                    {groupType !== QUESTION_TYPES.MCQ_CHOOSE_N && (
                        <Button
                            type="default"
                            icon={<PlusOutlined />}
                            block
                            size="small"
                            disabled={!canAddQuestion}
                            style={{
                                marginTop: '8px',
                                background: '#f8fafc',
                                borderColor: '#e2e8f0',
                                color: '#64748b',
                                fontWeight: 600,
                                height: '32px',
                                borderRadius: '6px',
                            }}
                            onClick={() => {
                                if (!canAddQuestion) {
                                    warnQuestionLimit();
                                    return;
                                }

                                const updatedGroups = [...groups];
                                const newQuestion = {
                                    ...emptyQuestion(),
                                    options: getSkillOptionsForType(group.groupType),
                                };
                                updatedGroups[groupIdx] = {
                                    ...group,
                                    questions: [...group.questions, newQuestion],
                                };
                                onUpdateGroups(updatedGroups);
                            }}
                        >
                            Thêm câu hỏi mới vào nhóm này
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
};

