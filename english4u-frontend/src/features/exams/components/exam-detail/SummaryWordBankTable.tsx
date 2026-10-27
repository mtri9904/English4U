import React from 'react';
import type { QuestionGroupDto } from '@/features/exams/types/exam.types';
import { inferQuestionGroupOptionLabelType as inferOptionLabelType } from '@/shared/lib/examDisplay';
import { getOptionLabel, stripOptionLeadingLabel } from '@/shared/utils/optionLabel.utils';
import { getSharedGroupOptions, renderFormattedText } from '../../utils/examDetail.utils';

export const SummaryWordBankTable: React.FC<{ group: QuestionGroupDto }> = ({ group }) => {
    const options = getSharedGroupOptions(group);
    const optionLabelType = inferOptionLabelType(group);
    if (options.length === 0) {
        return null;
    }

    const columns = 4;
    const rows = Array.from({ length: Math.ceil(options.length / columns) }, (_, rowIndex) =>
        options.slice(rowIndex * columns, rowIndex * columns + columns),
    );

    return (
        <div style={{ background: '#fff', padding: '12px', border: '2px solid #0ea5e9', borderRadius: '12px', marginBottom: '15px' }}>
            <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '10px', fontSize: '0.875rem', textTransform: 'uppercase' }}>
                Answer Box
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520, background: '#fff' }}>
                    <tbody>
                        {rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                                {Array.from({ length: columns }, (_, columnIndex) => {
                                    const option = row[columnIndex];
                                    const globalIndex = rowIndex * columns + columnIndex;
                                    return (
                                        <td
                                            key={columnIndex}
                                            style={{
                                                width: `${100 / columns}%`,
                                                border: '1px solid #cbd5e1',
                                                padding: '10px 12px',
                                                color: '#334155',
                                                fontSize: '0.9375rem',
                                                verticalAlign: 'top',
                                                background: option ? '#ffffff' : '#f8fafc',
                                            }}
                                        >
                                            {option ? (
                                                <>
                                                    <b>{getOptionLabel(globalIndex, optionLabelType)}.</b>{' '}
                                                    {renderFormattedText(
                                                        stripOptionLeadingLabel(option.optionText, globalIndex, optionLabelType) || option.optionText || '',
                                                    )}
                                                </>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

