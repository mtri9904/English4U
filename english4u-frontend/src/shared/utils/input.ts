import type { ClipboardEvent } from 'react';

/**
 * Làm sạch văn bản khi paste: xóa bỏ tất cả các dấu xuống dòng và thay bằng khoảng trắng,
 * thu gọn nhiều khoảng trắng liên tiếp thành một.
 */
export const cleanUpText = (text: string) => {
    if (!text) return '';
    return text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
};

/**
 * Xây dựng giá trị mới sau khi paste dựa trên vị trí con trỏ (selection).
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
 * Helper cho sự kiện onPaste của Input/TextArea để lấy giá trị đã làm sạch.
 * Trả về null nếu không có văn bản trong clipboard.
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
