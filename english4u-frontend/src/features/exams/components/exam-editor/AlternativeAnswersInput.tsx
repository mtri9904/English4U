import React, { useState, useEffect, useRef } from 'react';
import { Input, Button } from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { getCleanPastedInputValue } from '@/shared/utils/input';

export const splitCorrectAnswers = (value?: string) =>
    (value ?? '')
        .split('|')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

export const joinCorrectAnswers = (values: string[]) => {
    const normalized = Array.from(
        new Set(values.map((item) => item.trim()).filter((item) => item.length > 0)),
    );
    return normalized.length > 0 ? normalized.join('|') : undefined;
};

export interface AlternativeAnswersInputProps {
    value: string;
    onChange: (newValue: string) => void;
    placeholder?: string;
    style?: React.CSSProperties;
    isInline?: boolean;
}

export const AlternativeAnswersInput: React.FC<AlternativeAnswersInputProps> = ({
    value,
    onChange,
    placeholder = 'Đáp án',
    style,
    isInline = false,
}) => {
    const lastSentValueRef = useRef<string>(value);
    const [localAnswers, setLocalAnswers] = useState<string[]>(() => {
        const parsed = splitCorrectAnswers(value);
        return parsed.length > 0 ? parsed : [''];
    });

    useEffect(() => {
        if (value === lastSentValueRef.current) {
            return;
        }
        const parsed = splitCorrectAnswers(value);
        setLocalAnswers(parsed.length > 0 ? parsed : ['']);
        lastSentValueRef.current = value;
    }, [value]);

    const handleAnswerChange = (index: number, text: string) => {
        const next = [...localAnswers];
        next[index] = text;
        setLocalAnswers(next);
        const joined = joinCorrectAnswers(next) ?? '';
        lastSentValueRef.current = joined;
        onChange(joined);
    };

    const handleAdd = () => {
        const next = [...localAnswers, ''];
        setLocalAnswers(next);
    };

    const handleRemove = (index: number) => {
        const next = localAnswers.filter((_, idx) => idx !== index);
        const finalAnswers = next.length > 0 ? next : [''];
        setLocalAnswers(finalAnswers);
        const joined = joinCorrectAnswers(finalAnswers) ?? '';
        lastSentValueRef.current = joined;
        onChange(joined);
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: isInline ? '4px' : '6px',
                width: style?.width || '100%',
                padding: isInline ? '4px 6px' : '8px 10px',
                background: '#f8fafc',
                border: isInline ? '1px solid #e2e8f0' : '1px dashed #cbd5e1',
                borderRadius: '8px',
                ...style,
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: isInline ? '4px' : '6px' }}>
                {localAnswers.map((answer, index) => (
                    <div key={index} style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%' }}>
                        <Input
                            size={isInline ? 'small' : 'middle'}
                            placeholder={`${placeholder} ${index + 1}`}
                            value={answer}
                            style={{
                                flex: 1,
                                borderColor: '#10b981',
                                height: isInline ? '28px' : '34px',
                                borderRadius: '6px',
                            }}
                            onPaste={(event) => {
                                const nextValue = getCleanPastedInputValue(event, answer);
                                if (nextValue === null) return;
                                handleAnswerChange(index, nextValue);
                            }}
                            onChange={(event) => handleAnswerChange(index, event.target.value)}
                        />
                        {localAnswers.length > 1 && (
                            <Button
                                type="text"
                                danger
                                icon={<MinusCircleOutlined style={{ fontSize: '12px' }} />}
                                size="small"
                                onClick={() => handleRemove(index)}
                                style={{
                                    padding: 0,
                                    width: 20,
                                    height: 20,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    borderRadius: '50%',
                                    background: '#fee2e2',
                                }}
                            />
                        )}
                    </div>
                ))}
            </div>

            <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={handleAdd}
                style={{
                    color: '#10b981',
                    borderColor: '#10b981',
                    fontSize: '11px',
                    width: 'fit-content',
                    height: '24px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: '#ffffff',
                }}
            >
                Thêm đáp án thay thế
            </Button>
        </div>
    );
};

