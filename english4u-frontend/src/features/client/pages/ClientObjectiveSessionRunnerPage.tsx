import { useEffect, useMemo, useRef, useState, type FC, type ReactNode } from 'react';
import {
    Alert,
    Button,
    Card,
    Empty,
    Input,
    Radio,
    Select,
    Space,
    Spin,
    Tag,
    Typography,
    Checkbox,
} from 'antd';
import {
    ArrowLeftOutlined,
    ClockCircleOutlined,
    SaveOutlined,
    SoundOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import ReactMarkdown from 'react-markdown';
import { getEffectiveMcqGroupType, getQuestionTypeLabel, inferQuestionGroupOptionLabelType, type OptionLabelType } from '@/shared/lib/examDisplay';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { usePracticeSessionQuery, useUpdatePracticeSessionAnswersMutation } from '../api/session.api';
import type {
    PracticeSessionDto,
    PracticeSessionAnswerDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
    PracticeSessionReadingPassageDto,
} from '../types/session.types';
import { getSkillLabel, isObjectiveSkill } from '../lib/sessionRouting';
import { TruthValueDefinitionTable } from '@/shared/components/TruthValueDefinitionTable';
import {
    getListeningAttemptMode,
    getListeningAudioPositionSeconds,
    getListeningResumePositionSeconds,
    setListeningAudioPositionSeconds,
    setListeningAttemptMode,
    type ListeningAttemptMode,
} from '../lib/listeningSessionState';

const { Title, Text } = Typography;

const MATCHING_TYPES = new Set([
    'MATCHING_HEADINGS',
    'MATCHING_INFO',
    'MATCHING_FEATURES',
    'MATCHING_CLASSIFICATION',
    'MATCHING_VISUALS',
    'MATCHING_TABLE',
    'MAP_LABELLING',
]);

const TABLE_TYPES = new Set([
    'TABLE_COMPLETION',
    'MATCHING_TABLE',
]);

const FILL_TYPES = new Set([
    'SENTENCE_COMPLETION',
    'SUMMARY_COMPLETION',
    'TABLE_COMPLETION',
    'FLOWCHART_COMPLETION',
    'SHORT_ANSWER',
    'SHORT_ANSWER_QUESTIONS',
]);

const TABLE_TITLE_PLACEHOLDER = 'Tiêu đề bảng';

const INLINE_TEMPLATE_INPUT_TYPES = new Set(['text', 'shared-select']);

type ObjectiveReviewAnswerMap = Record<string, PracticeSessionAnswerDto | undefined>;
type RenderQuestionAction = (params: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    compact?: boolean;
}) => ReactNode;

const getReviewAnswerState = (questionId: string, reviewAnswerMap?: ObjectiveReviewAnswerMap) => reviewAnswerMap?.[questionId];

const getReviewAnswerBorderColor = (answer?: PracticeSessionAnswerDto) => {
    if (answer?.isCorrect === true) return '#22c55e';
    if (answer?.isCorrect === false) return '#ef4444';
    return '#cbd5e1';
};

const getReviewAnswerBackground = (answer?: PracticeSessionAnswerDto) => {
    if (answer?.isCorrect === true) return '#f0fdf4';
    if (answer?.isCorrect === false) return '#fef2f2';
    return '#f8fafc';
};

const TEXT_ANSWER_BOX_GROUP_TYPES = new Set([
    'SUMMARY_COMPLETION',
    'FLOWCHART_COMPLETION',
    'ORDERING_INFORMATION',
]);

const resolveAnswerBoxText = (group: PracticeSessionQuestionGroupDto, rawAnswer: string) => {
    if (!TEXT_ANSWER_BOX_GROUP_TYPES.has((group.groupType ?? '').toUpperCase())) {
        return rawAnswer;
    }

    const options = getSharedOptions(group);
    if (options.length === 0) {
        return rawAnswer;
    }

    const optionLabelType = getGroupOptionLabelType(group);
    const resolvedTokens = rawAnswer
        .split('|')
        .map((token) => {
            const normalizedToken = normalizeChoiceToken(token);
            if (!normalizedToken) {
                return '';
            }

            const optionIndex = options.findIndex((_, index) => (
                normalizeChoiceToken(getOptionLabel(index, optionLabelType)) === normalizedToken
            ));
            const optionText = optionIndex >= 0 ? options[optionIndex]?.optionText?.trim() : '';
            return optionText || token.trim();
        })
        .filter((token) => token.length > 0);

    return resolvedTokens.length > 0 ? resolvedTokens.join(' | ') : rawAnswer;
};

const formatReviewCorrectAnswer = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
    answer?: PracticeSessionAnswerDto,
) => {
    const fromAnswer = (answer?.correctAnswer ?? '').trim();
    if (fromAnswer) return resolveAnswerBoxText(group, fromAnswer);

    const fromQuestion = (question.correctAnswer ?? '').trim();
    if (fromQuestion) return resolveAnswerBoxText(group, fromQuestion);

    return '';
};

const parseSharedPromptContent = (contentData?: string | null) => {
    if (!contentData) {
        return { prompt: '', isSharedPromptLayout: false };
    }

    try {
        const parsed = JSON.parse(contentData) as unknown;
        if (typeof parsed === 'string') {
            return { prompt: parsed, isSharedPromptLayout: false };
        }

        if (parsed && typeof parsed === 'object' && (parsed as { layout?: unknown }).layout === 'listening_multi_select') {
            return {
                prompt: typeof (parsed as { prompt?: unknown }).prompt === 'string'
                    ? (parsed as { prompt: string }).prompt
                    : '',
                isSharedPromptLayout: true,
            };
        }
    } catch {
        return { prompt: contentData, isSharedPromptLayout: false };
    }

    return { prompt: contentData, isSharedPromptLayout: false };
};

const parseFlowchartAssets = (assetsData?: string | null) => {
    if (!assetsData) {
        return { imageUrl: '', answerMode: 'text_input' as 'text_input' | 'shared_option_bank' };
    }

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        if (parsed && typeof parsed === 'object') {
            return {
                imageUrl:
                    typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string'
                        ? (parsed as { imageUrl: string }).imageUrl
                        : typeof (parsed as { url?: unknown }).url === 'string'
                            ? (parsed as { url: string }).url
                            : '',
                answerMode:
                    (parsed as { answerMode?: 'text_input' | 'shared_option_bank' }).answerMode ?? 'text_input',
            };
        }
    } catch {
        return { imageUrl: assetsData, answerMode: 'text_input' as const };
    }

    return { imageUrl: '', answerMode: 'text_input' as const };
};

const isImageUrl = (value?: string | null) => /^https?:\/\/.+/i.test((value ?? '').trim());

const parseAssetImageUrls = (assetsData?: string | null) => {
    if (!assetsData) {
        return [];
    }

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        if (typeof parsed === 'string') {
            return isImageUrl(parsed) ? [parsed.trim()] : [];
        }

        if (Array.isArray(parsed)) {
            return parsed
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => isImageUrl(item));
        }

        if (parsed && typeof parsed === 'object') {
            const singleImageCandidates = [
                (parsed as { imageUrl?: unknown }).imageUrl,
                (parsed as { url?: unknown }).url,
                (parsed as { assetUrl?: unknown }).assetUrl,
            ];
            const imageList = Array.isArray((parsed as { images?: unknown }).images)
                ? (parsed as { images: unknown[] }).images
                : [];

            return [
                ...singleImageCandidates,
                ...imageList,
            ]
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => isImageUrl(item));
        }
    } catch {
        return isImageUrl(assetsData) ? [assetsData.trim()] : [];
    }

    return [];
};

const getSharedListeningAudioUrl = (parts: PracticeSessionListeningPartDto[] = []) =>
    parts
        .map((part) => (part.audioUrl ?? '').trim())
        .find((audioUrl) => audioUrl.length > 0)
    ?? '';

const formatAudioTime = (seconds?: number | null) => {
    if (seconds == null || !Number.isFinite(seconds)) {
        return '0:00';
    }

    const totalSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
};

const getGroupOptionLabelType = (group: PracticeSessionQuestionGroupDto): OptionLabelType =>
    inferQuestionGroupOptionLabelType(group);

