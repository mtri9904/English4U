import React from 'react';
import type { QuestionGroupDto, QuestionOptionDto } from '@/features/exams/types/exam.types';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import { ROMAN_LABEL_TOKENS } from '../constants/examDetail.constants';

export const parseMultiSelectContent = (contentData?: string | null) => {
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

export const sanitizeLabelToken = (value?: string | null) =>
    (value ?? '')
        .trim()
        .replace(/^[([{<\s"']+/, '')
        .replace(/[)\]}>.,;:!?\s"']+$/, '');

export const isRomanLabelToken = (value?: string | null) => {
    const normalized = sanitizeLabelToken(value).toLowerCase();
    if (!normalized) {
        return false;
    }

    return ROMAN_LABEL_TOKENS.includes(normalized);
};

export const romanLabelToAlpha = (value: string) => {
    const normalized = sanitizeLabelToken(value).toLowerCase();
    const labelIndex = ROMAN_LABEL_TOKENS.indexOf(normalized);
    return labelIndex >= 0 ? getOptionLabel(labelIndex, 'alpha') : sanitizeLabelToken(value).toUpperCase();
};

export const alphaLabelToRoman = (value: string) => {
    const normalized = sanitizeLabelToken(value).toUpperCase();
    if (!/^[A-Z]$/.test(normalized)) {
        return sanitizeLabelToken(value).toLowerCase();
    }

    return getOptionLabel(normalized.charCodeAt(0) - 65, 'roman');
};

export const normalizeAnswerTokenForLabelType = (token: string, optionLabelType: 'alpha' | 'roman' = 'alpha') => {
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

export const formatCorrectAnswerForDisplay = (answer: string) =>
    answer
        .split('|')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .join(' / ');

export const stripDisplayedOptionLeadingLabel = (optionText: string | null | undefined, optionLabel: string) => {
    const text = (optionText ?? '').trim();
    if (!text) {
        return '';
    }

    const escapedLabel = optionLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`^${escapedLabel}\\s*(?:[.)\\:-]\\s*|\\s+)`, 'i'), '').trim();
};

export const normalizeMarkdownDisplayText = (text: string) =>
    (text ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\\\*\\\*/g, '**')
        .replace(/\\_\\_/g, '__');

export const renderFormattedText = (text: string) => {
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

export const renderStandardOptionContent = (option: QuestionOptionDto, optionLabel: string) => (
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

export const getSharedGroupOptions = (group: QuestionGroupDto) =>
    group.questions.find((question) => (question.options?.length ?? 0) > 0)?.options ?? [];

export const hasSequentialAlphaOptionBank = (options: QuestionOptionDto[]) => {
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

export const countTokenOccurrences = (text: string, token: string) => {
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

export const stripSingleOrphanPair = (text: string, token: string) => {
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

export const stripBoundaryIfUnmatched = (text: string, token: string) => {
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

export const stripOrphanMarkdownMarkers = (text: string) => {
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

export const hasStructuredParagraphLabels = (text: string) => {
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

export const isLikelyReadingSubheading = (line: string) => {
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

export const parseReadingSubheading = (line: string) => {
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

export const isLikelyReadingSubheadingToken = (token: string) => /^[A-Z0-9]+(?:[.\-\/&][A-Z0-9]+)*$/.test(token);

export const splitGluedHeadingToken = (token: string) => {
    if (!token) {
        return [token];
    }

    const match = token.match(/^(?<heading>[A-Z0-9]+(?:[.\-][A-Z0-9]+)*)(?<body>[A-Z][a-z][A-Za-z'’.-]*)$/);
    if (!match?.groups?.heading || !match.groups.body) {
        return [token];
    }

    return [match.groups.heading, match.groups.body];
};

export const parseInlineReadingSubheading = (line: string) => {
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

export const splitTrailingGluedBodyFromStandaloneSubheading = (line: string, nextLine?: string) => {
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

export const normalizeBlockMarkdownText = (text: string) =>
    normalizeMarkdownDisplayText(text)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(?<!\n)\n(?!\n)/g, '  \n')
        .trim();

export const repairOutOfOrderStructuredParagraphLabels = (text: string) => {
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

export const markdownComponents = {
    p: ({ ...props }: React.HTMLAttributes<HTMLParagraphElement>) => <p style={{ margin: '0 0 0.75rem' }} {...props} />,
    strong: ({ ...props }: React.HTMLAttributes<HTMLElement>) => <strong style={{ fontWeight: 800, color: '#0f172a' }} {...props} />,
    em: ({ ...props }: React.HTMLAttributes<HTMLElement>) => <em style={{ fontStyle: 'italic', fontWeight: 600, color: '#1f2937' }} {...props} />,
    ul: ({ ...props }: React.HTMLAttributes<HTMLUListElement>) => <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }} {...props} />,
    ol: ({ ...props }: React.HTMLAttributes<HTMLOListElement>) => <ol style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem' }} {...props} />,
    li: ({ ...props }: React.HTMLAttributes<HTMLLIElement>) => <li style={{ marginBottom: '0.25rem' }} {...props} />,
};

export const normalizeMarkdownText = (text: string) => {
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

export const shouldForceReadingParagraphLabels = (questionGroups: QuestionGroupDto[]) =>
    questionGroups.some((group) => {
        const normalizedGroupType = (group.groupType ?? '').toUpperCase();
        if (normalizedGroupType === 'MATCHING_HEADINGS' || normalizedGroupType === 'MATCHING_INFO') {
            return true;
        }

        return /\bparagraphs?\b/i.test(group.instruction ?? '');
    });

export const normalizeReadingPassageMarkdown = (text: string, questionGroups: QuestionGroupDto[]) => {
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

