import {
    formatTranscriptRangeLabel,
    type ListeningTranscriptSegment,
    type ListeningTranscriptReplayMatch,
} from '@/shared/lib/listeningTranscript';
import type {
    PracticeSessionAnswerDto,
    PracticeSessionQuestionDto,
    PracticeSessionQuestionGroupDto,
} from '../types/session.types';
import {
    getAnswerOptions,
    isChooseNGroup,
    normalizeInlineTokenText,
    normalizeText,
    resolveGroupOrderedAnswerToken,
} from './reviewCopilotBase.utils';

export interface ListeningQuestionEvidenceMatch extends ListeningTranscriptReplayMatch {
    questionNumber?: number | null;
    answerStartSecond: number;
    answerEndSecond: number;
    playAtSecond: number;
    timestampLabel: string;
    transcriptSnippet: string;
    confidence: 'high' | 'medium';
    segmentIndexes: number[];
    score: number;
}

export const resolveQuestionSpecificCorrectAnswer = (
    group: PracticeSessionQuestionGroupDto,
    question: PracticeSessionQuestionDto,
    reviewAnswer?: PracticeSessionAnswerDto,
) => {
    const shouldResolveByGroupOrder = isChooseNGroup(group);
    const reviewedCorrectAnswer = normalizeText(reviewAnswer?.correctAnswer);
    if (reviewedCorrectAnswer) {
        return shouldResolveByGroupOrder
            ? resolveGroupOrderedAnswerToken(group, question, reviewedCorrectAnswer)
            : reviewedCorrectAnswer;
    }

    const questionCorrectAnswer = normalizeText(question.correctAnswer);
    return shouldResolveByGroupOrder
        ? resolveGroupOrderedAnswerToken(group, question, questionCorrectAnswer)
        : questionCorrectAnswer;
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

    const anchorPhrases = buildListeningEvidenceAnchorPhrases(group, question);
    const answerCandidates = buildListeningEvidenceAnswerCandidates(group, question);
    const keywordTokens = buildListeningEvidenceKeywordTokens(group, question);
    const groupType = (group.groupType ?? '').trim().toUpperCase();

    if (anchorPhrases.length === 0 && answerCandidates.length === 0 && keywordTokens.length === 0) {
        return null;
    }

    const normalizedSegmentTexts = segments.map((segment) => normalizeTranscriptEvidenceText(segment.text));
    let bestWindow: {
        startIndex: number;
        endIndex: number;
        score: number;
    } | null = null;

    const maxWindowLength = groupType.startsWith('MATCHING') ? 4 : 2;

    for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
        let accumulatedRawText = '';
        let accumulatedNormalizedText = '';

        for (let offset = 0; offset < maxWindowLength && startIndex + offset < segments.length; offset += 1) {
            const currentIndex = startIndex + offset;
            const currentRawText = segments[currentIndex]?.text?.trim() ?? '';
            const currentNormalizedText = normalizedSegmentTexts[currentIndex] ?? '';

            if (!currentRawText) {
                continue;
            }

            accumulatedRawText = accumulatedRawText ? `${accumulatedRawText} ${currentRawText}` : currentRawText;
            accumulatedNormalizedText = accumulatedNormalizedText ? `${accumulatedNormalizedText} ${currentNormalizedText}` : currentNormalizedText;

            const score = scoreListeningEvidenceWindow({
                windowText: accumulatedNormalizedText,
                rawText: accumulatedRawText,
                anchorPhrases,
                answerCandidates,
                keywordTokens,
                groupType,
                windowLength: offset + 1,
            });

            if (score <= 0) {
                continue;
            }

            if (!bestWindow || score > bestWindow.score) {
                bestWindow = {
                    startIndex,
                    endIndex: currentIndex,
                    score,
                };
            }
        }
    }

    if (!bestWindow) {
        return null;
    }

    const startSegment = segments[bestWindow.startIndex];
    const endSegment = segments[bestWindow.endIndex];
    if (!startSegment || !endSegment) {
        return null;
    }

    const startSecond = startSegment.startTime;
    const rawEnd = endSegment.endTime ?? startSegment.startTime;
    const endSecond = rawEnd > startSecond ? rawEnd : startSecond + 1;
    const snippet = segments
        .slice(bestWindow.startIndex, bestWindow.endIndex + 1)
        .map((segment) => segment.text?.trim() ?? '')
        .filter(Boolean)
        .join(' ');

    return {
        questionNumber: question.questionNumber,
        answerStartSecond: startSecond,
        answerEndSecond: endSecond,
        playAtSecond: startSecond,
        timestampLabel: formatTranscriptRangeLabel(startSecond, endSecond),
        transcriptSnippet: snippet,
        confidence: bestWindow.score >= 20 ? 'high' : 'medium',
        segmentIndexes: Array.from(
            { length: bestWindow.endIndex - bestWindow.startIndex + 1 },
            (_, i) => bestWindow!.startIndex + i,
        ),
        score: bestWindow.score,
        startTime: startSecond,
        endTime: endSecond,
        text: snippet,
        targetQuestionNumbers: question.questionNumber ? [question.questionNumber] : [],
        segmentCount: bestWindow.endIndex - bestWindow.startIndex + 1,
    };
};

