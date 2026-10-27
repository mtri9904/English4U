import type { ClipboardEvent } from 'react';
import type { CreateSectionDto } from '@/features/exams/types/exam.types';
import { buildCleanPastedValue } from './examEditor.helpers';

export interface SharedSectionEditorProps {
    section: CreateSectionDto;
    sIdx: number;
    updateSection: (sIdx: number, partial: Partial<CreateSectionDto>) => void;
}

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

