export const normalizeDisplayText = (value?: string | null): string =>
    (value ?? '')
        .replace(/\\r\\n/g, '\n')
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\n')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');

/**
 * Normalizes Markdown bold and italic tokens so that CommonMark / ReactMarkdown
 * and custom token parsers reliably recognize bold styling:
 * - Unescapes \*\* or \* into raw asterisks
 * - Collapses spaced asterisks like `* *` or `*   *` on the same line into `**`
 * - Converts `__word__` into `**word**`
 * - Ensures space before opening `**` if preceded by alphanumeric/closing bracket
 * - Trims inner whitespace inside `**`: `** word **` or `**word **` -> `**word**`
 */
export const normalizeMarkdownBoldText = (value?: string | null): string => {
    if (!value) return '';

    const text = normalizeDisplayText(value)
        .replace(/\\+(\*)/g, '$1')
        .replace(/\\+(_)/g, '$1')
        .replace(/\*[ \t]+\*/g, '**')
        .replace(/__\s*([^\n_]+?)\s*__/g, '**$1**')
        .replace(/([A-Za-z0-9)\]])\*\*(?=\s*\S)/g, '$1 **')
        .replace(/\*\*[ \t]*([^*\n]+?)[ \t]*\*\*/g, '**$1**');

    let output = '';
    let cursor = 0;
    let isBold = false;

    while (cursor < text.length) {
        const markerIndex = text.indexOf('**', cursor);
        if (markerIndex < 0) {
            output += text.slice(cursor);
            break;
        }

        output += text.slice(cursor, markerIndex);
        if (!isBold) {
            output += '**';
            isBold = true;
            cursor = markerIndex + 2;
            continue;
        }

        const rawInner = output.slice(output.lastIndexOf('**') + 2);
        const trimmedInner = rawInner.trim();
        if (trimmedInner.length !== rawInner.length) {
            output = output.slice(0, output.length - rawInner.length) + trimmedInner;
        }
        output += '**';
        isBold = false;
        cursor = markerIndex + 2;

        if (text[cursor] && !/\s|[.,;:!?()[\]{}"'“”‘’/-]/.test(text[cursor])) {
            output += ' ';
        }
    }

    return output;
};

export const normalizeBlockMarkdownText = (value?: string | null): string =>
    normalizeMarkdownBoldText(value)
        .replace(/\n{3,}/g, '\n\n')
        .replace(/(?<!\n)\n(?!\n)/g, '  \n')
        .trim();

