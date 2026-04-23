import React from 'react';

type TruthValueDefinitionTableProps = {
    groupType?: string | null;
};

const definitionRows: Record<string, Array<{ label: string; description: string }>> = {
    TFNG: [
        { label: 'TRUE', description: 'if the statement agrees with the information' },
        { label: 'FALSE', description: 'if the statement contradicts the information' },
        { label: 'NOT GIVEN', description: 'if there is no information on this' },
    ],
    YNNG: [
        { label: 'YES', description: 'if the statement agrees with the views of the writer' },
        { label: 'NO', description: 'if the statement contradicts the views of the writer' },
        { label: 'NOT GIVEN', description: 'if it is impossible to say what the writer thinks about this' },
    ],
};

export const isTruthValueDefinitionType = (groupType?: string | null) => {
    const normalizedType = (groupType ?? '').trim().toUpperCase();
    return normalizedType === 'TFNG' || normalizedType === 'YNNG';
};

export const TruthValueDefinitionTable: React.FC<TruthValueDefinitionTableProps> = ({ groupType }) => {
    const normalizedType = (groupType ?? '').trim().toUpperCase();
    const rows = definitionRows[normalizedType];

    if (!rows) {
        return null;
    }

    return (
        <div
            style={{
                border: '1px solid #a3a3a3',
                background: '#f5f5f5',
                width: '100%',
                maxWidth: 760,
                margin: '8px 0 12px',
                overflow: 'hidden',
            }}
        >
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 15, color: '#2f2f2f' }}>
                <tbody>
                    {rows.map((row, index) => (
                        <tr key={row.label} style={{ background: index % 2 === 0 ? '#eeeeee' : '#ffffff' }}>
                            <td
                                style={{
                                    width: 150,
                                    padding: '7px 16px',
                                    fontWeight: 800,
                                    letterSpacing: 0.4,
                                    whiteSpace: 'nowrap',
                                    borderBottom: index === rows.length - 1 ? 'none' : '1px solid #d4d4d4',
                                }}
                            >
                                {row.label}
                            </td>
                            <td
                                style={{
                                    padding: '7px 16px',
                                    borderBottom: index === rows.length - 1 ? 'none' : '1px solid #d4d4d4',
                                }}
                            >
                                {row.description}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
