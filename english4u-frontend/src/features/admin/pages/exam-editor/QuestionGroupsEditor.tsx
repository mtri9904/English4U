import { useRef, type MutableRefObject } from 'react';
import { Button, Input, InputNumber, Select, Tag, Upload, message } from 'antd';
import { AppstoreOutlined, BoldOutlined, DownOutlined, MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { TiptapQxEditor, type TiptapQxEditorRef } from '../../components/TiptapQxEditor';
import type { CreateQuestionDto, CreateQuestionGroupDto } from '../../types/exam.types';
import {
    FILL_TYPES,
    MATCHING_TYPES,
    QUESTION_TYPES,
    SINGLE_CHOICE_TYPES,
    MULTI_CHOICE_TYPES,
} from '../../constants/questionTypes';
import {
    getOptionsForType,
    emptyGroup,
    emptyOption,
    emptyQuestion,
    COMPLEX_LAYOUT_GROUP_TYPES,
    GROUP_TYPE_OPTIONS,
    TABLE_LAYOUT_GROUP_TYPES,
} from './examEditor.helpers';
import { getCleanPastedInputValue } from '@/shared/utils/input';
import { GenericTableEditor } from './GenericTableEditor';
import { MapLabellingEditor } from './MapLabellingEditor';
import { FlowchartCompletionEditor } from './FlowchartCompletionEditor';
import { ListeningMultiSelectEditor } from './ListeningMultiSelectEditor';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { Radio } from 'antd';
import { getEffectiveMcqGroupType } from '@/shared/lib/examDisplay';
import { TruthValueDefinitionTable } from '@/shared/components/TruthValueDefinitionTable';

const MULTI_CORRECT_MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_INFO,
    QUESTION_TYPES.MATCHING_FEATURES,
    QUESTION_TYPES.MATCHING_TABLE,
]);

const FIXED_OPTION_MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_CLASSIFICATION,
]);

const splitCorrectAnswers = (value?: string) =>
    (value ?? '')
        .split('|')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

const joinCorrectAnswers = (values: string[]) => {
    const normalized = Array.from(
        new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)),
    );
    return normalized.length > 0 ? normalized.join('|') : undefined;
};

const remapCorrectAnswerTokens = (
    value: string | undefined,
    mapper: (token: string) => string | null | undefined,
) => {
    const remapped = splitCorrectAnswers(value)
        .map((token) => mapper(token))
        .filter((token): token is string => !!token && token.trim().length > 0);

    return joinCorrectAnswers(remapped);
};

const buildBlankOptions = (count: number, existingOptions: CreateQuestionDto['options'] = []) =>
    Array.from({ length: count }, (_, index) => ({
        ...(existingOptions[index] ?? emptyOption(index)),
        orderIndex: index,
    }));

const getSharedQuestionOptions = (group: CreateQuestionGroupDto) =>
    group.questions.find((question) => question.options.length > 0)?.options ?? [];

const applySharedOptionsToQuestions = (
    questions: CreateQuestionDto[],
    nextOptions: CreateQuestionDto['options'],
) => {
    const normalizedOptions = nextOptions.map((option, index) => ({
        ...option,
        orderIndex: index,
    }));

    return questions.map((question) => ({
        ...question,
        options: normalizedOptions,
    }));
};

const closeActiveSelectDropdown = () => {
    requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    });
};

const isFlowchartLikeType = (groupType?: string | null) =>
    groupType === QUESTION_TYPES.FLOWCHART_COMPLETION || groupType === QUESTION_TYPES.ORDERING_INFORMATION;

