import { useState, useMemo, useRef } from 'react';
import type { PracticeSessionDto } from '../types/session.types';
import { buildSpeakingReviewCopilotContext } from '../utils/reviewCopilotContext.utils';
import { streamCopilotChat } from '../services/copilot.service';
import type { CopilotChatMessage, CopilotFocusPayload } from '../types/copilot.types';

interface UseSpeakingReviewCopilotProps {
    session: PracticeSessionDto;
}

export const useSpeakingReviewCopilot = ({ session }: UseSpeakingReviewCopilotProps) => {
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [copilotMessages, setCopilotMessages] = useState<CopilotChatMessage[]>([]);
    const [copilotDraftMessage, setCopilotDraftMessage] = useState('');
    const [copilotStreamingMessageId, setCopilotStreamingMessageId] = useState<string | null>(null);
    const [copilotErrorMessage, setCopilotErrorMessage] = useState<string | null>(null);
    const [copilotFocuses, setCopilotFocuses] = useState<CopilotFocusPayload[]>([]);
    const [copilotComposerFocusSignal, setCopilotComposerFocusSignal] = useState(0);
    const [copilotReservedWidth, setCopilotReservedWidth] = useState(0);

    const copilotAbortRef = useRef<AbortController | null>(null);

    const baseContext = useMemo(() => {
        if (!session) return null;
        return buildSpeakingReviewCopilotContext({ session });
    }, [session]);

    const stopCopilotStream = () => {
        copilotAbortRef.current?.abort();
        copilotAbortRef.current = null;
        setCopilotStreamingMessageId(null);
    };

    const handleSendCopilotMessage = async (textToSend: string) => {
        if (!textToSend.trim() || !baseContext || !!copilotStreamingMessageId) return;

        const assistantMessageId = `model-${Date.now()}`;
        let accumulatedContent = '';
        const userMsg: CopilotChatMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: textToSend,
            createdAt: Date.now(),
            status: 'done',
            focusChips: copilotFocuses.length > 0 ? [...copilotFocuses] : null,
        };

        const updatedHistory = [...copilotMessages, userMsg];
        setCopilotMessages(updatedHistory);
        setCopilotDraftMessage('');
        setCopilotErrorMessage(null);
        setCopilotFocuses([]);

        const controller = new AbortController();
        copilotAbortRef.current = controller;
        setCopilotStreamingMessageId(assistantMessageId);

        let outgoingUserMessage = textToSend.trim();
        if (userMsg.focusChips && userMsg.focusChips.length > 0) {
            const focusContext = userMsg.focusChips.map((f) => `[Focus: ${f.label}]\n${f.text}`).join('\n\n');
            outgoingUserMessage = `Ngữ cảnh câu hỏi đang focus:\n${focusContext}\n\nCâu hỏi: ${outgoingUserMessage}`;
        }

        try {
            const apiHistory = copilotMessages.map((m) => ({
                role: m.role,
                content: m.content,
            }));

            setCopilotMessages((prev) => [
                ...prev,
                {
                    id: assistantMessageId,
                    role: 'model',
                    content: '',
                    createdAt: Date.now(),
                    status: 'streaming',
                },
            ]);

            await streamCopilotChat({
                payload: {
                    context: baseContext,
                    userMessage: outgoingUserMessage,
                    chatHistory: apiHistory,
                },
                signal: controller.signal,
                onEvent: (event) => {
                    if (event.event === 'chunk') {
                        const delta = String(event.data?.text || '');
                        accumulatedContent += delta;
                    } else if (event.event === 'error') {
                        const errorMsg = String(event.data?.message || 'Lỗi từ AI Copilot');
                        setCopilotErrorMessage(errorMsg);
                    }
                },
            });

            setCopilotMessages((prev) =>
                prev.map((msg) =>
                    msg.id === assistantMessageId
                        ? { ...msg, status: 'done', content: accumulatedContent }
                        : msg,
                ),
            );
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                setCopilotErrorMessage(err.message || 'Lỗi kết nối đến Gia Sư AI.');
            }
            setCopilotMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
        } finally {
            setCopilotStreamingMessageId(null);
            copilotAbortRef.current = null;
        }
    };

    return {
        baseContext,
        copilotOpen,
        setCopilotOpen,
        copilotMessages,
        copilotDraftMessage,
        setCopilotDraftMessage,
        copilotStreamingMessageId,
        copilotErrorMessage,
        copilotFocuses,
        setCopilotFocuses,
        copilotComposerFocusSignal,
        setCopilotComposerFocusSignal,
        copilotReservedWidth,
        setCopilotReservedWidth,
        stopCopilotStream,
        handleSendCopilotMessage,
    };
};

