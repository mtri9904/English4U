import { Typography } from 'antd';
import type { OptionLabelType } from '@/shared/lib/examDisplay';
import { getOptionLabel, stripOptionLeadingLabel } from '@/shared/utils/optionLabel.utils';
import type { PracticeSessionQuestionDto } from '../../../types/session.types';

const { Text } = Typography;

export interface SummaryWordBankTableProps {
    options: PracticeSessionQuestionDto['options'];
    optionLabelType?: OptionLabelType;
}

export const SummaryWordBankTable = ({
    options,
    optionLabelType = 'alpha',
}: SummaryWordBankTableProps) => {
    if (options.length === 0) {
        return null;
    }

    const columns = 4;
    const rows = Array.from({ length: Math.ceil(options.length / columns) }, (_, rowIndex) =>
        options.slice(rowIndex * columns, rowIndex * columns + columns),
    );

    return (
        <div
            style={{
                border: '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 14,
                background: '#eff6ff',
                overflowX: 'auto',
            }}
        >
            <Text strong style={{ display: 'block', marginBottom: 10 }}>Answer Box</Text>
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
                                            color: '#1e293b',
                                            verticalAlign: 'top',
                                            background: option ? '#ffffff' : '#f8fafc',
                                        }}
                                    >
                                        {option ? (
                                             <>
                                                <b>{getOptionLabel(globalIndex, optionLabelType)}.</b>{' '}
                                                {stripOptionLeadingLabel(option.optionText, globalIndex, optionLabelType) || option.optionText}
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
    );
};

