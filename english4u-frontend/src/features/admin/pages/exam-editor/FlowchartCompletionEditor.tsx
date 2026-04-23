import { useMemo, useRef, type MutableRefObject } from 'react';
import { Button, Empty, Input, InputNumber, Radio, Select, Tag, Upload } from 'antd';
import { BoldOutlined, CloseOutlined, PictureOutlined } from '@ant-design/icons';
import { TiptapQxEditor, type TiptapQxEditorRef } from '../../components/TiptapQxEditor';
import type { CreateQuestionGroupDto, CreateQuestionOptionDto } from '../../types/exam.types';
import { QUESTION_TYPES } from '../../constants/questionTypes';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { emptyOption, emptyQuestion } from './examEditor.helpers';

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

type FlowchartAnswerMode = 'text_input' | 'shared_option_bank';
type FlowchartTextInputLayout = 'template' | 'question_count';

interface FlowchartAssetData {
    layout: 'flowchart_completion_image';
    imageUrl: string;
    answerMode?: FlowchartAnswerMode;
    textInputLayout?: FlowchartTextInputLayout;
}

const MIN_ANSWER_COUNT = 1;
const MAX_ANSWER_COUNT = 26;
const DEFAULT_ANSWER_COUNT = 5;
const MIN_OPTION_COUNT = 1;
const MAX_OPTION_COUNT = 26;
const DEFAULT_OPTION_COUNT = 6;
const DEFAULT_ANSWER_MODE: FlowchartAnswerMode = 'text_input';
const DEFAULT_TEXT_INPUT_LAYOUT: FlowchartTextInputLayout = 'template';

const getDefaultAnswerMode = (groupType?: string): FlowchartAnswerMode =>
    groupType === QUESTION_TYPES.ORDERING_INFORMATION ? 'shared_option_bank' : DEFAULT_ANSWER_MODE;

const createDefaultAssets = (groupType?: string): FlowchartAssetData => ({
    layout: 'flowchart_completion_image',
    imageUrl: '',
    answerMode: getDefaultAnswerMode(groupType),
});

const parseFlowchartAssetsData = (assetsData?: string, groupType?: string): FlowchartAssetData => {
    const defaults = createDefaultAssets(groupType);
    if (!assetsData) return defaults;

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        if (typeof parsed === 'string') {
            return { ...defaults, imageUrl: parsed };
        }

        if (parsed && typeof parsed === 'object') {
            const answerMode = (parsed as { answerMode?: unknown }).answerMode;
            const textInputLayout = (parsed as { textInputLayout?: unknown }).textInputLayout;
            const normalizedAnswerMode: FlowchartAnswerMode =
                answerMode === 'shared_option_bank' || answerMode === 'text_input'
                    ? answerMode
                    : defaults.answerMode ?? DEFAULT_ANSWER_MODE;
            const normalizedTextInputLayout: FlowchartTextInputLayout | undefined =
                textInputLayout === 'template' || textInputLayout === 'question_count'
                    ? textInputLayout
                    : undefined;

            if (typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string') {
                return {
                    layout: 'flowchart_completion_image',
                    imageUrl: (parsed as { imageUrl: string }).imageUrl,
                    answerMode: normalizedAnswerMode,
                    textInputLayout: normalizedTextInputLayout,
                };
            }

            if (typeof (parsed as { url?: unknown }).url === 'string') {
                return {
                    layout: 'flowchart_completion_image',
                    imageUrl: (parsed as { url: string }).url,
                    answerMode: normalizedAnswerMode,
                    textInputLayout: normalizedTextInputLayout,
                };
            }
        }
    } catch {
        return { ...defaults, imageUrl: assetsData };
    }

    return defaults;
};

const serializeFlowchartAssetsData = (assets: FlowchartAssetData) => JSON.stringify(assets);

const normalizeAnswerCount = (count?: number | null) => {
    const candidate = count ?? DEFAULT_ANSWER_COUNT;
    const normalized = Number.isFinite(candidate) ? Math.trunc(candidate) : DEFAULT_ANSWER_COUNT;
    return Math.min(MAX_ANSWER_COUNT, Math.max(MIN_ANSWER_COUNT, normalized));
};

