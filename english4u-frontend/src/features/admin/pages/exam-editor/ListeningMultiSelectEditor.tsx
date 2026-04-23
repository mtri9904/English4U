import { Input, InputNumber, Tag } from 'antd';
import type {
    CreateQuestionDto,
    CreateQuestionGroupDto,
    CreateQuestionOptionDto,
} from '../../types/exam.types';
import { emptyOption, emptyQuestion } from './examEditor.helpers';
import { getCleanPastedInputValue } from '@/shared/utils/input';

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

const normalizeSelectedAnswers = (
    answers: string[],
    optionCount: number,
    answerCount: number,
): string[] => {
    const maxIndex = optionCount - 1;
    const uniqueAnswers: string[] = [];
    const seen = new Set<string>();

    answers.forEach((answer) => {
        const normalized = normalizeAnswer(answer);
        if (!normalized || seen.has(normalized)) return;

        const optionIndex = normalized.charCodeAt(0) - 65;
        if (optionIndex < 0 || optionIndex > maxIndex) return;

        seen.add(normalized);
        uniqueAnswers.push(normalized);
    });

    return uniqueAnswers.slice(0, answerCount);
};

const applySelectedAnswers = (
    questions: CreateQuestionDto[],
    selectedAnswers: string[],
): CreateQuestionDto[] => (
    questions.map((question, index) => ({
        ...question,
        content: '',
        correctAnswer: selectedAnswers[index],
    }))
);



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
    const selectedAnswers = normalizeSelectedAnswers(
        workingQuestions.map((question) => question.correctAnswer ?? ''),
        sharedOptions.length,
        answerCount,
    );
    const prompt = parsePrompt(group.contentData, group.questions[0]?.content ?? '');
    const questionRangeLabel = `Questions ${groupStartNum}-${groupStartNum + answerCount - 1}`;

    const updateGroup = (partial: Partial<CreateQuestionGroupDto>) => {
        const nextPrompt = typeof partial.contentData === 'string'
            ? parsePrompt(partial.contentData, prompt)
            : prompt;
        const updatedGroups = [...groups];
        updatedGroups[groupIdx] = {
            ...group,
            ...partial,
            contentData: buildContentData(nextPrompt),
        };
        onUpdate(updatedGroups);
    };

    const updatePrompt = (nextPrompt: string) => {
        const nextQuestions = applySelectedAnswers(
            normalizeQuestions(workingQuestions, sharedOptions, answerCount),
            selectedAnswers,
        );
        updateGroup({
            contentData: buildContentData(nextPrompt),
            questions: nextQuestions,
        });
    };

    const updateAnswerCount = (count?: number | null) => {
        const nextAnswerCount = normalizeAnswerCount(count);
        const nextSelectedAnswers = normalizeSelectedAnswers(
            selectedAnswers,
            sharedOptions.length,
            nextAnswerCount,
        );
        updateGroup({
            questions: applySelectedAnswers(
                normalizeQuestions(workingQuestions, sharedOptions, nextAnswerCount),
                nextSelectedAnswers,
            ),
        });
    };

    const updateOptions = (nextOptions: CreateQuestionOptionDto[]) => {
        const normalizedCount = normalizeAnswerCount(workingQuestions.length || MIN_ANSWER_COUNT);
        const nextSelectedAnswers = normalizeSelectedAnswers(
            selectedAnswers,
            nextOptions.length,
            normalizedCount,
        );
        updateGroup({
            questions: applySelectedAnswers(
                normalizeQuestions(workingQuestions, nextOptions, normalizedCount),
                nextSelectedAnswers,
            ),
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

    const updateCorrectAnswers = (values: string[]) => {
        const nextSelectedAnswers = normalizeSelectedAnswers(
            values,
            sharedOptions.length,
            answerCount,
        );

        updateGroup({
            questions: applySelectedAnswers(
                normalizeQuestions(workingQuestions, sharedOptions, answerCount),
                nextSelectedAnswers,
            ),
        });
    };

    const toggleCorrectAnswer = (answer: string) => {
        const normalized = normalizeAnswer(answer);
        if (!normalized) return;

        const isSelected = selectedAnswers.includes(normalized);
        if (!isSelected && selectedAnswers.length >= answerCount) {
            return;
        }

        const nextSelectedAnswers = isSelected
            ? selectedAnswers.filter((item) => item !== normalized)
            : [...selectedAnswers, normalized];

        updateCorrectAnswers(nextSelectedAnswers);
    };

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', marginBottom: '8px' }}>
            <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '8px', fontSize: '0.8125rem' }}>
                MCQ_CHOOSE_N - 1 block option chung, N ô đáp án
            </div>

            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#334155' }}>Số ô đáp án / số câu</span>
                <InputNumber
                    value={answerCount}
                    min={MIN_ANSWER_COUNT}
                    max={MAX_ANSWER_COUNT}
                    size="middle"
                    style={{ width: 110 }}
                    onChange={updateAnswerCount}
                />
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Mỗi ô tương ứng 1 question number: Q{groupStartNum} - Q{groupStartNum + answerCount - 1}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Chọn đúng {answerCount} đáp án bằng ô vuông cạnh mỗi lựa chọn.
                </span>
            </div>

            <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.8125rem', marginBottom: '6px' }}>
                Câu hỏi chung
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

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.8125rem' }}>Danh sách lựa chọn chung</span>
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
                <div style={{ marginBottom: '10px', padding: '10px', border: '1px solid #dbeafe', background: '#eff6ff', borderRadius: '8px' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                        {questionRangeLabel}
                    </div>
                    <div style={{ color: '#1e293b', fontSize: '0.9375rem', lineHeight: 1.5, fontStyle: prompt.trim() ? 'normal' : 'italic' }}>
                        {prompt.trim() || `Nhập prompt chung cho ${answerCount} ô đáp án của nhóm này.`}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sharedOptions.map((option, optionIdx) => (
                        <div key={optionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <Tag color="blue" style={{ marginInlineEnd: 0, minWidth: 30, textAlign: 'center', borderRadius: '999px' }}>
                                {toLetter(optionIdx)}
                            </Tag>
                            <button
                                type="button"
                                style={{
                                    width: '16px',
                                    height: '16px',
                                    border: selectedAnswers.includes(toLetter(optionIdx)) ? '1px solid #2563eb' : '1px solid #94a3b8',
                                    borderRadius: '2px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: selectedAnswers.includes(toLetter(optionIdx)) ? '#dbeafe' : '#fff',
                                    flexShrink: 0,
                                    color: '#1d4ed8',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: selectedAnswers.includes(toLetter(optionIdx)) || selectedAnswers.length < answerCount ? 'pointer' : 'not-allowed',
                                    padding: 0,
                                }}
                                onClick={() => toggleCorrectAnswer(toLetter(optionIdx))}
                                title={`Chọn đáp án ${toLetter(optionIdx)}`}
                            >
                                {selectedAnswers.includes(toLetter(optionIdx)) ? '✓' : ''}
                            </button>
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
                <div style={{ marginTop: '10px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {selectedAnswers.length > 0 ? selectedAnswers.map((answer) => (
                        <Tag key={answer} color="blue" style={{ marginInlineEnd: 0 }}>
                            [{answer}]
                        </Tag>
                    )) : (
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Chưa chọn đáp án</span>
                    )}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {Array.from({ length: answerCount }, (_, index) => {
                        const questionNumber = groupStartNum + index;
                        const answer = selectedAnswers[index];
                        return (
                            <Tag key={questionNumber} style={{ marginInlineEnd: 0 }}>
                                Q{questionNumber}: {answer ?? '—'}
                            </Tag>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
