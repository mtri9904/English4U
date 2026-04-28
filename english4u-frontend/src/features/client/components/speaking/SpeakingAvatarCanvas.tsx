import { useState, type CSSProperties, type FC } from 'react';
import { Card, Space, Typography } from 'antd';
import type { SpeakingVisemeCode } from '../../lib/speakingPlayback';
import { SpeakingExaminerModel } from './SpeakingExaminerModel';

const { Paragraph, Text, Title } = Typography;

interface SpeakingAvatarCanvasProps {
    microphoneLevel: number;
    promptAudioLevel: number;
    isPromptPlaying: boolean;
    isRecording: boolean;
    promptText?: string | null;
    activeViseme?: SpeakingVisemeCode;
    playbackMode?: 'browser-voice' | null;
}

const WAVE_BAR_COUNT = 14;

const mouthStyleMap: Record<SpeakingVisemeCode, CSSProperties> = {
    A: { width: 58, height: 34, borderRadius: '44% 44% 54% 54% / 40% 40% 62% 62%', background: '#7f1d1d', border: '3px solid #0f172a' },
    B: { width: 50, height: 10, borderRadius: 999, background: '#0f172a' },
    C: { width: 60, height: 22, borderRadius: '999px 999px 16px 16px', background: '#991b1b', border: '3px solid #0f172a' },
    D: { width: 54, height: 18, borderRadius: 999, background: '#fff7ed', border: '3px solid #0f172a' },
    E: { width: 56, height: 20, borderRadius: '999px 999px 20px 20px', background: '#fecaca', border: '3px solid #0f172a' },
    F: { width: 42, height: 28, borderRadius: '48% 48% 55% 55%', background: '#7f1d1d', border: '3px solid #0f172a' },
    G: { width: 52, height: 14, borderRadius: 999, background: '#ef4444', border: '3px solid #0f172a' },
    H: { width: 54, height: 16, borderRadius: '999px 999px 14px 14px', background: '#1e293b', border: '3px solid #0f172a' },
    X: { width: 48, height: 8, borderRadius: 999, background: '#0f172a' },
};

const playbackLabelMap: Record<NonNullable<SpeakingAvatarCanvasProps['playbackMode']>, string> = {
    'browser-voice': 'Browser voice',
};

const chipStyle = (background: string, color: string): CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 999,
    background,
    color,
});

