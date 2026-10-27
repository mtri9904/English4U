import React from 'react';
import { Button, Progress } from 'antd';
import { CloseOutlined, EyeOutlined, ReloadOutlined } from '@ant-design/icons';
import type { PdfGenerationJobState } from '../pdfGenerationJob.store';
import type { getStatusTone } from './pdfProgress.utils';

export interface PdfGenerationFullCardProps {
    job: PdfGenerationJobState;
    statusTone: ReturnType<typeof getStatusTone>;
    onClose: () => void;
    onViewExam: (examId: string) => void;
    onRetry: () => void;
}

export const PdfGenerationFullCard: React.FC<PdfGenerationFullCardProps> = ({
    job,
    statusTone,
    onClose,
    onViewExam,
    onRetry,
}) => {
    const progressPercent = Math.round(job.progressPercent);

    return (
        <div
            style={{
                position: 'fixed',
                right: 20,
                bottom: 20,
                width: 392,
                maxWidth: 'calc(100vw - 24px)',
                zIndex: 1200,
                borderRadius: 22,
                border: `1px solid ${statusTone.border}`,
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                boxShadow: statusTone.shadow,
                overflow: 'hidden',
            }}
        >
            <div
                style={{
                    padding: '16px 18px 14px',
                    background: `linear-gradient(135deg, ${statusTone.badgeBg} 0%, #ffffff 100%)`,
                    borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                            <div
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 999,
                                    background: statusTone.accent,
                                    boxShadow: `0 0 0 6px ${statusTone.badgeBg}`,
                                    flexShrink: 0,
                                }}
                            />
                            <div style={{ fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
                                Tiến độ generate PDF
                            </div>
                            <span
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: 999,
                                    background: statusTone.badgeBg,
                                    color: statusTone.badgeColor,
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {statusTone.label}
                            </span>
                        </div>
                        <div
                            style={{
                                color: '#475569',
                                fontSize: '0.8rem',
                                lineHeight: 1.5,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                            }}
                        >
                            {job.fileName}
                        </div>
                    </div>
                    <Button
                        type="text"
                        size="small"
                        icon={<CloseOutlined />}
                        onClick={onClose}
                        style={{ color: '#64748b', flexShrink: 0 }}
                    />
                </div>
            </div>

            <div style={{ padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 10 }}>
                    <div style={{ color: '#334155', fontSize: '0.82rem', fontWeight: 700 }}>
                        {job.message}
                    </div>
                    <div style={{ color: statusTone.accent, fontSize: '1.5rem', fontWeight: 900, lineHeight: 1 }}>
                        {progressPercent}%
                    </div>
                </div>

                <Progress
                    percent={progressPercent}
                    showInfo={false}
                    status={
                        job.status === 'failed'
                            ? 'exception'
                            : job.status === 'completed'
                                ? 'success'
                                : 'active'
                    }
                    strokeColor={statusTone.progress}
                    trailColor="#e2e8f0"
                    strokeLinecap="round"
                />

                <div
                    style={{
                        marginTop: 12,
                        display: 'grid',
                        gridTemplateColumns: job.passageNumber && job.totalPassages ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                        gap: 10,
                    }}
                >
                    <div
                        style={{
                            borderRadius: 14,
                            padding: '10px 12px',
                            background: '#eff6ff',
                            border: '1px solid #dbeafe',
                        }}
                    >
                        <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Trạng thái
                        </div>
                        <div style={{ color: '#0f172a', fontWeight: 800, marginTop: 2 }}>
                            {statusTone.label}
                        </div>
                    </div>

                    {job.passageNumber && job.totalPassages ? (
                        <div
                            style={{
                                borderRadius: 14,
                                padding: '10px 12px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                            }}
                        >
                            <div style={{ color: '#64748b', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                Passage
                            </div>
                            <div style={{ color: '#0f172a', fontWeight: 800, marginTop: 2 }}>
                                {job.passageNumber}/{job.totalPassages}
                            </div>
                        </div>
                    ) : null}
                </div>

                {job.status === 'completed' && job.examId ? (
                    <div style={{ marginTop: 16 }}>
                        <Button
                            type="primary"
                            icon={<EyeOutlined />}
                            onClick={() => onViewExam(job.examId!)}
                            style={{
                                width: '100%',
                                height: 44,
                                border: 'none',
                                borderRadius: 14,
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                background: 'linear-gradient(135deg, #166534 0%, #16a34a 52%, #22c55e 100%)',
                                boxShadow: '0 14px 28px rgba(22, 163, 74, 0.24)',
                            }}
                        >
                            Mở đề vừa tạo
                        </Button>
                    </div>
                ) : null}

                {job.status === 'failed' ? (
                    <div style={{ marginTop: 16 }}>
                        <Button
                            type="primary"
                            icon={<ReloadOutlined />}
                            onClick={onRetry}
                            style={{
                                width: '100%',
                                height: 44,
                                border: 'none',
                                borderRadius: 14,
                                fontSize: '0.95rem',
                                fontWeight: 800,
                                background: 'linear-gradient(135deg, #b91c1c 0%, #dc2626 52%, #ef4444 100%)',
                                boxShadow: '0 14px 28px rgba(220, 38, 38, 0.24)',
                            }}
                        >
                            Thử lại
                        </Button>
                    </div>
                ) : null}
            </div>
        </div>
    );
};

