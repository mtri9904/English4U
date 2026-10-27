import { useMemo, type MutableRefObject } from 'react';
import type { TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';
import type { CreateQuestionGroupDto } from '@/features/exams/types/exam.types';
import { QUESTION_TYPES } from '@/features/exams/components/questionTypes';
import { emptyOption, emptyQuestion } from './examEditor.helpers';
import {
    DEFAULT_ANSWER_COUNT,
    DEFAULT_ANSWER_MODE,
    DEFAULT_TEXT_INPUT_LAYOUT,
    adjustAnswerForOptionCount,
    cloneOptions,
    convertAnswerLabel,
    createDefaultOptions,
    extractTemplateQuestionNumbers,
    inferTextInputLayout,
    normalizeAnswerCount,
    normalizeOptionCount,
    parseFlowchartAssetsData,
    serializeFlowchartAssetsData,
    type FlowchartAssetData,
    type FlowchartTextInputLayout,
} from './flowchartCompletion.utils';
import { FlowchartImageUploader } from './FlowchartImageUploader';
import { FlowchartTextInputEditor } from './FlowchartTextInputEditor';
import { FlowchartOptionBankEditor } from './FlowchartOptionBankEditor';

interface FlowchartCompletionEditorProps {
    group: CreateQuestionGroupDto;
    groups: CreateQuestionGroupDto[];
    groupIdx: number;
    groupStartNum: number;
    nextQNum: number;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    onUpdate: (groups: CreateQuestionGroupDto[]) => void;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

export const FlowchartCompletionEditor = ({
    group,
    groups,
    groupIdx,
    groupStartNum,
    nextQNum,
    activeEditorRef,
    onUpdate,
    uploading = false,
    handleUploadFile,
}: FlowchartCompletionEditorProps) => {
    const isOrderingInformation = group.groupType === QUESTION_TYPES.ORDERING_INFORMATION;
    const assets = useMemo(
        () => parseFlowchartAssetsData(group.assetsData, group.groupType),
        [group.assetsData, group.groupType],
    );
    const answerMode = isOrderingInformation
        ? 'shared_option_bank'
        : assets.answerMode ?? DEFAULT_ANSWER_MODE;
    const textInputLayout = answerMode === 'text_input'
        ? assets.textInputLayout ?? inferTextInputLayout(group)
        : DEFAULT_TEXT_INPUT_LAYOUT;
    const optionLabelType = group.optionLabelType ?? 'alpha';
    const sharedOptions = useMemo(() => {
        const current = group.questions[0]?.options ?? [];
        return current.length > 0 ? cloneOptions(current) : createDefaultOptions();
    }, [group.questions]);
    const answerCount = group.questions.length > 0 ? group.questions.length : DEFAULT_ANSWER_COUNT;

    const updateGroup = (partial: Partial<CreateQuestionGroupDto>) => {
        const updatedGroups = [...groups];
        updatedGroups[groupIdx] = {
            ...group,
            ...partial,
        };
        onUpdate(updatedGroups);
    };

    const updateAssets = (partial: Partial<FlowchartAssetData>) => {
        updateGroup({
            assetsData: serializeFlowchartAssetsData({
                ...assets,
                answerMode,
                textInputLayout,
                ...partial,
            }),
        });
    };

    const buildTemplateQuestions = (nextContent: string) => {
        const nextQuestionNumbers = extractTemplateQuestionNumbers(nextContent);
        return nextQuestionNumbers.map((questionNumber) => {
            const existing = group.questions.find((question) => question.questionNumber === questionNumber);
            return existing
                ? {
                    ...existing,
                    questionNumber,
                    options: answerMode === 'shared_option_bank' ? cloneOptions(sharedOptions) : [],
                    content: '',
                }
                : {
                    ...emptyQuestion(),
                    questionNumber,
                    options: answerMode === 'shared_option_bank' ? cloneOptions(sharedOptions) : [],
                    content: '',
                };
        });
    };

    const buildCountOnlyQuestions = (count: number) => (
        Array.from({ length: normalizeAnswerCount(count) }, (_, index) => {
            const existing = group.questions[index];
            return existing
                ? {
                    ...existing,
                    questionNumber: existing.questionNumber ?? groupStartNum + index,
                    options: [],
                    content: '',
                }
                : {
                    ...emptyQuestion(),
                    questionNumber: groupStartNum + index,
                    options: [],
                    content: '',
                };
        })
    );

    const syncQuestionsFromTemplate = (nextContent: string) => {
        const nextQuestions = buildTemplateQuestions(nextContent);

        updateGroup({
            contentData: nextContent,
            questions: nextQuestions,
            optionLabelType: undefined,
        });
    };

    const updateTextInputLayout = (nextLayout: FlowchartTextInputLayout) => {
        const nextQuestions = nextLayout === 'template'
            ? buildTemplateQuestions(group.contentData ?? '')
            : buildCountOnlyQuestions(answerCount);

        updateGroup({
            assetsData: serializeFlowchartAssetsData({
                ...assets,
                answerMode: 'text_input',
                textInputLayout: nextLayout,
            }),
            contentData: nextLayout === 'question_count' ? '' : group.contentData,
            optionLabelType: undefined,
            questions: nextQuestions,
        });
    };

    const updateAnswerMode = (nextMode: FlowchartAssetData['answerMode']) => {
        const effectiveMode = nextMode ?? DEFAULT_ANSWER_MODE;
        const nextSharedOptions = sharedOptions.length > 0 ? sharedOptions : createDefaultOptions();
        const desiredCount = group.questions.length > 0 ? group.questions.length : DEFAULT_ANSWER_COUNT;
        const nextTextInputLayout = assets.textInputLayout ?? inferTextInputLayout(group);
        const nextQuestions = effectiveMode === 'text_input'
            ? nextTextInputLayout === 'template'
                ? buildTemplateQuestions(group.contentData ?? '')
                : buildCountOnlyQuestions(desiredCount)
            : Array.from({ length: desiredCount }, (_, index) => {
                const existing = group.questions[index];
                return existing
                    ? {
                        ...existing,
                        questionNumber: existing.questionNumber ?? groupStartNum + index,
                        options: cloneOptions(nextSharedOptions),
                        content: '',
                    }
                    : {
                        ...emptyQuestion(),
                        questionNumber: groupStartNum + index,
                        options: cloneOptions(nextSharedOptions),
                        content: '',
                    };
            });

        updateGroup({
            assetsData: serializeFlowchartAssetsData({
                ...assets,
                answerMode: effectiveMode,
                textInputLayout: nextTextInputLayout,
            }),
            optionLabelType: effectiveMode === 'shared_option_bank' ? optionLabelType : undefined,
            contentData: effectiveMode === 'text_input' && nextTextInputLayout === 'question_count' ? '' : group.contentData,
            questions: nextQuestions,
        });
    };

    const updateAnswerCount = (count?: number | null) => {
        const nextCount = normalizeAnswerCount(count);
        const nextQuestions = Array.from({ length: nextCount }, (_, index) => {
            const existing = group.questions[index];
            return existing
                ? {
                    ...existing,
                    options: answerMode === 'shared_option_bank' ? cloneOptions(sharedOptions) : [],
                    questionNumber: existing.questionNumber ?? groupStartNum + index,
                    content: '',
                }
                : {
                    ...emptyQuestion(),
                    options: answerMode === 'shared_option_bank' ? cloneOptions(sharedOptions) : [],
                    questionNumber: groupStartNum + index,
                    content: '',
                };
        });

        updateGroup({
            questions: nextQuestions,
        });
    };

    const updateSharedOptionCount = (count?: number | null) => {
        const nextCount = normalizeOptionCount(count);
        const resizedOptions = Array.from({ length: nextCount }, (_, index) => {
            const existing = sharedOptions[index];
            return existing
                ? { ...existing, orderIndex: index }
                : emptyOption(index);
        });

        updateGroup({
            questions: group.questions.map((question, questionIndex) => ({
                ...question,
                questionNumber: question.questionNumber ?? groupStartNum + questionIndex,
                options: cloneOptions(resizedOptions),
                correctAnswer: adjustAnswerForOptionCount(
                    question.correctAnswer,
                    optionLabelType,
                    resizedOptions.length,
                ),
                content: '',
            })),
        });
    };

    const updateSharedOptionText = (optionIndex: number, value: string) => {
        const nextOptions = cloneOptions(sharedOptions);
        nextOptions[optionIndex] = {
            ...nextOptions[optionIndex],
            optionText: value,
            orderIndex: optionIndex,
        };

        updateGroup({
            questions: group.questions.map((question, questionIndex) => ({
                ...question,
                questionNumber: question.questionNumber ?? groupStartNum + questionIndex,
                options: cloneOptions(nextOptions),
                content: '',
            })),
        });
    };

    const updateOptionLabelType = (nextType: 'alpha' | 'roman') => {
        const nextOptions = cloneOptions(sharedOptions);
        updateGroup({
            optionLabelType: nextType,
            questions: group.questions.map((question, questionIndex) => ({
                ...question,
                questionNumber: question.questionNumber ?? groupStartNum + questionIndex,
                options: cloneOptions(nextOptions),
                correctAnswer: convertAnswerLabel(
                    question.correctAnswer,
                    optionLabelType,
                    nextType,
                    nextOptions.length,
                ),
                content: '',
            })),
        });
    };

    const updateQuestionAnswer = (questionIndex: number, value?: string) => {
        updateGroup({
            questions: group.questions.map((question, index) => (
                index === questionIndex
                    ? { ...question, correctAnswer: value || undefined }
                    : question
            )),
        });
    };

    return (
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
            <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '0.875rem', marginBottom: '10px' }}>
                {isOrderingInformation ? 'Ordering Information' : 'Flowchart Completion'}
            </div>

            <FlowchartImageUploader
                isOrderingInformation={isOrderingInformation}
                assets={assets}
                answerMode={answerMode}
                textInputLayout={textInputLayout}
                uploading={uploading}
                handleUploadFile={handleUploadFile}
                onUpdateAssets={updateAssets}
                onUpdateAnswerMode={updateAnswerMode}
                onUpdateTextInputLayout={updateTextInputLayout}
            />

            {answerMode === 'text_input' && !isOrderingInformation ? (
                <FlowchartTextInputEditor
                    group={group}
                    groupStartNum={groupStartNum}
                    nextQNum={nextQNum}
                    textInputLayout={textInputLayout}
                    answerCount={answerCount}
                    activeEditorRef={activeEditorRef}
                    onSyncQuestionsFromTemplate={syncQuestionsFromTemplate}
                    onUpdateAnswerCount={updateAnswerCount}
                    onUpdateQuestionAnswer={updateQuestionAnswer}
                />
            ) : (
                <FlowchartOptionBankEditor
                    group={group}
                    groupStartNum={groupStartNum}
                    isOrderingInformation={isOrderingInformation}
                    sharedOptions={sharedOptions}
                    optionLabelType={optionLabelType}
                    answerCount={answerCount}
                    onUpdateOptionLabelType={updateOptionLabelType}
                    onUpdateSharedOptionCount={updateSharedOptionCount}
                    onUpdateSharedOptionText={updateSharedOptionText}
                    onUpdateAnswerCount={updateAnswerCount}
                    onUpdateQuestionAnswer={updateQuestionAnswer}
                />
            )}
        </div>
    );
};