const getChoiceLabel = (optionText: string | null | undefined, index: number, optionLabelType: OptionLabelType) => {
    const label = getOptionLabel(index, optionLabelType);
    const trimmedText = (optionText ?? '').trim();
    return trimmedText ? `${label}. ${trimmedText}` : label;
};

const renderSelectableOptionContent = ({
    label,
    text,
    imageUrl,
}: {
    label: string;
    text?: string | null;
    imageUrl?: string | null;
}) => (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 8 }}>
        <span>
            <b>{label}.</b>{text?.trim() ? ` ${text}` : ''}
        </span>
        {imageUrl ? (
            <img
                src={imageUrl}
                alt={`Option ${label}`}
                style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: 220,
                    maxHeight: 160,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1px solid #dbeafe',
                }}
            />
        ) : null}
    </span>
);

const isMatchingVisualsGroup = (group: Pick<PracticeSessionQuestionGroupDto, 'groupType'>) =>
    (group.groupType ?? '').toUpperCase() === 'MATCHING_VISUALS';

const isClassificationMatchingGroup = (group: Pick<PracticeSessionQuestionGroupDto, 'groupType'>) =>
    (group.groupType ?? '').toUpperCase() === 'MATCHING_CLASSIFICATION';

const isFlowchartLikeGroup = (group: Pick<PracticeSessionQuestionGroupDto, 'groupType'>) =>
    (group.groupType ?? '').toUpperCase() === 'FLOWCHART_COMPLETION'
    || (group.groupType ?? '').toUpperCase() === 'ORDERING_INFORMATION';

const getSharedSelectOptions = (group: PracticeSessionQuestionGroupDto) => {
    const optionLabelType = getGroupOptionLabelType(group);
    const visualGroup = isMatchingVisualsGroup(group);

    return getSharedOptions(group).map((option, index) => {
        const value = getOptionLabel(index, optionLabelType);
        return {
            label: visualGroup ? value : getChoiceLabel(option.optionText, index, optionLabelType),
            value,
        };
    });
};

