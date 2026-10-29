import React from 'react';
import { Button, Dropdown, Space, Typography } from 'antd';
import { CustomerServiceOutlined } from '@ant-design/icons';
import type { DictationFormat, VoicePersona } from '../types/dictation.types';
import {
    ACCENT_NAME_MAP,
    AUDIO_SPEED_OPTIONS,
    CURATED_VOICES,
} from '../constants/dictation.constants';
import { AccentBadge } from './AccentBadge';

const { Text } = Typography;

export interface DictationToolbarProps {
    title: string;
    format: DictationFormat;
    currentIndex: number;
    totalItems: number;
    rate: number;
    onRateChange: (rate: number) => void;
    currentVoice: VoicePersona;
    onVoiceSelect: (voiceId: string) => void;
    onExit: () => void;
    fullParagraph?: string | null;
    onPlayFullParagraph?: () => void;
}

export const DictationToolbar: React.FC<DictationToolbarProps> = ({
    title,
    format,
    currentIndex,
    totalItems,
    rate,
    onRateChange,
    currentVoice,
    onVoiceSelect,
    onExit,
    fullParagraph,
    onPlayFullParagraph,
}) => {
    const voiceMenuItems = CURATED_VOICES.map((v) => ({
        key: v.id,
        label: (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <AccentBadge accent={v.accent} />
                <div>
                    <Text strong>{v.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        Giọng {ACCENT_NAME_MAP[v.accent] ?? v.accent} – {v.gender === 'female' ? 'Nữ' : 'Nam'}
                    </Text>
                </div>
            </div>
        ),
        onClick: () => onVoiceSelect(v.id),
    }));

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 12,
                marginBottom: 16,
                padding: '12px 18px',
                borderRadius: 20,
                background: '#fff',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.04)',
            }}
        >
            <Space size={12} align="center">
                <Button
                    size="small"
                    onClick={onExit}
                    style={{ borderRadius: 8, fontWeight: 600 }}
                >
                    Thoát
                </Button>
                <div>
                    <Text strong style={{ fontSize: 15, color: '#1e293b' }}>
                        {title}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                        {format === 'paragraph'
                            ? `Đoạn văn • Câu ${currentIndex + 1} / ${totalItems}`
                            : `Câu ${currentIndex + 1} / ${totalItems}`}
                    </Text>
                </div>
            </Space>

            <Space size={8} wrap align="center">
                {/* Speed Controls */}
                <div
                    style={{
                        display: 'inline-flex',
                        background: '#f1f5f9',
                        borderRadius: 999,
                        padding: 2,
                    }}
                >
                    {AUDIO_SPEED_OPTIONS.map((speed) => (
                        <button
                            key={speed}
                            type="button"
                            onClick={() => onRateChange(speed)}
                            style={{
                                border: 'none',
                                background: rate === speed ? '#fff' : 'transparent',
                                color: rate === speed ? '#4f46e5' : '#64748b',
                                fontWeight: rate === speed ? 700 : 500,
                                fontSize: 12,
                                padding: '4px 10px',
                                borderRadius: 999,
                                cursor: 'pointer',
                                boxShadow: rate === speed ? '0 2px 4px rgba(0,0,0,0.06)' : 'none',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            {speed}x
                        </button>
                    ))}
                </div>

                {/* Voice Persona Dropdown */}
                <Dropdown
                    menu={{
                        items: voiceMenuItems,
                        style: { maxHeight: 380, overflowY: 'auto', borderRadius: 14 },
                    }}
                    trigger={['click']}
                >
                    <Button
                        style={{
                            borderRadius: 999,
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                        }}
                    >
                        <AccentBadge accent={currentVoice.accent} />
                        <span>{currentVoice.name}</span>
                    </Button>
                </Dropdown>

                {/* Full Paragraph Audio Listen if paragraph format */}
                {format === 'paragraph' && fullParagraph && onPlayFullParagraph && (
                    <Button
                        icon={<CustomerServiceOutlined />}
                        onClick={onPlayFullParagraph}
                        style={{ borderRadius: 999, fontWeight: 600, color: '#4f46e5', borderColor: '#c7d2fe' }}
                    >
                        Nghe cả đoạn
                    </Button>
                )}
            </Space>
        </div>
    );
};

