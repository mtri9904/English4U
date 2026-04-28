import { getEffectiveMcqGroupType, inferQuestionGroupOptionLabelType } from '@/shared/lib/examDisplay';
import {
    findListeningReplayMatch,
    formatTranscriptRangeLabel,
    parseListeningTranscriptEnvelope,
    type ListeningTranscriptSegment,
    type ListeningTranscriptReplayMatch,
} from '@/shared/lib/listeningTranscript';
import { extractWritingTaskHiddenDataText, extractWritingTaskImageUrls } from '@/shared/lib/writingTaskAssets';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionDto,
    PracticeSessionFeedbackDto,
    PracticeSessionListeningPartDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
    PracticeSessionReadingPassageDto,
    PracticeSessionWritingTaskDto,
} from '../types/session.types';
import type { CopilotContextImagePayload, CopilotFocusPayload, ReviewCopilotContext } from '../types/copilot.types';

type ObjectiveReviewAnswerMap = Record<string, PracticeSessionAnswerDto | undefined>;

export interface ListeningQuestionEvidenceMatch extends ListeningTranscriptReplayMatch {
    segmentIndexes: number[];
    score: number;
}

const normalizeText = (value?: string | null) =>
    (value ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

const normalizeInlineTokenText = (value?: string | null) =>
    normalizeText(value).replace(/\[Q(\d+)\]/g, 'blank Q$1');

const isImageUrl = (value?: string | null) => {
    const normalized = (value ?? '').trim();
    if (!normalized) {
        return false;
    }

    return /^https?:\/\/.+\.(?:png|jpe?g|webp|gif|bmp)(?:\?.*)?$/i.test(normalized);
};

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
            const candidates = [
                (parsed as { imageUrl?: unknown }).imageUrl,
                (parsed as { url?: unknown }).url,
                (parsed as { assetUrl?: unknown }).assetUrl,
            ];

            return candidates
                .filter((item): item is string => typeof item === 'string')
                .map((item) => item.trim())
                .filter((item) => isImageUrl(item));
        }
    } catch {
        return isImageUrl(assetsData) ? [assetsData.trim()] : [];
    }

    return [];
};

const dedupeImages = (images: CopilotContextImagePayload[]) => {
    const seen = new Set<string>();

    return images.filter((image) => {
        const normalizedUrl = image.url.trim();
        if (!normalizedUrl || seen.has(normalizedUrl)) {
            return false;
        }

        seen.add(normalizedUrl);
        return true;
    });
};

const buildImagePayloads = (urls: string[], labelPrefix: string) =>
    urls.map((url, index) => ({
        url,
        label: `${labelPrefix} - hình ${index + 1}`,
    }));

const getQuestionVisualOptionUrls = (question: PracticeSessionQuestionDto) =>
    sortOptions(question.options)
        .flatMap((option) => {
            const explicitImageUrl = option.imageUrl?.trim() ?? '';
            const legacyImageUrl = option.optionText?.trim() ?? '';
            return [explicitImageUrl, legacyImageUrl];
        })
        .filter((optionUrl) => isImageUrl(optionUrl));

const getGroupImagePayloads = (
    group: PracticeSessionQuestionGroupDto,
    labelPrefix: string,
    question?: PracticeSessionQuestionDto,
) => {
    const urls = [
        ...parseAssetImageUrls(group.assetsData),
        ...(question ? getQuestionVisualOptionUrls(question) : []),
    ];

    return buildImagePayloads(
        Array.from(new Set(urls)),
        labelPrefix,
    );
};

const getSharedOptions = (group: PracticeSessionQuestionGroupDto) =>
    group.questions.find((question) => question.options.length > 0)?.options ?? [];

const sortQuestions = (questions: PracticeSessionQuestionDto[]) =>
    [...questions].sort((left, right) => {
        const leftOrder = left.questionNumber ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.questionNumber ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });

const sortGroups = (groups: PracticeSessionQuestionGroupDto[]) =>
    [...groups].sort((left, right) => {
        const leftOrder = left.startQuestion ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.startQuestion ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });

const sortOptions = (options: PracticeSessionQuestionDto['options']) =>
    [...options].sort((left, right) => {
        const leftOrder = left.orderIndex ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.orderIndex ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    });

const extractPromptText = (group: PracticeSessionQuestionGroupDto) => {
    if (!group.contentData) {
        return '';
    }

    try {
        const parsed = JSON.parse(group.contentData) as unknown;
        if (typeof parsed === 'string') {
            return normalizeInlineTokenText(parsed);
        }

        if (Array.isArray(parsed)) {
            return normalizeInlineTokenText(
                parsed.flatMap((row) => Array.isArray(row) ? row : []).join('\n'),
            );
        }

        if (parsed && typeof parsed === 'object') {
            if (typeof (parsed as { prompt?: unknown }).prompt === 'string') {
                return normalizeInlineTokenText((parsed as { prompt: string }).prompt);
            }

            if (Array.isArray((parsed as { rows?: unknown }).rows)) {
                const rows = (parsed as { rows: unknown[] }).rows
                    .filter((row): row is string[] => Array.isArray(row))
                    .map((row) => row.join(' | '));
                return normalizeInlineTokenText(rows.join('\n'));
            }
        }
    } catch {
        return normalizeInlineTokenText(group.contentData);
    }

    return normalizeInlineTokenText(group.contentData);
};

const getAnswerOptions = (group: PracticeSessionQuestionGroupDto, question: PracticeSessionQuestionDto) => {
    const optionLabelType = inferQuestionGroupOptionLabelType(group);
    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((item) => !!item.content?.trim()),
    });
    const groupType = (effectiveGroupType || group.groupType || '').trim().toUpperCase();
    const usesOptionTextAsAnswer = groupType === 'TFNG' || groupType === 'YNNG';
    const options = sortOptions(question.options.length > 0 ? question.options : getSharedOptions(group));

    return options.map((option, index) => ({
        label: usesOptionTextAsAnswer
            ? normalizeText(option.optionText) || getOptionLabel(index, optionLabelType)
            : getOptionLabel(index, optionLabelType),
        text: normalizeText(option.optionText) || null,
    }));
};

const resolveAnswerText = (
    answer: string | null | undefined,
    options: Array<{ label: string; text: string | null }>,
) => {
    const trimmed = normalizeText(answer);
    if (!trimmed) {
        return null;
    }

    const optionLookup = new Map<string, { label: string; text: string | null }>();
    options.forEach((option) => {
        optionLookup.set(option.label.trim().toUpperCase(), option);
        if (option.text) {
            optionLookup.set(option.text.trim().toUpperCase(), option);
        }
    });

    return trimmed
        .split('|')
        .map((token) => token.trim())
        .filter(Boolean)
        .map((token) => {
            const matched = optionLookup.get(token.toUpperCase());
            if (!matched) {
                return token;
            }

            return matched.text
                ? `${matched.label}. ${matched.text}`
                : matched.label;
        })
        .join(' | ');
};

