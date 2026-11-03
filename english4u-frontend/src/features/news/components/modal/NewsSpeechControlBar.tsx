import React from 'react';
import { Button } from 'antd';
import { SoundOutlined, PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';

interface NewsSpeechControlBarProps {
    isSpeaking: boolean;
    isPaused: boolean;
    speechRate: number;
    onSpeechRateChange: (rate: number) => void;
    onToggleSpeech: () => void;
    onStopSpeech: () => void;
}

export const NewsSpeechControlBar: React.FC<NewsSpeechControlBarProps> = ({
    isSpeaking,
    isPaused,
    speechRate,
    onSpeechRateChange,
    onToggleSpeech,
    onStopSpeech,
}) => {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 18px',
                background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)',
                border: '1px solid #bae6fd',
                borderRadius: '12px',
                marginBottom: '24px',
                gap: '12px',
                flexWrap: 'wrap',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                    style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                    }}
                >
                    <SoundOutlined />
                </div>
                <div>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: '#0369a1' }}>
                        Giọng đọc chuẩn Anh Quốc (British English AI)
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                        {isSpeaking
                            ? isPaused
                                ? 'Đang tạm dừng phát âm'
                                : 'Đang đọc bài viết theo ngữ điệu chuẩn...'
                            : 'Bấm phát âm và click vào bất kỳ từ vựng nào để tra từ điển & thêm Flashcard'}
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                    value={speechRate}
                    onChange={(e) => onSpeechRateChange(Number(e.target.value))}
                    style={{
                        fontSize: '12px',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        border: '1px solid #cbd5e1',
                        background: '#fff',
                        color: '#334155',
                        fontWeight: 600,
                    }}
                    title="Tốc độ đọc"
                >
                    <option value={0.8}>0.8x (Chậm)</option>
                    <option value={1.0}>1.0x (Chuẩn)</option>
                    <option value={1.2}>1.2x (Nhanh)</option>
                </select>

                <Button
                    type="primary"
                    size="small"
                    icon={isSpeaking && !isPaused ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                    onClick={onToggleSpeech}
                    style={{
                        background: '#0284c7',
                        borderColor: '#0284c7',
                        borderRadius: '6px',
                        fontWeight: 600,
                    }}
                >
                    {isSpeaking && !isPaused ? 'Tạm dừng' : isPaused ? 'Tiếp tục' : 'Phát âm'}
                </Button>

                {isSpeaking && (
                    <Button size="small" danger onClick={onStopSpeech} style={{ borderRadius: '6px' }}>
                        Dừng
                    </Button>
                )}
            </div>
        </div>
    );
};

