import { Button, Space } from 'antd';
import { PlayCircleOutlined, PushpinOutlined, ScissorOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import type { CopilotChatMessage, CopilotReplayAction } from '../../types/copilot.types';
import { thinkingPlaceholderText } from '../../constants/reviewCopilot.constants';
import { formatCopilotMarkdown, markdownComponents } from '../../utils/reviewCopilotMarkdown.utils';

interface CopilotMessageItemProps {
    message: CopilotChatMessage;
    skillType?: string | null;
    onPlayReplayAction?: (action: CopilotReplayAction) => void;
}

export const CopilotMessageItem = ({
    message,
    skillType,
    onPlayReplayAction,
}: CopilotMessageItemProps) => {
    const isUser = message.role === 'user';
    const isStreamingMessage = message.status === 'streaming';
    const formattedMessageContent = isUser ? message.content : formatCopilotMarkdown(message.content, skillType);
    const isThinkingPlaceholder = isStreamingMessage && !formattedMessageContent.trim();
    const bubbleBackground = isUser
        ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'
        : '#ffffff';
    const bubbleColor = isUser ? '#ffffff' : '#334155';
    const replayAction = !isUser ? message.replayAction ?? null : null;

    return (
        <div
            style={{
                display: 'flex',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
            }}
        >
            <div
                style={{
                    maxWidth: '92%',
                    borderRadius: 18,
                    padding: '12px 14px',
                    background: bubbleBackground,
                    color: bubbleColor,
                    border: isUser ? 'none' : '1px solid #dbeafe',
                    boxShadow: isUser
                        ? '0 10px 24px rgba(37, 99, 235, 0.22)'
                        : '0 8px 24px rgba(15, 23, 42, 0.06)',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                }}
            >
                {isUser ? (
                    <div>
                        {message.focusChips && message.focusChips.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                                {message.focusChips.map((chip) => (
                                    <span
                                        key={chip.label}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '2px 8px',
                                            borderRadius: 999,
                                            background: 'rgba(255,255,255,0.18)',
                                            border: '1px solid rgba(255,255,255,0.32)',
                                            color: 'rgba(255,255,255,0.92)',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            lineHeight: 1.5,
                                            whiteSpace: 'nowrap',
                                            maxWidth: 180,
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                        title={chip.label}
                                    >
                                        <PushpinOutlined style={{ fontSize: 10, flexShrink: 0 }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{chip.label}</span>
                                    </span>
                                ))}
                                {message.selectionLabel ? (
                                    <span
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '2px 8px',
                                            borderRadius: 999,
                                            background: 'rgba(255,255,255,0.18)',
                                            border: '1px solid rgba(255,255,255,0.32)',
                                            color: 'rgba(255,255,255,0.92)',
                                            fontSize: 11,
                                            fontWeight: 600,
                                            lineHeight: 1.5,
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        <ScissorOutlined style={{ fontSize: 10, flexShrink: 0 }} />
                                        <span>{message.selectionLabel}</span>
                                    </span>
                                ) : null}
                            </div>
                        ) : message.selectionLabel ? (
                            <div style={{ marginBottom: 8 }}>
                                <span
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '2px 8px',
                                        borderRadius: 999,
                                        background: 'rgba(255,255,255,0.18)',
                                        border: '1px solid rgba(255,255,255,0.32)',
                                        color: 'rgba(255,255,255,0.92)',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        lineHeight: 1.5,
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    <ScissorOutlined style={{ fontSize: 10, flexShrink: 0 }} />
                                    <span>{message.selectionLabel}</span>
                                </span>
                            </div>
                        ) : null}
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{message.content}</div>
                    </div>
                ) : isThinkingPlaceholder ? (
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            minHeight: 34,
                            fontSize: 16,
                            fontWeight: 700,
                            lineHeight: 1.6,
                            color: 'transparent',
                            backgroundImage:
                                'linear-gradient(110deg, #94a3b8 0%, #0f172a 22%, #60a5fa 50%, #0f172a 78%, #94a3b8 100%)',
                            backgroundSize: '220% 100%',
                            backgroundClip: 'text',
                            WebkitBackgroundClip: 'text',
                            animation: 'copilot-thinking-shimmer 1.9s linear infinite',
                        }}
                    >
                        {thinkingPlaceholderText}
                    </div>
                ) : (
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                        <ReactMarkdown components={markdownComponents}>
                            {isStreamingMessage ? `${formattedMessageContent}▍` : formattedMessageContent}
                        </ReactMarkdown>
                        {replayAction ? (
                            <div
                                style={{
                                    borderRadius: 14,
                                    border: '1px solid #bfdbfe',
                                    background: '#eff6ff',
                                    padding: 12,
                                }}
                            >
                                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            gap: 12,
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <div>
                                            <div
                                                style={{
                                                    fontSize: 12,
                                                    fontWeight: 800,
                                                    color: '#1d4ed8',
                                                    textTransform: 'uppercase',
                                                    letterSpacing: 0.4,
                                                }}
                                            >
                                                Replay audio
                                            </div>
                                            <div style={{ fontWeight: 700, color: '#0f172a' }}>
                                                {replayAction.questionNumber != null
                                                    ? `Câu ${replayAction.questionNumber} • ${replayAction.answerTimestampLabel ?? replayAction.timestampLabel}`
                                                    : replayAction.answerTimestampLabel ?? replayAction.timestampLabel}
                                            </div>
                                            {replayAction.answerTimestampLabel ? (
                                                <div style={{ marginTop: 2, fontSize: 12, color: '#475569' }}>
                                                    Phát lại với ngữ cảnh: {replayAction.timestampLabel}
                                                </div>
                                            ) : null}
                                        </div>
                                        <Button
                                            type="primary"
                                            icon={<PlayCircleOutlined />}
                                            onClick={() => onPlayReplayAction?.(replayAction)}
                                        >
                                            Nghe lại đoạn này
                                        </Button>
                                    </div>
                                    {replayAction.transcriptSnippet ? (
                                        <div
                                            style={{
                                                whiteSpace: 'pre-wrap',
                                                lineHeight: 1.7,
                                                color: '#334155',
                                                borderLeft: '3px solid #93c5fd',
                                                paddingLeft: 10,
                                            }}
                                        >
                                            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
                                                Tapescript đoạn này
                                            </div>
                                            {replayAction.transcriptSnippet}
                                        </div>
                                    ) : null}
                                </Space>
                            </div>
                        ) : null}
                    </Space>
                )}
            </div>
        </div>
    );
};