const buildQuestionText = (group: PracticeSessionQuestionGroupDto, question: PracticeSessionQuestionDto) => {
    const blocks = [
        normalizeInlineTokenText(group.instruction),
        extractPromptText(group),
        normalizeInlineTokenText(question.content),
    ].filter(Boolean);

    if (blocks.length === 0 && question.questionNumber != null) {
        return `Question ${question.questionNumber}`;
    }

    return blocks.join('\n\n');
};

const normalizeTranscriptEvidenceText = (value?: string | null) => (
    (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9.%/$&+' -]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[.,;:!?]+|[.,;:!?]+$/g, '')
        .trim()
);

const splitTranscriptEvidenceCandidates = (value?: string | null) => (
    (value ?? '')
        .split('|')
        .map((item) => normalizeTranscriptEvidenceText(item))
        .filter((item) => item.length >= 2)
);

const transcriptEvidenceStopwords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'into', 'your', 'their', 'there', 'about', 'would', 'could',
    'should', 'have', 'has', 'had', 'were', 'was', 'been', 'being', 'while', 'where', 'when', 'which', 'what',
    'then', 'than', 'them', 'they', 'those', 'these', 'just', 'also', 'only', 'more', 'most', 'very',
    'much', 'many', 'some', 'such', 'over', 'under', 'after', 'before', 'because', 'through', 'during', 'between',
    'each', 'other', 'another', 'into', 'onto', 'upon', 'across', 'around', 'within', 'without', 'against', 'among',
    'student', 'students', 'answer', 'question', 'questions', 'listening', 'part', 'section', 'blank',
]);

const transcriptEvidenceIntroPhrases = [
    'before you hear',
    'now listen',
    'listen carefully',
    'you will hear',
    'first you have some time',
    'you have some time to look at',
    'now turn to section',
    'that is the end of section',
    'you now have half a minute',
];

const buildTranscriptEvidenceTokenVariants = (token: string) => {
    const normalized = normalizeTranscriptEvidenceText(token);
    if (!normalized || normalized.includes(' ')) {
        return new Set<string>();
    }

    const variants = new Set<string>([normalized]);

    if (normalized.endsWith('ies') && normalized.length > 4) {
        variants.add(`${normalized.slice(0, -3)}y`);
    }

    if (normalized.endsWith('ing') && normalized.length > 5) {
        const stem = normalized.slice(0, -3);
        variants.add(stem);
        variants.add(`${stem}e`);
    }

    if (normalized.endsWith('ed') && normalized.length > 4) {
        const stem = normalized.slice(0, -2);
        variants.add(stem);
        variants.add(`${stem}e`);
    }

    if (normalized.endsWith('es') && normalized.length > 4) {
        variants.add(normalized.slice(0, -2));
    }

    if (normalized.endsWith('s') && normalized.length > 3) {
        variants.add(normalized.slice(0, -1));
    }

    return new Set(Array.from(variants).filter((variant) => variant.length >= 2));
};

const extractTranscriptEvidenceTokens = (value?: string | null) => {
    const normalized = normalizeTranscriptEvidenceText(value);
    if (!normalized) {
        return new Set<string>();
    }

    const tokens = new Set<string>();
    normalized.split(' ').forEach((token) => {
        if (!token) {
            return;
        }

        buildTranscriptEvidenceTokenVariants(token).forEach((variant) => {
            tokens.add(variant);
        });
    });

    return tokens;
};

const looksLikeEvidenceIntroSegment = (rawText: string) => {
    const normalized = normalizeTranscriptEvidenceText(rawText);
    return transcriptEvidenceIntroPhrases.some((phrase) => normalized.includes(phrase));
};

const extractQuestionSpecificGroupContentContext = (
    contentData?: string | null,
    questionNumber?: number | null,
) => {
    if (!contentData?.trim() || questionNumber == null) {
        return '';
    }

    const token = `[Q${questionNumber}]`;
    const normalizedLines = contentData
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const lineIndex = normalizedLines.findIndex((line) => line.includes(token));
    if (lineIndex >= 0) {
        return normalizedLines[lineIndex] ?? '';
    }

    const tokenIndex = contentData.indexOf(token);
    if (tokenIndex >= 0) {
        const snippetStart = Math.max(0, tokenIndex - 100);
        const snippetEnd = Math.min(contentData.length, tokenIndex + token.length + 100);
        return contentData.slice(snippetStart, snippetEnd).trim();
    }

    return '';
};

const resolveListeningQuestionCorrectOptionTexts = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
) => {
    const options = getAnswerOptions(group, question);
    const answerTokens = splitTranscriptEvidenceCandidates(question.correctAnswer);

    return Array.from(new Set(answerTokens.flatMap((token) => {
        const matchingOption = options.find((option) => (
            normalizeTranscriptEvidenceText(option.label) === token
        ));
        return matchingOption?.text ? [matchingOption.text] : [];
    })));
};

const buildListeningEvidenceAnchorPhrases = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
) => {
    const candidates = [
        extractQuestionSpecificGroupContentContext(group.contentData, question.questionNumber),
        question.content ?? '',
    ];

    return Array.from(new Set(
        candidates
            .map((item) => normalizeTranscriptEvidenceText(normalizeInlineTokenText(item).replace(/\bblank q\d+\b/gi, ' ')))
            .map((item) => item.replace(/\s+/g, ' ').trim())
            .filter((item) => item.length >= 3),
    ));
};

const buildListeningEvidenceAnswerCandidates = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
) => {
    const options = getAnswerOptions(group, question);
    const rawAnswerTokens = splitTranscriptEvidenceCandidates(question.correctAnswer);
    const directAnswers = rawAnswerTokens.filter((token) => !options.some((option) => (
        normalizeTranscriptEvidenceText(option.label) === token
    )));
    const correctOptionTexts = resolveListeningQuestionCorrectOptionTexts(group, question)
        .map((optionText) => normalizeTranscriptEvidenceText(optionText))
        .filter((item) => item.length >= 2);

    return Array.from(new Set([...directAnswers, ...correctOptionTexts]));
};

const buildListeningEvidenceKeywordTokens = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
) => {
    const candidateText = [
        extractQuestionSpecificGroupContentContext(group.contentData, question.questionNumber),
        question.content ?? '',
        ...resolveListeningQuestionCorrectOptionTexts(group, question),
    ].join(' ');

    return Array.from(extractTranscriptEvidenceTokens(candidateText))
        .filter((token) => token.length >= 3 && !transcriptEvidenceStopwords.has(token));
};

const segmentContainsTranscriptCandidate = (segmentText: string, candidate: string) => {
    if (!candidate) {
        return false;
    }

    if (candidate.length <= 3) {
        return new RegExp(`(^|[^a-z0-9])${candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`, 'i').test(segmentText);
    }

    return segmentText.includes(candidate);
};

