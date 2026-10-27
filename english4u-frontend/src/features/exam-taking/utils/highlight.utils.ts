import {
    HIGHLIGHT_COLOR_OPTIONS,
    HIGHLIGHT_COLOR_STYLES,
    HIGHLIGHT_STORAGE_VERSION,
    type RunnerHighlight,
    type RunnerHighlightColor,
} from '../constants/highlight.constants';

export const getHighlightStorageKey = (sessionId: string) =>
    `practice-highlights:${sessionId}:v${HIGHLIGHT_STORAGE_VERSION}`;

export const createRunnerHighlightId = () =>
    `hl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const normalizeRunnerHighlights = (highlights: RunnerHighlight[]) => (
    highlights
        .filter((highlight) => (
            highlight.sourceKey.trim()
            && highlight.selectedText.trim()
            && HIGHLIGHT_COLOR_OPTIONS.includes(highlight.color)
            && Number.isFinite(highlight.startOffset)
            && Number.isFinite(highlight.endOffset)
            && highlight.endOffset > highlight.startOffset
        ))
        .map((highlight) => ({
            ...highlight,
            sourceKey: highlight.sourceKey.trim(),
            selectedText: highlight.selectedText.trim(),
            startOffset: Math.max(0, Math.trunc(highlight.startOffset)),
            endOffset: Math.max(0, Math.trunc(highlight.endOffset)),
        }))
        .sort((left, right) => (
            left.sourceKey.localeCompare(right.sourceKey)
            || left.startOffset - right.startOffset
            || left.endOffset - right.endOffset
        ))
);

export const mergeSameColorHighlights = (highlights: RunnerHighlight[]) => {
    const sorted = normalizeRunnerHighlights(highlights);
    const merged: RunnerHighlight[] = [];

    sorted.forEach((highlight) => {
        const previous = merged[merged.length - 1];
        if (
            previous
            && previous.sourceKey === highlight.sourceKey
            && previous.color === highlight.color
            && previous.endOffset >= highlight.startOffset
        ) {
            merged[merged.length - 1] = {
                ...highlight,
                startOffset: Math.min(previous.startOffset, highlight.startOffset),
                endOffset: Math.max(previous.endOffset, highlight.endOffset),
                selectedText: highlight.selectedText || previous.selectedText,
                createdAt: previous.createdAt < highlight.createdAt ? previous.createdAt : highlight.createdAt,
            };
            return;
        }

        merged.push(highlight);
    });

    return merged;
};

export const parseStoredHighlights = (value?: string | null): RunnerHighlight[] => {
    if (!value) {
        return [];
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!Array.isArray(parsed)) {
            return [];
        }

        return normalizeRunnerHighlights(parsed.flatMap((item) => {
            if (!item || typeof item !== 'object') {
                return [];
            }

            const candidate = item as Partial<RunnerHighlight>;
            if (
                typeof candidate.id !== 'string'
                || typeof candidate.sourceKey !== 'string'
                || typeof candidate.selectedText !== 'string'
                || typeof candidate.color !== 'string'
                || !HIGHLIGHT_COLOR_OPTIONS.includes(candidate.color as RunnerHighlightColor)
                || typeof candidate.startOffset !== 'number'
                || typeof candidate.endOffset !== 'number'
                || !Number.isFinite(candidate.startOffset)
                || !Number.isFinite(candidate.endOffset)
                || candidate.endOffset <= candidate.startOffset
            ) {
                return [];
            }

            return [{
                id: candidate.id,
                sourceKey: candidate.sourceKey,
                startOffset: Math.max(0, Math.trunc(candidate.startOffset)),
                endOffset: Math.max(0, Math.trunc(candidate.endOffset)),
                selectedText: candidate.selectedText,
                color: candidate.color as RunnerHighlightColor,
                createdAt: typeof candidate.createdAt === 'string' ? candidate.createdAt : new Date().toISOString(),
                updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString(),
            }];
        }));
    } catch {
        return [];
    }
};

export const applyRunnerHighlightPatch = (
    current: RunnerHighlight[],
    patch: RunnerHighlight,
) => {
    const nextHighlights: RunnerHighlight[] = [];

    current.forEach((existing) => {
        const overlaps = existing.sourceKey === patch.sourceKey
            && existing.startOffset < patch.endOffset
            && existing.endOffset > patch.startOffset;
        const touchesSameColor = existing.sourceKey === patch.sourceKey
            && existing.color === patch.color
            && existing.startOffset <= patch.endOffset
            && existing.endOffset >= patch.startOffset;

        if (!overlaps && !touchesSameColor) {
            nextHighlights.push(existing);
            return;
        }

        if (existing.color === patch.color) {
            patch.startOffset = Math.min(patch.startOffset, existing.startOffset);
            patch.endOffset = Math.max(patch.endOffset, existing.endOffset);
            patch.createdAt = existing.createdAt < patch.createdAt ? existing.createdAt : patch.createdAt;
            return;
        }

        if (existing.startOffset < patch.startOffset) {
            nextHighlights.push({
                ...existing,
                id: `${existing.id}-left-${patch.id}`,
                endOffset: patch.startOffset,
                updatedAt: patch.updatedAt,
            });
        }

        if (existing.endOffset > patch.endOffset) {
            nextHighlights.push({
                ...existing,
                id: `${existing.id}-right-${patch.id}`,
                startOffset: patch.endOffset,
                updatedAt: patch.updatedAt,
            });
        }
    });

    nextHighlights.push(patch);
    return mergeSameColorHighlights(nextHighlights);
};

export const isTextNode = (node: Node): node is Text => node.nodeType === Node.TEXT_NODE;

export const unwrapRenderedHighlights = (root: HTMLElement) => {
    root.querySelectorAll('span[data-runner-highlight="true"]').forEach((highlightNode) => {
        const parent = highlightNode.parentNode;
        if (!parent) {
            return;
        }

        parent.replaceChild(document.createTextNode(highlightNode.textContent ?? ''), highlightNode);
        parent.normalize();
    });
};

export const collectTextNodes = (root: HTMLElement) => {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let currentNode = walker.nextNode();
    while (currentNode) {
        if (isTextNode(currentNode) && currentNode.nodeValue) {
            nodes.push(currentNode);
        }
        currentNode = walker.nextNode();
    }
    return nodes;
};

export const applyRenderedHighlights = (root: HTMLElement, highlights: RunnerHighlight[]) => {
    unwrapRenderedHighlights(root);
    if (highlights.length === 0) {
        return;
    }

    const normalizedHighlights = highlights
        .filter((highlight) => highlight.endOffset > highlight.startOffset)
        .sort((left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset);

    const textNodes = collectTextNodes(root);
    let textCursor = 0;

    textNodes.forEach((textNode) => {
        const text = textNode.nodeValue ?? '';
        const nodeStart = textCursor;
        const nodeEnd = nodeStart + text.length;
        textCursor = nodeEnd;

        const overlappingHighlights = normalizedHighlights.filter((highlight) => (
            highlight.startOffset < nodeEnd && highlight.endOffset > nodeStart
        ));
        if (overlappingHighlights.length === 0) {
            return;
        }

        const fragment = document.createDocumentFragment();
        let localCursor = 0;
        overlappingHighlights.forEach((highlight) => {
            const start = Math.max(0, highlight.startOffset - nodeStart);
            const end = Math.min(text.length, highlight.endOffset - nodeStart);
            if (start > localCursor) {
                fragment.appendChild(document.createTextNode(text.slice(localCursor, start)));
            }
            if (end > start) {
                const mark = document.createElement('span');
                const style = HIGHLIGHT_COLOR_STYLES[highlight.color];
                mark.dataset.runnerHighlight = 'true';
                mark.dataset.highlightId = highlight.id;
                mark.title = 'Click để xoá highlight';
                mark.style.background = style.background;
                mark.style.borderBottom = `2px solid ${style.border}`;
                mark.style.borderRadius = '3px';
                mark.style.cursor = 'pointer';
                mark.appendChild(document.createTextNode(text.slice(start, end)));
                fragment.appendChild(mark);
            }
            localCursor = Math.max(localCursor, end);
        });

        if (localCursor < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(localCursor)));
        }

        textNode.parentNode?.replaceChild(fragment, textNode);
    });
};

export const getSelectionOffsetsInsideRoot = (root: HTMLElement) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return null;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
        return null;
    }

    const selectedText = range.toString();
    if (!selectedText.trim()) {
        return null;
    }

    const preSelectionRange = document.createRange();
    preSelectionRange.selectNodeContents(root);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);

    const startOffset = preSelectionRange.toString().length;
    const endOffset = startOffset + selectedText.length;
    return {
        startOffset,
        endOffset,
        selectedText,
        rect: range.getBoundingClientRect(),
    };
};