interface QuestionGroupsEditorProps {
    groups: CreateQuestionGroupDto[];
    skill: 'Reading' | 'Listening';
    onUpdate: (groups: CreateQuestionGroupDto[]) => void;
    startQNum?: number;
    maxQuestionCount?: number;
    totalQuestionCount?: number;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

export const QuestionGroupsEditor = ({
    groups,
    skill,
    onUpdate,
    startQNum = 1,
    maxQuestionCount,
    totalQuestionCount = 0,
    activeEditorRef,
    uploading = false,
    handleUploadFile,
}: QuestionGroupsEditorProps) => {
    const typeOptions = GROUP_TYPE_OPTIONS[skill] ?? [];
    let runningQNum = startQNum;
    const instructionEditorRefs = useRef<Record<number, TiptapQxEditorRef | null>>({});
    const templateEditorRefs = useRef<Record<number, TiptapQxEditorRef | null>>({});
    const shortAnswerEditorRefs = useRef<Record<string, TiptapQxEditorRef | null>>({});
    const canAddQuestion = maxQuestionCount == null || totalQuestionCount < maxQuestionCount;
    const warnQuestionLimit = () => {
        if (maxQuestionCount != null) {
            message.warning(`${skill} chỉ được tối đa ${maxQuestionCount} câu.`);
        }
    };
    const wouldExceedQuestionLimit = (currentGroupQuestionCount: number, nextGroupQuestionCount: number) =>
        maxQuestionCount != null
        && totalQuestionCount - currentGroupQuestionCount + nextGroupQuestionCount > maxQuestionCount;
    const getSkillOptionsForType = (groupType?: string) => getOptionsForType(groupType, skill);



    const applyGroupTypeToQuestions = (questions: CreateQuestionDto[], groupType?: string) => {
        const defaultOptions = getSkillOptionsForType(groupType);
        const hasDefaultOptions = defaultOptions.length > 0;
        const isPresetType = groupType === QUESTION_TYPES.TFNG || groupType === QUESTION_TYPES.YNNG;

        return questions.map((question) => {
            if (!hasDefaultOptions) {
                return { ...question, options: [] };
            }

            if (isPresetType || question.options.length === 0) {
                return {
                    ...question,
                    options: defaultOptions.map((option) => ({ ...option })),
                };
            }

            return question;
        });
    };

    const extractTemplateQuestionNumbers = (contentData?: string) => {
        if (!contentData) return [];

        const matches = [...contentData.matchAll(/\[Q(\d+)\]/g)];
        const uniqueNumbers = new Set<number>();

        matches.forEach((match) => {
            uniqueNumbers.add(Number.parseInt(match[1], 10));
        });

        return Array.from(uniqueNumbers);
    };

    const normalizeSingleQuestionToken = (value: string, questionNumber: number) => {
        const token = `[Q${questionNumber}]`;
        let hasToken = false;

        return value.replace(/\[Q\d+\]/g, () => {
            if (hasToken) {
                return '';
            }
            hasToken = true;
            return token;
        });
    };

    const hasQuestionToken = (value?: string | null) => /\[Q\d+\]/.test(value ?? '');

    const getTemplatePlaceholder = (groupType?: string) => {
        if (groupType === QUESTION_TYPES.SENTENCE_COMPLETION) {
            return 'Nhập câu/đoạn và chèn [Q1], [Q2] tại vị trí cần điền.';
        }
        if (groupType === QUESTION_TYPES.SUMMARY_COMPLETION) {
            return 'Nhập đoạn summary và chèn [Q1], [Q2]... vào các chỗ trống.';
        }
        if (groupType === QUESTION_TYPES.FLOWCHART_COMPLETION) {
            return 'Nhập các dòng mô tả dưới flowchart rồi chèn [Q1], [Q2] tại vị trí cần điền.';
        }
        if (groupType === QUESTION_TYPES.ORDERING_INFORMATION) {
            return 'Ordering Information dùng ảnh sơ đồ + answer bank A-F, không cần template text.';
        }
        return 'Nội dung template (Ví dụ: [Q1] is a good [Q2])';
    };

    const hasMultiSelectLayout = (contentData?: string) => {
        if (!contentData) return false;

        try {
            const parsed = JSON.parse(contentData) as unknown;
            return parsed
                && typeof parsed === 'object'
                && (parsed as { layout?: unknown }).layout === 'listening_multi_select';
        } catch {
            return false;
        }
    };

    const getFlowchartAnswerMode = (
        groupType?: string,
        assetsData?: string,
    ): 'text_input' | 'shared_option_bank' => {
        if (groupType === QUESTION_TYPES.ORDERING_INFORMATION) {
            return 'shared_option_bank';
        }

        if (!assetsData) return 'text_input';

        try {
            const parsed = JSON.parse(assetsData) as unknown;
            if (parsed && typeof parsed === 'object') {
                const answerMode = (parsed as { answerMode?: unknown }).answerMode;
                if (answerMode === 'shared_option_bank') {
                    return 'shared_option_bank';
                }
            }
        } catch {
            // Ignore parse errors and fall back to text input.
        }

        return 'text_input';
    };

const buildMultiSelectContentData = (prompt = '') => JSON.stringify({
    layout: 'listening_multi_select',
    prompt,
});

const parseGroupAssetsData = (assetsData?: string | null) => {
    if (!assetsData) return {} as Record<string, unknown>;

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
};

const getListeningMcqOptionInputMode = (assetsData: string | null | undefined, questionKey: string): 'text' | 'image' => {
    const parsed = parseGroupAssetsData(assetsData);
    const rawMap = parsed.optionInputModeByQuestion;
    if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
        return (rawMap as Record<string, unknown>)[questionKey] === 'image' ? 'image' : 'text';
    }

    return 'text';
};

const setListeningMcqOptionInputMode = (
    assetsData: string | null | undefined,
    questionKey: string,
    mode: 'text' | 'image',
) => {
    const parsed = parseGroupAssetsData(assetsData);
    const nextMap = parsed.optionInputModeByQuestion && typeof parsed.optionInputModeByQuestion === 'object' && !Array.isArray(parsed.optionInputModeByQuestion)
        ? { ...(parsed.optionInputModeByQuestion as Record<string, unknown>) }
        : {};

    if (mode === 'image') nextMap[questionKey] = 'image';
    else delete nextMap[questionKey];

    const nextPayload: Record<string, unknown> = { ...parsed };
    if (Object.keys(nextMap).length > 0) nextPayload.optionInputModeByQuestion = nextMap;
    else delete nextPayload.optionInputModeByQuestion;

    return Object.keys(nextPayload).length > 0 ? JSON.stringify(nextPayload) : undefined;
};