const MatchingVisualsOptionBank = ({
    options,
    optionLabelType,
}: {
    options: PracticeSessionQuestionDto['options'];
    optionLabelType: OptionLabelType;
}) => {
    if (options.length === 0) {
        return null;
    }

    return (
        <div
            style={{
                border: '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 14,
                background: '#eff6ff',
            }}
        >
            <Text strong style={{ display: 'block', marginBottom: 10 }}>Danh sách hình</Text>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12,
                }}
            >
                {options.map((option, index) => {
                    const label = getOptionLabel(index, optionLabelType);
                    const imageUrl = (option.optionText ?? '').trim();

                    return (
                        <div
                            key={option.id}
                            style={{
                                border: '1px solid #dbeafe',
                                borderRadius: 12,
                                padding: 10,
                                background: '#fff',
                            }}
                        >
                            <Tag color="blue" style={{ marginBottom: 8 }}>{label}</Tag>
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt={`Hình ${label}`}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        height: 120,
                                        objectFit: 'contain',
                                        borderRadius: 10,
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        height: 120,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 10,
                                        background: '#f8fafc',
                                        border: '1px dashed #cbd5e1',
                                        color: '#94a3b8',
                                        fontSize: 13,
                                    }}
                                >
                                    Chưa có ảnh
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SummaryWordBankTable = ({ options }: { options: PracticeSessionQuestionDto['options'] }) => {
    if (options.length === 0) {
        return null;
    }

    const columns = 4;
    const rows = Array.from({ length: Math.ceil(options.length / columns) }, (_, rowIndex) =>
        options.slice(rowIndex * columns, rowIndex * columns + columns),
    );

    return (
        <div
            style={{
                border: '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 14,
                background: '#eff6ff',
                overflowX: 'auto',
            }}
        >
            <Text strong style={{ display: 'block', marginBottom: 10 }}>Answer Box</Text>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, background: '#fff' }}>
                <tbody>
                    {rows.map((row, rowIndex) => (
                        <tr key={rowIndex}>
                            {Array.from({ length: columns }, (_, columnIndex) => {
                                const option = row[columnIndex];
                                return (
                                    <td
                                        key={columnIndex}
                                        style={{
                                            width: `${100 / columns}%`,
                                            border: '1px solid #cbd5e1',
                                            padding: '10px 12px',
                                            color: '#1e293b',
                                            verticalAlign: 'top',
                                            background: option ? '#ffffff' : '#f8fafc',
                                        }}
                                    >
                                        {option ? option.optionText : null}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

const normalizeChoiceToken = (value?: string | null) => (value ?? '').trim().toUpperCase();

const ClassificationMatchingTable = ({
    group,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
}: {
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}) => {
    const options = getSharedOptions(group);
    const optionLabelType = getGroupOptionLabelType(group);

    if (group.questions.length === 0 || options.length === 0) {
        return null;
    }

    return (
        <div
            style={{
                border: '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 14,
                background: '#eff6ff',
                overflowX: 'auto',
            }}
        >
            <Space wrap size={8} style={{ marginBottom: 12 }}>
                {options.map((option, index) => {
                    const label = getOptionLabel(index, optionLabelType);
                    return (
                        <Tag key={`${option.id}-${label}`} color="blue" style={{ borderRadius: 999, paddingInline: 10 }}>
                            {label}{option.optionText?.trim() ? ` = ${option.optionText.trim()}` : ''}
                        </Tag>
                    );
                })}
            </Space>

            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', background: '#fff', borderRadius: 12, overflow: 'hidden' }}>
                <thead>
                    <tr>
                        <th
                            style={{
                                textAlign: 'left',
                                padding: '12px 14px',
                                border: '1px solid #cbd5e1',
                                background: '#f8fafc',
                                color: '#0f172a',
                                width: '60%',
                            }}
                        >
                            Đối tượng
                        </th>
                        {options.map((option, index) => {
                            const label = getOptionLabel(index, optionLabelType);
                            return (
                                <th
                                    key={`${option.id}-${label}`}
                                    style={{
                                        textAlign: 'center',
                                        padding: '12px 10px',
                                        border: '1px solid #cbd5e1',
                                        background: '#f8fafc',
                                        color: '#0f172a',
                                        minWidth: 110,
                                    }}
                                >
                                    <div style={{ fontWeight: 700 }}>{label}</div>
                                    {option.optionText?.trim() ? (
                                        <div style={{ marginTop: 4, fontSize: 12, fontWeight: 500, color: '#64748b' }}>
                                            {option.optionText.trim()}
                                        </div>
                                    ) : null}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {group.questions.map((question) => {
                        const reviewAnswer = getReviewAnswerState(question.id, reviewAnswerMap);
                        const selectedToken = normalizeChoiceToken(answerMap[question.id] ?? '');
                        const correctTokens = new Set(
                            formatReviewCorrectAnswer(group, question, reviewAnswer)
                                .split('|')
                                .map((token) => normalizeChoiceToken(token))
                                .filter((token) => token.length > 0),
                        );

                        return (
                            <tr key={question.id} id={`question-${question.questionNumber ?? question.id}`}>
                                <td
                                    style={{
                                        border: '1px solid #cbd5e1',
                                        padding: '12px 14px',
                                        verticalAlign: 'top',
                                        background: readOnly ? getReviewAnswerBackground(reviewAnswer) : '#fff',
                                    }}
                                >
                                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                        <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                            <Space wrap>
                                                <Tag color="blue">Câu {question.questionNumber ?? 'N/A'}</Tag>
                                                {readOnly && reviewAnswer?.isCorrect != null ? (
                                                    <Tag color={reviewAnswer.isCorrect ? 'success' : 'error'}>
                                                        {reviewAnswer.isCorrect ? 'Đúng' : 'Sai'}
                                                    </Tag>
                                                ) : null}
                                            </Space>
                                            {readOnly ? renderQuestionAction?.({ group, question, reviewAnswer, compact: true }) : null}
                                        </Space>

                                        {question.content?.trim() ? (
                                            <div style={{ color: '#334155', lineHeight: 1.7 }}>
                                                <ReactMarkdown components={compactMarkdownComponents}>
                                                    {formatTemplateText(question.content)}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <Text type="secondary">Chưa có nội dung item.</Text>
                                        )}

                                        {readOnly && !selectedToken ? (
                                            <Text type="secondary" style={{ fontSize: 13 }}>
                                                Bạn chưa chọn đáp án.
                                            </Text>
                                        ) : null}
                                    </Space>
                                </td>
                                {options.map((option, index) => {
                                    const optionValue = getOptionLabel(index, optionLabelType);
                                    const normalizedOptionValue = normalizeChoiceToken(optionValue);
                                    const isSelected = selectedToken === normalizedOptionValue;
                                    const isCorrectOption = correctTokens.has(normalizedOptionValue);
                                    const background = readOnly
                                        ? (isCorrectOption ? '#dcfce7' : isSelected ? '#fef2f2' : '#fff')
                                        : (isSelected ? '#dbeafe' : '#fff');
                                    const borderColor = readOnly
                                        ? (isCorrectOption ? '#86efac' : isSelected ? '#fca5a5' : '#cbd5e1')
                                        : (isSelected ? '#60a5fa' : '#cbd5e1');

                                    return (
                                        <td
                                            key={`${question.id}-${option.id}`}
                                            onClick={readOnly ? undefined : () => onAnswerChange(question.id, optionValue)}
                                            style={{
                                                border: `1px solid ${borderColor}`,
                                                padding: '12px 10px',
                                                textAlign: 'center',
                                                verticalAlign: 'middle',
                                                background,
                                                cursor: readOnly ? 'default' : 'pointer',
                                                transition: 'background 0.2s ease, border-color 0.2s ease',
                                            }}
                                        >
                                            <Space direction="vertical" size={6} align="center" style={{ width: '100%' }}>
                                                <Radio checked={isSelected} disabled={readOnly} />
                                                {readOnly && isCorrectOption ? (
                                                    <Text style={{ fontSize: 12, color: '#15803d', fontWeight: 700 }}>Đáp án</Text>
                                                ) : readOnly && isSelected ? (
                                                    <Text style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>Bạn chọn</Text>
                                                ) : null}
                                            </Space>
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const normalizeDisplayText = (value?: string | null) =>
    (value ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

const normalizeMarkdownBoldText = (value?: string | null) => {
    const normalized = normalizeDisplayText(value)
        .replace(/\\\*\\\*/g, '**')
        .replace(/\\_\\_/g, '__')
        .replace(/__\s*([\s\S]*?\S)\s*__/g, '**$1**')
        .replace(/([A-Za-z0-9)\]])\*\*(?=\s*\S)/g, '$1 **')
        .replace(/\*\*\s*([A-Za-z0-9(][^*]*?[A-Za-z0-9)\]])\s*\*\*/g, '**$1**');

    let output = '';
    let cursor = 0;
    let isBold = false;

    while (cursor < normalized.length) {
        const markerIndex = normalized.indexOf('**', cursor);
        if (markerIndex < 0) {
            output += normalized.slice(cursor);
            break;
        }

        output += normalized.slice(cursor, markerIndex);
        if (!isBold) {
            output += '**';
            isBold = true;
            cursor = markerIndex + 2;
            continue;
        }

        const rawInner = output.slice(output.lastIndexOf('**') + 2);
        const trimmedInner = rawInner.trimEnd();
        if (trimmedInner.length !== rawInner.length) {
            output = output.slice(0, output.length - rawInner.length) + trimmedInner;
        }
        output += '**';
        isBold = false;
        cursor = markerIndex + 2;

        if (normalized[cursor] && !/\s|[.,;:!?()[\]{}"'“”‘’/-]/.test(normalized[cursor])) {
            output += ' ';
        }
    }

    return output;
};

const normalizeBlockMarkdownText = (value?: string | null) =>
    normalizeMarkdownBoldText(value)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(?<!\n)\n(?!\n)/g, '  \n')
        .trim();

const formatTemplateText = (value?: string | null) =>
    normalizeBlockMarkdownText(value).replace(/\[Q(\d+)\]/g, '_____ `Q$1`');

const parseTableContent = (contentData?: string | null) => {
    if (!contentData) {
        return { title: '', rows: [] as string[][] };
    }

    try {
        const parsed = JSON.parse(contentData) as unknown;
        const rows = Array.isArray(parsed)
            ? parsed
            : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { rows?: unknown }).rows)
                ? (parsed as { rows: unknown[] }).rows
                : []);
        const title = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            && typeof (parsed as { title?: unknown }).title === 'string'
            ? (parsed as { title: string }).title.trim()
            : '';

        return {
            title: title === TABLE_TITLE_PLACEHOLDER ? '' : title,
            rows: rows.filter((row): row is string[] => Array.isArray(row))
                .map((row) => row.map((cell) => typeof cell === 'string' ? cell : '')),
        };
    } catch {
        return { title: '', rows: [] as string[][] };
    }
};

const getSharedOptions = (group: PracticeSessionQuestionGroupDto) =>
    group.questions.find((question) => question.options.length > 0)?.options ?? [];

const getFlowchartUsesAnswerBank = (group: PracticeSessionQuestionGroupDto) => {
    if (!isFlowchartLikeGroup(group)) {
        return false;
    }

    if ((group.groupType ?? '').toUpperCase() === 'ORDERING_INFORMATION') {
        return true;
    }

    return parseFlowchartAssets(group.assetsData).answerMode === 'shared_option_bank';
};

const buildInitialAnswers = (session?: PracticeSessionDto | null) => {
    if (!session) {
        return {};
    }

    return session.answers.reduce<Record<string, string>>((accumulator, answer) => {
        if (answer.answerText) {
            accumulator[answer.questionId] = answer.answerText;
        }
        return accumulator;
    }, {});
};

const getQuestionInputType = (group: PracticeSessionQuestionGroupDto) => {
    const groupType = (group.groupType ?? '').toUpperCase();
    const parsedPrompt = parseSharedPromptContent(group.contentData);
    const usesSharedPrompt = parsedPrompt.isSharedPromptLayout;

    // Ngăn chặn các dạng MCQ rơi vào shared-select để có thể hiển thị Radio/Checkbox
    const isMCQ = groupType === 'MCQ_CHOOSE_N' || groupType === 'MCQ_MULTIPLE' || groupType === 'MCQ_SINGLE';

    if (MATCHING_TYPES.has(groupType) || (isFlowchartLikeGroup(group) && getFlowchartUsesAnswerBank(group)) || (usesSharedPrompt && !isMCQ)) {
        return 'shared-select';
    }

    if (FILL_TYPES.has(groupType)) {
        return 'text';
    }

    if (groupType === 'TFNG' || groupType === 'YNNG' || groupType === 'MCQ_SINGLE' || groupType === 'MCQ_MULTIPLE' || groupType === 'MCQ_CHOOSE_N') {
        return 'single-choice';
    }

    return group.questions.some((question) => question.options.length > 0) ? 'single-choice' : 'text';
};

const markdownComponents = {
    p: ({ children }: any) => <p style={{ margin: '0 0 10px', color: '#334155', lineHeight: 1.7 }}>{children}</p>,
    strong: ({ children }: any) => <strong style={{ color: '#0f172a' }}>{children}</strong>,
    code: ({ children }: any) => (
        <code
            style={{
                padding: '1px 8px',
                borderRadius: 999,
                background: '#dbeafe',
                color: '#1d4ed8',
                border: '1px solid #93c5fd',
                fontSize: '0.8125rem',
                fontWeight: 700,
            }}
        >
            {children}
        </code>
    ),
    li: ({ children }: any) => <li style={{ marginBottom: 6, color: '#334155' }}>{children}</li>,
};

const compactMarkdownComponents = {
    ...markdownComponents,
    p: ({ children }: any) => <p style={{ margin: 0, color: '#334155', lineHeight: 1.7 }}>{children}</p>,
    li: ({ children }: any) => <li style={{ marginBottom: 4, color: '#334155' }}>{children}</li>,
};

const hasTemplateQuestionTokens = (value?: string | null) => /\[Q\d+\]/.test(value ?? '');

const InlineAnswerControl = ({
    group,
    question,
    value,
    onChange,
    readOnly = false,
    reviewAnswer,
}: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswer?: PracticeSessionAnswerDto;
}) => {
    const inputType = getQuestionInputType(group);
    const reviewStyle = readOnly ? {
        borderColor: getReviewAnswerBorderColor(reviewAnswer),
        background: getReviewAnswerBackground(reviewAnswer),
        color: '#0f172a',
        fontWeight: 500,
        textTransform: 'none' as const,
    } : undefined;

    if (inputType === 'shared-select') {
        return (
            <Select
                allowClear
                disabled={readOnly}
                value={value || undefined}
                placeholder={`Q${question.questionNumber ?? ''}`}
                popupMatchSelectWidth={false}
                optionLabelProp="value"
                style={{ minWidth: 112, width: 112, ...reviewStyle }}
                options={getSharedSelectOptions(group)}
                onChange={(nextValue) => onChange(nextValue ?? '')}
            />
        );
    }

    const displayValue = value || `Q${question.questionNumber ?? ''}`;
    const width = Math.max(108, Math.min(180, (displayValue.length + 2) * 10));

    return (
        <Input
            value={value}
            readOnly={readOnly}
            placeholder={`Q${question.questionNumber ?? ''}`}
            onChange={(event) => onChange(event.target.value)}
            style={{ width, ...reviewStyle }}
        />
    );
};

const renderInlineTemplateSegments = ({
    text,
    group,
    answerMap,
    onAnswerChange,
    questionByNumber,
    readOnly = false,
    reviewAnswerMap,
}: {
    text: string;
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    questionByNumber: Map<number, PracticeSessionQuestionDto>;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
}) => {
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
                            fontWeight: segment.bold ? 700 : undefined,
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

const InlineTemplateRenderer = ({
    template,
    group,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
}: {
    template: string;
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
}) => {
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

const QuestionInput = ({
    group,
    question,
    value,
    onChange,
    readOnly = false,
    reviewAnswer,
}: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswer?: PracticeSessionAnswerDto;
}) => {
    const inputType = getQuestionInputType(group);
    const groupType = (group.groupType ?? '').toUpperCase();
    const sharedOptions = getSharedOptions(group);
    const optionLabelType = getGroupOptionLabelType(group);
    const reviewBorderColor = getReviewAnswerBorderColor(reviewAnswer);
    const reviewBackground = getReviewAnswerBackground(reviewAnswer);

    if (inputType === 'shared-select') {
        return (
            <Select
                allowClear
                disabled={readOnly}
                placeholder="Chọn đáp án"
                optionLabelProp="value"
                style={{ width: '100%' }}
                value={value || undefined}
                options={getSharedSelectOptions(group)}
                onChange={(nextValue) => onChange(nextValue ?? '')}
            />
        );
    }


    if (inputType === 'single-choice') {
        const usesOptionTextValue = groupType === 'TFNG' || groupType === 'YNNG';
        const optionsToRender = question.options.length > 0 ? question.options : sharedOptions;

        return (
            <Radio.Group
                disabled={readOnly}
                style={{ display: 'grid', gap: 8 }}
                value={value || undefined}
                onChange={(event) => onChange(event.target.value)}
            >
                {optionsToRender.map((option, index) => {
                    const optionValue = usesOptionTextValue ? option.optionText : getOptionLabel(index, optionLabelType);
                    return (
                        <Radio key={option.id} value={optionValue}>
                            {usesOptionTextValue
                                ? option.optionText
                                : renderSelectableOptionContent({
                                    label: optionValue,
                                    text: option.optionText,
                                    imageUrl: option.imageUrl,
                                })}
                        </Radio>
                    );
                })}
            </Radio.Group>
        );
    }

    return (
        <Input
            value={value}
            readOnly={readOnly}
            placeholder="Nhập đáp án"
            onChange={(event) => onChange(event.target.value)}
            style={readOnly ? { borderColor: reviewBorderColor, background: reviewBackground, fontWeight: 500, textTransform: 'none' } : undefined}
        />
    );
};

const QuestionBlock = ({
    group,
    question,
    value,
    onChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
}: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    value: string;
    onChange: (nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}) => {
    const reviewAnswer = getReviewAnswerState(question.id, reviewAnswerMap);
    const correctAnswer = formatReviewCorrectAnswer(group, question, reviewAnswer);
    const rendersInlineAnswer = hasTemplateQuestionTokens(question.content)
        && INLINE_TEMPLATE_INPUT_TYPES.has(getQuestionInputType(group));
    const inlineTemplate = rendersInlineAnswer && typeof question.questionNumber === 'number'
        ? (question.content ?? '').replace(/\[Q\d+\]/g, `[Q${question.questionNumber}]`)
        : question.content ?? '';

    return (
        <div
            id={`question-${question.questionNumber ?? question.id}`}
            style={{
                border: `1px solid ${readOnly ? getReviewAnswerBorderColor(reviewAnswer) : '#e2e8f0'}`,
                borderRadius: 16,
                padding: 14,
                background: readOnly ? getReviewAnswerBackground(reviewAnswer) : '#fff',
            }}
        >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                    <Space wrap>
                        <Tag color="blue">Câu {question.questionNumber ?? 'N/A'}</Tag>
                    </Space>
                    <Space wrap>
                        {readOnly ? renderQuestionAction?.({ group, question, reviewAnswer }) : null}
                        {readOnly && reviewAnswer?.isCorrect != null ? (
                            <Tag color={reviewAnswer.isCorrect ? 'success' : 'error'}>
                                {reviewAnswer.isCorrect ? 'Đúng' : 'Sai'}
                            </Tag>
                        ) : null}
                    </Space>
                </Space>

                {question.content ? (
                    <div style={{ color: '#334155', lineHeight: 1.7 }}>
                        {rendersInlineAnswer ? (
                            <InlineTemplateRenderer
                                template={inlineTemplate}
                                group={group}
                                answerMap={{ [question.id]: value }}
                                onAnswerChange={(questionId, nextValue) => {
                                    if (questionId === question.id) {
                                        onChange(nextValue);
                                    }
                                }}
                                readOnly={readOnly}
                                reviewAnswerMap={reviewAnswerMap}
                            />
                        ) : (
                            <ReactMarkdown components={compactMarkdownComponents}>
                                {formatTemplateText(question.content)}
                            </ReactMarkdown>
                        )}
                    </div>
                ) : null}

                {!rendersInlineAnswer && (
                    <QuestionInput
                        group={group}
                        question={question}
                        value={value}
                        onChange={onChange}
                        readOnly={readOnly}
                        reviewAnswer={reviewAnswer}
                    />
                )}

                {readOnly && reviewAnswer?.isCorrect === false && correctAnswer ? (
                    <Text style={{ color: '#15803d', fontSize: 13 }}>
                        Đáp án đúng: <b>{correctAnswer}</b>
                    </Text>
                ) : null}

                {readOnly && !value ? (
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        Bạn chưa trả lời câu này.
                    </Text>
                ) : null}
            </Space>
        </div>
    );
};

const GroupBlock = ({
    group,
    skillType,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
}: {
    group: PracticeSessionQuestionGroupDto;
    skillType: string;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}) => {
    const parsedPrompt = parseSharedPromptContent(group.contentData);
    const flowchartAssets = parseFlowchartAssets(group.assetsData);
    const sharedOptions = getSharedOptions(group);
    const inputType = getQuestionInputType(group);
    const optionLabelType = getGroupOptionLabelType(group);
    const isTableLayout = TABLE_TYPES.has((group.groupType ?? '').toUpperCase());
    const isSummaryCompletion = (group.groupType ?? '').toUpperCase() === 'SUMMARY_COMPLETION';
    const isMatchingVisuals = isMatchingVisualsGroup(group);
    const isClassificationMatching = isClassificationMatchingGroup(group);
    const isMapLabelling = (group.groupType ?? '').toUpperCase() === 'MAP_LABELLING';
    const tableContent = isTableLayout ? parseTableContent(group.contentData) : { title: '', rows: [] as string[][] };
    const rendersInlineTemplateAnswers = hasTemplateQuestionTokens(group.contentData)
        && INLINE_TEMPLATE_INPUT_TYPES.has(inputType);
    const shouldShowPrompt = !!parsedPrompt.prompt && inputType !== 'shared-select' ? true : !!parsedPrompt.prompt;
    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
    });
    const shouldShowSharedOptionsBox = (inputType === 'shared-select' || (group.groupType ?? '').toUpperCase() === 'SUMMARY_COMPLETION')
        && sharedOptions.length > 0
        && (group.groupType ?? '').toUpperCase() !== 'MATCHING_HEADINGS'
        && !isClassificationMatching
        && !isMapLabelling;
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
                        message={<ReactMarkdown components={markdownComponents}>{formatTemplateText(group.instruction)}</ReactMarkdown>}
                    />
                ) : null}
                <TruthValueDefinitionTable groupType={group.groupType} />

                {isTableLayout && tableContent.rows.length > 0 ? (
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
                                <ReactMarkdown components={compactMarkdownComponents}>
                                    {formatTemplateText(tableContent.title)}
                                </ReactMarkdown>
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
                                                    <ReactMarkdown components={compactMarkdownComponents}>
                                                        {formatTemplateText(cell)}
                                                    </ReactMarkdown>
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
                            <ReactMarkdown components={markdownComponents}>
                                {formatTemplateText(parsedPrompt.prompt)}
                            </ReactMarkdown>
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
                        }}
                    >
                        <img
                            src={flowchartAssets.imageUrl}
                            alt="Group visual"
                            style={{ width: '100%', borderRadius: 12, objectFit: 'contain', maxHeight: 420 }}
                        />
                    </div>
                ) : null}

                {shouldShowSharedOptionsBox ? (
                    isSummaryCompletion ? (
                        <SummaryWordBankTable options={sharedOptions} />
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
                                        {option.optionText?.trim() ? (
                                            <><b>{getOptionLabel(index, optionLabelType)}.</b> {option.optionText}</>
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
                                                    <ReactMarkdown components={compactMarkdownComponents}>
                                                        {formatTemplateText(question.content)}
                                                    </ReactMarkdown>
                                                </div>
                                            ) : null}

                                            <Checkbox.Group
                                                disabled={readOnly}
                                                style={{ display: 'grid', gap: 8 }}
                                                value={checkedValues}
                                                onChange={(nextValues) => onAnswerChange(question.id, (nextValues as string[]).join('|'))}
                                            >
                                                {options.map((option, index) => {
                                                    const optionValue = getOptionLabel(index, optionLabelType);
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
                                            {readOnly && getReviewAnswerState(question.id, reviewAnswerMap)?.isCorrect === false && formatReviewCorrectAnswer(group, question, getReviewAnswerState(question.id, reviewAnswerMap)) ? (
                                                <Text style={{ color: '#15803d', fontSize: 13 }}>
                                                    Đáp án đúng: <b>{formatReviewCorrectAnswer(group, question, getReviewAnswerState(question.id, reviewAnswerMap))}</b>
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

                    let checkedValues: string[] = [];
                    if (isSingleQuestionN) {
                        checkedValues = (answerMap[group.questions[0]?.id] ?? '').split('|').map(s => s.trim()).filter(Boolean);
                    } else {
                        checkedValues = group.questions.map(q => answerMap[q.id]).filter(Boolean);
                    }

                    const handleChange = (nextChecked: string[]) => {
                        if (isSingleQuestionN) {
                            if (group.questions[0]) {
                                onAnswerChange(group.questions[0].id, nextChecked.join('|'));
                            }
                        } else {
                            if (nextChecked.length > group.questions.length) return;
                            
                            group.questions.forEach((q, idx) => {
                                onAnswerChange(q.id, nextChecked[idx] ?? '');
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
                                                <Text style={{ color: '#15803d', fontSize: 13 }}>
                                                    Đáp án đúng: <b>{correctAnswer}</b>
                                                </Text>
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

export const ReadingBody = ({
    passages,
    activePassageIndex,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
}: {
    passages: PracticeSessionReadingPassageDto[];
    activePassageIndex: number;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}) => {
    const passage = passages[activePassageIndex];
    const passageAssetImages = parseAssetImageUrls(passage?.assetsData);

    if (!passage) {
        return (
            <Card style={{ borderRadius: 22 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đề này chưa có passage." />
            </Card>
        );
    }

    return (
        <Card id="runner-active-section" key={passage.id} bodyStyle={{ padding: 0, overflow: 'hidden' }} style={{ borderRadius: 22 }}>
            <div className="runner-split-layout">
                <div
                    className="runner-split-pane"
                    style={{
                        padding: 20,
                        borderRight: '1px solid #e2e8f0',
                    }}
                >
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                        <Title level={4} style={{ margin: 0, color: '#15803d' }}>
                            Passage {passage.passageNumber ?? activePassageIndex + 1}: {passage.title || 'Reading passage'}
                        </Title>

                        {passageAssetImages.length > 0 ? (
                            <div
                                style={{
                                    display: 'grid',
                                    gap: 12,
                                }}
                            >
                                {passageAssetImages.map((imageUrl, index) => (
                                    <div
                                        key={`${passage.id}-asset-${index}`}
                                        style={{
                                            border: '1px solid #e2e8f0',
                                            borderRadius: 16,
                                            padding: 12,
                                            background: '#fff',
                                        }}
                                    >
                                        <img
                                            src={imageUrl}
                                            alt={`Passage visual ${index + 1}`}
                                            style={{ width: '100%', borderRadius: 12, objectFit: 'contain', maxHeight: 420 }}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : null}

                        {passage.paragraphsData ? (
                            <div
                                style={{
                                    border: '1px solid #e2e8f0',
                                    borderRadius: 16,
                                    padding: 16,
                                    background: '#fff',
                                }}
                            >
                                <ReactMarkdown components={markdownComponents}>
                                    {formatTemplateText(passage.paragraphsData)}
                                </ReactMarkdown>
                            </div>
                        ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Passage chưa có nội dung." />
                        )}
                    </Space>
                </div>

                <div
                    className="runner-split-pane"
                    style={{
                        padding: 20,
                    }}
                >
                    <Space direction="vertical" size={14} style={{ width: '100%' }}>
                        {passage.questionGroups.map((group) => (
                                <GroupBlock
                                    key={group.id}
                                    group={group}
                                    skillType="Reading"
                                    answerMap={answerMap}
                                    onAnswerChange={onAnswerChange}
                                    readOnly={readOnly}
                                    reviewAnswerMap={reviewAnswerMap}
                                    renderQuestionAction={renderQuestionAction}
                                />
                        ))}
                    </Space>
                </div>
            </div>
        </Card>
    );
};

export const ListeningBody = ({
    parts,
    activePartIndex,
    answerMap,
    onAnswerChange,
    readOnly = false,
    reviewAnswerMap,
    renderQuestionAction,
}: {
    parts: PracticeSessionListeningPartDto[];
    activePartIndex: number;
    answerMap: Record<string, string>;
    onAnswerChange: (questionId: string, nextValue: string) => void;
    readOnly?: boolean;
    reviewAnswerMap?: ObjectiveReviewAnswerMap;
    renderQuestionAction?: RenderQuestionAction;
}) => {
    const part = parts[activePartIndex];

    if (!part) {
        return (
            <Card style={{ borderRadius: 22 }}>
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Đề này chưa có part listening." />
            </Card>
        );
    }

    return (
        <Card
            id="runner-active-section"
            key={part.id}
            bodyStyle={{ padding: 20 }}
            style={{ borderRadius: 22 }}
        >
            <Space direction="vertical" size={14} style={{ width: '100%' }}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 12,
                        flexWrap: 'wrap',
                    }}
                >
                    <Title level={4} style={{ margin: 0, color: '#2563eb' }}>
                        Part {part.partNumber ?? activePartIndex + 1}
                    </Title>
                    <Tag color="blue" style={{ borderRadius: 999, paddingInline: 12 }}>
                        Audio đang nằm trên header
                    </Tag>
                </div>

                {part.contextDescription ? (
                    <div
                        style={{
                            border: '1px solid #dbeafe',
                            borderRadius: 16,
                            padding: 16,
                            background: '#f8fbff',
                        }}
                    >
                        <ReactMarkdown components={compactMarkdownComponents}>
                            {formatTemplateText(part.contextDescription)}
                        </ReactMarkdown>
                    </div>
                ) : null}

                <Space direction="vertical" size={14} style={{ width: '100%' }}>
                    {part.questionGroups.map((group) => (
                        <GroupBlock
                            key={group.id}
                            group={group}
                            skillType="Listening"
                            answerMap={answerMap}
                            onAnswerChange={onAnswerChange}
                            readOnly={readOnly}
                            reviewAnswerMap={reviewAnswerMap}
                            renderQuestionAction={renderQuestionAction}
                        />
                    ))}
                </Space>
            </Space>
        </Card>
    );
};

const ObjectiveRunnerPage = ({ expectedSkill }: { expectedSkill: 'READING' | 'LISTENING' }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const { sessionId = '' } = useParams();
    const { data: session, isLoading, isError } = usePracticeSessionQuery(sessionId);
    const updateAnswersMutation = useUpdatePracticeSessionAnswersMutation();

    const [answerMap, setAnswerMap] = useState<Record<string, string>>({});
    const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
    const [autosaveLabel, setAutosaveLabel] = useState('Chưa lưu');
    const [activeItemIndex, setActiveItemIndex] = useState(0);
    const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);
    const [listeningAttemptMode, setListeningAttemptModeState] = useState<ListeningAttemptMode>('practice');
    const [audioCurrentTime, setAudioCurrentTime] = useState(0);
    const [audioDuration, setAudioDuration] = useState(0);
    const [mockCountdownSeconds, setMockCountdownSeconds] = useState<number | null>(null);
    const [practiceAudioPlaying, setPracticeAudioPlaying] = useState(false);
    const dirtyAnswersRef = useRef<Record<string, string>>({});
    const timerValueRef = useRef<number | null>(null);
    const lastPersistedTimeRef = useRef<number | null>(null);
    const hasRedirectedOnTimeoutRef = useRef(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const lastStoredAudioSecondRef = useRef<number>(-1);
    const audioResumeAppliedRef = useRef(false);
    const mockReplayGuardRef = useRef(false);

    useEffect(() => {
        if (!session) {
            return;
        }

        setAnswerMap(buildInitialAnswers(session));
        setTimeRemaining(session.timeRemaining ?? null);
        timerValueRef.current = session.timeRemaining ?? null;
        lastPersistedTimeRef.current = session.timeRemaining ?? null;
        setAutosaveLabel('Đã đồng bộ với server');
        if (expectedSkill === 'LISTENING') {
            setAudioCurrentTime(getListeningAudioPositionSeconds(session.sessionId));
            setAudioDuration(0);
            setPracticeAudioPlaying(false);
            setMockCountdownSeconds(null);
            audioResumeAppliedRef.current = false;
            lastStoredAudioSecondRef.current = -1;
        }
    }, [expectedSkill, session?.sessionId]);

    useEffect(() => {
        setHeaderSlot(document.getElementById('client-page-header-slot'));
    }, []);

    useEffect(() => {
        timerValueRef.current = timeRemaining;
    }, [timeRemaining]);

    const sections = useMemo(() => {
        if (!session) {
            return [];
        }

        return session.exam.sections.filter((section) => section.skillType.trim().toUpperCase() === expectedSkill);
    }, [session, expectedSkill]);

    const readingPassages = useMemo(() => {
        return sections.flatMap((section) => section.readingPassages);
    }, [sections]);

    const listeningParts = useMemo(() => {
        return sections.flatMap((section) => section.listeningParts);
    }, [sections]);

    const sharedListeningAudioUrl = useMemo(
        () => getSharedListeningAudioUrl(listeningParts),
        [listeningParts],
    );

    const navigationItems = expectedSkill === 'READING' ? readingPassages : listeningParts;

    useEffect(() => {
        if (expectedSkill !== 'LISTENING' || !sessionId) {
            return;
        }

        const locationMode = (location.state as { listeningAttemptMode?: ListeningAttemptMode } | null)?.listeningAttemptMode;
        const nextMode = locationMode ?? getListeningAttemptMode(sessionId);
        setListeningAttemptMode(sessionId, nextMode);
        setListeningAttemptModeState(nextMode);
    }, [expectedSkill, location.state, sessionId]);

    useEffect(() => {
        setActiveItemIndex((current) => {
            if (navigationItems.length === 0) {
                return 0;
            }

            return Math.min(current, navigationItems.length - 1);
        });
    }, [navigationItems.length]);

    const flushAnswers = (includeTimerOnly = false) => {
        if (!sessionId) {
            return;
        }

        const dirtyAnswers = Object.entries(dirtyAnswersRef.current).map(([questionId, answerText]) => ({
            questionId,
            answerText: answerText || null,
        }));

        const nextTimeRemaining = timerValueRef.current;
        const shouldPersistTimer = nextTimeRemaining !== lastPersistedTimeRef.current;

        if (!includeTimerOnly && dirtyAnswers.length === 0 && !shouldPersistTimer) {
            return;
        }

        if (includeTimerOnly && !shouldPersistTimer) {
            return;
        }

        const payload = {
            sessionId,
            data: {
                timeRemaining: nextTimeRemaining,
                answers: includeTimerOnly ? [] : dirtyAnswers,
            },
        };

        if (!includeTimerOnly) {
            dirtyAnswersRef.current = {};
        }

        lastPersistedTimeRef.current = nextTimeRemaining;
        setAutosaveLabel('Đang lưu...');
        updateAnswersMutation.mutate(payload, {
            onSuccess: () => {
                setAutosaveLabel('Đã lưu tự động');
            },
            onError: () => {
                setAutosaveLabel('Lưu tạm thất bại');
            },
        });
    };

    useEffect(() => {
        const timeout = window.setInterval(() => {
            flushAnswers(true);
        }, 15000);

        return () => window.clearInterval(timeout);
    }, [sessionId]);

    useEffect(() => {
        if (!session || session.status !== 'InProgress' || timeRemaining == null) {
            return;
        }

        const interval = window.setInterval(() => {
            setTimeRemaining((current) => {
                if (current == null) {
                    return current;
                }

                const nextValue = Math.max(0, current - 1);
                if (nextValue === 0 && !hasRedirectedOnTimeoutRef.current) {
                    hasRedirectedOnTimeoutRef.current = true;
                    flushAnswers();
                    navigate(`/app/sessions/${sessionId}/submit?auto=1`, { replace: true });
                }
                return nextValue;
            });
        }, 1000);

        return () => window.clearInterval(interval);
    }, [session?.status, timeRemaining, navigate, sessionId]);

    useEffect(() => () => {
        flushAnswers();
    }, []);

    const handleAnswerChange = (questionId: string, nextValue: string) => {
        setAnswerMap((current) => ({ ...current, [questionId]: nextValue }));
        dirtyAnswersRef.current = { ...dirtyAnswersRef.current, [questionId]: nextValue };
        setAutosaveLabel('Chưa lưu');
    };

    const handleNavigationItemChange = (index: number) => {
        setActiveItemIndex(index);
        window.requestAnimationFrame(() => {
            document.getElementById('runner-active-section')?.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    };

    useEffect(() => {
        if (Object.keys(dirtyAnswersRef.current).length === 0) {
            return;
        }

        const timeout = window.setTimeout(() => {
            flushAnswers();
        }, 900);

        return () => window.clearTimeout(timeout);
    }, [answerMap]);

    useEffect(() => {
        if (expectedSkill !== 'LISTENING' || !sessionId || !sharedListeningAudioUrl) {
            return;
        }

        const audioElement = audioRef.current;
        if (!audioElement) {
            return;
        }

        const handleLoadedMetadata = () => {
            const resumePosition = getListeningResumePositionSeconds(sessionId);
            if (!audioResumeAppliedRef.current && resumePosition > 0) {
                audioElement.currentTime = resumePosition;
                audioResumeAppliedRef.current = true;
                setAudioCurrentTime(resumePosition);
            }

            setAudioDuration(Number.isFinite(audioElement.duration) ? audioElement.duration : 0);
        };

        const handleTimeUpdate = () => {
            const nextCurrentTime = audioElement.currentTime;
            setAudioCurrentTime(nextCurrentTime);
            const flooredSecond = Math.floor(nextCurrentTime);
            if (flooredSecond !== lastStoredAudioSecondRef.current) {
                lastStoredAudioSecondRef.current = flooredSecond;
                setListeningAudioPositionSeconds(sessionId, nextCurrentTime);
            }
        };

        const handleEnded = () => {
            setAudioCurrentTime(audioElement.duration || 0);
            setPracticeAudioPlaying(false);
            setMockCountdownSeconds(null);
            setListeningAudioPositionSeconds(sessionId, audioElement.duration || 0);
        };

        const handlePlay = () => {
            setPracticeAudioPlaying(true);
        };

        const handlePause = () => {
            const isMockMode = listeningAttemptMode === 'mock';
            const isEnded = audioElement.ended;
            setPracticeAudioPlaying(false);

            if (isMockMode && !isEnded && !mockReplayGuardRef.current) {
                mockReplayGuardRef.current = true;
                window.setTimeout(() => {
                    audioElement.play().catch(() => undefined).finally(() => {
                        mockReplayGuardRef.current = false;
                    });
                }, 0);
            }
        };

        audioElement.addEventListener('loadedmetadata', handleLoadedMetadata);
        audioElement.addEventListener('timeupdate', handleTimeUpdate);
        audioElement.addEventListener('ended', handleEnded);
        audioElement.addEventListener('play', handlePlay);
        audioElement.addEventListener('pause', handlePause);

        if (audioElement.readyState >= 1) {
            handleLoadedMetadata();
        }

        return () => {
            audioElement.removeEventListener('loadedmetadata', handleLoadedMetadata);
            audioElement.removeEventListener('timeupdate', handleTimeUpdate);
            audioElement.removeEventListener('ended', handleEnded);
            audioElement.removeEventListener('play', handlePlay);
            audioElement.removeEventListener('pause', handlePause);
        };
    }, [expectedSkill, listeningAttemptMode, sessionId, sharedListeningAudioUrl]);

    useEffect(() => {
        if (expectedSkill !== 'LISTENING' || listeningAttemptMode !== 'mock' || !sharedListeningAudioUrl || session?.status !== 'InProgress') {
            setMockCountdownSeconds(null);
            return;
        }

        const audioElement = audioRef.current;
        if (!audioElement || audioElement.ended) {
            return;
        }

        setMockCountdownSeconds(10);
        const interval = window.setInterval(() => {
            setMockCountdownSeconds((current) => {
                if (current == null) {
                    return current;
                }

                if (current <= 1) {
                    audioElement.play().catch(() => undefined);
                    window.clearInterval(interval);
                    return 0;
                }

                return current - 1;
            });
        }, 1000);

        return () => window.clearInterval(interval);
    }, [expectedSkill, listeningAttemptMode, session?.status, sharedListeningAudioUrl, session?.sessionId]);

    useEffect(() => () => {
        if (expectedSkill === 'LISTENING' && sessionId && audioRef.current) {
            setListeningAudioPositionSeconds(sessionId, audioRef.current.currentTime || 0);
        }
    }, [expectedSkill, sessionId]);

    if (isLoading) {
        return (
            <Card style={{ borderRadius: 24, minHeight: 320, display: 'grid', placeItems: 'center' }}>
                <Spin />
            </Card>
        );
    }

    if (isError || !session) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Empty
                    description="Không tìm thấy session đang làm."
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                >
                    <Button type="primary" onClick={() => navigate('/app/my-exams')}>
                        Quay về Bài thi của tôi
                    </Button>
                </Empty>
            </Card>
        );
    }

    if (!isObjectiveSkill(session.skillType)) {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Alert
                    type="warning"
                    showIcon
                    message="Session này chưa thuộc Reading/Listening objective."
                    description="Runner objective hiện tại chỉ mở cho Reading và Listening."
                />
            </Card>
        );
    }

    if (session.skillType.trim().toUpperCase() !== expectedSkill) {
        navigate(`/app/sessions/${sessionId}/${session.skillType.trim().toUpperCase() === 'LISTENING' ? 'listening' : 'reading'}`, { replace: true });
        return null;
    }

    if (session.status !== 'InProgress') {
        return (
            <Card style={{ borderRadius: 24 }}>
                <Space direction="vertical" size={16}>
                    <Alert
                        type="success"
                        showIcon
                        message="Session này không còn ở trạng thái đang làm."
                        description="Bạn có thể mở trang kết quả để xem band IELTS, raw score và thông tin đã nộp."
                    />
                    <Button type="primary" onClick={() => navigate(`/app/sessions/${sessionId}/submit`)}>
                        Xem trang submit
                    </Button>
                </Space>
            </Card>
        );
    }

    const timerText = timeRemaining == null
        ? 'Không giới hạn'
        : `${Math.floor(timeRemaining / 60)}:${String(timeRemaining % 60).padStart(2, '0')}`;
    const isListeningSession = expectedSkill === 'LISTENING';
    const audioProgressPercent = audioDuration > 0
        ? Math.min(100, Math.max(0, (audioCurrentTime / audioDuration) * 100))
        : 0;
    const mockCountdownLabel = mockCountdownSeconds != null && mockCountdownSeconds > 0
        ? `Tự phát sau ${mockCountdownSeconds}s`
        : 'Đang phát như thi thật';

    return (
        <>
            {headerSlot ? createPortal(
                <div className="runner-page-toolbar">
                    <Button
                        type="text"
                        className="runner-back-button"
                        icon={<ArrowLeftOutlined />}
                        aria-label="Quay lại bài thi của tôi"
                        title="Bài thi của tôi"
                        onClick={() => navigate('/app/my-exams')}
                    />
                    <div className="runner-title-block">
                        <span className="runner-title-accent" />
                        <div className="runner-page-title" title={session.examTitle}>
                            {session.examTitle}
                        </div>
                    </div>
                    {isListeningSession && sharedListeningAudioUrl ? (
                        <div className="runner-audio-slot">
                            {listeningAttemptMode === 'practice' ? (
                                <audio
                                    ref={audioRef}
                                    controls
                                    controlsList="nodownload noplaybackrate"
                                    preload="auto"
                                    src={sharedListeningAudioUrl}
                                    className="runner-audio-player"
                                />
                            ) : (
                                <>
                                    <audio
                                        ref={audioRef}
                                        preload="auto"
                                        src={sharedListeningAudioUrl}
                                        className="runner-audio-hidden"
                                    />
                                    <div className="runner-mock-audio-card">
                                        <div className="runner-mock-audio-head">
                                            <span className="runner-mock-audio-badge">Mock test</span>
                                            <span className="runner-mock-audio-state">{mockCountdownLabel}</span>
                                        </div>
                                        <div className="runner-mock-audio-track">
                                            <div
                                                className="runner-mock-audio-track-fill"
                                                style={{ width: `${audioProgressPercent}%` }}
                                            />
                                        </div>
                                        <div className="runner-mock-audio-meta">
                                            <span>{formatAudioTime(audioCurrentTime)}</span>
                                            <span>{formatAudioTime(audioDuration)}</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : null}
                    <div className="runner-header-meta">
                        <span className="runner-header-chip runner-skill-chip">{getSkillLabel(session.skillType)}</span>
                        <span className="runner-header-chip runner-timer-chip">
                            <ClockCircleOutlined />
                            {timerText}
                        </span>
                        <span className="runner-header-chip runner-save-chip runner-save-status-chip runner-autosave-tag">
                            <SaveOutlined />
                            {autosaveLabel}
                        </span>
                    </div>
                    <Button type="primary" className="runner-header-submit" onClick={() => navigate(`/app/sessions/${sessionId}/submit`)}>
                        Hoàn thành
                    </Button>
                </div>,
                headerSlot,
            ) : null}

            <div style={{ width: '100%', padding: '8px 8px 46px' }}>
            <style>{`
                .runner-page-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: 100%;
                    min-width: 0;
                    height: 100%;
                }

                .runner-back-button {
                    width: 40px;
                    height: 40px;
                    flex: 0 0 40px;
                    border-radius: 12px;
                    border: 1px solid #dbeafe;
                    background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
                    color: #0f172a;
                    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
                }

                .runner-back-button:hover {
                    border-color: #93c5fd !important;
                    background: #eff6ff !important;
                    color: #1d4ed8 !important;
                }

                .runner-title-block {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                    flex: 1;
                }

                .runner-title-accent {
                    width: 4px;
                    height: 30px;
                    flex: 0 0 4px;
                    border-radius: 999px;
                    background: linear-gradient(180deg, #2563eb 0%, #14b8a6 100%);
                    box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
                }

                .runner-page-title {
                    min-width: 0;
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: #0f172a;
                    font-weight: 800;
                    font-size: 1.08rem;
                    letter-spacing: -0.02em;
                }

                .runner-header-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex-shrink: 0;
                }

                .runner-audio-slot {
                    width: 320px;
                    min-width: 320px;
                    max-width: 320px;
                    flex: 0 0 320px;
                }

                .runner-audio-player {
                    display: block;
                    width: 100%;
                    height: 34px;
                }

                .runner-audio-hidden {
                    display: none;
                }

                .runner-mock-audio-card {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    width: 100%;
                    padding: 8px 12px;
                    border-radius: 16px;
                    border: 1px solid #bfdbfe;
                    background: linear-gradient(135deg, #eff6ff 0%, #ffffff 100%);
                    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.08);
                }

                .runner-mock-audio-head,
                .runner-mock-audio-meta {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 8px;
                }

                .runner-mock-audio-badge {
                    font-size: 0.72rem;
                    font-weight: 800;
                    color: #1d4ed8;
                    text-transform: uppercase;
                    letter-spacing: 0.04em;
                }

                .runner-mock-audio-state {
                    font-size: 0.72rem;
                    font-weight: 700;
                    color: #475569;
                    white-space: nowrap;
                }

                .runner-mock-audio-track {
                    position: relative;
                    width: 100%;
                    height: 8px;
                    border-radius: 999px;
                    overflow: hidden;
                    background: #dbeafe;
                }

                .runner-mock-audio-track-fill {
                    position: absolute;
                    inset: 0 auto 0 0;
                    height: 100%;
                    border-radius: inherit;
                    background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
                }

                .runner-mock-audio-meta {
                    font-size: 0.72rem;
                    font-weight: 700;
                    color: #334155;
                }

                .runner-header-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    height: 32px;
                    padding: 0 12px;
                    border-radius: 999px;
                    border: 1px solid #e2e8f0;
                    background: #ffffff;
                    color: #334155;
                    font-size: 0.84rem;
                    font-weight: 700;
                    box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
                    white-space: nowrap;
                    font-variant-numeric: tabular-nums;
                    font-feature-settings: "tnum";
                }

                .runner-skill-chip {
                    border-color: #bfdbfe;
                    background: #eff6ff;
                    color: #1d4ed8;
                }

                .runner-timer-chip {
                    min-width: 92px;
                    justify-content: center;
                }

                .runner-save-chip {
                    border-color: #bbf7d0;
                    background: #f0fdf4;
                    color: #15803d;
                }

                .runner-save-status-chip {
                    min-width: 132px;
                    justify-content: center;
                }

                .runner-header-submit {
                    flex-shrink: 0;
                    height: 32px;
                    border-radius: 999px;
                    padding-inline: 14px;
                    font-size: 0.84rem;
                    font-weight: 800;
                    box-shadow: 0 2px 8px rgba(37, 99, 235, 0.16);
                }

                .runner-split-layout {
                    display: grid;
                    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
                    align-items: stretch;
                    height: calc(100vh - 118px);
                    min-height: 520px;
                }

                .runner-split-pane {
                    min-width: 0;
                    height: 100%;
                    overflow-y: auto;
                    overscroll-behavior: contain;
                    padding-bottom: 18px !important;
                }

                .runner-split-pane::-webkit-scrollbar {
                    width: 8px;
                }

                .runner-split-pane::-webkit-scrollbar-track {
                    background: transparent;
                }

                .runner-split-pane::-webkit-scrollbar-thumb {
                    background: rgba(148, 163, 184, 0.42);
                    border-radius: 999px;
                }

                @media (max-width: 1100px) {
                    .runner-split-layout {
                        grid-template-columns: 1fr;
                        height: auto;
                    }

                    .runner-split-pane {
                        height: auto;
                        max-height: none !important;
                        overflow: visible !important;
                        padding-bottom: 20px !important;
                    }
                }

                @media (max-width: 980px) {
                    .runner-autosave-tag {
                        display: none;
                    }

                    .runner-audio-slot {
                        width: 250px;
                        min-width: 250px;
                        max-width: 250px;
                        flex-basis: 250px;
                    }

                    .runner-page-title {
                        font-size: 0.875rem;
                    }
                }

                @media (max-width: 820px) {
                    .runner-header-meta {
                        gap: 6px;
                    }

                    .runner-skill-chip {
                        display: none;
                    }

                    .runner-audio-slot {
                        width: 190px;
                        min-width: 190px;
                        max-width: 190px;
                        flex-basis: 190px;
                    }

                    .runner-mock-audio-state {
                        display: none;
                    }

                    .runner-header-submit {
                        padding-inline: 10px;
                    }
                }
            `}</style>

            {expectedSkill === 'READING' ? (
                <ReadingBody
                    passages={readingPassages}
                    activePassageIndex={activeItemIndex}
                    answerMap={answerMap}
                    onAnswerChange={handleAnswerChange}
                />
            ) : (
                <ListeningBody
                    parts={listeningParts}
                    activePartIndex={activeItemIndex}
                    answerMap={answerMap}
                    onAnswerChange={handleAnswerChange}
                />
            )}

            <div
                style={{
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 900,
                    padding: '4px 8px 6px',
                    background: 'linear-gradient(180deg, rgba(248,250,252,0) 0%, rgba(248,250,252,0.74) 55%, rgba(248,250,252,0.9) 100%)',
                    pointerEvents: 'none',
                }}
            >
                <div style={{ width: 'fit-content', margin: '0 auto', pointerEvents: 'auto' }}>
                    <Card
                        size="small"
                        bodyStyle={{ padding: 0 }}
                        style={{
                            width: 'fit-content',
                            margin: '0 auto',
                            borderRadius: 0,
                            border: '1px solid #dbeafe',
                            boxShadow: '0 6px 16px rgba(15, 23, 42, 0.1)',
                            background: 'rgba(255, 255, 255, 0.96)',
                            backdropFilter: 'blur(10px)',
                            overflow: 'hidden',
                        }}
                    >
                        <div style={{ display: 'flex' }}>
                            {navigationItems.map((item, index) => {
                                const itemNumber = expectedSkill === 'READING'
                                    ? (item as PracticeSessionReadingPassageDto).passageNumber
                                    : (item as PracticeSessionListeningPartDto).partNumber;
                                const isActive = index === activeItemIndex;

                                return (
                                    <Button
                                        key={item.id}
                                        type="text"
                                        aria-label={`${expectedSkill === 'READING' ? 'Passage' : 'Part'} ${itemNumber ?? index + 1}`}
                                        onClick={() => handleNavigationItemChange(index)}
                                        style={{
                                            borderRadius: 0,
                                            minWidth: 38,
                                            height: 32,
                                            paddingInline: 12,
                                            borderRight: index === navigationItems.length - 1 ? 'none' : '1px solid #e2e8f0',
                                            background: isActive ? '#111827' : '#fff',
                                            color: isActive ? '#fff' : '#0f172a',
                                            fontWeight: 700,
                                        }}
                                    >
                                        {itemNumber ?? index + 1}
                                    </Button>
                                );
                            })}
                        </div>
                    </Card>
                </div>
            </div>
        </div>
        </>
    );
};

export const ClientReadingSessionPage: FC = () => <ObjectiveRunnerPage expectedSkill="READING" />;

export const ClientListeningSessionPage: FC = () => <ObjectiveRunnerPage expectedSkill="LISTENING" />;