const scoreListeningEvidenceWindow = ({
    windowText,
    rawText,
    anchorPhrases,
    answerCandidates,
    keywordTokens,
    groupType,
    windowLength,
}: {
    windowText: string;
    rawText: string;
    anchorPhrases: string[];
    answerCandidates: string[];
    keywordTokens: string[];
    groupType: string;
    windowLength: number;
}) => {
    let score = 0;
    let directAnchorMatches = 0;
    let directAnswerMatches = 0;
    const normalizedWindowTokens = extractTranscriptEvidenceTokens(windowText);

    anchorPhrases.forEach((anchorPhrase) => {
        if (!anchorPhrase) {
            return;
        }

        if (segmentContainsTranscriptCandidate(windowText, anchorPhrase)) {
            score += anchorPhrase.length >= 10 ? 26 : 20;
            directAnchorMatches += 1;
            return;
        }

        const phraseTokens = anchorPhrase.split(' ').filter((token) => token.length >= 3);
        if (phraseTokens.length === 0) {
            return;
        }

        const matchedTokens = phraseTokens.filter((token) => {
            const variants = buildTranscriptEvidenceTokenVariants(token);
            return Array.from(variants).some((variant) => normalizedWindowTokens.has(variant));
        }).length;

        if (matchedTokens === phraseTokens.length) {
            score += phraseTokens.length >= 3 ? 12 : 8;
        } else if (matchedTokens >= Math.max(1, Math.ceil(phraseTokens.length * 0.6))) {
            score += 4;
        }
    });

    answerCandidates.forEach((candidate) => {
        if (!candidate) {
            return;
        }

        if (segmentContainsTranscriptCandidate(windowText, candidate)) {
            score += candidate.length >= 8 ? 18 : 14;
            directAnswerMatches += 1;
            return;
        }

        const candidateTokens = candidate.split(' ').filter((token) => token.length >= 3);
        if (candidateTokens.length === 0) {
            return;
        }

        const matchedTokens = candidateTokens.filter((token) => {
            const variants = buildTranscriptEvidenceTokenVariants(token);
            return Array.from(variants).some((variant) => normalizedWindowTokens.has(variant));
        }).length;

        if (matchedTokens === candidateTokens.length) {
            score += 10;
            directAnswerMatches += 1;
        } else if (matchedTokens >= Math.max(1, Math.ceil(candidateTokens.length * 0.66))) {
            score += 4;
        }
    });

    keywordTokens.forEach((token) => {
        if (normalizedWindowTokens.has(token)) {
            score += token.length >= 6 ? 1.5 : 0.9;
        }
    });

    if ((groupType.startsWith('MATCHING') || groupType.startsWith('MCQ')) && directAnchorMatches > 0) {
        score += Math.max(0, windowLength - 1) * 0.75;
    }

    if (looksLikeEvidenceIntroSegment(rawText)) {
        score -= 10;
    }

    if (groupType.startsWith('MATCHING') && directAnchorMatches === 0 && score < 10) {
        return 0;
    }

    if (!groupType.startsWith('MATCHING') && directAnchorMatches === 0 && directAnswerMatches === 0 && score < 8) {
        return 0;
    }

    return Math.max(0, score);
};

export const inferListeningQuestionEvidenceMatch = ({
    segments,
    group,
    question,
}: {
    segments: ListeningTranscriptSegment[];
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
}): ListeningQuestionEvidenceMatch | null => {
    if (segments.length === 0 || question.questionNumber == null) {
        return null;
    }

    const groupType = getNormalizedListeningGroupType(group);
    const anchorPhrases = buildListeningEvidenceAnchorPhrases(group, question);
    const answerCandidates = buildListeningEvidenceAnswerCandidates(group, question);
    const keywordTokens = buildListeningEvidenceKeywordTokens(group, question);

    if (anchorPhrases.length === 0 && answerCandidates.length === 0 && keywordTokens.length === 0) {
        return null;
    }

    const normalizedSegmentTexts = segments.map((segment) => normalizeTranscriptEvidenceText(segment.text));
    const maxWindowSize = groupType.startsWith('MATCHING') || groupType.startsWith('MCQ') ? 4 : 3;
    let bestWindow: { startIndex: number; endIndex: number; score: number } | null = null;

    for (let startIndex = 0; startIndex < normalizedSegmentTexts.length; startIndex += 1) {
        for (
            let endIndex = startIndex;
            endIndex < Math.min(normalizedSegmentTexts.length, startIndex + maxWindowSize);
            endIndex += 1
        ) {
            const windowText = normalizedSegmentTexts.slice(startIndex, endIndex + 1).join(' ');
            const rawText = segments.slice(startIndex, endIndex + 1).map((segment) => segment.text).join(' ');
            const score = scoreListeningEvidenceWindow({
                windowText,
                rawText,
                anchorPhrases,
                answerCandidates,
                keywordTokens,
                groupType,
                windowLength: endIndex - startIndex + 1,
            });

            if (score <= 0) {
                continue;
            }

            if (!bestWindow
                || score > bestWindow.score
                || (score === bestWindow.score && (endIndex - startIndex) > (bestWindow.endIndex - bestWindow.startIndex))
            ) {
                bestWindow = { startIndex, endIndex, score };
            }
        }
    }

    const minimumScore = groupType.startsWith('MATCHING') ? 14 : answerCandidates.length > 0 ? 10 : 8;
    if (!bestWindow || bestWindow.score < minimumScore) {
        return null;
    }

    const segmentIndexes = Array.from(
        { length: bestWindow.endIndex - bestWindow.startIndex + 1 },
        (_, index) => bestWindow.startIndex + index,
    );
    const firstSegment = segments[segmentIndexes[0]];
    const lastSegment = segments[segmentIndexes[segmentIndexes.length - 1]];

    return {
        startTime: firstSegment.startTime,
        endTime: lastSegment.endTime ?? lastSegment.startTime,
        text: segments.slice(bestWindow.startIndex, bestWindow.endIndex + 1).map((segment) => segment.text).join(' ').trim(),
        targetQuestionNumbers: [question.questionNumber],
        segmentCount: segmentIndexes.length,
        segmentIndexes,
        score: bestWindow.score,
    };
};

const buildAnswerStatus = (reviewAnswer?: PracticeSessionAnswerDto) => {
    if (reviewAnswer?.isCorrect === true) {
        return 'Đúng';
    }

    if (reviewAnswer?.isCorrect === false) {
        return 'Sai';
    }

    return 'Chưa chấm';
};

const buildQuestionBlock = ({
    group,
    question,
    reviewAnswer,
    userAnswer,
}: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    userAnswer?: string | null;
}) => {
    const options = getAnswerOptions(group, question);
    const finalUserAnswer = normalizeText(userAnswer ?? reviewAnswer?.answerText) || null;
    const correctAnswer = normalizeText(reviewAnswer?.correctAnswer ?? question.correctAnswer) || null;
    const lines = [
        `Câu ${question.questionNumber ?? 'N/A'}`,
        `Nội dung: ${buildQuestionText(group, question) || 'Không có nội dung riêng.'}`,
        finalUserAnswer ? `Học viên chọn: ${finalUserAnswer}` : 'Học viên chọn: Chưa trả lời',
        (() => {
            const resolved = resolveAnswerText(finalUserAnswer, options);
            return resolved ? `Diễn giải đáp án học viên: ${resolved}` : '';
        })(),
        correctAnswer ? `Đáp án đúng: ${correctAnswer}` : 'Đáp án đúng: Không rõ',
        (() => {
            const resolved = resolveAnswerText(correctAnswer, options);
            return resolved ? `Diễn giải đáp án đúng: ${resolved}` : '';
        })(),
        `Kết quả: ${buildAnswerStatus(reviewAnswer)}`,
        options.length > 0
            ? `Lựa chọn:\n${options.map((option) => `- ${option.label}${option.text ? `. ${option.text}` : ''}`).join('\n')}`
            : '',
    ].filter(Boolean);

    return lines.join('\n');
};

