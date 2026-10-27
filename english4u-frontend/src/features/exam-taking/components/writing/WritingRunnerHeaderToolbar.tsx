import React from 'react';
import { createPortal } from 'react-dom';
import { Button } from 'antd';
import { ArrowLeftOutlined, ClockCircleOutlined, SaveOutlined } from '@ant-design/icons';
import { getSkillLabel } from '../../utils/sessionRouting.utils';

interface WritingRunnerHeaderToolbarProps {
    headerSlot: HTMLElement | null;
    examTitle: string;
    skillType: string;
    timerText: string;
    autosaveLabel: string;
    isPending: boolean;
    onBack: () => void;
    onFinish: () => void;
}

export const WritingRunnerHeaderToolbar: React.FC<WritingRunnerHeaderToolbarProps> = ({
    headerSlot,
    examTitle,
    skillType,
    timerText,
    autosaveLabel,
    isPending,
    onBack,
    onFinish,
}) => {
    if (!headerSlot) return null;

    return createPortal(
        <div className="writing-runner-page-toolbar">
            <Button
                type="text"
                className="writing-runner-back-button"
                icon={<ArrowLeftOutlined />}
                aria-label="Quay lại bài thi của tôi"
                title="Bài thi của tôi"
                onClick={onBack}
            />
            <div className="writing-runner-title-block">
                <span className="writing-runner-title-accent" />
                <div className="writing-runner-page-title" title={examTitle}>
                    {examTitle}
                </div>
            </div>
            <div className="writing-runner-header-meta">
                <span className="writing-runner-header-chip writing-runner-skill-chip">
                    {getSkillLabel(skillType)}
                </span>
                <span className="writing-runner-header-chip">
                    <ClockCircleOutlined />
                    {timerText}
                </span>
                <span className="writing-runner-header-chip writing-runner-save-chip">
                    <SaveOutlined />
                    {autosaveLabel}
                </span>
            </div>
            <Button
                type="primary"
                className="writing-runner-header-submit"
                loading={isPending}
                onClick={onFinish}
            >
                Hoàn thành
            </Button>
        </div>,
        headerSlot,
    );
};

