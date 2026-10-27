import { type ForwardedRef, forwardRef } from 'react';
import { Button, Input, Space, Typography } from 'antd';
import { CloseOutlined, PushpinOutlined, ScissorOutlined, SendOutlined, StopOutlined } from '@ant-design/icons';
import type { CopilotFocusPayload } from '../../types/copilot.types';

const { Text } = Typography;

interface CopilotChatComposerProps {
    draftMessage: string;
    loadingContext: boolean;
    hasContext: boolean;
    isStreaming: boolean;
    canSend: boolean;
    focusChips: CopilotFocusPayload[];
    hasSelection: boolean;
    selectionChipLabel?: string;
    onDraftChange: (value: string) => void;
    onSubmit: () => void;
    onClearFocus: () => void;
    onRemoveFocus: (focus: CopilotFocusPayload) => void;
    onClearSelection: () => void;
    onStopStreaming: () => void;
}

export const CopilotChatComposer = forwardRef((
    {
        draftMessage,
        loadingContext,
        hasContext,
        isStreaming,
        canSend,
        focusChips,
        hasSelection,
        selectionChipLabel,
        onDraftChange,
        onSubmit,
        onClearFocus,
        onRemoveFocus,
        onClearSelection,
        onStopStreaming,
    }: CopilotChatComposerProps,
    ref: ForwardedRef<any>,
) => {
    const hasFocus = focusChips.length > 0;
    const hasContextCards = hasSelection || hasFocus;

    return (
        <div
            style={{
                padding: 16,
                borderTop: '1px solid #e2e8f0',
                background: '#ffffff',
                position: 'relative',
                zIndex: 1,
                flexShrink: 0,
                pointerEvents: 'auto',
            }}
        >
            <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {hasContextCards ? (
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            padding: 10,
                            border: '1px solid #dbeafe',
                            borderRadius: 16,
                            background: '#f8fbff',
                        }}
                    >
                        {focusChips.map((focus) => (
                            <div
                                key={focus.questionNumber != null ? `focus-${focus.questionNumber}` : focus.label}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    maxWidth: '100%',
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    border: '1px solid #fde68a',
                                    background: '#fffbeb',
                                    color: '#92400e',
                                }}
                            >
                                <PushpinOutlined />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {focus.label}
                                </span>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<CloseOutlined />}
                                    onClick={() => onRemoveFocus(focus)}
                                    style={{ color: '#92400e' }}
                                />
                            </div>
                        ))}

                        {hasSelection ? (
                            <div
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    maxWidth: '100%',
                                    padding: '6px 10px',
                                    borderRadius: 999,
                                    border: '1px solid #bfdbfe',
                                    background: '#eff6ff',
                                    color: '#1d4ed8',
                                }}
                            >
                                <ScissorOutlined />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectionChipLabel || 'Từ khóa trích đoạn'}
                                </span>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<CloseOutlined />}
                                    onClick={onClearSelection}
                                    style={{ color: '#1d4ed8' }}
                                />
                            </div>
                        ) : null}
                    </div>
                ) : null}

                <Input.TextArea
                    ref={ref}
                    value={draftMessage}
                    disabled={loadingContext || !hasContext || isStreaming}
                    autoSize={{ minRows: 3, maxRows: 7 }}
                    placeholder="Hỏi bất kỳ điều gì trong bài review này, hoặc bôi đen một đoạn rồi nhấn Ctrl + L."
                    onChange={(event) => onDraftChange(event.target.value)}
                    onPressEnter={(event) => {
                        if (!event.shiftKey) {
                            event.preventDefault();
                            onSubmit();
                        }
                    }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                    <Space wrap>
                        {hasFocus ? (
                            <Button onClick={onClearFocus}>
                                Bỏ tất cả focus
                            </Button>
                        ) : null}
                        {hasSelection ? (
                            <Button icon={<CloseOutlined />} onClick={onClearSelection}>
                                Bỏ từ khóa
                            </Button>
                        ) : null}
                        <Text type="secondary">
                            {isStreaming ? 'Copilot đang trả lời...' : 'Ctrl + L để gắn đoạn bôi đen'}
                        </Text>
                    </Space>
                    <Space>
                        {isStreaming ? (
                            <Button icon={<StopOutlined />} onClick={onStopStreaming}>
                                Dừng
                            </Button>
                        ) : null}
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            disabled={!canSend}
                            htmlType="button"
                            onClick={onSubmit}
                        >
                            Gửi
                        </Button>
                    </Space>
                </div>
            </Space>
        </div>
    );
});

CopilotChatComposer.displayName = 'CopilotChatComposer';

