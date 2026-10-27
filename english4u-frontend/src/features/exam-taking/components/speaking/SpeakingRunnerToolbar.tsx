import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined, ClockCircleOutlined, SendOutlined } from '@ant-design/icons';
import { getSkillLabel } from '../../utils/sessionRouting.utils';

interface SpeakingRunnerToolbarProps {
    headerSlot: HTMLElement | null;
    examTitle: string;
    skillType: string;
    activePartNumber?: number | null;
    timerText: string;
    onBack: () => void;
    onSubmitClick: () => void;
}

export const SpeakingRunnerToolbar: React.FC<SpeakingRunnerToolbarProps> = ({
    headerSlot,
    examTitle,
    skillType,
    activePartNumber,
    timerText,
    onBack,
    onSubmitClick,
}) => {
    if (!headerSlot) return null;

    return createPortal(
        <div className="speaking-runner-page-toolbar">
            <Button
                type="text"
                className="speaking-runner-back-button"
                icon={<ArrowLeftOutlined />}
                aria-label="Quay lại bài thi của tôi"
                title="Bài thi của tôi"
                onClick={onBack}
            />
            <div className="speaking-runner-title-block">
                <span className="speaking-runner-title-accent" />
                <div className="speaking-runner-page-title" title={examTitle}>
                    {examTitle}
                </div>
            </div>
            <div className="speaking-runner-header-meta">
                <span className="speaking-runner-header-chip speaking-runner-skill-chip">
                    {getSkillLabel(skillType)}
                </span>
                <span className="speaking-runner-header-chip speaking-runner-part-chip">
                    {`Part ${activePartNumber ?? '—'}`}
                </span>
                <span className="speaking-runner-header-chip">
                    <ClockCircleOutlined />
                    {timerText}
                </span>
            </div>
            <Button
                type="primary"
                className="speaking-runner-header-submit"
                icon={<SendOutlined />}
                onClick={onSubmitClick}
            >
                Xem màn nộp bài
            </Button>
        </div>,
        headerSlot,
    );
};

