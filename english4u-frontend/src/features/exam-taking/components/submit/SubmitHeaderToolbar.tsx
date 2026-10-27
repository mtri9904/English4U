import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Space } from 'antd';
import { ArrowLeftOutlined, BulbOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { getSkillLabel } from '../../utils/sessionRouting.utils';
import { getSessionStatusLabel } from '../../utils/sessionReview.utils';
import type { PracticeSessionDto } from '../../types/session.types';

interface SubmitHeaderToolbarProps {
    headerSlot: HTMLElement | null;
    session: PracticeSessionDto;
    showWritingScoringView: boolean;
    canSubmitNow: boolean;
    canRetryWritingScore: boolean;
    activeSubmitLoading: boolean;
    isRestartPending: boolean;
    canUseWritingCopilot: boolean;
    writingCopilotOpen: boolean;
    onBack: () => void;
    onSubmit: () => void;
    onRestart: () => void;
    onToggleWritingCopilot: () => void;
}

export const SubmitHeaderToolbar: React.FC<SubmitHeaderToolbarProps> = ({
    headerSlot,
    session,
    showWritingScoringView,
    canSubmitNow,
    canRetryWritingScore,
    activeSubmitLoading,
    isRestartPending,
    canUseWritingCopilot,
    writingCopilotOpen,
    onBack,
    onSubmit,
    onRestart,
    onToggleWritingCopilot,
}) => {
    if (!headerSlot) {
        return null;
    }

    return createPortal(
        <>
            <style>{`
                .session-submit-page-toolbar {
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    width: auto;
                    min-width: 0;
                    height: 100%;
                    flex: 1 1 0;
                    overflow: hidden;
                }

                .session-submit-back-button {
                    width: 40px;
                    height: 40px;
                    flex: 0 0 40px;
                    border-radius: 12px;
                    border: 1px solid #dbeafe;
                    background: linear-gradient(135deg, #ffffff 0%, #f8fbff 100%);
                    color: #0f172a;
                    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.06);
                }

                .session-submit-title-block {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 0;
                    flex: 1 1 auto;
                    overflow: hidden;
                }

                .session-submit-title-accent {
                    width: 10px;
                    height: 32px;
                    border-radius: 999px;
                    background: linear-gradient(180deg, #2563eb 0%, #60a5fa 100%);
                    box-shadow: 0 6px 16px rgba(37, 99, 235, 0.28);
                    flex: 0 0 10px;
                }

                .session-submit-page-title {
                    min-width: 0;
                    flex: 1 1 auto;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    font-size: 1.1rem;
                    font-weight: 800;
                    color: #0f172a;
                }

                .session-submit-header-meta {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 0 0 auto;
                    flex-wrap: nowrap;
                    min-width: max-content;
                }

                .session-submit-header-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    height: 34px;
                    padding: 0 12px;
                    border-radius: 999px;
                    border: 1px solid #dbeafe;
                    background: #ffffff;
                    color: #1e293b;
                    font-size: 0.85rem;
                    font-weight: 700;
                    white-space: nowrap;
                }

                .session-submit-skill-chip {
                    border-color: #93c5fd;
                    background: #eff6ff;
                    color: #1d4ed8;
                }

                .session-submit-status-chip {
                    border-color: #bbf7d0;
                    background: #f0fdf4;
                    color: #16a34a;
                }

                .session-submit-header-action {
                    flex: 0 0 auto;
                    height: 40px;
                    border-radius: 12px;
                    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
                }

                .session-submit-header-progress {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                    gap: 10px;
                    min-width: 196px;
                    height: 40px;
                    padding: 0 16px;
                    border-radius: 14px;
                    border: 1px solid #bfdbfe;
                    background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
                    color: #1d4ed8;
                    font-weight: 800;
                    box-shadow: 0 8px 20px rgba(37, 99, 235, 0.14);
                    overflow: hidden;
                }

                .session-submit-header-progress::after {
                    content: "";
                    position: absolute;
                    left: 12px;
                    right: 12px;
                    bottom: 6px;
                    height: 4px;
                    border-radius: 999px;
                    background: rgba(191, 219, 254, 0.95);
                }

                .session-submit-header-progress-bar {
                    position: absolute;
                    left: 12px;
                    bottom: 6px;
                    width: 42%;
                    height: 4px;
                    border-radius: 999px;
                    background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
                    animation: session-submit-progress-slide 1.6s ease-in-out infinite;
                    z-index: 1;
                }

                .session-submit-header-progress-dot {
                    width: 10px;
                    height: 10px;
                    border-radius: 999px;
                    background: #2563eb;
                    box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.28);
                    animation: session-submit-progress-pulse 1.6s ease-in-out infinite;
                }

                @keyframes session-submit-progress-slide {
                    0% { transform: translateX(-16%); }
                    50% { transform: translateX(92%); }
                    100% { transform: translateX(-16%); }
                }

                @keyframes session-submit-progress-pulse {
                    0%, 100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.18); }
                    50% { transform: scale(1); box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); }
                }

                @media (max-width: 980px) {
                    .session-submit-page-toolbar {
                        gap: 8px;
                    }

                    .session-submit-title-accent,
                    .session-submit-status-chip {
                        display: none;
                    }

                    .session-submit-page-title {
                        font-size: 0.92rem;
                    }

                    .session-submit-header-action {
                        padding-inline: 12px;
                    }
                }

                @media (max-width: 760px) {
                    .session-submit-skill-chip {
                        display: none;
                    }
                }
            `}</style>
            <div className="session-submit-page-toolbar">
                <Button
                    type="text"
                    className="session-submit-back-button"
                    icon={<ArrowLeftOutlined />}
                    aria-label="Quay lại bài thi của tôi"
                    title="Bài thi của tôi"
                    onClick={onBack}
                />
                <div className="session-submit-title-block">
                    <span className="session-submit-title-accent" />
                    <div className="session-submit-page-title" title={session.examTitle}>
                        {session.examTitle}
                    </div>
                </div>
                <div className="session-submit-header-meta">
                    <span className="session-submit-header-chip session-submit-skill-chip">
                        {getSkillLabel(session.skillType)}
                    </span>
                    <span className="session-submit-header-chip session-submit-status-chip">
                        {getSessionStatusLabel(session.status)}
                    </span>
                </div>
                {showWritingScoringView ? (
                    <div className="session-submit-header-progress">
                        <span className="session-submit-header-progress-dot" />
                        <span>AI đang chấm</span>
                        <span className="session-submit-header-progress-bar" />
                    </div>
                ) : canSubmitNow ? (
                    <Button
                        type="primary"
                        className="session-submit-header-action"
                        icon={<SendOutlined />}
                        loading={activeSubmitLoading}
                        onClick={onSubmit}
                    >
                        {canRetryWritingScore ? 'Chấm lại' : 'Nộp bài'}
                    </Button>
                ) : (
                    <Button
                        className="session-submit-header-action"
                        icon={<ReloadOutlined />}
                        loading={isRestartPending}
                        onClick={onRestart}
                    >
                        Làm lại
                    </Button>
                )}
            </div>

            {canUseWritingCopilot ? (
                <Button
                    type="text"
                    onClick={onToggleWritingCopilot}
                    style={{
                        height: 40,
                        marginLeft: 10,
                        paddingInline: 16,
                        borderRadius: 999,
                        border: writingCopilotOpen ? '1px solid #93c5fd' : '1px solid #dbeafe',
                        background: writingCopilotOpen
                            ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                            : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                        color: '#1d4ed8',
                        fontWeight: 700,
                        boxShadow: writingCopilotOpen
                            ? '0 8px 18px rgba(59, 130, 246, 0.18)'
                            : '0 6px 14px rgba(15, 23, 42, 0.06)',
                        flexShrink: 0,
                    }}
                >
                    <Space size={8}>
                        <BulbOutlined />
                        <span>Hỏi AI</span>
                    </Space>
                </Button>
            ) : null}
        </>,
        headerSlot,
    );
};