    const renderQuestion = (
        question: CreateQuestionDto,
        questionIdx: number,
        group: CreateQuestionGroupDto,
        groupIdx: number,
        groupStartNum: number,
    ) => {
        const groupType = group.groupType ?? '';
        const hasOptions = SINGLE_CHOICE_TYPES.has(groupType) || MULTI_CHOICE_TYPES.has(groupType) || MATCHING_TYPES.has(groupType);
        const isFillType = FILL_TYPES.has(groupType) || groupType === QUESTION_TYPES.SUMMARY_COMPLETION;
        const isTFNGType = groupType === QUESTION_TYPES.TFNG || groupType === QUESTION_TYPES.YNNG;
        const isShortAnswerTemplateType = groupType === QUESTION_TYPES.SHORT_ANSWER;
        const supportsOptionImageUpload = skill === 'Listening' && groupType === QUESTION_TYPES.MCQ_SINGLE && !isTFNGType;
        const displayQuestionNumber = question.questionNumber ?? groupStartNum + questionIdx;
        const optionInputMode = supportsOptionImageUpload ? getListeningMcqOptionInputMode(group.assetsData, String(displayQuestionNumber)) : 'text';
        const shortAnswerEditorKey = `${groupIdx}-${questionIdx}-${displayQuestionNumber}`;

        const updateQuestion = (partial: Partial<CreateQuestionDto>) => {
            const updatedGroups = [...groups];
            const updatedQuestions = [...group.questions];
            updatedQuestions[questionIdx] = { ...question, ...partial };
            updatedGroups[groupIdx] = { ...group, questions: updatedQuestions };
            onUpdate(updatedGroups);
        };

        return (
            <div key={questionIdx} style={{ padding: '10px', background: '#fff', borderRadius: '8px', marginBottom: '6px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', minWidth: 45 }}>
                        Câu {displayQuestionNumber}
                    </span>
                    {supportsOptionImageUpload && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Kiểu đáp án:</span>
                            <Radio.Group
                                size="small"
                                value={optionInputMode}
                                onChange={(event) => {
                                    const nextMode = event.target.value as 'text' | 'image';
                                    const updatedGroups = [...groups];
                                    updatedGroups[groupIdx] = {
                                        ...group,
                                        assetsData: setListeningMcqOptionInputMode(group.assetsData, String(displayQuestionNumber), nextMode),
                                    };
                                    onUpdate(updatedGroups);
                                }}
                            >
                                <Radio.Button value="text">Text</Radio.Button>
                                <Radio.Button value="image">Image</Radio.Button>
                            </Radio.Group>
                        </div>
                    )}
                    {group.questions.length > 1 && (
                        <Button
                            type="text"
                            danger
                            icon={<MinusCircleOutlined />}
                            size="small"
                            onClick={() => {
                                const updatedGroups = [...groups];
                                updatedGroups[groupIdx] = {
                                    ...group,
                                    questions: group.questions.filter((_, index) => index !== questionIdx),
                                };
                                onUpdate(updatedGroups);
                            }}
                        />
                    )}
                </div>
                {isShortAnswerTemplateType ? (
                    <div style={{ marginBottom: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0369a1' }}>
                                Câu hỏi có ô trả lời inline
                            </span>
                            <Button
                                size="small"
                                type={hasQuestionToken(question.content) ? 'default' : 'primary'}
                                disabled={hasQuestionToken(question.content)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    shortAnswerEditorRefs.current[shortAnswerEditorKey]?.insertQ(displayQuestionNumber);
                                }}
                            >
                                {hasQuestionToken(question.content) ? `Đã có [Q${displayQuestionNumber}]` : `Thêm [Q${displayQuestionNumber}]`}
                            </Button>
                        </div>
                        <TiptapQxEditor
                            ref={(instance) => {
                                shortAnswerEditorRefs.current[shortAnswerEditorKey] = instance;
                            }}
                            value={question.content ?? ''}
                            placeholder={`Nhập câu hỏi và chèn [Q${displayQuestionNumber}] đúng vị trí cần điền.`}
                            minHeight="72px"
                            enableMarkdownBold
                            onFocus={() => {
                                activeEditorRef.current = shortAnswerEditorRefs.current[shortAnswerEditorKey] ?? null;
                            }}
                            onChange={(value) => updateQuestion({
                                content: normalizeSingleQuestionToken(value, displayQuestionNumber),
                            })}
                        />
                        <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#64748b' }}>
                            Mỗi câu chỉ có 1 token [Qx]. Muốn đổi vị trí thì xóa token cũ rồi thêm lại ở vị trí mới.
                        </div>
                    </div>
                ) : (
                    <Input.TextArea
                        value={question.content ?? ''}
                        placeholder={isFillType ? 'Nội dung câu hỏi' : 'Nội dung câu hỏi'}
                        title="Nhập nội dung câu hỏi"
                        autoSize={{ minRows: 2, maxRows: 5 }}
                        size="middle"
                        style={{ marginBottom: '8px' }}
                        onPaste={(event) => {
                            const nextValue = getCleanPastedInputValue(event, question.content ?? '');
                            if (nextValue === null) return;
                            updateQuestion({ content: nextValue });
                        }}
                        onChange={(event) => updateQuestion({ content: event.target.value })}
                    />
                )}

                {isFillType && (
                    <Input
                        value={question.correctAnswer ?? ''}
                        placeholder="Đáp án đúng (dùng | phân cách nhiều đáp án)"
                        title="Nhập đáp án đúng, có thể dùng | để nhập nhiều đáp án"
                        size="middle"
                        style={{ borderColor: '#10b981', marginBottom: '6px', height: '38px' }}
                        onPaste={(event) => {
                            const nextValue = getCleanPastedInputValue(event, question.correctAnswer ?? '');
                            if (nextValue === null) return;
                            updateQuestion({ correctAnswer: nextValue });
                        }}
                        onChange={(event) => updateQuestion({ correctAnswer: event.target.value })}
                    />
                )}

                {hasOptions && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {question.options.map((option, optionIdx) => (
                            <div
                                key={optionIdx}
                                style={{
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: supportsOptionImageUpload ? 'flex-start' : 'center',
                                    padding: supportsOptionImageUpload ? '8px' : 0,
                                    border: supportsOptionImageUpload ? '1px solid #e2e8f0' : 'none',
                                    borderRadius: supportsOptionImageUpload ? '10px' : 0,
                                    background: supportsOptionImageUpload ? '#f8fafc' : 'transparent',
                                }}
                            >
                                <input
                                    type="checkbox"
                                    style={{ marginTop: supportsOptionImageUpload ? '8px' : 0 }}
                                    checked={option.isCorrect}
                                    onChange={(event) => {
                                        const isChecked = event.target.checked;
                                        let options = [...question.options];

                                        if (SINGLE_CHOICE_TYPES.has(groupType)) {
                                            options = options.map((item, index) => ({
                                                ...item,
                                                isCorrect: index === optionIdx ? isChecked : false,
                                            }));
                                        } else {
                                            options[optionIdx] = { ...option, isCorrect: isChecked };
                                        }

                                        updateQuestion({ options });
                                    }}
                                />
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {!supportsOptionImageUpload || optionInputMode === 'text' ? (
                                        <Input
                                            value={option.optionText}
                                            disabled={isTFNGType}
                                            placeholder={isTFNGType ? option.optionText : `Lựa chọn ${getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}`}
                                            title={isTFNGType ? 'Giá trị cố định cho dạng TF/NG hoặc Y/N/NG' : 'Nhập nội dung lựa chọn'}
                                            size="small"
                                            style={{ flex: 1 }}
                                            onPaste={(event) => {
                                                const nextValue = getCleanPastedInputValue(event, option.optionText ?? '');
                                                if (nextValue === null) return;
                                                const options = [...question.options];
                                                options[optionIdx] = { ...option, optionText: nextValue };
                                                updateQuestion({ options });
                                            }}
                                            onChange={(event) => {
                                                const options = [...question.options];
                                                options[optionIdx] = { ...option, optionText: event.target.value };
                                                updateQuestion({ options });
                                            }}
                                        />
                                    ) : null}
                                    {supportsOptionImageUpload && optionInputMode === 'image' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div
                                                style={{
                                                    width: 140,
                                                    height: 100,
                                                    borderRadius: '8px',
                                                    border: '1px dashed #cbd5e1',
                                                    background: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {option.imageUrl ? (
                                                    <img
                                                        src={option.imageUrl}
                                                        alt={`Option ${getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}`}
                                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '0 8px' }}>
                                                        Chưa có ảnh
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                {handleUploadFile ? (
                                                    <Upload
                                                        accept="image/*"
                                                        showUploadList={false}
                                                        beforeUpload={async (file) => {
                                                            const url = await handleUploadFile(file, 'image');
                                                            if (!url) return false;

                                                            const options = [...question.options];
                                                            options[optionIdx] = { ...option, imageUrl: url };
                                                            updateQuestion({ options });
                                                            return false;
                                                        }}
                                                    >
                                                        <Button size="small" loading={uploading}>Upload ảnh</Button>
                                                    </Upload>
                                                ) : null}
                                                {option.imageUrl ? (
                                                    <Button
                                                        size="small"
                                                        onClick={() => {
                                                            const options = [...question.options];
                                                            options[optionIdx] = { ...option, imageUrl: '' };
                                                            updateQuestion({ options });
                                                        }}
                                                    >
                                                        Xóa ảnh
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {!isTFNGType && question.options.length > 1 && (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<MinusCircleOutlined />}
                                        size="small"
                                        style={{ marginTop: supportsOptionImageUpload ? '4px' : 0 }}
                                        onClick={() => updateQuestion({ options: question.options.filter((_, index) => index !== optionIdx) })}
                                    />
                                )}
                            </div>
                        ))}
                        {!isTFNGType && (
                            <Button
                                type="default"
                                size="small"
                                icon={<PlusOutlined />}
                                style={{
                                    marginTop: '4px',
                                    background: '#f0fdf4',
                                    borderColor: '#bbf7d0',
                                    color: '#166534',
                                    fontWeight: 600,
                                    width: '100%',
                                }}
                                onClick={() => updateQuestion({ options: [...question.options, emptyOption(question.options.length)] })}
                            >
                                Thêm lựa chọn
                            </Button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {groups.map((group, groupIdx) => {
                const groupType = getEffectiveMcqGroupType({
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
                const groupStartNum = runningQNum;
                const sharedQuestionOptions = getSharedQuestionOptions(group);
                const matchingHeadingOptionCount = Math.max(1, sharedQuestionOptions.length || 4);
                const matchingHeadingAnswerOptions = Array.from({ length: matchingHeadingOptionCount }, (_, index) => {
                    const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                    return { label, value: label };
                });
                const questionsForSharedOptions = () => (
                    group.questions.length > 0
                        ? group.questions
                        : [{ ...emptyQuestion(), questionNumber: groupStartNum }]
                );

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
                            correctAnswer: remapCorrectAnswerTokens(
                                question.correctAnswer,
                                (token) => (allowedAnswers.has(token) ? token : null),
                            ),
                        })),
                    };
                    onUpdate(updatedGroups);
                };

                const templateQuestionNumbers = isComplexLayout
                    ? extractTemplateQuestionNumbers(group.contentData)
                    : [];
                const numberedQuestions = (isComplexLayout ? templateQuestionNumbers : group.questions
                    .map((question) => question.questionNumber)
                    .filter((questionNumber): questionNumber is number => typeof questionNumber === 'number'));
                const nextQToInsert = numberedQuestions.length > 0
                    ? Math.max(...numberedQuestions) + 1
                    : groupStartNum;
                runningQNum += group.questions.length;

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
                    onUpdate(updatedGroups);
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

                    onUpdate(updatedGroups);
                };

                return (
                    <div key={groupIdx} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
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
                                        const previousType = group.groupType ?? '';
                                        const previousIsComplex = COMPLEX_LAYOUT_GROUP_TYPES.has(previousType);
                                        const nextIsComplex = COMPLEX_LAYOUT_GROUP_TYPES.has(value);
                                        const previousIsTable = TABLE_LAYOUT_GROUP_TYPES.has(previousType);
                                        const nextIsTable = TABLE_LAYOUT_GROUP_TYPES.has(value);
                                        const previousIsFlowchart = isFlowchartLikeType(previousType);
                                        const nextIsFlowchart = isFlowchartLikeType(value);
                                        const previousIsMapLabelling = previousType === QUESTION_TYPES.MAP_LABELLING;
                                        const nextIsMapLabelling = value === QUESTION_TYPES.MAP_LABELLING;
                                        const nextIsSharedMultiSelect = value === QUESTION_TYPES.MCQ_CHOOSE_N;
                                        const nextIsMultiQuestionMulti = value === QUESTION_TYPES.MCQ_MULTIPLE;
                                        const previousIsStructuredLayout = previousIsTable;
                                        const nextIsStructuredLayout = nextIsTable;

                                        let nextQuestions = applyGroupTypeToQuestions(group.questions, value);
                                        let nextContentData = group.contentData;
                                        let nextAssetsData = group.assetsData;

                                        if (value === QUESTION_TYPES.MATCHING_CLASSIFICATION && previousType !== value) {
                                            const classificationOptions = getSkillOptionsForType(value);
                                            const baseQuestions = nextQuestions.length > 0
                                                ? nextQuestions
                                                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: classificationOptions }];
                                            nextQuestions = baseQuestions.map((question, index) => ({
                                                ...question,
                                                questionNumber: question.questionNumber ?? groupStartNum + index,
                                                options: classificationOptions.map((option) => ({ ...option })),
                                            }));
                                        }

                                        if (nextIsComplex && !previousIsComplex) {
                                            // Do not carry old non-template questions into template-based groups.
                                            nextQuestions = [];
                                        }

                                        if (!nextIsComplex) {
                                            nextContentData = undefined;
                                        } else if (previousIsStructuredLayout && !nextIsStructuredLayout) {
                                            // Switching from JSON layout to text template layout.
                                            nextContentData = '';
                                            nextQuestions = [];
                                        } else if (!previousIsStructuredLayout && nextIsStructuredLayout) {
                                            // Switching from text template to JSON layout; let editor use default structure.
                                            nextContentData = undefined;
                                            nextQuestions = [];
                                        }

                                        if (!nextIsComplex && previousIsComplex && nextQuestions.length === 0) {
                                            nextQuestions = [{
                                                ...emptyQuestion(),
                                                options: getSkillOptionsForType(value),
                                            }];
                                        }

                                        if (nextIsFlowchart) {
                                            nextContentData = previousIsFlowchart ? (group.contentData ?? '') : '';
                                            nextAssetsData = previousIsFlowchart ? nextAssetsData : undefined;
                                            const baseFlowchartQuestions = previousIsFlowchart
                                                ? nextQuestions
                                                : value === QUESTION_TYPES.ORDERING_INFORMATION
                                                    ? Array.from({ length: 5 }, (_, index) => ({
                                                        ...emptyQuestion(),
                                                        questionNumber: groupStartNum + index,
                                                        options: [],
                                                        content: '',
                                                    }))
                                                    : [];
                                            nextQuestions = baseFlowchartQuestions.map((question, index) => ({
                                                ...question,
                                                questionNumber: question.questionNumber ?? groupStartNum + index,
                                                options: [],
                                                content: '',
                                            }));
                                        }

                                        if (nextIsMapLabelling) {
                                            const mapOptions = getSkillOptionsForType(value);
                                            if (nextQuestions.length === 0) {
                                                nextQuestions = [{
                                                    ...emptyQuestion(),
                                                    options: mapOptions,
                                                }];
                                            } else {
                                                nextQuestions = nextQuestions.map((question) => ({
                                                    ...question,
                                                    options: previousIsMapLabelling && question.options.length > 0
                                                        ? question.options
                                                    : mapOptions,
                                                }));
                                            }
                                            nextContentData = undefined;
                                            nextAssetsData = previousIsMapLabelling ? nextAssetsData : undefined;
                                        }

                                        if (!nextIsMapLabelling && previousIsMapLabelling) {
                                            nextAssetsData = undefined;
                                        }

                                        if (!nextIsFlowchart && previousIsFlowchart) {
                                            nextAssetsData = undefined;
                                        }

                                        if (nextIsMultiQuestionMulti) {
                                            const baseQuestions = nextQuestions.length > 0
                                                ? nextQuestions
                                                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: getSkillOptionsForType(value) }];
                                            nextQuestions = baseQuestions.map((question, index) => ({
                                                ...question,
                                                questionNumber: question.questionNumber ?? groupStartNum + index,
                                                options: question.options.length > 0
                                                    ? question.options
                                                    : getSkillOptionsForType(value),
                                            }));
                                            nextContentData = undefined;
                                        }

                                        if (nextIsSharedMultiSelect) {
                                            const baseQuestions = nextQuestions.length > 0
                                                ? nextQuestions
                                                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: getSkillOptionsForType(value) }];
                                            nextQuestions = baseQuestions.map((question, index) => ({
                                                ...question,
                                                content: '',
                                                questionNumber: question.questionNumber ?? groupStartNum + index,
                                                options: question.options.length > 0
                                                    ? question.options
                                                    : getSkillOptionsForType(value),
                                            }));
                                            nextContentData = hasMultiSelectLayout(group.contentData)
                                                ? group.contentData
                                                : buildMultiSelectContentData('');
                                        }

                                        const updatedGroups = [...groups];
                                        updatedGroups[groupIdx] = {
                                            ...group,
                                            groupType: value,
                                            contentData: nextContentData,
                                            assetsData: nextAssetsData,
                                            optionLabelType: value === QUESTION_TYPES.ORDERING_INFORMATION
                                                ? 'alpha'
                                                : nextIsFlowchart
                                                    ? undefined
                                                    : group.optionLabelType,
                                            questions: nextQuestions,
                                        };
                                        onUpdate(updatedGroups);
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
                                                onUpdate(updatedGroups);
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
                                        onClick={() => onUpdate(groups.filter((_, index) => index !== groupIdx))}
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
                                    onUpdate(updatedGroups);
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
                                onUpdate={onUpdate}
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
                                onUpdate={onUpdate}
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
                                onUpdate={onUpdate}
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
                                        activeEditorRef={activeEditorRef}
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
                                <div style={{ flex: 6, minWidth: '300px' }}>
                                    {group.questions.map((question, questionIdx) => (
                                        <div key={questionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                            <Tag color="blue">Q{question.questionNumber || groupStartNum + questionIdx}</Tag>
                                            {!isComplexLayout && (
                                                <Input
                                                    size="middle"
                                                    placeholder={isClassificationMatchingType ? 'Tên người / nhóm / đối tượng...' : 'Nội dung item...'}
                                                    title="Nội dung câu hỏi"
                                                    value={question.content ?? ''}
                                                    style={{ flex: 1, height: '38px' }}
                                                    onPaste={(event) => {
                                                        const nextValue = getCleanPastedInputValue(event, question.content ?? '');
                                                        if (nextValue === null) return;

                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            content: nextValue,
                                                        };
                                                        onUpdate(updatedGroups);
                                                    }}
                                                    onChange={(event) => {
                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            content: event.target.value,
                                                        };
                                                        onUpdate(updatedGroups);
                                                    }}
                                                />
                                            )}
                                            {isMatchingHeadingsType ? (
                                                <Select
                                                    size="middle"
                                                    placeholder="Đáp án"
                                                    value={question.correctAnswer || undefined}
                                                    style={{ width: 120, border: '1px solid #10b981', borderRadius: '4px' }}
                                                    onChange={(value) => {
                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            correctAnswer: value,
                                                        };
                                                        onUpdate(updatedGroups);
                                                        closeActiveSelectDropdown();
                                                    }}
                                                    options={matchingHeadingAnswerOptions}
                                                />
                                            ) : showOptionsBox ? (
                                                allowsMultipleCorrectAnswers ? (
                                                    <Select
                                                        mode="multiple"
                                                        size="middle"
                                                        placeholder="Đáp án (1-3)"
                                                        value={splitCorrectAnswers(question.correctAnswer)}
                                                        maxTagCount={3}
                                                        style={{ width: '170px', border: '1px solid #10b981', borderRadius: '4px' }}
                                                        onChange={(values: string[]) => {
                                                            const updatedGroups = [...groups];
                                                            updatedGroups[groupIdx].questions[questionIdx] = {
                                                                ...question,
                                                                correctAnswer: joinCorrectAnswers(values.slice(0, 3)),
                                                            };
                                                            onUpdate(updatedGroups);
                                                            closeActiveSelectDropdown();
                                                        }}
                                                        options={sharedQuestionOptions.map((_, index) => {
                                                            const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                                                            return { label, value: label };
                                                        })}
                                                    />
                                                ) : (
                                                    <Select
                                                        size="middle"
                                                        placeholder="Đáp án"
                                                        value={question.correctAnswer || undefined}
                                                        style={{ width: isSummaryType ? '120px' : '100px', border: '1px solid #10b981', borderRadius: '4px' }}
                                                        onChange={(value) => {
                                                            const updatedGroups = [...groups];
                                                            updatedGroups[groupIdx].questions[questionIdx] = {
                                                                ...question,
                                                                correctAnswer: value,
                                                            };
                                                            onUpdate(updatedGroups);
                                                            closeActiveSelectDropdown();
                                                        }}
                                                        options={sharedQuestionOptions.map((_, index) => {
                                                            const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                                                            return { label, value: label };
                                                        })}
                                                    />
                                                )
                                            ) : (
                                                <Input
                                                    size="middle"
                                                    placeholder="Đáp án"
                                                    title="Nhập đáp án cho câu hỏi"
                                                    value={question.correctAnswer ?? ''}
                                                    style={{ width: isSummaryType ? '220px' : '120px', borderColor: '#10b981', height: '38px' }}
                                                    onPaste={(event) => {
                                                        const nextValue = getCleanPastedInputValue(event, question.correctAnswer ?? '');
                                                        if (nextValue === null) return;
                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            correctAnswer: nextValue,
                                                        };
                                                        onUpdate(updatedGroups);
                                                    }}
                                                    onChange={(event) => {
                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            correctAnswer: event.target.value,
                                                        };
                                                        onUpdate(updatedGroups);
                                                    }}
                                                />
                                            )}
                                            <Button
                                                type="text"
                                                danger
                                                icon={<MinusCircleOutlined />}
                                                size="small"
                                                onClick={() => {
                                                    removeQuestionAt(
                                                        questionIdx,
                                                        question.questionNumber ?? groupStartNum + questionIdx,
                                                    );
                                                }}
                                            />
                                        </div>
                                    ))}
                                    {!isComplexLayout && (
                                        <Button
                                            type="default"
                                            size="small"
                                            icon={<PlusOutlined />}
                                            block
                                            disabled={!canAddQuestion}
                                            style={{
                                                background: '#f0f9ff',
                                                borderColor: '#bae6fd',
                                                color: '#0369a1',
                                                fontWeight: 600,
                                                height: '32px',
                                                borderRadius: '6px',
                                                marginTop: '8px',
                                            }}
                                            onClick={() => {
                                                if (!canAddQuestion) {
                                                    warnQuestionLimit();
                                                    return;
                                                }

                                                const updatedGroups = [...groups];
                                                const newQuestion = {
                                                    ...emptyQuestion(),
                                                    options: sharedQuestionOptions.length > 0 ? sharedQuestionOptions : buildBlankOptions(matchingHeadingOptionCount),
                                                };
                                                updatedGroups[groupIdx] = {
                                                    ...group,
                                                    questions: [...group.questions, newQuestion],
                                                };
                                                onUpdate(updatedGroups);
                                            }}
                                        >
                                            Thêm Item mới vào danh sách
                                        </Button>
                                    )}
                                </div>

                                {showOptionsBox && (
                                    <div style={{ flex: 4, minWidth: '250px', background: '#fff', border: '2px solid #bae6fd', borderRadius: '12px', padding: '12px', alignSelf: 'stretch' }}>
                                        <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '10px', fontSize: '0.8125rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>{isSummaryType ? 'DANH SÁCH TỪ VỰNG (BOX)' : 'DANH SÁCH OPTIONS CHUNG'}</span>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {sharedQuestionOptions.map((option, optionIdx) => (
                                                <div
                                                    key={optionIdx}
                                                    style={{
                                                        display: 'flex',
                                                        gap: '8px',
                                                        alignItems: 'center',
                                                        padding: isVisualMatchingType ? '10px' : 0,
                                                        border: isVisualMatchingType ? '1px solid #e2e8f0' : 'none',
                                                        borderRadius: isVisualMatchingType ? '10px' : 0,
                                                        background: isVisualMatchingType ? '#f8fafc' : 'transparent',
                                                    }}
                                                >
                                                    <b style={{ color: '#0ea5e9', width: '25px', textAlign: 'center', fontSize: '0.75rem' }}>
                                                        {getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}
                                                    </b>
                                                    {isVisualMatchingType ? (
                                                        <>
                                                            <div
                                                                style={{
                                                                    width: 120,
                                                                    height: 90,
                                                                    borderRadius: '8px',
                                                                    border: '1px dashed #cbd5e1',
                                                                    background: '#fff',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    overflow: 'hidden',
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {option.optionText ? (
                                                                    <img
                                                                        src={option.optionText}
                                                                        alt={`Option ${getOptionLabel(optionIdx, group.optionLabelType || 'alpha')}`}
                                                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                                    />
                                                                ) : (
                                                                    <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '0 8px' }}>
                                                                        Chưa có ảnh
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {handleUploadFile ? (
                                                                <Upload
                                                                    accept="image/*"
                                                                    showUploadList={false}
                                                                    beforeUpload={async (file) => {
                                                                        const url = await handleUploadFile(file, 'image');
                                                                        if (!url) return false;

                                                                        const updatedGroups = [...groups];
                                                                        const newOptions = [...sharedQuestionOptions];
                                                                        newOptions[optionIdx] = { ...option, optionText: url };
                                                                        updatedGroups[groupIdx] = {
                                                                            ...group,
                                                                            questions: applySharedOptionsToQuestions(questionsForSharedOptions(), newOptions),
                                                                        };
                                                                        onUpdate(updatedGroups);
                                                                        return false;
                                                                    }}
                                                                >
                                                                    <Button size="small">Upload ảnh</Button>
                                                                </Upload>
                                                            ) : null}
                                                            {option.optionText ? (
                                                                <Button
                                                                    size="small"
                                                                    onClick={() => {
                                                                        const updatedGroups = [...groups];
                                                                        const newOptions = [...sharedQuestionOptions];
                                                                        newOptions[optionIdx] = { ...option, optionText: '' };
                                                                        updatedGroups[groupIdx] = {
                                                                            ...group,
                                                                            questions: applySharedOptionsToQuestions(questionsForSharedOptions(), newOptions),
                                                                        };
                                                                        onUpdate(updatedGroups);
                                                                    }}
                                                                >
                                                                    Xóa ảnh
                                                                </Button>
                                                            ) : null}
                                                        </>
                                                    ) : (
                                                        <Input
                                                            size="small"
                                                            value={option.optionText}
                                                            placeholder="Nội dung..."
                                                            title="Nội dung lựa chọn"
                                                            style={{ flex: 1 }}
                                                            onPaste={(event) => {
                                                                const nextValue = getCleanPastedInputValue(event, option.optionText ?? '');
                                                                if (nextValue === null) return;
                                                                const updatedGroups = [...groups];
                                                                const newOptions = [...sharedQuestionOptions];
                                                                newOptions[optionIdx] = { ...option, optionText: nextValue };
                                                                updatedGroups[groupIdx] = {
                                                                    ...group,
                                                                    questions: applySharedOptionsToQuestions(questionsForSharedOptions(), newOptions),
                                                                };
                                                                onUpdate(updatedGroups);
                                                            }}
                                                            onChange={(event) => {
                                                                const updatedGroups = [...groups];
                                                                const newOptions = [...sharedQuestionOptions];
                                                                newOptions[optionIdx] = { ...option, optionText: event.target.value };
                                                                updatedGroups[groupIdx] = {
                                                                    ...group,
                                                                    questions: applySharedOptionsToQuestions(questionsForSharedOptions(), newOptions),
                                                                };
                                                                onUpdate(updatedGroups);
                                                            }}
                                                        />
                                                    )}
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<MinusCircleOutlined />}
                                                        size="small"
                                                        disabled={isClassificationMatchingType && sharedQuestionOptions.length <= 2}
                                                        onClick={() => {
                                                            const updatedGroups = [...groups];
                                                            const newOptions = sharedQuestionOptions.filter((_, index) => index !== optionIdx);
                                                            updatedGroups[groupIdx] = {
                                                                ...group,
                                                                questions: applySharedOptionsToQuestions(questionsForSharedOptions(), newOptions),
                                                            };
                                                            onUpdate(updatedGroups);
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                            <Button
                                                type="default"
                                                size="small"
                                                icon={<PlusOutlined />}
                                                block
                                                disabled={FIXED_OPTION_MATCHING_TYPES.has(groupType)}
                                                style={{
                                                    background: '#f0f9ff',
                                                    borderColor: '#bae6fd',
                                                    color: '#0369a1',
                                                    fontWeight: 600,
                                                    height: '32px',
                                                    borderRadius: '6px',
                                                }}
                                                onClick={() => {
                                                    const updatedGroups = [...groups];
                                                    const currentOptions = sharedQuestionOptions;
                                                    const newOptions = [...currentOptions, emptyOption(currentOptions.length)];
                                                    updatedGroups[groupIdx] = {
                                                        ...group,
                                                        questions: applySharedOptionsToQuestions(questionsForSharedOptions(), newOptions),
                                                    };
                                                    onUpdate(updatedGroups);
                                                }}
                                            >
                                                {isClassificationMatchingType ? 'Dạng này dùng cố định 2 cột A/B' : 'Thêm lựa chọn mới vào Box'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {isComplexLayout && !isMatchingType && !isSummaryType && !isFlowchartType && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '8px' }}>
                                <div style={{ fontWeight: 600, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                                    Đáp án cho các ô trống
                                </div>
                                {group.questions.length === 0 ? (
                                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                                        {isFlowchartOptionBank
                                            ? 'Tăng số ô đáp án ở phần flowchart để tạo danh sách đáp án.'
                                            : 'Thêm [Qx] trong template để tạo danh sách đáp án.'}
                                    </div>
                                ) : (
                                    group.questions.map((question, questionIdx) => (
                                        <div key={questionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                            <Tag color="blue">Q{question.questionNumber || groupStartNum + questionIdx}</Tag>
                                            {isFlowchartOptionBank ? (
                                                <Select
                                                    size="middle"
                                                    placeholder="Đáp án"
                                                    value={question.correctAnswer || undefined}
                                                    style={{ width: '180px', border: '1px solid #10b981', borderRadius: '4px' }}
                                                    onChange={(value) => {
                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            correctAnswer: value,
                                                        };
                                                        onUpdate(updatedGroups);
                                                    }}
                                                    options={sharedQuestionOptions.map((_, index) => {
                                                        const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                                                        return { label, value: label };
                                                    })}
                                                    allowClear
                                                />
                                            ) : (
                                                <Input
                                                    size="middle"
                                                    placeholder="Đáp án (dùng | nếu có nhiều đáp án)"
                                                    title="Nhập đáp án đúng. Nếu có nhiều đáp án, dùng dấu | để phân cách, ví dụ: animal|insect|wild creature."
                                                    value={question.correctAnswer ?? ''}
                                                    style={{ width: '280px', borderColor: '#10b981', height: '38px' }}
                                                    onChange={(event) => {
                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            correctAnswer: event.target.value,
                                                        };
                                                        onUpdate(updatedGroups);
                                                    }}
                                                />
                                            )}
                                            <Button
                                                type="text"
                                                danger
                                                icon={<MinusCircleOutlined />}
                                                size="small"
                                                onClick={() => {
                                                    removeQuestionAt(
                                                        questionIdx,
                                                        question.questionNumber ?? groupStartNum + questionIdx,
                                                    );
                                                }}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        )}

                        {!isComplexLayout && !isMatchingType && !isSummaryType && !isMapLabellingType && !isFlowchartType && !usesLegacySharedMultiSelectLayout && (
                            <div style={{ marginTop: '10px' }}>
                                {group.questions.map((question, questionIdx) => renderQuestion(question, questionIdx, group, groupIdx, groupStartNum))}
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
                                            onUpdate(updatedGroups);
                                        }}
                                    >
                                        Thêm câu hỏi mới vào nhóm này
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
            <Button
                type="default"
                icon={<PlusOutlined />}
                block
                disabled={!canAddQuestion}
                style={{
                    background: '#f1f5f9',
                    borderColor: '#cbd5e1',
                    color: '#475569',
                    fontWeight: 700,
                    height: '40px',
                    borderRadius: '10px',
                    marginTop: '4px',
                    borderStyle: 'dashed',
                    borderWidth: '2px',
                }}
                onClick={() => {
                    if (!canAddQuestion) {
                        warnQuestionLimit();
                        return;
                    }

                    onUpdate([...groups, emptyGroup(QUESTION_TYPES.MCQ_SINGLE, skill)]);
                }}
            >
                THÊM NHÓM CÂU HỎI MỚI (PHẦN NÀY)
            </Button>
        </div>
    );
};
