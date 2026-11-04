import type { ClipboardEvent } from 'react';

/**
 * Clean pasted text: replace line breaks with spaces and collapse consecutive whitespace into a single space.
 */
export const cleanUpText = (text: string) => {
    if (!text) return '';
    return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Construct new input value after paste based on selection range.
 */
export const buildCleanPastedValue = (
    currentValue: string,
    pastedText: string,
    selectionStart?: number | null,
    selectionEnd?: number | null,
) => {
    const cleaned = cleanUpText(pastedText);
    const safeCurrent = currentValue ?? '';
    const start = typeof selectionStart === 'number' ? selectionStart : safeCurrent.length;
    const end = typeof selectionEnd === 'number' ? selectionEnd : start;

    return safeCurrent.substring(0, start) + cleaned + safeCurrent.substring(end);
};

/**
 * Helper for Input/TextArea onPaste event to obtain sanitized text.
 * Returns null if clipboard does not contain plain text.
 */
export const getCleanPastedInputValue = (
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    currentValue: string,
) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return null;

    event.preventDefault();
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    return buildCleanPastedValue(
        currentValue,
        pasted,
        target.selectionStart,
        target.selectionEnd,
    );
};