const buildGroupBlock = ({
    group,
    answerMap,
    reviewAnswerMap,
}: {
    group: PracticeSessionQuestionGroupDto;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}) => {
    const questionRange = group.startQuestion != null && group.endQuestion != null
        ? `Câu ${group.startQuestion}-${group.endQuestion}`
        : 'Không rõ dải câu';
    const promptText = extractPromptText(group);

    const lines = [
        `Nhóm câu: ${questionRange}`,
        group.groupType ? `Loại câu hỏi: ${group.groupType}` : '',
        group.instruction ? `Instruction: ${normalizeInlineTokenText(group.instruction)}` : '',
        promptText ? `Prompt chung: ${promptText}` : '',
        ...sortQuestions(group.questions).map((question) => buildQuestionBlock({
            group,
            question,
            reviewAnswer: reviewAnswerMap[question.id],
            userAnswer: answerMap[question.id],
        })),
    ].filter(Boolean);

    return lines.join('\n\n');
};

const buildReadingPassageBlock = ({
    passage,
    answerMap,
    reviewAnswerMap,
}: {
    passage: PracticeSessionReadingPassageDto;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}) => {
    const heading = `Passage ${passage.passageNumber ?? 'N/A'}${passage.title ? `: ${normalizeText(passage.title)}` : ''}`;

    return [
        heading,
        normalizeText(passage.paragraphsData) || 'Passage chưa có nội dung.',
        ...sortGroups(passage.questionGroups).map((group) => buildGroupBlock({ group, answerMap, reviewAnswerMap })),
    ].filter(Boolean).join('\n\n');
};

const buildListeningPartBlock = ({
    part,
    answerMap,
    reviewAnswerMap,
    includeTranscript = false,
}: {
    part: PracticeSessionListeningPartDto;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
    includeTranscript?: boolean;
}) => {
    const heading = `Part ${part.partNumber ?? 'N/A'}`;

    return [
        heading,
        part.contextDescription
            ? `Nội dung hiển thị cho học viên:\n${normalizeText(part.contextDescription)}`
            : 'Không có nội dung hiển thị của part.',
        includeTranscript
            ? (() => {
                const transcriptLines = buildListeningTranscriptWindowText(part);
                return transcriptLines
                    ? `Tapescript có timestamp cho AI:\n${transcriptLines}`
                    : 'Không có tapescript timestamp.';
            })()
            : '',
        part.audioUrl ? `Audio URL: ${part.audioUrl}` : '',
        ...sortGroups(part.questionGroups).map((group) => buildGroupBlock({ group, answerMap, reviewAnswerMap })),
    ].filter(Boolean).join('\n\n');
};

const formatListeningSegmentsWindowForCopilot = (segments: ListeningTranscriptSegment[]) => (
    segments
        .map((segment) => {
            const questionLabel = segment.targetQuestionNumbers.length > 0
                ? ` Q${segment.targetQuestionNumbers.join('/')}`
                : '';
            return `[${formatTranscriptRangeLabel(segment.startTime, segment.endTime)}]${questionLabel} ${segment.text}`;
        })
        .join('\n')
);

const normalizeTranscriptScopeText = (value?: string | null) => (
    (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/([a-z])[-–—]([a-z])/g, '$1 $2')
        .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 - $2')
        .replace(/\s+/g, ' ')
        .trim()
);

const listeningQuestionNumberWordValues: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
    eleven: 11,
    twelve: 12,
    thirteen: 13,
    fourteen: 14,
    fifteen: 15,
    sixteen: 16,
    seventeen: 17,
    eighteen: 18,
    nineteen: 19,
    twenty: 20,
    thirty: 30,
    forty: 40,
};

const parseListeningQuestionNumberToken = (token: string) => {
    const normalized = token.trim().replace(/\s+/g, ' ');
    const numericValue = Number(normalized);
    if (Number.isFinite(numericValue)) {
        return numericValue;
    }

    if (listeningQuestionNumberWordValues[normalized] != null) {
        return listeningQuestionNumberWordValues[normalized];
    }

    const compoundMatch = normalized.match(/^(twenty|thirty|forty)\s+(one|two|three|four|five|six|seven|eight|nine)$/);
    if (!compoundMatch) {
        return null;
    }

    return listeningQuestionNumberWordValues[compoundMatch[1]] + listeningQuestionNumberWordValues[compoundMatch[2]];
};

const listeningQuestionNumberTokenPattern = [
    '\\d+',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
    'twenty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'thirty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'forty',
].join('|');

const parseQuestionRangeFromTranscriptSegment = (value?: string | null) => {
    const normalized = normalizeTranscriptScopeText(value);
    if (!normalized) {
        return null;
    }

    const match = normalized.match(new RegExp(`\\bquestions?\\s+(${listeningQuestionNumberTokenPattern})\\s*(?:to|-|through)\\s*(${listeningQuestionNumberTokenPattern})\\b`));
    if (!match) {
        return null;
    }

    const startQuestion = parseListeningQuestionNumberToken(match[1]);
    const endQuestion = parseListeningQuestionNumberToken(match[2]);
    if (!Number.isFinite(startQuestion) || !Number.isFinite(endQuestion) || startQuestion > endQuestion) {
        return null;
    }

    return { startQuestion, endQuestion };
};

const detectListeningQuestionScopes = (segments: ListeningTranscriptSegment[]) => {
    const events: Array<{ segmentIndex: number; startQuestion: number; endQuestion: number }> = [];

    segments.forEach((segment, index) => {
        const questionRange = parseQuestionRangeFromTranscriptSegment(segment.text);
        if (!questionRange) {
            return;
        }

        const previousEvent = events[events.length - 1];
        if (previousEvent
            && previousEvent.startQuestion === questionRange.startQuestion
            && previousEvent.endQuestion === questionRange.endQuestion) {
            events[events.length - 1] = {
                segmentIndex: index,
                startQuestion: questionRange.startQuestion,
                endQuestion: questionRange.endQuestion,
            };
            return;
        }

        events.push({
            segmentIndex: index,
            startQuestion: questionRange.startQuestion,
            endQuestion: questionRange.endQuestion,
        });
    });

    return events.map((event, index) => {
        const nextEvent = events[index + 1];
        return {
            startQuestion: event.startQuestion,
            endQuestion: event.endQuestion,
            startSegmentIndex: Math.min(event.segmentIndex + 1, Math.max(segments.length - 1, 0)),
            endSegmentIndex: nextEvent
                ? Math.max(event.segmentIndex + 1, nextEvent.segmentIndex - 1)
                : Math.max(segments.length - 1, 0),
        };
    });
};

