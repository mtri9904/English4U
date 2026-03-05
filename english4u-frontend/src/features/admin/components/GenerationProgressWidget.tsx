import { Progress } from 'antd';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    LoadingOutlined,
    MinusOutlined,
    FileTextOutlined,
    CloseOutlined,
} from '@ant-design/icons';
import { useGenerationStore } from '../stores/useGenerationStore';
import { useQueryClient } from '@tanstack/react-query';

export const GenerationProgressWidget = () => {
    const {
        status,
        fileName,
        progress,
        statusText,
        examId,
        errorMessage,
        widgetVisible,
        widgetMinimized,
        setWidgetMinimized,
        dismissWidget,
        reset,
    } = useGenerationStore();

    const queryClient = useQueryClient();

    if (!widgetVisible) return null;

    const handleDismiss = () => {
        if (status === 'done') {
            queryClient.invalidateQueries({ queryKey: ['exams'] });
        }
        dismissWidget();
        if (status === 'done' || status === 'error') reset();
    };

    const gradientMap = {
        uploading: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
        processing: 'linear-gradient(135deg, #0ea5e9, #6366f1)',
        done: 'linear-gradient(135deg, #10b981, #0ea5e9)',
        error: 'linear-gradient(135deg, #ef4444, #f97316)',
        idle: 'linear-gradient(135deg, #94a3b8, #64748b)',
    };

    if (widgetMinimized) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                onClick={() => setWidgetMinimized(false)}
                style={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 18px',
                    borderRadius: 12,
                    background: gradientMap[status],
                    color: '#fff',
                    cursor: 'pointer',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    fontSize: '0.8125rem',
                    fontWeight: 600,
                    fontFamily: 'var(--font-sans)',
                }}
            >
                {(status === 'uploading' || status === 'processing') && (
                    <LoadingOutlined spin style={{ fontSize: 16 }} />
                )}
                {status === 'done' && <CheckCircleOutlined style={{ fontSize: 16 }} />}
                {status === 'error' && <CloseCircleOutlined style={{ fontSize: 16 }} />}
                <span>
                    {status === 'done'
                        ? 'Hoàn tất!'
                        : status === 'error'
                            ? 'Thất bại'
                            : `${progress}%`}
                </span>
            </motion.div>
        );
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 40, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 40, scale: 0.95 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                style={{
                    position: 'fixed',
                    bottom: 24,
                    right: 24,
                    zIndex: 9999,
                    width: 360,
                    borderRadius: 16,
                    overflow: 'hidden',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    fontFamily: 'var(--font-sans)',
                }}
            >
                <div
                    style={{
                        background: gradientMap[status],
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                        {(status === 'uploading' || status === 'processing') && (
                            <LoadingOutlined spin style={{ fontSize: 16 }} />
                        )}
                        {status === 'done' && <CheckCircleOutlined style={{ fontSize: 16 }} />}
                        {status === 'error' && <CloseCircleOutlined style={{ fontSize: 16 }} />}
                        <span style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                            AI Generate
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <div
                            onClick={() => setWidgetMinimized(true)}
                            style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                background: 'rgba(255,255,255,0.2)',
                                color: '#fff',
                            }}
                        >
                            <MinusOutlined style={{ fontSize: 12 }} />
                        </div>
                        {(status === 'done' || status === 'error') && (
                            <div
                                onClick={handleDismiss}
                                style={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 8,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    background: 'rgba(255,255,255,0.2)',
                                    color: '#fff',
                                }}
                            >
                                <CloseOutlined style={{ fontSize: 12 }} />
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ background: '#fff', padding: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                        <FileTextOutlined style={{ fontSize: 20, color: '#64748b' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                                style={{
                                    margin: 0,
                                    fontWeight: 600,
                                    fontSize: '0.8125rem',
                                    color: '#0f172a',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {fileName}
                            </p>
                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}>
                                {statusText}
                            </p>
                        </div>
                    </div>

                    {(status === 'uploading' || status === 'processing') && (
                        <Progress
                            percent={progress}
                            strokeColor={{ '0%': '#0ea5e9', '100%': '#6366f1' }}
                            trailColor="#f1f5f9"
                            strokeWidth={6}
                            showInfo={false}
                            style={{ marginBottom: 4 }}
                        />
                    )}

                    {status === 'done' && (
                        <div
                            style={{
                                background: '#f0fdf4',
                                borderRadius: 10,
                                padding: '10px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                            }}
                        >
                            <CheckCircleOutlined style={{ color: '#10b981', fontSize: 18 }} />
                            <div>
                                <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8125rem', color: '#16a34a' }}>
                                    Tạo đề thi thành công!
                                </p>
                                <p style={{ margin: 0, fontSize: '0.6875rem', color: '#64748b' }}>
                                    ID: {examId?.slice(0, 8)}...
                                </p>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div
                            style={{
                                background: '#fef2f2',
                                borderRadius: 10,
                                padding: '10px 14px',
                            }}
                        >
                            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.8125rem', color: '#ef4444' }}>
                                Xử lý thất bại
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: '0.6875rem', color: '#94a3b8', lineHeight: 1.4 }}>
                                {errorMessage?.slice(0, 120)}
                            </p>
                        </div>
                    )}

                    {(status === 'uploading' || status === 'processing') && (
                        <p style={{ margin: '8px 0 0', fontSize: '0.6875rem', color: '#94a3b8', textAlign: 'center' }}>
                            Bạn có thể đóng cửa sổ này và tiếp tục làm việc
                        </p>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};
