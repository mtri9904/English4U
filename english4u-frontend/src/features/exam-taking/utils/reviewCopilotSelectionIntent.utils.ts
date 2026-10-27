import type { PracticeSessionListeningPartDto } from '../types/session.types';

export const normalizeCopilotIntentText = (value: string) => (
    value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
);

export const hasReadingEvidenceLocationIntent = (message: string) => {
    const normalized = normalizeCopilotIntentText(message);
    return [
        'doc o dau',
        'doc cho nao',
        'doc o cho nao',
        'tim o dau',
        'tim cho nao',
        'o doan nao',
        'doan may',
        'doan nao',
        'vi tri nao',
        'vi tri doc',
        'cho nao trong bai',
        'cau nay doc o dau',
        'cau nay tim o dau',
    ].some((phrase) => normalized.includes(phrase));
};

export const listeningQuestionNumberWordValues: Record<string, number> = {
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

export const listeningQuestionNumberTokenPattern = [
    '\\d+',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
    'twenty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'thirty(?:\\s+(?:one|two|three|four|five|six|seven|eight|nine))?',
    'forty',
].join('|');

export const parseListeningQuestionNumberToken = (token: string) => {
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

export const parseQuestionRangeFromListeningTranscriptSegment = (value?: string | null) => {
    const normalized = (value ?? '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/([a-z])[-–—]([a-z])/g, '$1 $2')
        .replace(/(\d)\s*[-–—]\s*(\d)/g, '$1 - $2')
        .replace(/\s+/g, ' ')
        .trim();

    if (!normalized) {
        return null;
    }

    const match = normalized.match(new RegExp(`\\bquestions?\\s+(${listeningQuestionNumberTokenPattern})\\s*(?:to|-|through)\\s*(${listeningQuestionNumberTokenPattern})\\b`));
    if (!match) {
        return null;
    }

    const startQuestion = parseListeningQuestionNumberToken(match[1]);
    const endQuestion = parseListeningQuestionNumberToken(match[2]);

    if (startQuestion === null || endQuestion === null || !Number.isFinite(startQuestion) || !Number.isFinite(endQuestion) || startQuestion > endQuestion) {
        return null;
    }

    const startNum = startQuestion as number;
    const endNum = endQuestion as number;
    return { startQuestion: startNum, endQuestion: endNum };
};

export const buildQuestionNumberRange = (startQuestion: number, endQuestion: number) => {
    const numbers: number[] = [];
    const minNumber = Math.min(startQuestion, endQuestion);
    const maxNumber = Math.max(startQuestion, endQuestion);

    if (maxNumber - minNumber > 40) {
        return numbers;
    }

    for (let current = minNumber; current <= maxNumber; current += 1) {
        numbers.push(current);
    }

    return numbers;
};

export const dedupeQuestionNumbers = (numbers: number[]) => {
    const seen = new Set<number>();
    const result: number[] = [];

    numbers.forEach((number) => {
        if (!seen.has(number) && number > 0 && number <= 40) {
            seen.add(number);
            result.push(number);
        }
    });

    return result;
};

export const extractReferencedQuestionNumbers = (message: string, focusedQuestionNumber?: number | null) => {
    const normalized = normalizeCopilotIntentText(message);
    const numbers: number[] = [];

    const rangeRegex = /(?:cau|question|q)\s*(\d{1,2})\s*(?:den|-|to)\s*(\d{1,2})/g;
    let rangeMatch = rangeRegex.exec(normalized);
    while (rangeMatch) {
        const start = Number(rangeMatch[1]);
        const end = Number(rangeMatch[2]);
        if (Number.isFinite(start) && Number.isFinite(end)) {
            numbers.push(...buildQuestionNumberRange(start, end));
        }
        rangeMatch = rangeRegex.exec(normalized);
    }

    const singleRegex = /(?:^|[^\w])(?:cau|question|q)\s*(\d{1,2})(?=[^\w]|$)/g;
    let singleMatch = singleRegex.exec(normalized);
    while (singleMatch) {
        const value = Number(singleMatch[1]);
        if (Number.isFinite(value)) {
            numbers.push(value);
        }
        singleMatch = singleRegex.exec(normalized);
    }

    const deduped = dedupeQuestionNumbers(numbers);
    if (deduped.length > 0) {
        return deduped;
    }

    return focusedQuestionNumber != null && focusedQuestionNumber > 0 && focusedQuestionNumber <= 40
        ? [focusedQuestionNumber]
        : [];
};

export const extractReferencedQuestionNumber = (message: string, focusedQuestionNumber?: number | null) => {
    const numbers = extractReferencedQuestionNumbers(message, focusedQuestionNumber);
    return numbers.length > 0 ? numbers[0] : null;
};

export const hasListeningReplayIntent = (message: string) => {
    const normalized = normalizeCopilotIntentText(message);
    const phrases = [
        'nghe lai',
        'phat lai',
        'bat lai',
        'replay',
        'doan audio',
        'cho nghe',
        'nghe o dau',
        'nghe o doan nao',
        'o phut thu may',
        'o giay thu may',
        'moc audio',
        'timestamp',
        'nghe lai cau',
        'phat audio',
    ];

    return phrases.some((phrase) => normalized.includes(phrase));
};

export const extractRequestedReplayQuestionNumber = (message: string, focusedQuestionNumber?: number | null) => {
    const normalized = normalizeCopilotIntentText(message);
    const directMatch = normalized.match(/(?:cau|question|q)\s*(\d{1,2})/);
    if (directMatch) {
        const candidate = Number(directMatch[1]);
        if (Number.isFinite(candidate) && candidate > 0 && candidate <= 40) {
            return candidate;
        }
    }

    return focusedQuestionNumber ?? null;
};

export const isAmbiguousListeningReplayRequest = (message: string, focusedQuestionNumber?: number | null) => {
    if (!hasListeningReplayIntent(message)) {
        return false;
    }

    return extractRequestedReplayQuestionNumber(message, focusedQuestionNumber) == null;
};

export const isCorrectAnswerQuery = (message: string) => {
    const normalized = normalizeCopilotIntentText(message);
    const phrases = [
        'dap an dung',
        'cau dung',
        'tai sao dung',
        'vi sao dung',
        'nghe o dau de dung',
        'cho nao la dap an',
    ];

    return phrases.some((phrase) => normalized.includes(phrase));
};

export const isObjectiveWeaknessSummaryIntent = (message: string, skillType: string) => {
    const normalized = normalizeCopilotIntentText(message);
    const normalizedSkill = skillType.trim().toUpperCase();

    if (normalizedSkill !== 'READING' && normalizedSkill !== 'LISTENING') {
        return false;
    }

    return [
        'giai thich toan bo loi sai noi bat',
        'tong hop loi sai',
        'nhung cau lam sai',
        'nhung cau sai',
        'cac cau lam sai',
        'cac cau sai',
    ].some((phrase) => normalized.includes(phrase));
};

export const isNodeInsideCopilotDrawer = (node: Node | null) => {
    const element = node instanceof Element ? node : node?.parentElement;
    return Boolean(element?.closest('[data-copilot-drawer-root="true"]'));
};

export const readSelectedReviewText = () => {
    if (typeof window === 'undefined') {
        return '';
    }

    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return '';
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;
    if (isNodeInsideCopilotDrawer(anchorNode) || isNodeInsideCopilotDrawer(focusNode)) {
        return '';
    }

    return selection.toString().trim();
};

export const selectionKeywordStopwords = new Set([
    'the', 'and', 'that', 'this', 'with', 'from', 'into', 'your', 'their', 'there', 'about', 'would', 'could',
    'should', 'have', 'has', 'had', 'were', 'was', 'been', 'being', 'while', 'where', 'when', 'which', 'what',
    'then', 'than', 'them', 'they', 'those', 'these', 'just', 'also', 'only', 'more', 'most', 'very',
    'much', 'many', 'some', 'such', 'over', 'under', 'after', 'before', 'because', 'through', 'during', 'between',
    'each', 'other', 'another', 'into', 'onto', 'upon', 'across', 'around', 'within', 'without', 'against', 'among',
    'cung', 'nhung', 'hoac', 'va', 'cua', 'trong', 'tren', 'duoi', 'khi', 'neu', 'vi', 'do', 'cho', 'voi',
]);

export const extractSelectionKeywords = (selectedText: string) => {
    if (!selectedText) {
        return [];
    }

    const words = selectedText
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .map((item) => item.trim())
        .filter((item) => item.length >= 3 && !selectionKeywordStopwords.has(item));

    const counts = new Map<string, number>();
    words.forEach((word) => counts.set(word, (counts.get(word) ?? 0) + 1));

    return Array.from(counts.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 4)
        .map(([word]) => word);
};

export const inferListeningQuestionNumberFromContextText = ({
    parts,
    text,
}: {
    parts: PracticeSessionListeningPartDto[];
    text?: string | null;
}) => {
    if (!text?.trim()) {
        return null;
    }

    const directReferencedNumber = extractReferencedQuestionNumber(text);
    if (directReferencedNumber != null) {
        return directReferencedNumber;
    }

    const normalizedText = normalizeCopilotIntentText(text);
    let bestMatch: { questionNumber: number; score: number } | null = null;

    for (const part of parts) {
        for (const group of part.questionGroups) {
            for (const question of group.questions) {
                if (question.questionNumber == null) {
                    continue;
                }

                const candidatePhrases = [
                    question.content,
                    question.correctAnswer,
                    ...question.options.map((opt) => opt.optionText),
                ]
                    .filter((phrase): phrase is string => Boolean(phrase?.trim()))
                    .map((phrase) => normalizeCopilotIntentText(phrase));

                let questionScore = 0;
                candidatePhrases.forEach((phrase) => {
                    if (phrase.length >= 4 && normalizedText.includes(phrase)) {
                        questionScore += phrase.length;
                    }
                });

                if (questionScore > 0 && (!bestMatch || questionScore > bestMatch.score)) {
                    bestMatch = { questionNumber: question.questionNumber, score: questionScore };
                }
            }
        }
    }

    return bestMatch?.questionNumber ?? null;
};

