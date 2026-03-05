import type { ClipboardEvent } from 'react';
import { Button, Input, InputNumber, Select, Tag } from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import type {
    CreateQuestionDto,
    CreateQuestionGroupDto,
    CreateQuestionOptionDto,
} from '../../types/exam.types';
import { buildCleanPastedValue, emptyOption, emptyQuestion } from './examEditor.helpers';

interface ListeningMultiSelectEditorProps {
    group: CreateQuestionGroupDto;
    groups: CreateQuestionGroupDto[];
    groupIdx: number;
    groupStartNum: number;
    onUpdate: (groups: CreateQuestionGroupDto[]) => void;
}

interface ListeningMultiSelectContentData {
    layout: 'listening_multi_select';
    prompt: string;
}

const MIN_ANSWER_COUNT = 1;
const MAX_ANSWER_COUNT = 20;
const MIN_OPTION_COUNT = 2;
const MAX_OPTION_COUNT = 26;
const DEFAULT_OPTION_COUNT = 7;

const toLetter = (index: number) => String.fromCharCode(65 + index);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeAnswer = (value?: string) => {
    if (!value) return undefined;
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]$/.test(normalized) ? normalized : undefined;
};

const cloneOptions = (options: CreateQuestionOptionDto[]) => (
    options.map((option, index) => ({
        ...option,
        orderIndex: index,
    }))
);

const parsePrompt = (contentData?: string, fallback = '') => {
    if (!contentData) return fallback;

    try {
        const parsed = JSON.parse(contentData) as unknown;
        if (typeof parsed === 'string') return parsed;

        if (parsed && typeof parsed === 'object' && (parsed as { layout?: unknown }).layout === 'listening_multi_select') {
            const prompt = (parsed as { prompt?: unknown }).prompt;
            return typeof prompt === 'string' ? prompt : fallback;
        }
    } catch {
        return contentData;
    }

    return contentData;
};

const buildContentData = (prompt: string): string => {
    const payload: ListeningMultiSelectContentData = {
        layout: 'listening_multi_select',
        prompt,
    };

    return JSON.stringify(payload);
};

const createDefaultOptions = (): CreateQuestionOptionDto[] => (
    Array.from({ length: DEFAULT_OPTION_COUNT }, (_, index) => emptyOption(index))
);

const normalizeOptionCount = (count?: number | null) => {
    const safe = Number.isFinite(count) ? Math.trunc(count as number) : DEFAULT_OPTION_COUNT;
    return clamp(safe, MIN_OPTION_COUNT, MAX_OPTION_COUNT);
};

const normalizeAnswerCount = (count?: number | null) => {
    const safe = Number.isFinite(count) ? Math.trunc(count as number) : MIN_ANSWER_COUNT;
    return clamp(safe, MIN_ANSWER_COUNT, MAX_ANSWER_COUNT);
};

const normalizeQuestions = (
    questions: CreateQuestionDto[],
    options: CreateQuestionOptionDto[],
    answerCount: number,
): CreateQuestionDto[] => {
    const normalizedOptions = cloneOptions(options);

    return Array.from({ length: answerCount }, (_, index) => {
        const existing = questions[index];
        const answer = normalizeAnswer(existing?.correctAnswer);
        const answerIndex = answer ? answer.charCodeAt(0) - 65 : -1;

        return {
            ...(existing ?? emptyQuestion()),
            content: '',
            correctAnswer: answerIndex >= 0 && answerIndex < normalizedOptions.length ? answer : undefined,
            options: cloneOptions(normalizedOptions),
        };
    });
};

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

