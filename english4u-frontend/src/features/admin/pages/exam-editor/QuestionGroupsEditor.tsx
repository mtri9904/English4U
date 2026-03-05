import { useRef, type ClipboardEvent, type MutableRefObject } from 'react';
import { Button, Input, InputNumber, Select, Tag } from 'antd';
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
    buildCleanPastedValue,
    COMPLEX_LAYOUT_GROUP_TYPES,
    GROUP_TYPE_OPTIONS,
    TABLE_LAYOUT_GROUP_TYPES,
    emptyGroup,
    emptyOption,
    emptyQuestion,
    getOptionsForType,
} from './examEditor.helpers';
import { GenericTableEditor } from './GenericTableEditor';
import { FlowchartEditor } from './FlowchartEditor';
import { MapLabellingEditor } from './MapLabellingEditor';
import { ListeningMultiSelectEditor } from './ListeningMultiSelectEditor';

interface QuestionGroupsEditorProps {
    groups: CreateQuestionGroupDto[];
    skill: 'Reading' | 'Listening';
    onUpdate: (groups: CreateQuestionGroupDto[]) => void;
    startQNum?: number;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

export const QuestionGroupsEditor = ({
    groups,
    skill,
    onUpdate,
    startQNum = 1,
    activeEditorRef,
    uploading = false,
    handleUploadFile,
}: QuestionGroupsEditorProps) => {
    const typeOptions = GROUP_TYPE_OPTIONS[skill] ?? [];
    let runningQNum = startQNum;
    const instructionEditorRefs = useRef<Record<number, TiptapQxEditorRef | null>>({});

    const getCleanPastedInputValue = (
        event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
        currentValue: string,
    ) => {
        const pasted = event.clipboardData.getData('text');
        if (!pasted) return null;

        event.preventDefault();
        const target = event.target as HTMLInputElement | HTMLTextAreaElement;
        return buildCleanPastedValue(
            currentValue,
            pasted,
            target.selectionStart,
            target.selectionEnd,
        );
    };

    const applyGroupTypeToQuestions = (questions: CreateQuestionDto[], groupType?: string) => {
        const defaultOptions = getOptionsForType(groupType);
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

    const getTemplatePlaceholder = (groupType?: string) => {
        if (groupType === QUESTION_TYPES.SENTENCE_COMPLETION) {
            return 'Nhập câu/đoạn và chèn [Q1], [Q2] tại vị trí cần điền.';
        }
        if (groupType === QUESTION_TYPES.SUMMARY_COMPLETION) {
            return 'Nhập đoạn summary và chèn [Q1], [Q2]... vào các chỗ trống.';
        }
        if (groupType === QUESTION_TYPES.FLOWCHART_COMPLETION) {
            return 'Nhập nội dung flowchart và chèn [Qx] vào các ô cần điền.';
        }
        return 'Nội dung template (Ví dụ: [Q1] is a good [Q2])';
    };

    const renderQuestion = (
        question: CreateQuestionDto,
        questionIdx: number,
        group: CreateQuestionGroupDto,
        groupIdx: number,
    ) => {
        const groupType = group.groupType ?? '';
        const hasOptions = SINGLE_CHOICE_TYPES.has(groupType) || MULTI_CHOICE_TYPES.has(groupType) || MATCHING_TYPES.has(groupType);
        const isFillType = FILL_TYPES.has(groupType) || groupType === QUESTION_TYPES.SUMMARY_COMPLETION;
        const isTFNGType = groupType === QUESTION_TYPES.TFNG || groupType === QUESTION_TYPES.YNNG;

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
                        Câu {question.questionNumber || questionIdx + 1}
                    </span>
                    <InputNumber
                        value={question.points}
                        min={0}
                        size="small"
                        style={{ width: 70 }}
                        placeholder="Điểm"
                        onChange={(value) => updateQuestion({ points: value ?? 1 })}
                    />
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
                <Input.TextArea
                    value={question.content ?? ''}
                    placeholder={isFillType ? 'Nội dung (dùng ___ cho chỗ trống)' : 'Nội dung câu hỏi'}
                    title={isFillType ? 'Nhập nội dung và dùng ___ cho chỗ trống' : 'Nhập nội dung câu hỏi'}
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

                {isFillType && (
                    <Input
                        value={question.correctAnswer ?? ''}
                        placeholder="Đáp án đúng (dùng | phân cách nhiều đáp án)"
                        title="Nhập đáp án đúng, có thể dùng | để nhập nhiều đáp án"
                        size="middle"
                        style={{ borderColor: '#10b981', marginBottom: '6px', height: '38px' }}
                        onChange={(event) => updateQuestion({ correctAnswer: event.target.value })}
                    />
                )}

                {hasOptions && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {question.options.map((option, optionIdx) => (
                            <div key={optionIdx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input
                                    type="checkbox"
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
                                <Input
                                    value={option.optionText}
                                    disabled={isTFNGType}
                                    placeholder={isTFNGType ? option.optionText : `Lựa chọn ${String.fromCharCode(65 + optionIdx)}`}
                                    title={isTFNGType ? 'Giá trị cố định cho dạng TF/NG hoặc Y/N/NG' : 'Nhập nội dung lựa chọn'}
                                    size="small"
                                    style={{ flex: 1 }}
                                    onChange={(event) => {
                                        const options = [...question.options];
                                        options[optionIdx] = { ...option, optionText: event.target.value };
                                        updateQuestion({ options });
                                    }}
                                />
                                {!isTFNGType && question.options.length > 1 && (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<MinusCircleOutlined />}
                                        size="small"
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
                const groupType = group.groupType ?? '';
                const isComplexLayout = COMPLEX_LAYOUT_GROUP_TYPES.has(groupType);
                const isMatchingType = MATCHING_TYPES.has(groupType);
                const isSummaryType = groupType === QUESTION_TYPES.SUMMARY_COMPLETION;
                const isTableType = TABLE_LAYOUT_GROUP_TYPES.has(groupType);
                const isFlowchartType = groupType === QUESTION_TYPES.FLOWCHART_COMPLETION;
                const isMapLabellingType = groupType === QUESTION_TYPES.MAP_LABELLING;
                const isListeningMultiSelectGroup = skill === 'Listening' && groupType === QUESTION_TYPES.MCQ_MULTIPLE;
                const showOptionsBox = isMatchingType || isSummaryType;

                const groupStartNum = runningQNum;
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
                    const newQuestions = sortedNumbers.map((number) => {
                        const existing = group.questions.find((question) => question.questionNumber === number);
                        return existing || { ...emptyQuestion(), questionNumber: number };
                    });

                    const updatedGroups = [...groups];
                    updatedGroups[groupIdx] = { ...group, contentData: newContent, questions: newQuestions };
                    onUpdate(updatedGroups);
                };

                const insertBlankAtCursor = () => {
                    if (activeEditorRef.current) {
                        activeEditorRef.current.insertQ(nextQToInsert);
                    }
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
                                    value={group.groupType}
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
                                        const previousIsFlowchart = previousType === QUESTION_TYPES.FLOWCHART_COMPLETION;
                                        const nextIsFlowchart = value === QUESTION_TYPES.FLOWCHART_COMPLETION;
                                        const previousIsMapLabelling = previousType === QUESTION_TYPES.MAP_LABELLING;
                                        const nextIsMapLabelling = value === QUESTION_TYPES.MAP_LABELLING;
                                        const previousIsStructuredLayout = previousIsTable || previousIsFlowchart;
                                        const nextIsStructuredLayout = nextIsTable || nextIsFlowchart;

                                        let nextQuestions = applyGroupTypeToQuestions(group.questions, value);
                                        let nextContentData = group.contentData;
                                        let nextAssetsData = group.assetsData;

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
                                                options: getOptionsForType(value),
                                            }];
                                        }

                                        if (nextIsMapLabelling) {
                                            const mapOptions = getOptionsForType(value);
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
                                        }

                                        if (!nextIsMapLabelling && previousIsMapLabelling) {
                                            nextAssetsData = undefined;
                                        }

                                        const updatedGroups = [...groups];
                                        updatedGroups[groupIdx] = {
                                            ...group,
                                            groupType: value,
                                            contentData: nextContentData,
                                            assetsData: nextAssetsData,
                                            questions: nextQuestions,
                                        };
                                        onUpdate(updatedGroups);
                                    }}
                                    options={typeOptions}
                                />
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

                        {isListeningMultiSelectGroup && (
                            <ListeningMultiSelectEditor
                                group={group}
                                groups={groups}
                                groupIdx={groupIdx}
                                groupStartNum={groupStartNum}
                                onUpdate={onUpdate}
                            />
                        )}

                        {isComplexLayout && !isMapLabellingType && (
                            <div style={{ marginBottom: '10px' }}>
                                {!isTableType && !isFlowchartType && (
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                        <Button
                                            size="small"
                                            type="primary"
                                            onMouseDown={(event) => {
                                                event.preventDefault();
                                                insertBlankAtCursor();
                                            }}
                                        >
                                            Thêm ô trống [Q{nextQToInsert}]
                                        </Button>
                                    </div>
                                )}
                                {isTableType ? (
                                    <GenericTableEditor
                                        contentData={group.contentData}
                                        nextQNum={nextQToInsert}
                                        onChange={handleContentChange}
                                        activeEditorRef={activeEditorRef}
                                    />
                                ) : isFlowchartType ? (
                                    <FlowchartEditor
                                        contentData={group.contentData}
                                        nextQNum={nextQToInsert}
                                        onChange={handleContentChange}
                                        activeEditorRef={activeEditorRef}
                                    />
                                ) : (
                                    <TiptapQxEditor
                                        ref={activeEditorRef}
                                        value={group.contentData ?? ''}
                                        placeholder={getTemplatePlaceholder(groupType)}
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
                                                    placeholder="Nội dung item..."
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
                                            {showOptionsBox ? (
                                                <Select
                                                    size="middle"
                                                    placeholder="Đáp án"
                                                    value={question.correctAnswer || undefined}
                                                    style={{ width: '100px', border: '1px solid #10b981', borderRadius: '4px' }}
                                                    onChange={(value) => {
                                                        const updatedGroups = [...groups];
                                                        updatedGroups[groupIdx].questions[questionIdx] = {
                                                            ...question,
                                                            correctAnswer: value,
                                                        };
                                                        onUpdate(updatedGroups);
                                                    }}
                                                    options={(group.questions[0]?.options || []).map((_, index) => {
                                                        const label = String.fromCharCode(65 + index);
                                                        return { label, value: label };
                                                    })}
                                                />
                                            ) : (
                                                <Input
                                                    size="middle"
                                                    placeholder="Đáp án"
                                                    title="Nhập đáp án cho câu hỏi"
                                                    value={question.correctAnswer ?? ''}
                                                    style={{ width: '120px', borderColor: '#10b981', height: '38px' }}
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
                                                const updatedGroups = [...groups];
                                                const newQuestion = {
                                                    ...emptyQuestion(),
                                                    options: group.questions[0]?.options || [],
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
                                            {(group.questions[0]?.options || []).map((option, optionIdx) => (
                                                <div key={optionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <b style={{ color: '#0ea5e9', width: '20px', textAlign: 'center' }}>
                                                        {String.fromCharCode(65 + optionIdx)}
                                                    </b>
                                                    <Input
                                                        size="small"
                                                        value={option.optionText}
                                                        placeholder="Nội dung..."
                                                        title="Nội dung lựa chọn"
                                                        style={{ flex: 1 }}
                                                        onChange={(event) => {
                                                            const updatedGroups = [...groups];
                                                            const newOptions = [...(group.questions[0]?.options || [])];
                                                            newOptions[optionIdx] = { ...option, optionText: event.target.value };
                                                            updatedGroups[groupIdx].questions = group.questions.map((question) => ({
                                                                ...question,
                                                                options: newOptions,
                                                            }));
                                                            onUpdate(updatedGroups);
                                                        }}
                                                    />
                                                    <Button
                                                        type="text"
                                                        danger
                                                        icon={<MinusCircleOutlined />}
                                                        size="small"
                                                        onClick={() => {
                                                            const updatedGroups = [...groups];
                                                            const newOptions = (group.questions[0]?.options || []).filter((_, index) => index !== optionIdx);
                                                            updatedGroups[groupIdx].questions = group.questions.map((question) => ({
                                                                ...question,
                                                                options: newOptions,
                                                            }));
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
                                                    const currentOptions = group.questions[0]?.options || [];
                                                    const newOptions = [...currentOptions, emptyOption(currentOptions.length)];
                                                    updatedGroups[groupIdx].questions = group.questions.map((question) => ({
                                                        ...question,
                                                        options: newOptions,
                                                    }));
                                                    onUpdate(updatedGroups);
                                                }}
                                            >
                                                Thêm lựa chọn mới vào Box
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {isComplexLayout && !isMatchingType && !isSummaryType && (
                            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px', marginBottom: '8px' }}>
                                <div style={{ fontWeight: 600, color: '#475569', marginBottom: '8px', fontSize: '0.8125rem' }}>
                                    Đáp án cho các ô trống
                                </div>
                                {group.questions.length === 0 ? (
                                    <div style={{ color: '#94a3b8', fontSize: '0.8125rem' }}>
                                        Thêm [Qx] trong template để tạo danh sách đáp án.
                                    </div>
                                ) : (
                                    group.questions.map((question, questionIdx) => (
                                        <div key={questionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                            <Tag color="blue">Q{question.questionNumber || groupStartNum + questionIdx}</Tag>
                                            <Input
                                                size="middle"
                                                placeholder="Đáp án"
                                                title="Nhập đáp án cho ô trống Qx"
                                                value={question.correctAnswer ?? ''}
                                                style={{ width: '220px', borderColor: '#10b981', height: '38px' }}
                                                onChange={(event) => {
                                                    const updatedGroups = [...groups];
                                                    updatedGroups[groupIdx].questions[questionIdx] = {
                                                        ...question,
                                                        correctAnswer: event.target.value,
                                                    };
                                                    onUpdate(updatedGroups);
                                                }}
                                            />
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

                        {!isComplexLayout && !isMatchingType && !isSummaryType && !isMapLabellingType && !isListeningMultiSelectGroup && (
                            <div style={{ marginTop: '10px' }}>
                                {group.questions.map((question, questionIdx) => renderQuestion(question, questionIdx, group, groupIdx))}
                                <Button
                                    type="default"
                                    icon={<PlusOutlined />}
                                    block
                                    size="small"
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
                                        const updatedGroups = [...groups];
                                        const newQuestion = {
                                            ...emptyQuestion(),
                                            options: getOptionsForType(group.groupType),
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
                            </div>
                        )}
                    </div>
                );
            })}
            <Button
                type="default"
                icon={<PlusOutlined />}
                block
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
                onClick={() => onUpdate([...groups, emptyGroup()])}
            >
                THÊM NHÓM CÂU HỎI MỚI (PHẦN NÀY)
            </Button>
        </div>
    );
};