const findListeningScopeForQuestion = (
    segments: ListeningTranscriptSegment[],
    questionNumber?: number | null,
) => {
    if (questionNumber == null || segments.length === 0) {
        return null;
    }

    const scopes = detectListeningQuestionScopes(segments);
    return scopes.find((scope) => scope.startQuestion <= questionNumber && questionNumber <= scope.endQuestion) ?? null;
};

const selectListeningScopeWindowSegments = ({
    segments,
    scope,
    questionNumber,
    maxSegments,
}: {
    segments: ListeningTranscriptSegment[];
    scope: NonNullable<ReturnType<typeof findListeningScopeForQuestion>>;
    questionNumber?: number | null;
    maxSegments: number;
}) => {
    const scopeSegments = segments.slice(scope.startSegmentIndex, scope.endSegmentIndex + 1);
    if (scopeSegments.length <= maxSegments) {
        return scopeSegments;
    }

    const questionSpan = Math.max(1, scope.endQuestion - scope.startQuestion);
    const questionRatio = questionNumber != null
        ? Math.max(0, Math.min(1, (questionNumber - scope.startQuestion) / questionSpan))
        : 0.5;
    const centerIndex = Math.round(questionRatio * (scopeSegments.length - 1));
    const halfWindow = Math.floor(maxSegments / 2);
    const startIndex = Math.min(
        Math.max(0, centerIndex - halfWindow),
        Math.max(0, scopeSegments.length - maxSegments),
    );

    return scopeSegments.slice(startIndex, startIndex + maxSegments);
};

const getListeningPartQuestionNumbers = (part: PracticeSessionListeningPartDto) => (
    sortGroups(part.questionGroups)
        .flatMap((group) => sortQuestions(group.questions))
        .flatMap((question) => question.questionNumber != null ? [question.questionNumber] : [])
);

const findNearestListeningQuestionAnchors = ({
    segments,
    targetQuestionNumber,
    candidateQuestionNumbers,
}: {
    segments: ListeningTranscriptSegment[];
    targetQuestionNumber: number;
    candidateQuestionNumbers: number[];
}) => {
    const uniqueQuestionNumbers = Array.from(new Set(candidateQuestionNumbers)).sort((left, right) => left - right);
    const previousQuestionNumber = [...uniqueQuestionNumbers]
        .reverse()
        .find((questionNumber) => questionNumber < targetQuestionNumber);
    const nextQuestionNumber = uniqueQuestionNumbers
        .find((questionNumber) => questionNumber > targetQuestionNumber);

    const previousIndexes = previousQuestionNumber == null
        ? []
        : segments.flatMap((segment, index) => (
            segment.targetQuestionNumbers.includes(previousQuestionNumber) ? [index] : []
        ));
    const nextIndexes = nextQuestionNumber == null
        ? []
        : segments.flatMap((segment, index) => (
            segment.targetQuestionNumbers.includes(nextQuestionNumber) ? [index] : []
        ));

    return {
        previousQuestionNumber: previousQuestionNumber ?? null,
        nextQuestionNumber: nextQuestionNumber ?? null,
        previousAnchorIndex: previousIndexes.length > 0 ? previousIndexes[previousIndexes.length - 1] : null,
        nextAnchorIndex: nextIndexes.length > 0 ? nextIndexes[0] : null,
    };
};

const buildListeningAnchorFallbackWindow = ({
    segments,
    questionNumber,
    candidateQuestionNumbers,
}: {
    segments: ListeningTranscriptSegment[];
    questionNumber: number;
    candidateQuestionNumbers: number[];
}) => {
    const {
        previousQuestionNumber,
        nextQuestionNumber,
        previousAnchorIndex,
        nextAnchorIndex,
    } = findNearestListeningQuestionAnchors({
        segments,
        targetQuestionNumber: questionNumber,
        candidateQuestionNumbers,
    });

    if (previousAnchorIndex == null && nextAnchorIndex == null) {
        return null;
    }

    const startIndex = previousAnchorIndex != null
        ? previousAnchorIndex
        : Math.max(0, (nextAnchorIndex ?? 0) - 8);
    const endIndex = nextAnchorIndex != null
        ? nextAnchorIndex
        : Math.min(segments.length - 1, (previousAnchorIndex ?? 0) + 8);

    if (startIndex > endIndex) {
        return null;
    }

    const windowSegments = segments.slice(startIndex, endIndex + 1);
    if (windowSegments.length === 0) {
        return null;
    }

    const boundaryLabel = previousQuestionNumber != null && nextQuestionNumber != null
        ? `Q${previousQuestionNumber} và Q${nextQuestionNumber}`
        : previousQuestionNumber != null
            ? `sau Q${previousQuestionNumber}`
            : nextQuestionNumber != null
                ? `trước Q${nextQuestionNumber}`
                : 'cùng part';

    return [
        `Đây là đoạn transcript kẹp ${boundaryLabel} trong cùng part để AI bám đúng ngữ cảnh cho câu ${questionNumber}.`,
        formatListeningSegmentsWindowForCopilot(windowSegments),
    ].join('\n');
};

const getNormalizedListeningGroupType = (group?: PracticeSessionQuestionGroupDto | null) => {
    if (!group) {
        return '';
    }

    const effectiveGroupType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
    });

    return (effectiveGroupType || group.groupType || '').trim().toUpperCase();
};

