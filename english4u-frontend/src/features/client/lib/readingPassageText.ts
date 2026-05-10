export interface ReadingPassageDisplaySegment {
    kind: 'heading' | 'paragraph';
    text: string;
    paragraphNumber?: number;
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

const hasStructuredParagraphLabels = (value: string) => (
    /^\s*(?:\[?đoạn\s+\d+\]?|paragraph\s+\d+|[A-H]\.)/im.test(value)
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

export const buildReadingPassageDisplaySegments = (value?: string | null): ReadingPassageDisplaySegment[] => {
    const normalized = normalizeReadingPassageText(value);
    if (!normalized) {
        return [];
    }

    if (hasStructuredParagraphLabels(normalized)) {
        return [{
            kind: 'paragraph',
            text: normalized,
        }];
    }

    const blocks = normalized
        .split(/\n{2,}/)
        .map((block) => block.trim())
        .filter(Boolean);

    let paragraphNumber = 0;

    return blocks.map((block) => {
        if (looksLikeReadingSubheading(block)) {
            return {
                kind: 'heading',
                text: block,
            };
        }

        paragraphNumber += 1;
        return {
            kind: 'paragraph',
            paragraphNumber,
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

        startIndex = boundaryPattern.lastIndex;
        while (compactParagraph[startIndex] === ' ') {
            startIndex += 1;
        }
    }

    const finalSentence = compactParagraph.slice(startIndex).trim();
    if (finalSentence) {
        sentences.push(finalSentence);
    }

    return sentences;
};
