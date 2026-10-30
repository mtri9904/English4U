export interface ReadingPassageDisplaySegment {
    kind: 'heading' | 'paragraph';
    text: string;
    paragraphNumber?: number | string;
    label?: string;
}

export const normalizeReadingPassageText = (value?: string | null) => (
    (value ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
);

const looksLikeReadingSubheading = (block: string) => {
    const compact = block.replace(/\s+/g, ' ').trim();
    if (!compact) {
        return false;
    }

    if (/^#{1,6}\s+/.test(compact)) {
        return true;
    }

    if (compact.endsWith(':') && compact.length <= 90 && !/[.!?]\s*$/.test(compact.slice(0, -1))) {
        return true;
    }

    return false;
};

const getLeadingLetter = (block: string): string | null => {
    const match = block.match(/^(?:(?:\[?(?:đoạn|paragraph)\s+)?(?:\*\*)?([A-H])(?:\.|\b)(?:\*\*)?[\s:.)\]]*)/i);
    return match && match[1] ? match[1].toUpperCase() : null;
};

const isFullAlphabetStructuredPassage = (blocks: string[]): boolean => {
    const nonHeadingBlocks = blocks.filter((b) => !looksLikeReadingSubheading(b));
    if (nonHeadingBlocks.length === 0) {
        return false;
    }

    const blockLetters: (string | null)[] = nonHeadingBlocks.map(getLeadingLetter);
    const validLetters = blockLetters.filter((l): l is string => l !== null);

    if (validLetters.length < 2) {
        return false;
    }

    const startsWithA = blockLetters[0] === 'A';
    const letterRatio = validLetters.length / nonHeadingBlocks.length;

    let longestRun = 1;
    let currentRun = 1;
    for (let i = 1; i < validLetters.length; i += 1) {
        if (validLetters[i].charCodeAt(0) === validLetters[i - 1].charCodeAt(0) + 1) {
            currentRun += 1;
            longestRun = Math.max(longestRun, currentRun);
        } else {
            currentRun = 1;
        }
    }

    // A passage is considered a full A-B-C-D structured passage (typical IELTS matching headings) if:
    // 1) It has a consecutive run of >= 3 letters (A, B, C...) covering >= 50% of the paragraphs
    // OR 2) It starts with A, has at least A and B, and covers >= 60% of paragraphs
    if (longestRun >= 3 && letterRatio >= 0.5) {
        return true;
    }

    if (startsWithA && longestRun >= 2 && letterRatio >= 0.6) {
        return true;
    }

    return false;
};

export const buildReadingPassageDisplaySegments = (value?: string | null): ReadingPassageDisplaySegment[] => {
    const normalized = normalizeReadingPassageText(value);
    if (!normalized) {
        return [];
    }

    // Split raw blocks by double newlines
    const rawBlocks = normalized
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

    if (rawBlocks.length === 0) {
        return [];
    }

    // Pass 1: Merge standalone letter labels (e.g. "A." on its own line) with following block
    const preMergedBlocks: string[] = [];
    for (let i = 0; i < rawBlocks.length; i += 1) {
        const block = rawBlocks[i];
        const standaloneLetterMatch = block.match(/^(?:\*\*)?([A-H])(?:\s*[).:\-]|[.])?(?:\*\*)?$/i);
        if (standaloneLetterMatch && i + 1 < rawBlocks.length) {
            const letter = standaloneLetterMatch[1].toUpperCase();
            const nextBlock = rawBlocks[i + 1];
            preMergedBlocks.push(`**${letter}.** ${nextBlock}`);
            i += 1; // skip next block since merged
        } else {
            preMergedBlocks.push(block);
        }
    }

    // Pass 2: Merge numbered list items (e.g. "1. ", "2) ") into their preceding block
    // so list items within an assumption/requirement do not become separate "Đoạn" tags
    const mergedBlocks: string[] = [];
    for (const block of preMergedBlocks) {
        const isNumberedListItem = /^\d+[.)]\s+/.test(block);
        if (isNumberedListItem && mergedBlocks.length > 0) {
            mergedBlocks[mergedBlocks.length - 1] += '\n\n' + block;
        } else {
            mergedBlocks.push(block);
        }
    }

    // If the passage is fully structured with A, B, C, D... across paragraphs (standard IELTS Matching Headings/Info),
    // keep each paragraph intact without injecting redundant "Đoạn" tags, as the text already provides section letters.
    if (isFullAlphabetStructuredPassage(mergedBlocks)) {
        return mergedBlocks.map((block) => {
            if (looksLikeReadingSubheading(block)) {
                return {
                    kind: 'heading',
                    text: block,
                };
            }
            return {
                kind: 'paragraph',
                text: block,
            };
        });
    }

    // Otherwise, this is a normal passage (or one with only 1-2 bullet points labeled A/B).
    // Assign standard sequential "Đoạn 1", "Đoạn 2", "Đoạn 3"... to all paragraphs.
    let sequentialNumber = 0;

    return mergedBlocks.map((block) => {
        if (looksLikeReadingSubheading(block)) {
            return {
                kind: 'heading',
                text: block,
            };
        }

        const explicitNumMatch = block.match(/^(?:\[?(?:đoạn|paragraph)\s+(\d+)[.:\]\s]*)/i);
        if (explicitNumMatch && explicitNumMatch[1]) {
            const num = Number(explicitNumMatch[1]);
            sequentialNumber = num;
            return {
                kind: 'paragraph',
                paragraphNumber: num,
                label: `Đoạn ${num}`,
                text: block,
            };
        }

        sequentialNumber += 1;
        return {
            kind: 'paragraph',
            paragraphNumber: sequentialNumber,
            label: `Đoạn ${sequentialNumber}`,
            text: block,
        };
    });
};

export const splitReadingParagraphIntoSentences = (paragraph: string) => {
    const compactParagraph = paragraph.replace(/\s+/g, ' ').trim();
    const sentences: string[] = [];
    const boundaryPattern = /[.!?](?=\s+(?:["'“‘]?[A-Z0-9]))/g;
    let startIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = boundaryPattern.exec(compactParagraph)) !== null) {
        const endIndex = match.index + 1;
        const sentence = compactParagraph.slice(startIndex, endIndex).trim();
        if (sentence) {
            sentences.push(sentence);
        }
        startIndex = endIndex;
    }

    const tail = compactParagraph.slice(startIndex).trim();
    if (tail) {
        sentences.push(tail);
    }

    return sentences.length > 0 ? sentences : [compactParagraph];
};