const getListeningTranscriptWindowConfig = ({
    group,
    questionNumber,
}: {
    group?: PracticeSessionQuestionGroupDto | null;
    questionNumber?: number | null;
}) => {
    const normalizedQuestionNumber = questionNumber ?? null;
    if (!group) {
        return {
            targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
            surroundingSegments: 3,
            scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'đoạn này',
        };
    }

    const questionNumbers = sortQuestions(group.questions)
        .flatMap((question) => question.questionNumber != null ? [question.questionNumber] : []);
    const normalizedGroupType = getNormalizedListeningGroupType(group);

    if ((normalizedGroupType === 'MCQ_CHOOSE_N' || normalizedGroupType === 'MCQ_MULTIPLE') && questionNumbers.length > 0) {
        return {
            targetQuestionNumbers: questionNumbers,
            surroundingSegments: 10,
            scopeLabel: `nhóm câu ${questionNumbers.join(', ')}`,
        };
    }

    if (normalizedGroupType === 'MCQ_SINGLE') {
        return {
            targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
            surroundingSegments: 6,
            scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi',
        };
    }

    if (normalizedGroupType === 'MAP_LABELLING') {
        const effectiveQuestionNumbers = questionNumbers.length > 0
            ? questionNumbers
            : normalizedQuestionNumber != null
                ? [normalizedQuestionNumber]
                : [];

        return {
            // Map directions often span several labelled items, so keep the whole map explanation in view.
            targetQuestionNumbers: effectiveQuestionNumbers,
            surroundingSegments: 10,
            scopeLabel: effectiveQuestionNumbers.length > 0
                ? `nhóm câu ${effectiveQuestionNumbers.join(', ')}`
                : (normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi'),
        };
    }

    if (normalizedGroupType.startsWith('MATCHING')) {
        return {
            targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
            surroundingSegments: 6,
            scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi',
        };
    }

    return {
        targetQuestionNumbers: normalizedQuestionNumber != null ? [normalizedQuestionNumber] : [],
        surroundingSegments: 3,
        scopeLabel: normalizedQuestionNumber != null ? `câu ${normalizedQuestionNumber}` : 'câu đang hỏi',
    };
};

const buildListeningTranscriptWindowText = (
    part: PracticeSessionListeningPartDto,
    options?: {
        questionNumber?: number | null;
        group?: PracticeSessionQuestionGroupDto | null;
        reviewAnswer?: PracticeSessionAnswerDto | null;
    },
) => {
    const transcriptData = parseListeningTranscriptEnvelope(part.transcriptData);
    const transcriptSegments = transcriptData.segments;
    if (transcriptSegments.length === 0) {
        return '';
    }

    if ((options?.questionNumber ?? null) == null) {
        return formatListeningSegmentsWindowForCopilot(transcriptSegments.slice(0, 24));
    }

    const partQuestionNumbers = getListeningPartQuestionNumbers(part);
    const groupQuestionNumbers = options?.group
        ? sortQuestions(options.group.questions)
            .flatMap((question) => question.questionNumber != null ? [question.questionNumber] : [])
        : [];

    const {
        targetQuestionNumbers,
        surroundingSegments,
        scopeLabel,
    } = getListeningTranscriptWindowConfig({
        group: options?.group,
        questionNumber: options?.questionNumber,
    });
    const normalizedGroupType = getNormalizedListeningGroupType(options?.group);
    const shouldPreferScopeFallback = normalizedGroupType.startsWith('MATCHING');
    const fallbackScopeWindowLimit = shouldPreferScopeFallback ? 96 : 80;
    const focusedQuestion = options?.group && options?.questionNumber != null
        ? sortQuestions(options.group.questions).find((question) => question.questionNumber === options.questionNumber) ?? null
        : null;
    const focusedQuestionForEvidence = focusedQuestion
        ? {
            ...focusedQuestion,
            correctAnswer: normalizeText(options?.reviewAnswer?.correctAnswer) || focusedQuestion.correctAnswer,
        }
        : null;
    const inferredEvidenceMatch = options?.group && focusedQuestion
        ? inferListeningQuestionEvidenceMatch({
            segments: transcriptSegments,
            group: options.group,
            question: focusedQuestionForEvidence ?? focusedQuestion,
        })
        : null;

    if (inferredEvidenceMatch && inferredEvidenceMatch.segmentIndexes.length > 0) {
        const startIndex = Math.max(0, inferredEvidenceMatch.segmentIndexes[0] - surroundingSegments);
        const endIndex = Math.min(
            transcriptSegments.length - 1,
            inferredEvidenceMatch.segmentIndexes[inferredEvidenceMatch.segmentIndexes.length - 1] + surroundingSegments,
        );

        return [
            `Đoạn bằng chứng chính cho câu ${options?.questionNumber}: ${formatTranscriptRangeLabel(
                inferredEvidenceMatch.startTime,
                inferredEvidenceMatch.endTime,
            )}`,
            targetQuestionNumbers.length > 1
                ? `Window transcript đang mở rộng theo ${scopeLabel} để không bỏ sót đáp án rải rác trong cùng một đoạn nghe.`
                : '',
            formatListeningSegmentsWindowForCopilot(transcriptSegments.slice(startIndex, endIndex + 1)),
        ].filter(Boolean).join('\n');
    }

    const matchedIndexes = transcriptSegments.flatMap((segment, index) => (
        segment.targetQuestionNumbers.some((candidateQuestionNumber) => targetQuestionNumbers.includes(candidateQuestionNumber))
            ? [index]
            : []
    ));

    if (matchedIndexes.length === 0) {
        const fallbackScope = findListeningScopeForQuestion(transcriptSegments, options?.questionNumber);
        if (shouldPreferScopeFallback && fallbackScope) {
            const fallbackWindowSegments = selectListeningScopeWindowSegments({
                segments: transcriptSegments,
                scope: fallbackScope,
                questionNumber: options?.questionNumber,
                maxSegments: fallbackScopeWindowLimit,
            });
            if (fallbackWindowSegments.length > 0) {
                return [
                    options?.questionNumber != null
                        ? `Đây là transcript scope của nhóm câu ${fallbackScope.startQuestion}-${fallbackScope.endQuestion} trong đúng part để AI bám đúng đoạn nghe cho câu ${options.questionNumber}.`
                        : '',
                    formatListeningSegmentsWindowForCopilot(fallbackWindowSegments),
                ].filter(Boolean).join('\n');
            }
        }

        const anchorFallbackWindow = options?.questionNumber != null
            ? buildListeningAnchorFallbackWindow({
                segments: transcriptSegments,
                questionNumber: options.questionNumber,
                candidateQuestionNumbers: groupQuestionNumbers.length > 0 ? groupQuestionNumbers : partQuestionNumbers,
            })
            : null;
        if (anchorFallbackWindow) {
            return anchorFallbackWindow;
        }

        if (!fallbackScope) {
            return [
                options?.questionNumber != null
                    ? `Đây là transcript của đúng part hiện tại để AI tự tìm bằng chứng cho câu ${options.questionNumber}; không được chỉ dựa vào đầu part nếu câu nằm ở đoạn sau.`
                    : '',
                formatListeningSegmentsWindowForCopilot(transcriptSegments.slice(0, 120)),
            ].filter(Boolean).join('\n');
        }

        const fallbackWindowSegments = selectListeningScopeWindowSegments({
            segments: transcriptSegments,
            scope: fallbackScope,
            questionNumber: options?.questionNumber,
            maxSegments: fallbackScopeWindowLimit,
        });
        if (fallbackWindowSegments.length === 0) {
            return '';
        }

        return [
            options?.questionNumber != null
                ? `Đây là transcript scope của nhóm câu ${fallbackScope.startQuestion}-${fallbackScope.endQuestion} trong đúng part để AI bám đúng đoạn nghe cho câu ${options.questionNumber}.`
                : '',
            formatListeningSegmentsWindowForCopilot(fallbackWindowSegments),
        ].filter(Boolean).join('\n');
    }

    const startIndex = Math.max(0, matchedIndexes[0] - surroundingSegments);
    const endIndex = Math.min(transcriptSegments.length - 1, matchedIndexes[matchedIndexes.length - 1] + surroundingSegments);
    const primaryReplayMatch = options?.questionNumber != null
        ? findListeningReplayMatch(transcriptSegments, options.questionNumber, transcriptData.alignments)
        : null;
    const transcriptWindow = formatListeningSegmentsWindowForCopilot(
        transcriptSegments.slice(startIndex, endIndex + 1),
    );

    return [
        primaryReplayMatch
            ? `Đoạn bằng chứng chính cho câu ${options?.questionNumber}: ${formatTranscriptRangeLabel(primaryReplayMatch.startTime, primaryReplayMatch.endTime)}`
            : '',
        targetQuestionNumbers.length > 1
            ? `Window transcript đang mở rộng theo ${scopeLabel} để không bỏ sót đáp án rải rác trong cùng một đoạn nghe.`
            : '',
        transcriptWindow,
    ].filter(Boolean).join('\n');
};

const buildReviewSummary = (session: PracticeSessionDto) => {
    const resultLines = [
        `Bài thi: ${session.examTitle}`,
        session.examDescription ? `Mô tả: ${normalizeText(session.examDescription)}` : '',
        `Kỹ năng: ${session.skillType}`,
        `Trạng thái: ${session.status}`,
        `Đã trả lời: ${session.answeredQuestions}/${session.totalQuestions}`,
        session.result ? `Độ chính xác: ${session.result.accuracyPercent.toFixed(1)}%` : '',
        session.result?.readingScore != null ? `Reading band: ${session.result.readingScore.toFixed(1)}` : '',
        session.result?.listeningScore != null ? `Listening band: ${session.result.listeningScore.toFixed(1)}` : '',
        session.result?.writingScore != null ? `Writing band: ${session.result.writingScore.toFixed(1)}` : '',
        session.result?.totalBandScore != null ? `Overall band: ${session.result.totalBandScore.toFixed(1)}` : '',
        session.result?.overallFeedback ? `Overall feedback: ${normalizeText(session.result.overallFeedback)}` : '',
    ].filter(Boolean);

    return resultLines.join('\n');
};

const buildWritingFeedbackBlock = (feedbacks?: PracticeSessionFeedbackDto[] | null) => {
    if (!feedbacks || feedbacks.length === 0) {
        return '';
    }

    return feedbacks
        .map((feedback) => {
            const lines = [
                `- ${feedback.criteria}: band ${feedback.bandScore > 0 ? feedback.bandScore.toFixed(1) : '—'}`,
                feedback.comment ? `  Nhận xét: ${normalizeText(feedback.comment)}` : '',
                feedback.improvements ? `  Cải thiện: ${normalizeText(feedback.improvements)}` : '',
            ].filter(Boolean);

            return lines.join('\n');
        })
        .join('\n');
};

const getWritingAnswerLookup = (session: PracticeSessionDto) => (
    session.answers.reduce<Record<string, PracticeSessionAnswerDto | undefined>>((accumulator, answer) => {
        if (answer.writingTaskId) {
            accumulator[answer.writingTaskId] = answer;
        }

        return accumulator;
    }, {})
);

const countWords = (value?: string | null) => {
    const normalized = normalizeText(value);
    if (!normalized) {
        return 0;
    }

    return normalized.split(/\s+/).filter(Boolean).length;
};

const sortWritingTasks = (tasks: PracticeSessionWritingTaskDto[]) => (
    [...tasks].sort((left, right) => {
        const leftOrder = left.taskNumber ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.taskNumber ?? Number.MAX_SAFE_INTEGER;
        return leftOrder - rightOrder || left.id.localeCompare(right.id);
    })
);

const buildWritingTaskBlock = ({
    task,
    answer,
}: {
    task: PracticeSessionWritingTaskDto;
    answer?: PracticeSessionAnswerDto;
}) => {
    const normalizedAnswerText = normalizeText(answer?.answerText);
    const feedbackBlock = buildWritingFeedbackBlock(answer?.feedbacks);
    const hiddenDataText = normalizeText(extractWritingTaskHiddenDataText(task.assetsData));
    const lines = [
        `Task ${task.taskNumber ?? 'N/A'}`,
        `Đề bài: ${normalizeText(task.promptText) || 'Không có đề bài.'}`,
        `Số từ tối thiểu: ${task.minWords}`,
        hiddenDataText ? `Dữ liệu chuẩn của biểu đồ/hình để AI đối chiếu:\n${hiddenDataText}` : '',
        normalizedAnswerText
            ? `Bài làm của học viên:\n${normalizedAnswerText}`
            : 'Bài làm của học viên: Chưa có nội dung được lưu.',
        normalizedAnswerText ? `Số từ hiện có: ${countWords(normalizedAnswerText)}` : '',
        answer?.scoreEarned > 0 ? `Band task: ${answer.scoreEarned.toFixed(1)}` : '',
        feedbackBlock ? `Feedback AI:\n${feedbackBlock}` : '',
    ].filter(Boolean);

    return lines.join('\n\n');
};

export const buildQuestionFocusPayload = ({
    group,
    question,
    reviewAnswer,
    userAnswer,
}: {
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    userAnswer?: string | null;
}): CopilotFocusPayload => ({
    label: question.questionNumber != null ? `Câu ${question.questionNumber}` : 'Câu đang chọn',
    text: buildQuestionBlock({
        group,
        question,
        reviewAnswer,
        userAnswer,
    }),
    questionNumber: question.questionNumber,
    images: getGroupImagePayloads(
        group,
        question.questionNumber != null ? `Câu ${question.questionNumber}` : 'Câu đang chọn',
        question,
    ),
});

export const buildListeningQuestionFocusPayload = ({
    parts,
    group,
    question,
    reviewAnswer,
    userAnswer,
}: {
    parts: PracticeSessionListeningPartDto[];
    group: PracticeSessionQuestionGroupDto;
    question: PracticeSessionQuestionDto;
    reviewAnswer?: PracticeSessionAnswerDto;
    userAnswer?: string | null;
}): CopilotFocusPayload => {
    const baseFocus = buildQuestionFocusPayload({
        group,
        question,
        reviewAnswer,
        userAnswer,
    });
    const listeningPart = parts.find((part) => part.questionGroups.some((questionGroup) => questionGroup.id === group.id))
        ?? parts.find((part) => part.questionGroups.some((questionGroup) => questionGroup.questions.some((item) => item.id === question.id)))
        ?? null;
    const transcriptWindowText = listeningPart && question.questionNumber != null
        ? buildListeningTranscriptWindowText(listeningPart, {
            questionNumber: question.questionNumber,
            group,
            reviewAnswer,
        })
        : '';

    return transcriptWindowText
        ? {
            ...baseFocus,
            text: [
                baseFocus.text,
                `Transcript window của câu ${question.questionNumber}:`,
                transcriptWindowText,
            ].join('\n\n'),
        }
        : baseFocus;
};

export const findListeningQuestionFocusPayload = ({
    parts,
    questionNumber,
    answerMap,
    reviewAnswerMap,
}: {
    parts: PracticeSessionListeningPartDto[];
    questionNumber: number;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}): CopilotFocusPayload | null => {
    for (const part of parts) {
        for (const group of sortGroups(part.questionGroups)) {
            for (const question of sortQuestions(group.questions)) {
                if (question.questionNumber !== questionNumber) {
                    continue;
                }

                return buildListeningQuestionFocusPayload({
                    parts,
                    group,
                    question,
                    reviewAnswer: reviewAnswerMap[question.id],
                    userAnswer: answerMap[question.id] ?? reviewAnswerMap[question.id]?.answerText,
                });
            }
        }
    }

    return null;
};

export const findReadingQuestionFocusPayload = ({
    passages,
    questionNumber,
    answerMap,
    reviewAnswerMap,
}: {
    passages: PracticeSessionReadingPassageDto[];
    questionNumber: number;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}): CopilotFocusPayload | null => {
    for (const passage of passages) {
        for (const group of sortGroups(passage.questionGroups)) {
            for (const question of sortQuestions(group.questions)) {
                if (question.questionNumber !== questionNumber) {
                    continue;
                }

                const baseFocus = buildQuestionFocusPayload({
                    group,
                    question,
                    reviewAnswer: reviewAnswerMap[question.id],
                    userAnswer: answerMap[question.id] ?? reviewAnswerMap[question.id]?.answerText,
                });
                const passageLabel = `Passage ${passage.passageNumber ?? 'N/A'}${passage.title ? `: ${normalizeText(passage.title)}` : ''}`;

                return {
                    ...baseFocus,
                    text: [
                        passageLabel,
                        `Bài đọc liên quan:\n${normalizeText(passage.paragraphsData) || 'Passage chưa có nội dung.'}`,
                        `Câu hỏi cần giải thích:\n${baseFocus.text}`,
                    ].join('\n\n'),
                    images: dedupeImages([
                        ...buildImagePayloads(
                            parseAssetImageUrls(passage.assetsData),
                            passageLabel,
                        ),
                        ...(baseFocus.images ?? []),
                    ]),
                };
            }
        }
    }

    return null;
};

export const buildWritingTaskFocusPayload = ({
    task,
    answer,
}: {
    task: PracticeSessionWritingTaskDto;
    answer?: PracticeSessionAnswerDto;
}): CopilotFocusPayload => ({
    label: task.taskNumber != null ? `Task ${task.taskNumber}` : 'Task đang chọn',
    text: buildWritingTaskBlock({ task, answer }),
    questionNumber: null,
    images: buildImagePayloads(
        extractWritingTaskImageUrls(task.assetsData),
        task.taskNumber != null ? `Task ${task.taskNumber}` : 'Task đang chọn',
    ),
});

export const buildObjectiveReviewCopilotContext = ({
    session,
    activeItemIndex,
    answerMap,
    reviewAnswerMap,
}: {
    session: PracticeSessionDto;
    activeItemIndex: number;
    answerMap: Record<string, string>;
    reviewAnswerMap: ObjectiveReviewAnswerMap;
}): ReviewCopilotContext => {
    const normalizedSkill = session.skillType.trim().toUpperCase();
    const sections = session.exam.sections.filter(
        (section) => section.skillType.trim().toUpperCase() === normalizedSkill,
    );
    const readingPassages = sections.flatMap((section) => section.readingPassages);
    const listeningParts = sections.flatMap((section) => section.listeningParts);

    const reviewBody = normalizedSkill === 'READING'
        ? readingPassages.map((passage) => buildReadingPassageBlock({ passage, answerMap, reviewAnswerMap }))
        : listeningParts.map((part) => buildListeningPartBlock({
            part,
            answerMap,
            reviewAnswerMap,
            includeTranscript: false,
        }));

    const activePassage = readingPassages[activeItemIndex];
    const activePart = listeningParts[activeItemIndex];

    const currentLocationLabel = normalizedSkill === 'READING'
        ? activePassage
            ? `Passage ${activePassage.passageNumber ?? activeItemIndex + 1}`
            : null
        : activePart
            ? `Part ${activePart.partNumber ?? activeItemIndex + 1}`
            : null;

    const currentLocationText = normalizedSkill === 'READING'
        ? activePassage
            ? buildReadingPassageBlock({ passage: activePassage, answerMap, reviewAnswerMap })
            : null
        : activePart
            ? buildListeningPartBlock({
                part: activePart,
                answerMap,
                reviewAnswerMap,
                includeTranscript: !normalizeText(activePart.contextDescription),
            })
            : null;

    const contextImages = normalizedSkill === 'READING' && activePassage
        ? dedupeImages([
            ...buildImagePayloads(
                parseAssetImageUrls(activePassage.assetsData),
                `Passage ${activePassage.passageNumber ?? activeItemIndex + 1}`,
            ),
            ...sortGroups(activePassage.questionGroups).flatMap((group) => getGroupImagePayloads(
                group,
                group.startQuestion != null && group.endQuestion != null
                    ? `Nhóm câu ${group.startQuestion}-${group.endQuestion}`
                    : 'Nhóm câu trong passage',
            )),
        ]).slice(0, 6)
        : normalizedSkill === 'LISTENING' && activePart
            ? dedupeImages(
                sortGroups(activePart.questionGroups).flatMap((group) => getGroupImagePayloads(
                    group,
                    group.startQuestion != null && group.endQuestion != null
                        ? `Nhóm câu ${group.startQuestion}-${group.endQuestion}`
                        : `Part ${activePart.partNumber ?? activeItemIndex + 1}`,
                )),
            ).slice(0, 6)
            : [];

    return {
        sessionId: session.sessionId,
        reviewTitle: session.examTitle,
        reviewDocumentText: [
            buildReviewSummary(session),
            ...reviewBody,
        ].filter(Boolean).join('\n\n====================\n\n'),
        skillType: normalizedSkill,
        currentLocationLabel,
        currentLocationText,
        currentFocusLabel: null,
        currentFocusText: null,
        focusedQuestionNumber: null,
        selectedText: null,
        selectedTextLabel: null,
        contextImages,
    };
};

export const buildWritingReviewCopilotContext = ({
    session,
}: {
    session: PracticeSessionDto;
}): ReviewCopilotContext => {
    const writingTasks = sortWritingTasks(
        session.exam.sections
            .filter((section) => section.skillType.trim().toUpperCase() === 'WRITING')
            .flatMap((section) => section.writingTasks),
    );
    const answerLookup = getWritingAnswerLookup(session);
    const reviewBody = writingTasks.map((task) => buildWritingTaskBlock({
        task,
        answer: answerLookup[task.id],
    }));
    const contextImages = dedupeImages(
        writingTasks.flatMap((task) => buildImagePayloads(
            extractWritingTaskImageUrls(task.assetsData),
            task.taskNumber != null ? `Task ${task.taskNumber}` : 'Task Writing',
        )),
    ).slice(0, 6);

    return {
        sessionId: session.sessionId,
        reviewTitle: session.examTitle,
        reviewDocumentText: [
            buildReviewSummary(session),
            ...reviewBody,
        ].filter(Boolean).join('\n\n====================\n\n'),
        skillType: 'WRITING',
        currentLocationLabel: 'Writing review',
        currentLocationText: reviewBody.join('\n\n--------------------\n\n') || null,
        currentFocusLabel: null,
        currentFocusText: null,
        focusedQuestionNumber: null,
        selectedText: null,
        selectedTextLabel: null,
        contextImages,
    };
};
