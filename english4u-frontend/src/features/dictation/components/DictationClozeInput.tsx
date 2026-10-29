import React from 'react';
import { Typography } from 'antd';
import type { DictationClozeToken } from '../types/dictation.types';

const { Text } = Typography;

export interface DictationClozeInputProps {
    tokens: DictationClozeToken[];
    inputs: Record<number, string>;
    onChange: (tokenIndex: number, value: string) => void;
    isChecked: boolean;
}

export const DictationClozeInput: React.FC<DictationClozeInputProps> = ({
    tokens,
    inputs,
    onChange,
    isChecked,
}) => {
    return (
        <div
            style={{
                padding: 20,
                borderRadius: 16,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                marginBottom: 20,
                lineHeight: 2.4,
                fontSize: 17,
            }}
        >
            {tokens.map((token, tIdx) => {
                if (!token.isMasked) {
                    return (
                        <span key={tIdx} style={{ marginRight: 6, color: '#334155' }}>
                            {token.word}
                        </span>
                    );
                }

                const val = inputs[tIdx] || '';
                const isCorrectWord =
                    isChecked && val.trim().toLowerCase() === token.word.trim().toLowerCase();

                return (
                    <span key={tIdx} style={{ display: 'inline-block', marginRight: 6 }}>
                        <input
                            type="text"
                            value={val}
                            onChange={(e) => onChange(tIdx, e.target.value)}
                            placeholder={token.hint || '____'}
                            style={{
                                minWidth: Math.max(64, token.word.length * 14),
                                padding: '4px 10px',
                                textAlign: 'center',
                                borderRadius: 8,
                                border: isChecked
                                    ? isCorrectWord
                                        ? '2px solid #10b981'
                                        : '2px solid #ef4444'
                                    : '1.5px solid #cbd5e1',
                                background: isChecked
                                    ? isCorrectWord
                                        ? '#ecfdf5'
                                        : '#fef2f2'
                                    : '#fff',
                                fontSize: 16,
                                fontWeight: 600,
                                outline: 'none',
                            }}
                        />
                        {isChecked && !isCorrectWord && (
                            <Text
                                style={{
                                    fontSize: 12,
                                    color: '#ef4444',
                                    display: 'block',
                                    textAlign: 'center',
                                    lineHeight: 1,
                                    marginTop: 2,
                                    fontWeight: 700,
                                }}
                            >
                                {token.word}
                            </Text>
                        )}
                    </span>
                );
            })}
        </div>
    );
};

