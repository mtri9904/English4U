import { Tag, Typography } from 'antd';
import type { OptionLabelType } from '@/shared/lib/examDisplay';
import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import type { PracticeSessionQuestionDto } from '../../../types/session.types';

const { Text } = Typography;

export interface MatchingVisualsOptionBankProps {
    options: PracticeSessionQuestionDto['options'];
    optionLabelType: OptionLabelType;
}

export const MatchingVisualsOptionBank = ({
    options,
    optionLabelType,
}: MatchingVisualsOptionBankProps) => {
    if (options.length === 0) {
        return null;
    }

    return (
        <div
            style={{
                border: '1px solid #bfdbfe',
                borderRadius: 14,
                padding: 14,
                background: '#eff6ff',
            }}
        >
            <Text strong style={{ display: 'block', marginBottom: 10 }}>Danh sách hình</Text>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: 12,
                }}
            >
                {options.map((option, index) => {
                    const label = getOptionLabel(index, optionLabelType);
                    const imageUrl = (option.optionText ?? '').trim();

                    return (
                        <div
                            key={option.id}
                            style={{
                                border: '1px solid #dbeafe',
                                borderRadius: 12,
                                padding: 10,
                                background: '#fff',
                            }}
                        >
                            <Tag color="blue" style={{ marginBottom: 8 }}>{label}</Tag>
                            {imageUrl ? (
                                <img
                                    src={imageUrl}
                                    alt={`Hình ${label}`}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        height: 120,
                                        objectFit: 'contain',
                                        borderRadius: 10,
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                    }}
                                />
                            ) : (
                                <div
                                    style={{
                                        height: 120,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        borderRadius: 10,
                                        background: '#f8fafc',
                                        border: '1px dashed #cbd5e1',
                                        color: '#94a3b8',
                                        fontSize: 13,
                                    }}
                                >
                                    Chưa có ảnh
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

