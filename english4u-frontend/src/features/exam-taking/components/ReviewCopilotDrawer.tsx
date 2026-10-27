import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Alert, Button, Space, Typography } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import type { CopilotChatMessage, CopilotFocusPayload, CopilotReplayAction, ReviewCopilotContext } from '../types/copilot.types';
import { COPILOT_PANEL_FIXED_TOP } from '../constants/reviewCopilot.constants';
import { useCopilotDrawerResize } from '../hooks/useCopilotDrawerResize';
import { CopilotEmptySuggestions } from './copilot/CopilotEmptySuggestions';
import { CopilotMessageItem } from './copilot/CopilotMessageItem';
import { CopilotChatComposer } from './copilot/CopilotChatComposer';

const { Text, Title } = Typography;

export interface ReviewCopilotDrawerProps {
    open: boolean;
    loadingContext: boolean;
    context: ReviewCopilotContext | null;
    messages: CopilotChatMessage[];
    draftMessage: string;
    isStreaming: boolean;
    errorMessage?: string | null;
    focusComposerSignal: number;
    focusChips: CopilotFocusPayload[];
    onClose: () => void;
    onDraftChange: (nextValue: string) => void;
    onSendMessage: (message: string) => void;
    onStopStreaming: () => void;
    onClearFocus: () => void;
    onRemoveFocus: (focus: CopilotFocusPayload) => void;
    onClearSelection: () => void;
    selectionChipLabel?: string;
    onReservedWidthChange?: (nextWidth: number) => void;
    onPlayReplayAction?: (action: CopilotReplayAction) => void;
}

export const ReviewCopilotDrawer = ({
    open,
    loadingContext,
    context,
    messages,
    draftMessage,
    isStreaming,
    errorMessage,
    focusComposerSignal,
    focusChips,
    onClose,
    onDraftChange,
    onSendMessage,
    onStopStreaming,
    onClearFocus,
    onRemoveFocus,
    onClearSelection,
    selectionChipLabel,
    onReservedWidthChange,
    onPlayReplayAction,
}: ReviewCopilotDrawerProps) => {
    const scrollAnchorRef = useRef<HTMLDivElement | null>(null);
    const composerRef = useRef<any>(null);

    const {
        actualPanelWidth,
        canResize,
        handleResizeStart,
    } = useCopilotDrawerResize(open, onReservedWidthChange);

    const canSend = draftMessage.trim().length > 0 && !loadingContext && !isStreaming && !!context;

    useEffect(() => {
        scrollAnchorRef.current?.scrollIntoView({
            behavior: messages.length > 0 ? 'smooth' : 'auto',
            block: 'end',
        });
    }, [messages, isStreaming, loadingContext]);

    useEffect(() => {
        if (!open) {
            return;
        }

        const timer = window.setTimeout(() => {
            composerRef.current?.resizableTextArea?.textArea?.focus();
        }, 30);

        return () => window.clearTimeout(timer);
    }, [open, focusComposerSignal]);

    const handleSubmit = () => {
        const trimmed = draftMessage.trim();
        if (!trimmed || !canSend) {
            return;
        }

        onSendMessage(trimmed);
    };

    if (!open || typeof document === 'undefined') {
        return null;
    }

    const panelNode = (
        <div
            style={{
                position: 'fixed',
                top: COPILOT_PANEL_FIXED_TOP,
                right: 0,
                bottom: 0,
                zIndex: 1200,
                display: 'flex',
                alignItems: 'stretch',
                gap: 16,
                pointerEvents: 'auto',
            }}
        >
            <style>{`
                @keyframes copilot-thinking-shimmer {
                    0% {
                        background-position: 220% 50%;
                    }
                    100% {
                        background-position: -40% 50%;
                    }
                }
            `}</style>
            <section
                data-copilot-drawer-root="true"
                aria-label="AI Copilot"
                style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    width: actualPanelWidth,
                    minWidth: actualPanelWidth,
                    maxWidth: actualPanelWidth,
                    height: `calc(100vh - ${COPILOT_PANEL_FIXED_TOP}px)`,
                    borderLeft: '1px solid #dbeafe',
                    borderTop: '1px solid #dbeafe',
                    borderRadius: '24px 0 0 0',
                    overflow: 'hidden',
                    overflowX: 'hidden',
                    background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 55%)',
                    boxShadow: '0 18px 42px rgba(15, 23, 42, 0.16)',
                    pointerEvents: 'auto',
                }}
            >
                {canResize ? (
                    <div
                        role="separator"
                        aria-orientation="vertical"
                        onPointerDown={handleResizeStart}
                        style={{
                            position: 'absolute',
                            top: 0,
                            bottom: 0,
                            left: -10,
                            width: 18,
                            cursor: 'col-resize',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 2,
                        }}
                    >
                        <div
                            style={{
                                width: 4,
                                height: 72,
                                borderRadius: 999,
                                background: '#93c5fd',
                                boxShadow: '0 0 0 7px rgba(219, 234, 254, 0.8)',
                            }}
                        />
                    </div>
                ) : null}

                <div
                    style={{
                        borderBottom: '1px solid #e2e8f0',
                        padding: '14px 18px 12px',
                        background: 'rgba(255,255,255,0.95)',
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0 }}>
                                <Title level={5} style={{ margin: 0 }}>AI gia sư</Title>
                            </div>
                            <Button type="text" icon={<CloseOutlined />} onClick={onClose} aria-label="Đóng AI Copilot" />
                        </div>
                    </Space>
                </div>

                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', padding: 18 }}>
                    {loadingContext ? (
                        <div
                            style={{
                                minHeight: '100%',
                                display: 'grid',
                                placeItems: 'center',
                                padding: '32px 0',
                            }}
                        >
                            <Space direction="vertical" size={12} align="center">
                                <Title level={5} style={{ margin: 0 }}>Đang tải tài liệu...</Title>
                                <Text type="secondary">Hệ thống đang chuẩn bị toàn bộ bài review cho Copilot.</Text>
                            </Space>
                        </div>
                    ) : messages.length === 0 ? (
                        <CopilotEmptySuggestions
                            skillType={context?.skillType}
                            onSendMessage={onSendMessage}
                        />
                    ) : (
                        <Space direction="vertical" size={14} style={{ width: '100%' }}>
                            {messages.map((msg) => (
                                <CopilotMessageItem
                                    key={msg.id}
                                    message={msg}
                                    skillType={context?.skillType}
                                    onPlayReplayAction={onPlayReplayAction}
                                />
                            ))}
                        </Space>
                    )}

                    {errorMessage ? (
                        <Alert
                            style={{ marginTop: 16 }}
                            type="error"
                            showIcon
                            message={errorMessage}
                        />
                    ) : null}

                    <div ref={scrollAnchorRef} />
                </div>

                <CopilotChatComposer
                    ref={composerRef}
                    draftMessage={draftMessage}
                    loadingContext={loadingContext}
                    hasContext={!!context}
                    isStreaming={isStreaming}
                    canSend={canSend}
                    focusChips={focusChips}
                    hasSelection={!!context?.selectedText?.trim()}
                    selectionChipLabel={selectionChipLabel}
                    onDraftChange={onDraftChange}
                    onSubmit={handleSubmit}
                    onClearFocus={onClearFocus}
                    onRemoveFocus={onRemoveFocus}
                    onClearSelection={onClearSelection}
                    onStopStreaming={onStopStreaming}
                />
            </section>
        </div>
    );

    return createPortal(panelNode, document.body);
};
