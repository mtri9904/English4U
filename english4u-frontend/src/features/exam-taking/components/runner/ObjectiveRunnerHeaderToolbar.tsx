import React from 'react';
import { Button } from 'antd';
import {
    ArrowLeftOutlined,
    ClockCircleOutlined,
    SaveOutlined,
} from '@ant-design/icons';
import { getSkillLabel } from '../../utils/sessionRouting.utils';
import { formatAudioTime } from '../../utils/objectiveRunner.utils';
import type { ListeningAttemptMode } from '../../utils/listeningSession.utils';

export interface ObjectiveRunnerHeaderToolbarProps {
    examTitle: string;
    skillType: string;
    timerText: string;
    autosaveLabel: string;
    isListeningSession: boolean;
    sharedListeningAudioUrl?: string | null;
    listeningAttemptMode: ListeningAttemptMode;
    audioRef: React.Ref<HTMLAudioElement>;
    audioCurrentTime: number;
    audioDuration: number;
    audioProgressPercent: number;
    mockCountdownLabel: string;
    onBack: () => void;
    onSubmit: () => void;
}

export const ObjectiveRunnerHeaderToolbar: React.FC<ObjectiveRunnerHeaderToolbarProps> = ({
    examTitle,
    skillType,
    timerText,
    autosaveLabel,
    isListeningSession,
    sharedListeningAudioUrl,
    listeningAttemptMode,
    audioRef,
    audioCurrentTime,
    audioDuration,
    audioProgressPercent,
    mockCountdownLabel,
    onBack,
    onSubmit,
}) => {
    return (
        <div className="runner-page-toolbar">
            <Button
                type="text"
                className="runner-back-button"
                icon={<ArrowLeftOutlined />}
                aria-label="Quay lại bài thi của tôi"
                title="Bài thi của tôi"
                onClick={onBack}
            />
            <div className="runner-title-block">
                <span className="runner-title-accent" />
                <div className="runner-page-title" title={examTitle}>
                    {examTitle}
                </div>
            </div>

            {isListeningSession && sharedListeningAudioUrl ? (
                <div className="runner-audio-slot">
                    {listeningAttemptMode === 'practice' ? (
                        <audio
                            ref={audioRef}
                            controls
                            controlsList="nodownload noplaybackrate"
                            preload="auto"
                            src={sharedListeningAudioUrl}
                            className="runner-audio-player"
                        />
                    ) : (
                        <>
                            <audio
                                ref={audioRef}
                                preload="auto"
                                src={sharedListeningAudioUrl}
                                className="runner-audio-hidden"
                            />
                            <div className="runner-mock-audio-card">
                                <div className="runner-mock-audio-head">
                                    <span className="runner-mock-audio-badge">Mock test</span>
                                    <span className="runner-mock-audio-state">{mockCountdownLabel}</span>
                                </div>
                                <div className="runner-mock-audio-track">
                                    <div
                                        className="runner-mock-audio-track-fill"
                                        style={{ width: `${audioProgressPercent}%` }}
                                    />
                                </div>
                                <div className="runner-mock-audio-meta">
                                    <span>{formatAudioTime(audioCurrentTime)}</span>
                                    <span>{formatAudioTime(audioDuration)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            ) : null}

            <div className="runner-header-meta">
                <span className="runner-header-chip runner-skill-chip">{getSkillLabel(skillType)}</span>
                <span className="runner-header-chip runner-timer-chip">
                    <ClockCircleOutlined />
                    {timerText}
                </span>
                <span className="runner-header-chip runner-save-chip runner-save-status-chip runner-autosave-tag">
                    <SaveOutlined />
                    {autosaveLabel}
                </span>
            </div>
            <Button type="primary" className="runner-header-submit" onClick={onSubmit}>
                Hoàn thành
            </Button>
        </div>
    );
};