const FallbackFace: FC<{
    activeViseme: SpeakingVisemeCode;
    isPromptPlaying: boolean;
    isRecording: boolean;
    microphoneLevel: number;
    speakerLevel: number;
}> = ({ activeViseme, isPromptPlaying, isRecording, microphoneLevel, speakerLevel }) => {
    const eyeScaleY = isPromptPlaying || isRecording ? 0.72 : 1;
    const avatarAccent = isRecording ? '#fecaca' : isPromptPlaying ? '#dbeafe' : '#f1f5f9';
    const mouthStyle = isPromptPlaying
        ? mouthStyleMap[activeViseme]
        : {
            ...mouthStyleMap.X,
            width: 50 + Math.round(microphoneLevel * 6),
            height: 8 + Math.round(microphoneLevel * 6),
            background: isRecording ? '#dc2626' : '#0f172a',
        };

    return (
        <div
            style={{
                width: 176,
                height: 176,
                borderRadius: '50%',
                background: '#f8fafc',
                boxShadow: `0 20px 45px rgba(15, 23, 42, ${0.15 + speakerLevel * 0.12})`,
                display: 'grid',
                placeItems: 'center',
                position: 'relative',
                transform: `translateY(${isPromptPlaying ? -2 : 0}px)`,
                transition: 'transform 140ms ease, box-shadow 140ms ease',
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: -10,
                    borderRadius: '50%',
                    border: `10px solid ${avatarAccent}`,
                    opacity: 0.8,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: 58,
                    left: 44,
                    width: 22,
                    height: 18,
                    borderRadius: '50%',
                    background: '#0f172a',
                    transform: `scaleY(${eyeScaleY})`,
                    transition: 'transform 140ms ease',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: 58,
                    right: 44,
                    width: 22,
                    height: 18,
                    borderRadius: '50%',
                    background: '#0f172a',
                    transform: `scaleY(${eyeScaleY})`,
                    transition: 'transform 140ms ease',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: 92,
                    width: 10,
                    height: 24,
                    borderRadius: 999,
                    background: '#cbd5e1',
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    bottom: 38,
                    display: 'grid',
                    placeItems: 'center',
                    transition: 'all 120ms ease',
                    ...mouthStyle,
                }}
            >
                {activeViseme === 'D' ? (
                    <div
                        style={{
                            width: 34,
                            height: 4,
                            borderRadius: 999,
                            background: '#0f172a',
                            opacity: 0.55,
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
};

export const SpeakingAvatarCanvas: FC<SpeakingAvatarCanvasProps> = ({
    microphoneLevel,
    promptAudioLevel,
    isPromptPlaying,
    isRecording,
    promptText,
    activeViseme = 'X',
    playbackMode,
}) => {
    const [isModelAvailable, setIsModelAvailable] = useState(false);
    const speakerLevel = isPromptPlaying ? promptAudioLevel : isRecording ? microphoneLevel : 0.06;
    const bars = Array.from({ length: WAVE_BAR_COUNT }, (_, index) => {
        const distanceToCenter = Math.abs(index - (WAVE_BAR_COUNT - 1) / 2);
        const intensity = Math.max(0.16, speakerLevel * (1 - distanceToCenter / WAVE_BAR_COUNT));
        return {
            key: index,
            height: `${Math.max(12, Math.round(18 + intensity * 58))}px`,
            opacity: Math.min(1, 0.32 + intensity),
        };
    });

    const avatarStatus = isPromptPlaying
        ? 'Examiner đang nói'
        : isRecording
            ? 'Candidate đang nói'
            : 'Examiner chờ phản hồi';

    return (
        <Card
            style={{
                borderRadius: 24,
                border: '1px solid #dbeafe',
                background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)',
                overflow: 'hidden',
                height: '100%',
            }}
            bodyStyle={{ padding: 24, height: '100%' }}
        >
            <Space direction="vertical" size={20} style={{ width: '100%', height: '100%', justifyContent: 'space-between' }}>
                <div
                    style={{
                        position: 'relative',
                        minHeight: 360,
                        borderRadius: 24,
                        background: 'radial-gradient(circle at 50% 24%, #bfdbfe 0%, #93c5fd 30%, #2563eb 100%)',
                        display: 'grid',
                        placeItems: 'center',
                        overflow: 'hidden',
                    }}
                >
                    <SpeakingExaminerModel
                        activeViseme={activeViseme}
                        audioLevel={speakerLevel}
                        isPromptPlaying={isPromptPlaying}
                        isRecording={isRecording}
                        onAvailabilityChange={setIsModelAvailable}
                    />

                    <div
                        style={{
                            position: 'absolute',
                            inset: '18px 18px auto',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            zIndex: 2,
                        }}
                    >
                        <Text style={{ ...chipStyle('rgba(255,255,255,0.72)', '#1e3a8a'), fontWeight: 600 }}>
                            {avatarStatus}
                        </Text>
                        {isPromptPlaying && playbackMode ? (
                            <Text style={chipStyle('rgba(15,23,42,0.18)', '#eff6ff')}>
                                {playbackLabelMap[playbackMode]}
                            </Text>
                        ) : null}
                    </div>

                    {!isModelAvailable ? (
                        <FallbackFace
                            activeViseme={activeViseme}
                            isPromptPlaying={isPromptPlaying}
                            isRecording={isRecording}
                            microphoneLevel={microphoneLevel}
                            speakerLevel={speakerLevel}
                        />
                    ) : null}

                    <div
                        style={{
                            position: 'absolute',
                            left: 24,
                            right: 24,
                            bottom: 24,
                            display: 'flex',
                            alignItems: 'flex-end',
                            justifyContent: 'center',
                            gap: 6,
                            pointerEvents: 'none',
                            zIndex: 2,
                        }}
                    >
                        {bars.map((bar) => (
                            <div
                                key={bar.key}
                                style={{
                                    width: 8,
                                    height: bar.height,
                                    borderRadius: 999,
                                    opacity: bar.opacity,
                                    background: isRecording ? '#ef4444' : '#ffffff',
                                    transition: 'height 90ms linear, opacity 90ms linear',
                                }}
                            />
                        ))}
                    </div>
                </div>

                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                    <Space wrap>
                        <Text style={chipStyle(isPromptPlaying ? '#dbeafe' : '#f1f5f9', '#1d4ed8')}>
                            {isPromptPlaying ? 'Lip-sync prompt đang chạy' : 'Prompt đang chờ phát'}
                        </Text>
                        <Text style={chipStyle(isRecording ? '#fee2e2' : '#f8fafc', isRecording ? '#b91c1c' : '#475569')}>
                            {isRecording ? 'Micro đang ghi âm' : 'Micro đang sẵn sàng'}
                        </Text>
                        <Text style={chipStyle('#e2e8f0', '#334155')}>
                            Viseme {activeViseme}
                        </Text>
                    </Space>
                    <Title level={4} style={{ margin: 0 }}>
                        Speaking Examiner Preview
                    </Title>
                    <Paragraph style={{ margin: 0, color: '#475569' }}>
                        {promptText?.trim() || 'Chọn một prompt để exam runner hiển thị nội dung, phát câu hỏi và đồng bộ cử động miệng.'}
                    </Paragraph>
                </Space>
            </Space>
        </Card>
    );
};