export const ListeningMultiSelectEditor = ({
    group,
    groups,
    groupIdx,
    groupStartNum,
    onUpdate,
}: ListeningMultiSelectEditorProps) => {
    const sharedOptions = group.questions[0]?.options?.length
        ? cloneOptions(group.questions[0].options)
        : createDefaultOptions();
    const answerCount = normalizeAnswerCount(group.questions.length || MIN_ANSWER_COUNT);
    const workingQuestions = group.questions.length > 0
        ? group.questions
        : normalizeQuestions([], sharedOptions, answerCount);
    const prompt = parsePrompt(group.contentData, group.questions[0]?.content ?? '');

    const updateGroup = (partial: Partial<CreateQuestionGroupDto>) => {
        const updatedGroups = [...groups];
        updatedGroups[groupIdx] = {
            ...group,
            ...partial,
        };
        onUpdate(updatedGroups);
    };

    const updatePrompt = (nextPrompt: string) => {
        const nextQuestions = normalizeQuestions(workingQuestions, sharedOptions, answerCount);
        updateGroup({
            contentData: buildContentData(nextPrompt),
            questions: nextQuestions,
        });
    };

    const updateAnswerCount = (count?: number | null) => {
        const nextAnswerCount = normalizeAnswerCount(count);
        updateGroup({
            questions: normalizeQuestions(workingQuestions, sharedOptions, nextAnswerCount),
        });
    };

    const updateOptions = (nextOptions: CreateQuestionOptionDto[]) => {
        const normalizedCount = normalizeAnswerCount(workingQuestions.length || MIN_ANSWER_COUNT);
        updateGroup({
            questions: normalizeQuestions(workingQuestions, nextOptions, normalizedCount),
        });
    };

    const updateOptionText = (optionIdx: number, value: string) => {
        const nextOptions = cloneOptions(sharedOptions);
        nextOptions[optionIdx] = {
            ...nextOptions[optionIdx],
            optionText: value,
        };
        updateOptions(nextOptions);
    };

    const updateOptionCount = (count?: number | null) => {
        const nextCount = normalizeOptionCount(count);
        const nextOptions = Array.from({ length: nextCount }, (_, index) => (
            sharedOptions[index]
                ? { ...sharedOptions[index], orderIndex: index }
                : emptyOption(index)
        ));
        updateOptions(nextOptions);
    };

    const selectedAnswers = workingQuestions.map((question) => normalizeAnswer(question.correctAnswer));

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '8px' }}>
            <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '8px', fontSize: '0.8125rem' }}>
                Multiple Choice (1 câu hỏi - nhiều đáp án)
            </div>

            <Input.TextArea
                value={prompt}
                placeholder="Nhập câu hỏi chung (VD: Which THREE topics are they interested in...?)"
                title="Câu hỏi chung cho toàn bộ nhóm đáp án"
                autoSize={{ minRows: 2, maxRows: 6 }}
                size="middle"
                style={{ marginBottom: '10px' }}
                onPaste={(event) => {
                    const nextValue = getCleanPastedInputValue(event, prompt ?? '');
                    if (nextValue === null) return;
                    updatePrompt(nextValue);
                }}
                onChange={(event) => updatePrompt(event.target.value)}
            />

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>Số câu trả lời</span>
                <InputNumber
                    value={answerCount}
                    min={MIN_ANSWER_COUNT}
                    max={MAX_ANSWER_COUNT}
                    size="middle"
                    style={{ width: 110 }}
                    onChange={updateAnswerCount}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Hệ thống tạo Q{groupStartNum} - Q{groupStartNum + answerCount - 1}
                </span>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.8125rem' }}>Danh sách lựa chọn (A-Z)</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Số lượng</span>
                    <InputNumber
                        value={sharedOptions.length}
                        min={MIN_OPTION_COUNT}
                        max={MAX_OPTION_COUNT}
                        size="small"
                        style={{ width: 100 }}
                        onChange={updateOptionCount}
                    />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {sharedOptions.map((option, optionIdx) => (
                        <div key={optionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Tag color="blue" style={{ marginInlineEnd: 0, minWidth: 30, textAlign: 'center' }}>
                                {toLetter(optionIdx)}
                            </Tag>
                            <Input
                                value={option.optionText}
                                placeholder={`Nội dung lựa chọn ${toLetter(optionIdx)}`}
                                size="middle"
                                style={{ height: '36px' }}
                                onPaste={(event) => {
                                    const nextValue = getCleanPastedInputValue(event, option.optionText ?? '');
                                    if (nextValue === null) return;
                                    updateOptionText(optionIdx, nextValue);
                                }}
                                onChange={(event) => updateOptionText(optionIdx, event.target.value)}
                            />
                        </div>
                    ))}
                </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px' }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.8125rem', marginBottom: '8px' }}>
                    Chọn đáp án cho từng câu
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {workingQuestions.map((question, questionIdx) => (
                        <div key={questionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Tag color="blue" style={{ marginInlineEnd: 0 }}>
                                Q{question.questionNumber || groupStartNum + questionIdx}
                            </Tag>
                            <Select
                                value={normalizeAnswer(question.correctAnswer)}
                                size="middle"
                                placeholder="Chọn đáp án"
                                style={{ width: 140 }}
                                options={sharedOptions.map((_, optionIdx) => {
                                    const letter = toLetter(optionIdx);
                                    const usedByAnother = selectedAnswers.some((answer, idx) => idx !== questionIdx && answer === letter);
                                    return { label: letter, value: letter, disabled: usedByAnother };
                                })}
                                onChange={(value) => {
                                    const nextQuestions = [...workingQuestions];
                                    nextQuestions[questionIdx] = {
                                        ...question,
                                        content: '',
                                        correctAnswer: value,
                                        options: cloneOptions(sharedOptions),
                                    };
                                    updateGroup({ questions: nextQuestions });
                                }}
                            />
                            {workingQuestions.length > MIN_ANSWER_COUNT && (
                                <Button
                                    type="text"
                                    danger
                                    icon={<MinusCircleOutlined />}
                                    onClick={() => {
                                        const nextQuestions = workingQuestions.filter((_, index) => index !== questionIdx);
                                        updateGroup({
                                            questions: normalizeQuestions(nextQuestions, sharedOptions, nextQuestions.length),
                                        });
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
                <Button
                    type="default"
                    size="small"
                    icon={<PlusOutlined />}
                    style={{ marginTop: '10px', height: '32px' }}
                    onClick={() => updateAnswerCount(workingQuestions.length + 1)}
                >
                    Thêm câu trả lời
                </Button>
            </div>
        </div>
    );
};