const normalizeOptionCount = (count?: number | null) => {
    const candidate = count ?? DEFAULT_OPTION_COUNT;
    const normalized = Number.isFinite(candidate) ? Math.trunc(candidate) : DEFAULT_OPTION_COUNT;
    return Math.min(MAX_OPTION_COUNT, Math.max(MIN_OPTION_COUNT, normalized));
};

const cloneOptions = (options: CreateQuestionOptionDto[]) => (
    options.map((option, index) => ({
        ...option,
        orderIndex: index,
    }))
);

const createDefaultOptions = (count = DEFAULT_OPTION_COUNT): CreateQuestionOptionDto[] => (
    Array.from({ length: count }, (_, index) => emptyOption(index))
);

const getRomanLabel = (index: number) => getOptionLabel(index, 'roman');

const convertAnswerLabel = (
    answer: string | undefined,
    previousType: 'alpha' | 'roman',
    nextType: 'alpha' | 'roman',
    optionCount: number,
) => {
    const normalized = (answer ?? '').trim();
    if (!normalized || previousType === nextType) {
        return normalized || undefined;
    }

    if (previousType === 'alpha' && nextType === 'roman') {
        const upper = normalized.toUpperCase();
        const index = upper.charCodeAt(0) - 65;
        return index >= 0 && index < optionCount ? getRomanLabel(index) : undefined;
    }

    const lower = normalized.toLowerCase();
    for (let index = 0; index < optionCount; index += 1) {
        if (getRomanLabel(index) === lower) {
            return getOptionLabel(index, 'alpha');
        }
    }

    return undefined;
};

const adjustAnswerForOptionCount = (
    answer: string | undefined,
    labelType: 'alpha' | 'roman',
    optionCount: number,
) => {
    const normalized = (answer ?? '').trim();
    if (!normalized) {
        return undefined;
    }

    if (labelType === 'alpha') {
        const upper = normalized.toUpperCase();
        const index = upper.charCodeAt(0) - 65;
        return index >= 0 && index < optionCount ? upper : undefined;
    }

    const lower = normalized.toLowerCase();
    for (let index = 0; index < optionCount; index += 1) {
        if (getRomanLabel(index) === lower) {
            return lower;
        }
    }

    return undefined;
};

const extractTemplateQuestionNumbers = (contentData?: string) => {
    if (!contentData) return [];

    const matches = [...contentData.matchAll(/\[Q(\d+)\]/g)];
    const uniqueNumbers = new Set<number>();

    matches.forEach((match) => {
        uniqueNumbers.add(Number.parseInt(match[1], 10));
    });

    return Array.from(uniqueNumbers).sort((left, right) => left - right);
};

const hasTemplateQuestionTokens = (contentData?: string) => extractTemplateQuestionNumbers(contentData).length > 0;

