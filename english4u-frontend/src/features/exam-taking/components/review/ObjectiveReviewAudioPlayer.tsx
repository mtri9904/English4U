import React, { type RefObject } from 'react';
import { Space, Typography } from 'antd';

const { Text } = Typography;

interface ObjectiveReviewAudioPlayerProps {
    audioRef: RefObject<HTMLAudioElement | null>;
    audioUrl?: string | null;
}

export const ObjectiveReviewAudioPlayer: React.FC<ObjectiveReviewAudioPlayerProps> = ({
    audioRef,
    audioUrl,
}) => {
    if (!audioUrl) {
        return null;
    }

    return (
        <div
            style={{
                border: '1px solid #dbeafe',
                borderRadius: 16,
                padding: 12,
                background: '#f8fbff',
            }}
        >
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text type="secondary">Audio review listening</Text>
                <div
                    style={{
                        minWidth: 0,
                        width: 'clamp(180px, 28vw, 320px)',
                        maxWidth: '100%',
                        flex: '1 1 180px',
                    }}
                >
                    <audio
                        ref={audioRef as any}
                        controls
                        controlsList="nodownload noplaybackrate"
                        preload="auto"
                        src={audioUrl}
                        style={{
                            width: '100%',
                            maxWidth: '100%',
                            display: 'block',
                        }}
                    />
                </div>
            </Space>
        </div>
    );
};

