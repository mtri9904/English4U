import { Spin, Tag, Collapse, Empty, Button, FloatButton, Image } from 'antd';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { areAllOptionsLabelOnly, getOptionLabel, stripOptionLeadingLabel } from '@/shared/utils/optionLabel.utils';
import { formatTranscriptRangeLabel, parseListeningTranscriptEnvelope } from '@/shared/lib/listeningTranscript';
import { useExamDetailQuery } from '../api/exam.api';
import { BookOutlined, QuestionCircleOutlined, ArrowLeftOutlined, SoundOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import type { QuestionGroupDto, QuestionDto, QuestionOptionDto, SectionDetailDto } from '../types/exam.types';
import { getEffectiveMcqGroupType, getQuestionTypeLabel, inferQuestionGroupOptionLabelType as inferOptionLabelType } from '@/shared/lib/examDisplay';
import { TruthValueDefinitionTable } from '@/shared/components/TruthValueDefinitionTable';
import { parseWritingTaskAssetsData } from '@/shared/lib/writingTaskAssets';

const typeColorMap: Record<string, string> = {
    MCQ_SINGLE: '#7c3aed', MCQ_MULTIPLE: '#8b5cf6',
    MCQ_CHOOSE_N: '#8b5cf6',
    TFNG: '#10b981', YNNG: '#10b981',
    MATCHING_HEADINGS: '#f59e0b', MATCHING_INFO: '#d97706', MATCHING_FEATURES: '#b45309', MATCHING_CLASSIFICATION: '#b45309', MATCHING_VISUALS: '#9a3412',
    SENTENCE_COMPLETION: '#3b82f6', SUMMARY_COMPLETION: '#2563eb',
    TABLE_COMPLETION: '#1d4ed8', MATCHING_TABLE: '#1e40af', FLOWCHART_COMPLETION: '#1e40af', ORDERING_INFORMATION: '#0f766e',
    MAP_LABELLING: '#0ea5e9',
    SHORT_ANSWER: '#ec4899',
    SHORT_ANSWER_QUESTIONS: '#db2777',
};

const MATCHING_TYPES = new Set(['MATCHING_HEADINGS', 'MATCHING_INFO', 'MATCHING_FEATURES', 'MATCHING_CLASSIFICATION', 'MATCHING_VISUALS', 'MATCHING_TABLE', 'MAP_LABELLING']);
const TABLE_TYPES = new Set(['TABLE_COMPLETION', 'MATCHING_TABLE']);
const TABLE_TITLE_PLACEHOLDER = 'Tiêu đề bảng';
const isFlowchartLikeType = (groupType?: string | null) =>
    groupType === 'FLOWCHART_COMPLETION' || groupType === 'ORDERING_INFORMATION';

const SKILL_COLORS: Record<string, string> = {
    Reading: '#10b981', Listening: '#6366f1', Writing: '#f59e0b', Speaking: '#ef4444',
};

const parseMultiSelectContent = (contentData?: string | null) => {
    if (!contentData) {
        return { prompt: '', isListeningMultiSelectLayout: false };
    }

    try {
        const parsed = JSON.parse(contentData) as unknown;
        if (typeof parsed === 'string') {
            return { prompt: parsed, isListeningMultiSelectLayout: false };
        }

        if (parsed && typeof parsed === 'object' && (parsed as { layout?: unknown }).layout === 'listening_multi_select') {
            const prompt = (parsed as { prompt?: unknown }).prompt;
            return {
                prompt: typeof prompt === 'string' ? prompt : '',
                isListeningMultiSelectLayout: true,
            };
        }
    } catch {
        return { prompt: contentData, isListeningMultiSelectLayout: false };
    }

    return { prompt: contentData, isListeningMultiSelectLayout: false };
};

const ROMAN_LABEL_TOKENS = Array.from({ length: 20 }, (_, index) => getOptionLabel(index, 'roman'));

const sanitizeLabelToken = (value?: string | null) =>
    (value ?? '')
        .trim()
        .replace(/^[([{<\s"']+/, '')
        .replace(/[)\]}>.,;:!?\s"']+$/, '');

const isRomanLabelToken = (value?: string | null) => {
    const normalized = sanitizeLabelToken(value).toLowerCase();
    if (!normalized) {
        return false;
    }

    return ROMAN_LABEL_TOKENS.includes(normalized);
};

const romanLabelToAlpha = (value: string) => {
    const normalized = sanitizeLabelToken(value).toLowerCase();
    const labelIndex = ROMAN_LABEL_TOKENS.indexOf(normalized);
    return labelIndex >= 0 ? getOptionLabel(labelIndex, 'alpha') : sanitizeLabelToken(value).toUpperCase();
};

const alphaLabelToRoman = (value: string) => {
    const normalized = sanitizeLabelToken(value).toUpperCase();
    if (!/^[A-Z]$/.test(normalized)) {
        return sanitizeLabelToken(value).toLowerCase();
    }

    return getOptionLabel(normalized.charCodeAt(0) - 65, 'roman');
};

const normalizeAnswerTokenForLabelType = (token: string, optionLabelType: 'alpha' | 'roman' = 'alpha') => {
    const normalized = sanitizeLabelToken(token);
    if (!normalized) {
        return '';
    }

    if (optionLabelType === 'roman') {
        return isRomanLabelToken(normalized)
            ? normalized.toLowerCase()
            : alphaLabelToRoman(normalized);
    }

    return isRomanLabelToken(normalized)
        ? romanLabelToAlpha(normalized)
        : normalized.toUpperCase();
};

const formatCorrectAnswerForDisplay = (answer: string) =>
    answer
        .split('|')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .join(' / ');

const stripDisplayedOptionLeadingLabel = (optionText: string | null | undefined, optionLabel: string) => {
    const text = (optionText ?? '').trim();
    if (!text) {
        return '';
    }

    const escapedLabel = optionLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`^${escapedLabel}\\s*(?:[.)\\:-]\\s*|\\s+)`, 'i'), '').trim();
};

const renderStandardOptionContent = (option: QuestionOptionDto, optionLabel: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <span>
            {optionLabel}. {renderFormattedText(stripDisplayedOptionLeadingLabel(option.optionText, optionLabel))}
        </span>
        {option.imageUrl ? (
            <img
                src={option.imageUrl}
                alt={`Option ${optionLabel}`}
                style={{
                    width: '100%',
                    maxWidth: 220,
                    maxHeight: 160,
                    objectFit: 'contain',
                    borderRadius: 8,
                    background: '#fff',
                    border: '1px solid #e2e8f0',
                }}
            />
        ) : null}
    </div>
);

const normalizeMarkdownDisplayText = (text: string) =>
    (text ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\\\*\\\*/g, '**')
        .replace(/\\_\\_/g, '__');

const getSharedGroupOptions = (group: QuestionGroupDto) =>
    group.questions.find((question) => (question.options?.length ?? 0) > 0)?.options ?? [];

const hasSequentialAlphaOptionBank = (options: QuestionOptionDto[]) => {
    if (options.length < 2) {
        return false;
    }

    let labelledCount = 0;
    for (let index = 0; index < options.length; index += 1) {
        const expectedLabel = String.fromCharCode(65 + index);
        const text = options[index]?.optionText?.trim() ?? '';
        if (new RegExp(`^${expectedLabel}\\s*(?:[.)\\:-]\\s*|\\s+)\\S`, 'i').test(text)) {
            labelledCount += 1;
        }
    }

    return labelledCount >= Math.min(options.length, 4);
};



const countTokenOccurrences = (text: string, token: string) => {
    if (!text || !token) {
        return 0;
    }

    let count = 0;
    let index = 0;
    while (true) {
        const nextIndex = text.indexOf(token, index);
        if (nextIndex < 0) {
            return count;
        }

        count += 1;
        index = nextIndex + token.length;
    }
};

const stripSingleOrphanPair = (text: string, token: string) => {
    if (!text || !token) {
        return text;
    }

    const occurrenceCount = countTokenOccurrences(text, token);
    if (occurrenceCount !== 1) {
        return text;
    }

    if (text.startsWith(token)) {
        return text.slice(token.length).trimStart();
    }

    if (text.endsWith(token)) {
        return text.slice(0, -token.length).trimEnd();
    }

    return text;
};

const stripBoundaryIfUnmatched = (text: string, token: string) => {
    if (!text || !token) {
        return text;
    }

    const occurrenceCount = countTokenOccurrences(text, token);
    if (occurrenceCount === 0 || occurrenceCount % 2 === 0) {
        return text;
    }

    if (text.startsWith(token)) {
        return text.slice(token.length).trimStart();
    }

    if (text.endsWith(token)) {
        return text.slice(0, -token.length).trimEnd();
    }

    return text;
};

const stripOrphanMarkdownMarkers = (text: string) => {
    let working = (text ?? '').trim();
    if (!working) {
        return '';
    }

    working = working.replace(/^[\u200B-\u200D\uFEFF\s]+|[\u200B-\u200D\uFEFF\s]+$/g, '');
    working = stripBoundaryIfUnmatched(working, '**');
    working = stripBoundaryIfUnmatched(working, '__');
    working = stripBoundaryIfUnmatched(working, '\\*\\*');
    working = stripBoundaryIfUnmatched(working, '\\_\\_');
    working = stripSingleOrphanPair(working, '**');
    working = stripSingleOrphanPair(working, '__');
    working = stripSingleOrphanPair(working, '\\*\\*');
    working = stripSingleOrphanPair(working, '\\_\\_');

    return working.trim();
};

const hasStructuredParagraphLabels = (text: string) => {
    const labels = Array.from(
        new Set(
            (text.match(/^(?:\*\*)?([A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?(?:\s+\S.*)?$/gm) ?? [])
                .map((line) => line.match(/^(?:\*\*)?([A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?/)?.[1] ?? '')
                .filter(Boolean),
        ),
    )
        .map((label) => label.toUpperCase())
        .sort();

    if (labels.length < 2) {
        return false;
    }

    let longestRun = 1;
    let currentRun = 1;
    for (let i = 1; i < labels.length; i += 1) {
        if (labels[i].charCodeAt(0) === labels[i - 1].charCodeAt(0) + 1) {
            currentRun += 1;
            longestRun = Math.max(longestRun, currentRun);
        } else {
            currentRun = 1;
        }
    }

    return longestRun >= 2;
};

const isLikelyReadingSubheading = (line: string) => {
    if (!line) {
        return false;
    }

    const candidate = line.trim();
    if (!candidate || candidate.length < 4 || candidate.length > 90) {
        return false;
    }

    if (/[.!?]$/.test(candidate)) {
        return false;
    }

    if (/^\[Q\d+\]$/i.test(candidate)) {
        return false;
    }

    if (/^(questions?|passage|reading passage)\b/i.test(candidate)) {
        return false;
    }

    const words = candidate.split(/\s+/).filter(Boolean);
    if (words.length === 0 || words.length > 8) {
        return false;
    }

    if (words.length === 1 && !/[0-9-]/.test(candidate)) {
        return false;
    }

    const lettersOnly = candidate.replace(/[^A-Za-z]/g, '');
    if (!lettersOnly) {
        return false;
    }

    const upperLetterCount = lettersOnly
        .split('')
        .filter((char) => char === char.toUpperCase())
        .length;
    return upperLetterCount / lettersOnly.length >= 0.85;
};

const parseReadingSubheading = (line: string) => {
    if (!line) {
        return null;
    }

    const explicitBoldMatch = line.match(/^(?:\*\*|__)\s*(.+?)\s*(?:\*\*|__)$/);
    const candidate = (explicitBoldMatch?.[1] ?? line).trim();
    if (!isLikelyReadingSubheading(candidate)) {
        return null;
    }

    return candidate;
};

const isLikelyReadingSubheadingToken = (token: string) => /^[A-Z0-9]+(?:[.\-\/&][A-Z0-9]+)*$/.test(token);

const splitGluedHeadingToken = (token: string) => {
    if (!token) {
        return [token];
    }

    const match = token.match(/^(?<heading>[A-Z0-9]+(?:[.\-][A-Z0-9]+)*)(?<body>[A-Z][a-z][A-Za-z'’.-]*)$/);
    if (!match?.groups?.heading || !match.groups.body) {
        return [token];
    }

    return [match.groups.heading, match.groups.body];
};

const parseInlineReadingSubheading = (line: string) => {
    if (!line) {
        return null;
    }

    const explicitBoldMatch = line.match(/^(?:\*\*|__)\s*(.+?)\s*(?:\*\*|__)\s+(.+)$/);
    if (explicitBoldMatch) {
        const heading = parseReadingSubheading(explicitBoldMatch[1]);
        const body = stripOrphanMarkdownMarkers(explicitBoldMatch[2]);
        if (heading && body) {
            return { heading, body };
        }
    }

    const tokens = line
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .flatMap(splitGluedHeadingToken);
    if (tokens.length < 2) {
        return null;
    }

    const maxHeadingTokens = Math.min(8, tokens.length - 1);
    for (let headingTokenCount = maxHeadingTokens; headingTokenCount >= 1; headingTokenCount -= 1) {
        const headingCandidate = tokens.slice(0, headingTokenCount).join(' ').trim();
        const bodyCandidate = tokens.slice(headingTokenCount).join(' ').trim();

        if (!headingCandidate || !bodyCandidate) {
            continue;
        }

        if (!/[a-z]/.test(bodyCandidate) || bodyCandidate.length < 12) {
            continue;
        }

        if (/[,;:]$/.test(headingCandidate)) {
            continue;
        }

        if (!tokens.slice(0, headingTokenCount).every(isLikelyReadingSubheadingToken)) {
            continue;
        }

        const heading = parseReadingSubheading(headingCandidate);
        if (!heading) {
            continue;
        }

        return {
            heading,
            body: stripOrphanMarkdownMarkers(bodyCandidate),
        };
    }

    return null;
};

const splitTrailingGluedBodyFromStandaloneSubheading = (line: string, nextLine?: string) => {
    if (!line || !nextLine?.trim()) {
        return null;
    }

    const tokens = line
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (tokens.length < 2 || tokens.length > 8) {
        return null;
    }

    const lastToken = tokens[tokens.length - 1];
    const lastTokenParts = splitGluedHeadingToken(lastToken);
    if (lastTokenParts.length !== 2) {
        return null;
    }

    const [headingTail, bodyLead] = lastTokenParts;
    const headingTokens = [...tokens.slice(0, -1), headingTail];
    if (!headingTokens.every(isLikelyReadingSubheadingToken)) {
        return null;
    }

    const heading = parseReadingSubheading(headingTokens.join(' ').trim());
    if (!heading) {
        return null;
    }

    const mergedBody = `${bodyLead} ${nextLine.trim()}`.trim();
    if (!/[a-z]/.test(mergedBody) || mergedBody.length < 12) {
        return null;
    }

    return {
        heading,
        bodyLead,
    };
};

const normalizeBlockMarkdownText = (text: string) =>
    normalizeMarkdownDisplayText(text)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(?<!\n)\n(?!\n)/g, '  \n')
        .trim();

const repairOutOfOrderStructuredParagraphLabels = (text: string) => {
    if (!text.trim()) {
        return text;
    }

    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const rebuilt: string[] = [];
    let highestAcceptedLabel: string | null = null;
    let pendingTextPrefix: string | null = null;

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        const labelMatch = line.match(/^\*\*([A-H])\.\*\*$/i);
        if (labelMatch) {
            const label = labelMatch[1].toUpperCase();
            if (!highestAcceptedLabel || label > highestAcceptedLabel) {
                highestAcceptedLabel = label;
                pendingTextPrefix = null;
                rebuilt.push(line);
                return;
            }

            pendingTextPrefix = label;
            while (rebuilt.length > 0 && !rebuilt[rebuilt.length - 1].trim()) {
                rebuilt.pop();
            }
            return;
        }

        if (pendingTextPrefix) {
            if (!line) {
                return;
            }

            const repairedLine = `${pendingTextPrefix} ${line}`.trim();
            pendingTextPrefix = null;
            if (rebuilt.length > 0 && rebuilt[rebuilt.length - 1].trim()) {
                rebuilt[rebuilt.length - 1] = `${rebuilt[rebuilt.length - 1].trimEnd()} ${repairedLine}`;
            } else {
                rebuilt.push(repairedLine);
            }
            return;
        }

        rebuilt.push(rawLine);
    });

    return rebuilt.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const markdownComponents = {
    p: ({ ...props }) => <p style={{ margin: '0 0 0.75rem' }} {...props} />,
    strong: ({ ...props }) => <strong style={{ fontWeight: 800, color: '#0f172a' }} {...props} />,
    em: ({ ...props }) => <em style={{ fontStyle: 'italic', fontWeight: 600, color: '#1f2937' }} {...props} />,
    ul: ({ ...props }) => <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }} {...props} />,
    ol: ({ ...props }) => <ol style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }} {...props} />,
    li: ({ ...props }) => <li style={{ marginBottom: '0.25rem' }} {...props} />,
};

const normalizeMarkdownText = (text: string) => {
    const unescaped = normalizeMarkdownDisplayText(text);

    const repairedAbbreviations = unescaped.replace(/(?<=\b[A-Z])\.\s*\n\s*(?=[A-Z]\.)/g, '.');
    const structuredLabels = hasStructuredParagraphLabels(repairedAbbreviations);
    const withLabelBoundaries = structuredLabels
        ? repairedAbbreviations.replace(/([.!?'"”’)\]])\s*(?=(\*\*)?[A-H](?:\s*[).:\-]|[.])?(\*\*)?\s+)/g, '$1\n\n')
        : repairedAbbreviations;
    const withSpeakerBoundaries = withLabelBoundaries.replace(
        /([’'"”])\s+([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,6}\s+\((?:[^()\n]{3,220})\))/g,
        '$1\n\n$2',
    );
    const withoutOrphanMarkers = withSpeakerBoundaries.replace(
        /(^|\n)[\u200B-\u200D\uFEFF \t]*(?:\*{2,}|_{2,})\s+(?=\S)/g,
        '$1',
    );
    const normalizedLines: string[] = [];
    const rawLines = withoutOrphanMarkers.split('\n');

    for (let lineIndex = 0; lineIndex < rawLines.length; lineIndex += 1) {
        const rawLine = rawLines[lineIndex];
        let line = stripOrphanMarkdownMarkers(rawLine.trim());
        if (!line) {
            if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
                normalizedLines.push('');
            }
            continue;
        }

        const trailingGluedSubheading = splitTrailingGluedBodyFromStandaloneSubheading(line, rawLines[lineIndex + 1]);
        if (trailingGluedSubheading) {
            line = trailingGluedSubheading.heading;
            rawLines[lineIndex + 1] = `${trailingGluedSubheading.bodyLead} ${rawLines[lineIndex + 1].trim()}`
                .trim();
        }

        const labeledParagraph = structuredLabels
            ? line.match(/^(?:\*\*)?([A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?\s+(.+)$/)
            : null;
        if (labeledParagraph) {
            const [, label, body] = labeledParagraph;
            if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
                normalizedLines.push('');
            }

            normalizedLines.push(`**${label}.**`);
            normalizedLines.push('');
            normalizedLines.push(stripOrphanMarkdownMarkers(body));
            continue;
        }

        const standaloneLabel = structuredLabels
            ? line.match(/^(?:\*\*)?([A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?$/)
            : null;
        if (standaloneLabel) {
            const [, label] = standaloneLabel;
            if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
                normalizedLines.push('');
            }

            normalizedLines.push(`**${label}.**`);
            continue;
        }

        const speakerLine = line.match(/^(?:\*\*\*)?([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,6}\s+\((?:[^()\n]{3,220})\))(?:\*\*\*)?$/);
        if (speakerLine) {
            const [, speaker] = speakerLine;
            if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
                normalizedLines.push('');
            }

            normalizedLines.push(`***${speaker}***`);
            normalizedLines.push('');
            continue;
        }

        const inlineSubheading = parseInlineReadingSubheading(line);
        if (inlineSubheading) {
            if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
                normalizedLines.push('');
            }

            normalizedLines.push(`**${inlineSubheading.heading}**`);
            normalizedLines.push('');
            normalizedLines.push(inlineSubheading.body);
            continue;
        }

        const subheading = parseReadingSubheading(line);
        if (subheading) {
            if (normalizedLines.length > 0 && normalizedLines[normalizedLines.length - 1] !== '') {
                normalizedLines.push('');
            }

            normalizedLines.push(`**${subheading}**`);
            normalizedLines.push('');
            continue;
        }

        normalizedLines.push(line);
    }

    return repairOutOfOrderStructuredParagraphLabels(
        normalizedLines.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    );
};

const shouldForceReadingParagraphLabels = (questionGroups: QuestionGroupDto[]) =>
    questionGroups.some((group) => {
        const normalizedGroupType = (group.groupType ?? '').toUpperCase();
        if (normalizedGroupType === 'MATCHING_HEADINGS' || normalizedGroupType === 'MATCHING_INFO') {
            return true;
        }

        return /\bparagraphs?\b/i.test(group.instruction ?? '');
    });

const normalizeReadingPassageMarkdown = (text: string, questionGroups: QuestionGroupDto[]) => {
    const normalized = normalizeMarkdownText(text);
    if (!normalized || hasStructuredParagraphLabels(normalized) || !shouldForceReadingParagraphLabels(questionGroups)) {
        return normalized;
    }

    const paragraphBlocks = normalized
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter((block) => block.length > 0)
        .filter((block) => block.length >= 25 || /[.!?]\s*$/.test(block));

    if (paragraphBlocks.length < 3 || paragraphBlocks.length > 8) {
        return normalized;
    }

    return paragraphBlocks
        .map((block, index) => {
            const cleanBlock = block.replace(/^\s*(?:\*\*)?[A-H](?:\.|\b)(?:\*\*)?\s*/i, '');
            return `**${getOptionLabel(index, 'alpha')}.**\n\n${cleanBlock}`;
        })
        .join('\n\n');
};

const QuestionItem = ({
    q,
    qIdx,
    groupType,
    skillType,
    optionLabelType = 'alpha',
}: {
    q: QuestionDto;
    qIdx: number;
    groupType: string | null;
    skillType?: string;
    optionLabelType?: 'alpha' | 'roman';
}) => {
    const gType = groupType ?? '';
    const color = typeColorMap[gType] || '#64748b';
    const isMatchingType = new Set(['MATCHING_HEADINGS', 'MATCHING_INFO', 'MATCHING_FEATURES', 'MATCHING_CLASSIFICATION', 'MATCHING_VISUALS', 'MATCHING_TABLE', 'MAP_LABELLING', 'FLOWCHART_COMPLETION', 'ORDERING_INFORMATION']).has(gType);
    const isSummaryCompletion = gType === 'SUMMARY_COMPLETION';
    const correctAnswerTokens = new Set(
        (q.correctAnswer ?? '')
            .split('|')
            .map((item) => normalizeAnswerTokenForLabelType(item, optionLabelType))
            .filter((item) => item.length > 0),
    );
    return (
        <div style={{ padding: '16px', background: '#fff', borderRadius: '10px', marginBottom: '8px', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <QuestionCircleOutlined style={{ color: '#0ea5e9', fontSize: '1.125rem' }} />
                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '1rem' }}>Câu {q.questionNumber ?? qIdx + 1}</span>
                {gType && (
                    <Tag style={{ background: `${color}15`, color, border: 'none', borderRadius: '6px', fontSize: '0.875rem' }}>
                        {getQuestionTypeLabel(gType, skillType)}
                    </Tag>
                )}
            </div>
            {q.content?.trim() ? (
                <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
                    {renderFormattedText(q.content || '')}
                </p>
            ) : null}
            {q.correctAnswer && (
                <div style={{ marginTop: '8px', padding: '6px 12px', background: '#dcfce7', borderRadius: '6px', color: '#16a34a', fontWeight: 600, fontSize: '0.875rem' }}>
                    Đáp án: {renderFormattedText(formatCorrectAnswerForDisplay(q.correctAnswer))}
                </div>
            )}
            {q.options.length > 0 && !isMatchingType && !isSummaryCompletion && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {q.options.map((opt, oIdx) => {
                        const optionLabel = getOptionLabel(oIdx, optionLabelType);
                        const isCorrect = opt.isCorrect || correctAnswerTokens.has(optionLabel);

                        return (
                            <div key={oIdx} style={{
                                fontSize: '0.9375rem', padding: '6px 12px', borderRadius: '6px',
                                background: isCorrect ? '#dcfce7' : 'transparent',
                                color: isCorrect ? '#16a34a' : '#64748b',
                                fontWeight: isCorrect ? 600 : 400,
                                border: isCorrect ? '1px solid #bbf7d0' : '1px solid transparent'
                            }}>
                                {renderStandardOptionContent(opt, optionLabel)}
                                {isCorrect && ' ✓'}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

const renderFormattedText = (text: string) => {
    const normalizedText = normalizeMarkdownDisplayText(text).replace(/__(.+?)__/g, '**$1**');
    if (!normalizedText) return null;

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

    return segments.flatMap((segment, segIdx) => {
        if (!segment.text) return [];

        const qParts = segment.text.split(/(\[Q\d+\])/g);
        return qParts.map((part, partIdx) => {
            if (!part) return null;
            const key = `${segIdx}-${partIdx}`;

            if (/^\[Q\d+\]$/.test(part)) {
                return (
                    <b key={key} style={{ color: '#2563eb', padding: '0 4px', background: '#dbeafe', borderRadius: '3px', fontSize: '0.8125rem' }}>
                        {part}
                    </b>
                );
            }

            if (segment.bold) {
                return <strong key={key} style={{ fontWeight: 800, color: '#1e293b' }}>{part}</strong>;
            }

            return <span key={key}>{part}</span>;
        });
    });
};

const renderGroupContent = (group: QuestionGroupDto, hideParsedText = false) => {
    if (!group.contentData && !group.assetsData) return null;
    const parsedContentText = (() => {
        if (!group.contentData) return '';

        if (group.groupType === 'MCQ_MULTIPLE' || group.groupType === 'MCQ_CHOOSE_N') {
            return parseMultiSelectContent(group.contentData).prompt;
        }

        return group.contentData;
    })();
    const assetImageUrl = (() => {
        if (!group.assetsData) return null;

        if (group.groupType === 'MATCHING_VISUALS') {
            return null;
        }

        if (group.groupType === 'MAP_LABELLING' || isFlowchartLikeType(group.groupType)) {
            try {
                const parsed = JSON.parse(group.assetsData);
                if (typeof parsed === 'string') return parsed;
                if (parsed && typeof parsed === 'object') {
                    if (typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string') {
                        return (parsed as { imageUrl: string }).imageUrl;
                    }
                    if (typeof (parsed as { url?: unknown }).url === 'string') {
                        return (parsed as { url: string }).url;
                    }
                }
            } catch {
                return group.assetsData;
            }
        }

        try {
            const parsed = JSON.parse(group.assetsData);
            if (parsed && typeof parsed === 'object') {
                const images = (parsed as { images?: unknown }).images;
                if (Array.isArray(images)) {
                    return images.filter((item): item is string => typeof item === 'string');
                }
            }
        } catch {
            // ignore JSON parse errors
        }

        return group.assetsData;
    })();

    const isDiagramType = group.groupType === 'MAP_LABELLING' || isFlowchartLikeType(group.groupType);
    const hasGroupVisualImage = !!assetImageUrl;
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
    const effectiveHideParsedText = hideParsedText || (
        isDiagramType && hasGroupVisualImage && !isMeaningfulPrompt(parsedContentText)
    );

    if (TABLE_TYPES.has(group.groupType || '')) {
        try {
            const parsedData = JSON.parse(group.contentData || '[]');
            const tableData = Array.isArray(parsedData)
                ? parsedData
                : (parsedData && typeof parsedData === 'object' && Array.isArray((parsedData as { rows?: unknown }).rows)
                    ? (parsedData as { rows: unknown[] }).rows
                    : []);
            const tableTitle = parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)
                && typeof (parsedData as { title?: unknown }).title === 'string'
                ? (parsedData as { title: string }).title.trim()
                : '';
            const normalizedTableTitle = tableTitle === TABLE_TITLE_PLACEHOLDER ? '' : tableTitle;

            if (Array.isArray(tableData) && tableData.length > 0) {
                return (
                    <div style={{ overflowX: 'auto', marginBottom: '15px' }}>
                        {normalizedTableTitle && (
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: '8px' }}>
                                {renderFormattedText(normalizedTableTitle)}
                            </div>
                        )}
                        <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', fontSize: '0.875rem' }}>
                            <tbody>
                                {tableData.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                        {Array.isArray(row) && row.map((cell, cIdx: number) => (
                                            <td key={cIdx} style={{ border: '1px solid #cbd5e1', padding: '10px' }}>
                                                {renderFormattedText(typeof cell === 'string' ? cell : '')}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
        } catch { }
    }

    return (
        <div style={{ marginBottom: '15px' }}>
            {assetImageUrl ? (
                Array.isArray(assetImageUrl) ? (
                    <div style={{ display: 'grid', gap: '12px', marginBottom: '12px' }}>
                        {assetImageUrl.map((url, index) => (
                            <div key={`${url}-${index}`} style={{ textAlign: 'center' }}>
                                <Image
                                    src={url}
                                    alt={`Question Asset ${index + 1}`}
                                    style={{
                                        maxHeight: '320px',
                                        maxWidth: '100%',
                                        objectFit: 'contain',
                                        borderRadius: '12px',
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                        cursor: 'zoom-in',
                                    }}
                                    preview={{
                                        mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ marginBottom: '12px', textAlign: 'center' }}>
                        <Image
                            src={assetImageUrl}
                            alt="Question Asset"
                            style={{
                                maxHeight: '620px',
                                maxWidth: '100%',
                                objectFit: 'contain',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0',
                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                                cursor: 'zoom-in',
                            }}
                            preview={{
                                mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                            }}
                        />
                    </div>
                )
            ) : null}
            {parsedContentText && !effectiveHideParsedText && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                    <ReactMarkdown components={markdownComponents}>
                        {normalizeBlockMarkdownText(parsedContentText)}
                    </ReactMarkdown>
                </div>
            )}
        </div>
    );
};

const ChooseNStatementsView = ({ group }: { group: QuestionGroupDto }) => {
    const parsedPrompt = parseMultiSelectContent(group.contentData).prompt;
    const startQuestion = group.startQuestion ?? group.questions[0]?.questionNumber ?? 1;
    const endQuestion = group.endQuestion ?? group.questions[group.questions.length - 1]?.questionNumber ?? startQuestion;
    const optionLabelType = inferOptionLabelType(group);
    const answerMap = group.questions.map((question, index) => ({
        questionNumber: question.questionNumber ?? startQuestion + index,
        answer: formatCorrectAnswerForDisplay(question.correctAnswer || ''),
    }));
    const selectedLetters = new Set(
        group.questions
            .map((question) => question.correctAnswer ?? '')
            .flatMap((answer) => answer.split('|'))
            .map((answer) => normalizeAnswerTokenForLabelType(answer, optionLabelType))
            .filter((item) => item.length > 0),
    );
    const sharedOptions = getSharedGroupOptions(group);

    return (
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '14px', marginBottom: '10px' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f172a', marginBottom: '8px' }}>
                Questions {startQuestion}-{endQuestion}
            </div>
            {parsedPrompt && (
                <div style={{ color: '#1e293b', fontSize: '1rem', lineHeight: 1.6, marginBottom: '10px' }}>
                    <ReactMarkdown components={markdownComponents}>
                        {normalizeBlockMarkdownText(parsedPrompt)}
                    </ReactMarkdown>
                </div>
            )}
            {sharedOptions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                    {sharedOptions.map((option, index) => {
                        const label = getOptionLabel(index, optionLabelType);
                        const isSelected = selectedLetters.has(label);

                        return (
                            <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                <span style={{
                                    width: '22px',
                                    height: '22px',
                                    borderRadius: '999px',
                                    background: '#e2e8f0',
                                    color: '#1e293b',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '0.8125rem',
                                    flexShrink: 0,
                                }}>
                                    {label}
                                </span>
                                <span style={{
                                    width: '16px',
                                    height: '16px',
                                    border: `1px solid ${isSelected ? '#16a34a' : '#94a3b8'}`,
                                    borderRadius: '2px',
                                    background: isSelected ? '#dcfce7' : '#fff',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '0.6875rem',
                                    color: '#16a34a',
                                    marginTop: '3px',
                                    flexShrink: 0,
                                }}>
                                    {isSelected ? '✓' : ''}
                                </span>
                                <span style={{ color: '#334155', fontSize: '0.9375rem', lineHeight: 1.6 }}>
                                    {renderFormattedText(option.optionText || '')}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
            <div style={{ padding: '10px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                    Answer boxes
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {answerMap.map((item) => (
                        <Tag key={item.questionNumber} color="blue" style={{ marginInlineEnd: 0 }}>
                            Q{item.questionNumber}: {item.answer || '—'}
                        </Tag>
                    ))}
                </div>
            </div>
        </div>
    );
};

const SummaryWordBankTable = ({ group }: { group: QuestionGroupDto }) => {
    const options = getSharedGroupOptions(group);
    const optionLabelType = inferOptionLabelType(group);
    if (options.length === 0) {
        return null;
    }

    const columns = 4;
    const rows = Array.from({ length: Math.ceil(options.length / columns) }, (_, rowIndex) =>
        options.slice(rowIndex * columns, rowIndex * columns + columns),
    );

    return (
        <div style={{ background: '#fff', padding: '12px', border: '2px solid #0ea5e9', borderRadius: '12px', marginBottom: '15px' }}>
            <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '10px', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                Answer Box
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, background: '#fff' }}>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {Array.from({ length: columns }, (_, columnIndex) => {
                                    const option = row[columnIndex];
                                    const globalIndex = rowIndex * columns + columnIndex;
                                    return (
                                        <td
                                            key={columnIndex}
                                            style={{
                                                width: `${100 / columns}%`,
                                                border: '1px solid #cbd5e1',
                                                padding: '10px 12px',
                                                color: '#334155',
                                                fontSize: '0.9375rem',
                                                verticalAlign: 'top',
                                                background: option ? '#ffffff' : '#f8fafc',
                                            }}
                                        >
                                            {option ? (
                                                <>
                                                    <b>{getOptionLabel(globalIndex, optionLabelType)}.</b>{' '}
                                                    {renderFormattedText(
                                                        stripOptionLeadingLabel(option.optionText, globalIndex, optionLabelType) || option.optionText || ''
                                                    )}
                                                </>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ClassificationMatchingPreview = ({ group }: { group: QuestionGroupDto }) => {
    const options = getSharedGroupOptions(group);
    const optionLabelType = inferOptionLabelType(group);

    if (group.questions.length === 0 || options.length === 0) {
        return null;
    }

    return (
        <div style={{ background: '#fff', padding: '12px', border: '2px solid #0ea5e9', borderRadius: '12px', marginBottom: '15px', overflowX: 'auto' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {options.map((option, index) => {
                    const label = getOptionLabel(index, optionLabelType);
                    return (
                        <Tag key={`${option.id}-${label}`} color="blue" style={{ marginInlineEnd: 0 }}>
                            {label}{option.optionText?.trim() ? ` = ${option.optionText.trim()}` : ''}
                        </Tag>
                    );
                })}
            </div>

            <table style={{ width: '100%', minWidth: 560, borderCollapse: 'collapse', background: '#fff' }}>
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left', border: '1px solid #cbd5e1', padding: '12px', background: '#f8fafc', width: '60%' }}>
                            Đối tượng
                        </th>
                        {options.map((option, index) => {
                            const label = getOptionLabel(index, optionLabelType);
                            return (
                                <th key={`${option.id}-${label}`} style={{ textAlign: 'center', border: '1px solid #cbd5e1', padding: '12px', background: '#f8fafc', minWidth: 110 }}>
                                    <div style={{ fontWeight: 700 }}>{label}</div>
                                    {option.optionText?.trim() ? (
                                        <div style={{ marginTop: 4, fontSize: '0.75rem', color: '#64748b' }}>
                                            {renderFormattedText(option.optionText)}
                                        </div>
                                    ) : null}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {group.questions.map((question, index) => {
                        const correctTokens = new Set(
                            (question.correctAnswer ?? '')
                                .split('|')
                                .map((item) => normalizeAnswerTokenForLabelType(item, optionLabelType))
                                .filter((item) => item.length > 0),
                        );

                        return (
                            <tr key={question.id}>
                                <td style={{ border: '1px solid #cbd5e1', padding: '12px', verticalAlign: 'top' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: question.content?.trim() ? '8px' : 0 }}>
                                        <Tag color="blue" style={{ marginInlineEnd: 0 }}>Câu {question.questionNumber ?? index + 1}</Tag>
                                    </div>
                                    <div style={{ color: '#334155', lineHeight: 1.6 }}>
                                        {question.content?.trim() ? renderFormattedText(question.content) : <span style={{ color: '#94a3b8' }}>Chưa có nội dung item.</span>}
                                    </div>
                                </td>
                                {options.map((option, optionIndex) => {
                                    const label = getOptionLabel(optionIndex, optionLabelType);
                                    const isCorrect = correctTokens.has(label);
                                    return (
                                        <td
                                            key={`${question.id}-${option.id}`}
                                            style={{
                                                border: '1px solid #cbd5e1',
                                                padding: '12px',
                                                textAlign: 'center',
                                                background: isCorrect ? '#dcfce7' : '#fff',
                                                color: isCorrect ? '#15803d' : '#94a3b8',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {isCorrect ? '✓' : ''}
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

const QuestionGroupBlock = ({ group, gIdx, skillType }: { group: QuestionGroupDto; gIdx: number; skillType: string }) => {
    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
    });
    const displayGroup = { ...group, groupType: effectiveGroupType || group.groupType };
    const usesLegacySharedMultiSelectLayout = effectiveGroupType === 'MCQ_CHOOSE_N';
    const optionLabelType = inferOptionLabelType(group);
    const isSummaryCompletion = displayGroup.groupType === 'SUMMARY_COMPLETION';
    const isClassificationMatching = displayGroup.groupType === 'MATCHING_CLASSIFICATION';
    const isMapLabelling = displayGroup.groupType === 'MAP_LABELLING';

    return (
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.9375rem' }}>Nhóm {gIdx + 1}</span>
                {group.groupType && <Tag color="blue">{getQuestionTypeLabel(effectiveGroupType || group.groupType, skillType)}</Tag>}
                {group.startQuestion != null && group.endQuestion != null && (
                    <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Câu {group.startQuestion}–{group.endQuestion}</span>
                )}
            </div>
            {group.instruction && (
                <div style={{ marginBottom: '10px', padding: '10px', background: '#eef2ff', borderRadius: '8px', color: '#3730a3', fontSize: '0.875rem', lineHeight: 1.5 }}>
                    <ReactMarkdown components={markdownComponents}>
                        {normalizeBlockMarkdownText(group.instruction)}
                    </ReactMarkdown>
                </div>
            )}
            <TruthValueDefinitionTable groupType={displayGroup.groupType} />
            {renderGroupContent(displayGroup, usesLegacySharedMultiSelectLayout)}
            {usesLegacySharedMultiSelectLayout && <ChooseNStatementsView group={displayGroup} />}
            {isClassificationMatching && <ClassificationMatchingPreview group={displayGroup} />}
            {isSummaryCompletion && <SummaryWordBankTable group={displayGroup} />}
            {((MATCHING_TYPES.has(displayGroup.groupType || '') || isFlowchartLikeType(displayGroup.groupType)) && !isMapLabelling && !isClassificationMatching) && getSharedGroupOptions(group).length > 0 && !areAllOptionsLabelOnly(getSharedGroupOptions(group)) && (
                <div style={{ background: '#fff', padding: '12px', border: '2px solid #0ea5e9', borderRadius: '12px', marginBottom: '15px' }}>
                    <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '8px', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                        {isFlowchartLikeType(displayGroup.groupType) ? 'Answer Bank' : 'Danh sách lựa chọn (Options):'}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                        {getSharedGroupOptions(group).map((opt, idx) => (
                            <div
                                key={idx}
                                style={{
                                    fontSize: '0.9375rem',
                                    color: '#334155',
                                    padding: displayGroup.groupType === 'MATCHING_VISUALS' ? '10px' : 0,
                                    border: displayGroup.groupType === 'MATCHING_VISUALS' ? '1px solid #e2e8f0' : 'none',
                                    borderRadius: displayGroup.groupType === 'MATCHING_VISUALS' ? '10px' : 0,
                                    background: displayGroup.groupType === 'MATCHING_VISUALS' ? '#f8fafc' : 'transparent',
                                }}
                            >
                                <b style={{ color: '#0ea5e9', width: '25px', display: 'inline-block' }}>{getOptionLabel(idx, optionLabelType)}.</b>
                                {displayGroup.groupType === 'MATCHING_VISUALS' ? (
                                    <div style={{ marginTop: '8px' }}>
                                        {opt.optionText ? (
                                            <img
                                                src={opt.optionText}
                                                alt={`Option ${getOptionLabel(idx, optionLabelType)}`}
                                                style={{
                                                    width: '100%',
                                                    maxHeight: '220px',
                                                    objectFit: 'contain',
                                                    borderRadius: '8px',
                                                    background: '#fff',
                                                    border: '1px solid #e2e8f0',
                                                }}
                                            />
                                        ) : (
                                            <div
                                                style={{
                                                    height: '120px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    color: '#94a3b8',
                                                    border: '1px dashed #cbd5e1',
                                                    borderRadius: '8px',
                                                    background: '#fff',
                                                }}
                                            >
                                                Chưa có ảnh
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <span> {renderFormattedText(opt.optionText || '')}</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {!usesLegacySharedMultiSelectLayout && !isClassificationMatching && group.questions.map((q, qIdx) => (
                <QuestionItem key={qIdx} q={q} qIdx={qIdx} groupType={effectiveGroupType || group.groupType} skillType={skillType} optionLabelType={optionLabelType} />
            ))}
        </div>
    );
};

const renderSectionBody = (section: SectionDetailDto) => {
    const skill = section.skillType;

    if (skill === 'Reading' || skill === 'READING') {
        const passages = section.readingPassages ?? [];
        if (passages.length === 0) return <Empty description="Chưa có passage" />;
        return passages.map((p, pIdx) => (
            <div key={pIdx} style={{ marginBottom: '16px' }}>
                <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Reading, margin: '0 0 8px' }}>Passage {p.passageNumber ?? pIdx + 1}: {p.title || ''}</h4>
                {p.paragraphsData && (
                    <Collapse ghost items={[{
                        key: '1',
                        label: <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Nội dung đoạn văn</span>,
                        children: (
                            <div style={{ color: '#475569', fontSize: '1rem', lineHeight: 1.8 }}>
                                <ReactMarkdown
                                    components={markdownComponents}
                                >
                                    {normalizeReadingPassageMarkdown(p.paragraphsData, p.questionGroups)}
                                </ReactMarkdown>
                            </div>
                        )
                    }]} style={{ marginBottom: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                )}
                {p.questionGroups
                    .sort((a, b) => {
                        const aStart = a.startQuestion ?? (a.questions[0]?.questionNumber || 0);
                        const bStart = b.startQuestion ?? (b.questions[0]?.questionNumber || 0);
                        return aStart - bStart;
                    })
                    .map((g, gIdx) => <QuestionGroupBlock key={gIdx} group={g} gIdx={gIdx} skillType={skill} />)}
            </div>
        ));
    }

    if (skill === 'Listening' || skill === 'LISTENING') {
        const parts = section.listeningParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có listening part" />;
        const sharedAudioUrl = parts.map((part) => (part.audioUrl ?? '').trim()).find(Boolean);
        return parts.map((lp, lpIdx) => (
            <div key={lpIdx} style={{ marginBottom: '16px' }}>
                {lpIdx === 0 && sharedAudioUrl && (
                    <div style={{ background: '#eef2ff', borderRadius: '8px', padding: '10px', marginBottom: '10px', border: '1px dashed #6366f1' }}>
                        <SoundOutlined style={{ marginRight: '6px', color: '#3730a3' }} />
                        <audio controls src={sharedAudioUrl} style={{ verticalAlign: 'middle' }} />
                    </div>
                )}
                <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Listening, margin: '0 0 8px' }}>Part {lp.partNumber ?? lpIdx + 1}</h4>
                {lp.contextDescription && (
                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
                        {renderFormattedText(lp.contextDescription)}
                    </p>
                )}
                {(() => {
                    const transcriptData = parseListeningTranscriptEnvelope(lp.transcriptData);
                    const transcriptSegments = transcriptData.segments;
                    if (transcriptSegments.length === 0) {
                        return null;
                    }

                    return (
                        <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '12px', marginBottom: '10px', border: '1px solid #cbd5e1' }}>
                            <div style={{ fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                                Transcript timestamp cho AI gia sư ({transcriptSegments.length} segments)
                            </div>
                            <div style={{ color: '#475569', fontSize: '0.8125rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                                {transcriptSegments.slice(0, 4).map((segment) => (
                                    <div key={`${segment.startTime}-${segment.text.slice(0, 24)}`}>
                                        [{formatTranscriptRangeLabel(segment.startTime, segment.endTime)}]
                                        {segment.targetQuestionNumbers.length > 0 ? ` Q${segment.targetQuestionNumbers.join('/')}` : ''}
                                        {' '}
                                        {segment.text}
                                    </div>
                                ))}
                                {transcriptSegments.length > 4 ? (
                                    <div style={{ color: '#64748b', marginTop: '4px' }}>
                                        ... và {transcriptSegments.length - 4} segment khác
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    );
                })()}
                {lp.questionGroups
                    .sort((a, b) => {
                        const aStart = a.startQuestion ?? (a.questions[0]?.questionNumber || 0);
                        const bStart = b.startQuestion ?? (b.questions[0]?.questionNumber || 0);
                        return aStart - bStart;
                    })
                    .map((g, gIdx) => <QuestionGroupBlock key={gIdx} group={g} gIdx={gIdx} skillType={skill} />)}
            </div>
        ));
    }

    if (skill === 'Writing' || skill === 'WRITING') {
        const tasks = section.writingTasks ?? [];
        if (tasks.length === 0) return <Empty description="Chưa có writing task" />;
        return tasks.map((t, tIdx) => {
            const writingAssets = parseWritingTaskAssetsData(t.assetsData);

            return (
                <div key={tIdx} style={{ background: '#fffbeb', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: '1px solid #fde68a' }}>
                    <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Writing, margin: '0 0 8px' }}>Task {t.taskNumber ?? tIdx + 1}</h4>
                    <div style={{ whiteSpace: 'pre-wrap', color: '#475569', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '8px' }}>
                        {renderFormattedText(t.promptText)}
                    </div>
                    <span style={{ fontSize: '0.8125rem', color: '#92400e' }}>Tối thiểu {t.minWords} từ</span>
                    {writingAssets.primaryImageUrl && (
                        <img src={writingAssets.primaryImageUrl} alt="Writing asset" style={{ maxWidth: '100%', marginTop: '10px', borderRadius: '8px' }} />
                    )}
                </div>
            )
        });
    }

    if (skill === 'Speaking' || skill === 'SPEAKING') {
        const parts = section.speakingParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có speaking part" />;
        return parts.map((sp, spIdx) => (
            <div key={spIdx} style={{ background: '#fef2f2', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: '1px solid #fecaca' }}>
                <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Speaking, margin: '0 0 8px' }}>Part {sp.partNumber ?? spIdx + 1}</h4>
                {sp.description && (
                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '10px', whiteSpace: 'pre-wrap' }}>
                        {renderFormattedText(sp.description)}
                    </p>
                )}
                {sp.questions.map((sq, sqIdx) => (
                    <div key={sqIdx} style={{ padding: '10px', background: '#fff', borderRadius: '8px', marginBottom: '6px', border: '1px solid #f1f5f9' }}>
                        <span style={{ fontWeight: 600, color: '#991b1b', marginRight: '6px' }}>Q{sqIdx + 1}.</span>
                        {renderFormattedText(sq.content)}
                        {sq.audioPromptUrl && (
                            <div style={{ marginTop: '8px' }}>
                                <audio controls preload="metadata" src={sq.audioPromptUrl} style={{ width: '100%' }} />
                            </div>
                        )}
                        {sq.cueCardPoints && (
                            <div style={{ marginTop: '6px', padding: '8px', background: '#fef2f2', borderRadius: '6px', fontSize: '0.8125rem', color: '#991b1b', whiteSpace: 'pre-wrap' }}>
                                Cue Card: {renderFormattedText(sq.cueCardPoints)}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        ));
    }

    return <Empty description="Kỹ năng không xác định" />;
};

export const ExamDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: exam, isLoading, error } = useExamDetailQuery(id ?? '');

    if (isLoading) {
        return (<div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}><Spin size="large" /></div>);
    }

    if (error) {
        const errorMessage =
            (error as { response?: { data?: { message?: string } }, message?: string })?.response?.data?.message ||
            (error as { message?: string })?.message ||
            'Không tải được chi tiết đề thi.';

        return (
            <div style={{ padding: '40px' }}>
                <Empty description={errorMessage} />
                <Button type="primary" onClick={() => navigate('/admin/exams')} style={{ marginTop: 16 }}>Quay về danh sách</Button>
            </div>
        );
    }

    if (!exam) {
        return (
            <div style={{ padding: '40px' }}>
                <Empty description="Không tìm thấy đề thi" />
                <Button type="primary" onClick={() => navigate('/admin/exams')} style={{ marginTop: 16 }}>Quay về danh sách</Button>
            </div>
        );
    }

    const primarySection = exam.sections[0];
    const hasLegacyMultiSection = exam.sections.length > 1;
    const primarySkill = (primarySection?.skillType ?? '').trim().toUpperCase();
    const isObjectiveSection = primarySkill === 'READING' || primarySkill === 'LISTENING';
    const scoreSummaryLabel = isObjectiveSection
        ? `📊 Số câu objective: ${exam.totalPoints ?? '—'}`
        : '📊 Band khi nộp: 0-9';

    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/exams')}>Quay lại</Button>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Chi tiết đề thi</h2>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '16px', padding: '32px', color: '#fff' }}>
                <h2 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800 }}>{exam.title}</h2>
                <p style={{ margin: '12px 0 0', opacity: 0.85, fontSize: '1.125rem', whiteSpace: 'pre-wrap' }}>
                    {exam.description ? renderFormattedText(exam.description) : 'Không có mô tả'}
                </p>
                <div style={{ display: 'flex', gap: '16px', marginTop: '24px', flexWrap: 'wrap' }}>
                    <Tag style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '1rem' }}>{exam.examType || 'N/A'}</Tag>
                    {primarySection ? (
                        <Tag style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '1rem' }}>
                            {primarySection.skillType}
                        </Tag>
                    ) : null}
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>⏱ {exam.durationMinutes ?? '—'} phút</span>
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>{scoreSummaryLabel}</span>
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>{exam.isPublished ? '✅ Đã xuất bản' : '📝 Nháp'}</span>
                </div>
            </div>

            {hasLegacyMultiSection && (
                <div style={{ background: '#fff7ed', borderRadius: '16px', padding: '16px 20px', border: '1px solid #fdba74', color: '#9a3412' }}>
                    Đề này đang có nhiều section từ cấu trúc cũ. CMS hiện ưu tiên hiển thị section đầu tiên để khớp với mô hình một đề một kỹ năng.
                </div>
            )}

            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #f1f5f9' }}>
                {primarySection ? (
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '16px', color: '#0f172a' }}>
                            <BookOutlined style={{ marginRight: '8px', color: SKILL_COLORS[primarySection.skillType] || '#0ea5e9' }} />
                            {primarySection.title || primarySection.skillType}
                        </div>
                        <div>{renderSectionBody(primarySection)}</div>
                    </div>
                ) : (
                    <Empty description="Đề thi chưa có section nào." />
                )}
                <FloatButton.BackTop
                    type="primary"
                    shape="circle"
                    style={{ right: 40, bottom: 40, width: 48, height: 48 }}
                    icon={<VerticalAlignTopOutlined style={{ fontSize: 20 }} />}
                    tooltip={<div>Lên đầu trang</div>}
                />
            </div>
        </motion.div>
    );
};