const inferTextInputLayout = (group: CreateQuestionGroupDto): FlowchartTextInputLayout => {
    if (hasTemplateQuestionTokens(group.contentData)) {
        return 'template';
    }

    if (!(group.contentData ?? '').trim() && group.questions.length > 0) {
        return 'question_count';
    }

    return DEFAULT_TEXT_INPUT_LAYOUT;
};

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
    const editorRef = useRef<TiptapQxEditorRef | null>(null);
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

    const renderTextInputAnswers = () => (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
            <div style={{ fontWeight: 700, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                Đáp án cho từng ô
            </div>
            {group.questions.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                    {textInputLayout === 'template'
                        ? 'Chèn token [Qx] vào sentence để tạo ô đáp án.'
                        : 'Tăng số câu để bắt đầu nhập đáp án đúng.'}
                </div>
            ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                    {group.questions.map((question, questionIndex) => (
                        <div key={question.questionNumber ?? questionIndex} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                                Q{question.questionNumber ?? groupStartNum + questionIndex}
                            </Tag>
                            <Input
                                size="middle"
                                placeholder="Nhập đáp án đúng"
                                value={question.correctAnswer ?? ''}
                                style={{ width: 260, maxWidth: '100%', borderColor: '#10b981' }}
                                onChange={(event) => updateQuestionAnswer(questionIndex, event.target.value)}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return (
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
            <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '0.875rem', marginBottom: '10px' }}>
                {isOrderingInformation ? 'Ordering Information' : 'Flowchart Completion'}
            </div>

            <div style={{ background: '#eff6ff', border: '1px dashed #60a5fa', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 600, color: '#1d4ed8', marginBottom: '6px', fontSize: '0.8125rem' }}>
                    <PictureOutlined /> Hình Flowchart / Diagram
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Upload
                        accept="image/*"
                        maxCount={1}
                        showUploadList={false}
                        disabled={!handleUploadFile}
                        beforeUpload={async (file) => {
                            if (!handleUploadFile) return false;
                            const url = await handleUploadFile(file, 'image');
                            if (url) {
                                updateAssets({ imageUrl: url });
                            }
                            return false;
                        }}
                    >
                        <Button
                            size="small"
                            type="primary"
                            icon={<PictureOutlined />}
                            loading={uploading}
                            disabled={!handleUploadFile}
                        >
                            Tải ảnh lên
                        </Button>
                    </Upload>
                    <Input
                        value={assets.imageUrl}
                        readOnly
                        size="small"
                        placeholder="Chưa có ảnh flowchart"
                        style={{ flex: 1, minWidth: 240, background: '#f8fafc' }}
                        suffix={assets.imageUrl ? (
                            <CloseOutlined
                                style={{ color: '#ef4444', cursor: 'pointer' }}
                                onClick={() => updateAssets({ imageUrl: '' })}
                            />
                        ) : null}
                    />
                </div>

                <div style={{ marginTop: '10px', color: '#475569', fontSize: '0.8125rem', lineHeight: 1.6 }}>
                    {isOrderingInformation
                        ? <>Tải ảnh sơ đồ/thứ tự sự kiện và khai báo answer bank A-F bên dưới. Mỗi ô đáp án sẽ lưu một chữ cái tương ứng.</>
                        : answerMode === 'text_input' && textInputLayout === 'question_count'
                            ? <>Tải ảnh flowchart, chọn số câu question bên dưới rồi nhập đáp án đúng cho từng Q.</>
                            : <>Tải ảnh flowchart, sau đó nhập các dòng mô tả bên dưới giống đề thật và chèn token <strong>[Qx]</strong> vào đúng vị trí cần điền.</>}
                </div>

                {!isOrderingInformation && (
                    <div style={{ display: 'grid', gap: '8px', marginTop: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Kiểu trả lời</span>
                            <Radio.Group
                                size="small"
                                value={answerMode}
                                onChange={(event) => updateAnswerMode(event.target.value)}
                            >
                                <Radio.Button value="text_input">Điền từ</Radio.Button>
                                <Radio.Button value="shared_option_bank">Chọn từ answer bank</Radio.Button>
                            </Radio.Group>
                        </div>
                        {answerMode === 'text_input' && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Cách nhập</span>
                                <Radio.Group
                                    size="small"
                                    value={textInputLayout}
                                    onChange={(event) => updateTextInputLayout(event.target.value)}
                                >
                                    <Radio.Button value="template">Có sentence + [Qx]</Radio.Button>
                                    <Radio.Button value="question_count">Chỉ nhập số câu</Radio.Button>
                                </Radio.Group>
                            </div>
                        )}
                    </div>
                )}

                {assets.imageUrl ? (
                    <div style={{ marginTop: '12px', textAlign: 'center' }}>
                        <img
                            src={assets.imageUrl}
                            alt="Flowchart"
                            style={{ maxWidth: '100%', maxHeight: 360, objectFit: 'contain', borderRadius: '12px', border: '1px solid #dbeafe' }}
                        />
                    </div>
                ) : (
                    <div style={{ marginTop: '12px' }}>
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="Tải ảnh flowchart lên để xem preview"
                        />
                    </div>
                )}
            </div>

            {answerMode === 'text_input' && !isOrderingInformation ? (
                <>
                    {textInputLayout === 'template' ? (
                        <div style={{ background: '#f8fbff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.8125rem' }}>
                                    Template nội dung dưới flowchart
                                </div>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <Button
                                        size="small"
                                        type="primary"
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            activeEditorRef.current = editorRef.current;
                                            editorRef.current?.insertQ(nextQNum);
                                        }}
                                    >
                                        Thêm ô trống [Q{nextQNum}]
                                    </Button>
                                    <Button
                                        size="small"
                                        icon={<BoldOutlined />}
                                        onMouseDown={(event) => {
                                            event.preventDefault();
                                            activeEditorRef.current = editorRef.current;
                                            editorRef.current?.toggleBold();
                                        }}
                                    >
                                        In đậm
                                    </Button>
                                </div>
                            </div>
                            <TiptapQxEditor
                                ref={(instance) => {
                                    editorRef.current = instance;
                                }}
                                value={group.contentData ?? ''}
                                placeholder={'Nhập các dòng sentence/note dưới hình và chèn [Qx] vào chỗ trống cần điền.'}
                                minHeight="180px"
                                enableMarkdownBold
                                onFocus={() => {
                                    activeEditorRef.current = editorRef.current;
                                }}
                                onChange={syncQuestionsFromTemplate}
                            />
                        </div>
                    ) : (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Số câu question</span>
                                <InputNumber
                                    min={MIN_ANSWER_COUNT}
                                    max={MAX_ANSWER_COUNT}
                                    value={answerCount}
                                    size="middle"
                                    style={{ width: 110 }}
                                    onChange={updateAnswerCount}
                                />
                            </div>
                        </div>
                    )}
                    {renderTextInputAnswers()}
                </>
            ) : (
                <>
                    <div style={{ background: '#f8fbff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                            <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.8125rem' }}>Answer Bank</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                {!isOrderingInformation && (
                                    <>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Kiểu nhãn:</span>
                                        <Radio.Group
                                            size="small"
                                            value={optionLabelType}
                                            onChange={(event) => updateOptionLabelType(event.target.value)}
                                        >
                                            <Radio.Button value="alpha">A, B, C</Radio.Button>
                                            <Radio.Button value="roman">i, ii, iii</Radio.Button>
                                        </Radio.Group>
                                    </>
                                )}
                                <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Số lượng options</span>
                                <InputNumber
                                    value={sharedOptions.length}
                                    min={MIN_OPTION_COUNT}
                                    max={MAX_OPTION_COUNT}
                                    size="middle"
                                    style={{ width: 110 }}
                                    onChange={updateSharedOptionCount}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                            {sharedOptions.map((option, optionIdx) => (
                                <div
                                    key={optionIdx}
                                    style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #dbeafe', display: 'flex', gap: '8px', alignItems: 'center' }}
                                >
                                    <Tag color="cyan" style={{ marginInlineEnd: 0 }}>
                                        {getOptionLabel(optionIdx, optionLabelType)}
                                    </Tag>
                                    <Input
                                        size="middle"
                                        value={option.optionText ?? ''}
                                        placeholder="Nhập nội dung lựa chọn"
                                        style={{ flex: 1 }}
                                        onChange={(event) => updateSharedOptionText(optionIdx, event.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Số ô đáp án</span>
                            <InputNumber
                                min={MIN_ANSWER_COUNT}
                                max={MAX_ANSWER_COUNT}
                                value={answerCount}
                                size="middle"
                                style={{ width: 110 }}
                                onChange={updateAnswerCount}
                            />
                        </div>
                    </div>

                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '12px' }}>
                        <div style={{ fontWeight: 700, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                            Đáp án cho từng ô
                        </div>
                        {group.questions.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                                Tăng số ô đáp án để bắt đầu map đáp án đúng.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gap: '8px' }}>
                                {group.questions.map((question, questionIndex) => (
                                    (() => {
                                        const selectedAnswers = new Set(
                                            group.questions
                                                .map((item, index) => index === questionIndex ? null : item.correctAnswer)
                                                .filter((item): item is string => !!item),
                                        );

                                        const selectableOptions = sharedOptions
                                            .map((_, optionIndex) => {
                                                const label = getOptionLabel(optionIndex, optionLabelType);
                                                return { label, value: label };
                                            })
                                            .filter((option) =>
                                                option.value === question.correctAnswer || !selectedAnswers.has(option.value),
                                            );

                                        return (
                                            <div key={question.questionNumber ?? questionIndex} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                                                    Q{question.questionNumber ?? groupStartNum + questionIndex}
                                                </Tag>
                                                <Select
                                                    allowClear
                                                    size="middle"
                                                    placeholder="Chọn đáp án"
                                                    value={question.correctAnswer || undefined}
                                                    style={{ width: 180 }}
                                                    onChange={(value) => updateQuestionAnswer(questionIndex, value)}
                                                    options={selectableOptions}
                                                />
                                            </div>
                                        );
                                    })()
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
