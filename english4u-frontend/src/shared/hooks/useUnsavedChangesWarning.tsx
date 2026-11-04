import React, { useState, useEffect, useCallback } from 'react';
import { useBlocker } from 'react-router-dom';
import { Modal, Button } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';

export interface UseUnsavedChangesWarningOptions {
    isDirty: boolean;
    enabled?: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
}

export function useUnsavedChangesWarning({
    isDirty,
    enabled = true,
    title = 'Xác nhận rời khỏi trang',
    message = 'Bạn có các thay đổi chưa được lưu. Nếu rời khỏi trang lúc này, toàn bộ nội dung bạn vừa nhập hoặc chỉnh sửa sẽ bị mất hoàn toàn. Bạn có chắc chắn muốn rời đi?',
    confirmText = 'Rời khỏi trang',
    cancelText = 'Ở lại tiếp tục',
}: UseUnsavedChangesWarningOptions) {
    const isBlockingActive = enabled && isDirty;

    // 1. Intercept client-side route transitions (sidebar click, browser back/forward, route change)
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            isBlockingActive && currentLocation.pathname !== nextLocation.pathname
    );

    // 2. State for in-page programmatic navigation (e.g. clicking Back Arrow button or "Cancel" button)
    const [manualNavigation, setManualNavigation] = useState<(() => void) | null>(null);

    // 3. Intercept browser tab close / refresh (F5 / Ctrl+R / close tab)
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isBlockingActive) {
                e.preventDefault();
                e.returnValue = '';
                return '';
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isBlockingActive]);

    const isModalOpen = blocker.state === 'blocked' || manualNavigation !== null;

    // Handle user choosing to stay on the page
    const handleStay = useCallback(() => {
        if (blocker.state === 'blocked') {
            blocker.reset?.();
        }
        setManualNavigation(null);
    }, [blocker]);

    // Handle user choosing to discard changes and leave
    const handleLeave = useCallback(() => {
        if (blocker.state === 'blocked') {
            blocker.proceed?.();
        } else if (manualNavigation) {
            const nextAction = manualNavigation;
            setManualNavigation(null);
            nextAction();
        }
    }, [blocker, manualNavigation]);

    // Programmatic trigger for button clicks
    const confirmNavigation = useCallback(
        (onProceed: () => void) => {
            if (isBlockingActive) {
                setManualNavigation(() => onProceed);
            } else {
                onProceed();
            }
        },
        [isBlockingActive]
    );

    // Reusable Confirmation Modal Component
    const ConfirmationModal: React.FC = useCallback(() => {
        return (
            <Modal
                open={isModalOpen}
                onCancel={handleStay}
                footer={[
                    <Button
                        key="stay"
                        type="primary"
                        onClick={handleStay}
                        style={{
                            borderRadius: '8px',
                            fontWeight: 600,
                            background: '#2563eb',
                            borderColor: '#2563eb',
                        }}
                    >
                        {cancelText}
                    </Button>,
                    <Button
                        key="leave"
                        danger
                        onClick={handleLeave}
                        style={{
                            borderRadius: '8px',
                            fontWeight: 600,
                        }}
                    >
                        {confirmText}
                    </Button>,
                ]}
                centered
                width={480}
                style={{ borderRadius: '16px' }}
                title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <ExclamationCircleFilled style={{ color: '#faad14', fontSize: '22px' }} />
                        <span style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a' }}>
                            {title}
                        </span>
                    </div>
                }
            >
                <div style={{ padding: '12px 0 8px', color: '#475569', fontSize: '14px', lineHeight: 1.6 }}>
                    {message}
                </div>
            </Modal>
        );
    }, [isModalOpen, handleStay, handleLeave, cancelText, confirmText, title, message]);

    return {
        ConfirmationModal,
        confirmNavigation,
        isBlocked: isModalOpen,
        proceed: handleLeave,
        reset: handleStay,
    };
}

