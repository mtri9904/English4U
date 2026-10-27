import React from 'react';
import { createPortal } from 'react-dom';
import { Button, Space } from 'antd';
import { BulbOutlined } from '@ant-design/icons';

interface ObjectiveReviewHeaderBarProps {
    headerSlot: HTMLElement | null;
    copilotOpen: boolean;
    onToggleCopilot: () => void;
}

export const ObjectiveReviewHeaderBar: React.FC<ObjectiveReviewHeaderBarProps> = ({
    headerSlot,
    copilotOpen,
    onToggleCopilot,
}) => {
    if (!headerSlot) {
        return null;
    }

    return createPortal(
        <div
            style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                minWidth: 0,
                width: 'auto',
                maxWidth: '100%',
                overflow: 'hidden',
                flex: '0 0 auto',
            }}
        >
            <Button
                type="text"
                onClick={onToggleCopilot}
                style={{
                    height: 40,
                    marginLeft: 10,
                    paddingInline: 16,
                    borderRadius: 999,
                    border: copilotOpen ? '1px solid #93c5fd' : '1px solid #dbeafe',
                    background: copilotOpen
                        ? 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)'
                        : 'linear-gradient(135deg, #ffffff 0%, #f8fbff 100%)',
                    color: '#1d4ed8',
                    fontWeight: 700,
                    boxShadow: copilotOpen
                        ? '0 8px 18px rgba(59, 130, 246, 0.18)'
                        : '0 6px 14px rgba(15, 23, 42, 0.06)',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                }}
            >
                <Space size={8}>
                    <BulbOutlined />
                    <span>Hỏi AI</span>
                </Space>
            </Button>
        </div>,
        headerSlot,
    );
};

