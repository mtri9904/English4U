export interface MixedNoteTableData {
    layout: 'mixed_note_table';
    topText: string;
    tableData: string[][];
    bottomText: string;
}

export const isMixedNoteTableLayout = (contentData?: string | null): boolean => {
    if (!contentData) return false;
    try {
        const parsed = JSON.parse(contentData);
        return Boolean(parsed && typeof parsed === 'object' && parsed.layout === 'mixed_note_table');
    } catch {
        return false;
    }
};

export const parseMixedNoteTableData = (contentData?: string | null): MixedNoteTableData | null => {
    if (!contentData) return null;
    try {
        const parsed = JSON.parse(contentData);
        if (parsed && typeof parsed === 'object' && parsed.layout === 'mixed_note_table') {
            const topText = typeof parsed.topText === 'string' ? parsed.topText : '';
            const bottomText = typeof parsed.bottomText === 'string' ? parsed.bottomText : '';
            const rawTable = Array.isArray(parsed.tableData) ? parsed.tableData : [];
            const tableData: string[][] = rawTable.map((row: unknown) =>
                Array.isArray(row)
                    ? row.map((cell: unknown) => (typeof cell === 'string' ? cell : ''))
                    : ['']
            );
            return {
                layout: 'mixed_note_table',
                topText,
                tableData: tableData.length > 0 ? tableData : [['Cột 1', 'Cột 2'], ['ND 1', 'ND 2']],
                bottomText,
            };
        }
    } catch {}
    return null;
};

export const serializeMixedNoteTableData = (
    topText: string,
    tableData: string[][],
    bottomText: string,
): string => {
    const payload: MixedNoteTableData = {
        layout: 'mixed_note_table',
        topText,
        tableData,
        bottomText,
    };
    return JSON.stringify(payload);
};

