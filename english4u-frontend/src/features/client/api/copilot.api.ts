import type { CopilotChatRequest, CopilotStreamEvent } from '../types/copilot.types';

const API_BASE_URL = ((import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:5237/api').replace(/\/$/, '');

const parseJsonSafe = (value: string) => {
    try {
        return JSON.parse(value) as Record<string, unknown>;
    } catch {
        return { message: value };
    }
};

const createAuthHeaders = () => {
    const headers: Record<string, string> = {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
    };

    const token = localStorage.getItem('token');

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    return headers;
};

const emitSseBlock = (
    rawBlock: string,
    onEvent: (event: CopilotStreamEvent) => void,
) => {
    const normalizedBlock = rawBlock.trim();
    if (!normalizedBlock) {
        return;
    }

    let eventName: CopilotStreamEvent['event'] = 'chunk';
    const dataLines: string[] = [];

    normalizedBlock.split('\n').forEach((line) => {
        if (line.startsWith('event:')) {
            const parsedEvent = line.slice(6).trim();
            if (parsedEvent === 'ready' || parsedEvent === 'chunk' || parsedEvent === 'done' || parsedEvent === 'error') {
                eventName = parsedEvent;
            }
            return;
        }

        if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    const rawPayload = dataLines.join('\n');
    if (!rawPayload) {
        return;
    }

    onEvent({
        event: eventName,
        data: parseJsonSafe(rawPayload),
    });
};

export const streamCopilotChat = async ({
    payload,
    signal,
    onEvent,
}: {
    payload: CopilotChatRequest;
    signal: AbortSignal;
    onEvent: (event: CopilotStreamEvent) => void;
}) => {
    const response = await fetch(`${API_BASE_URL}/copilot/chat`, {
        method: 'POST',
        headers: createAuthHeaders(),
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) {
        const errorText = await response.text();
        const errorPayload = parseJsonSafe(errorText);
        throw new Error(String(errorPayload.message || 'Không thể khởi tạo AI Copilot.'));
    }

    if (!response.body) {
        throw new Error('Trình duyệt không hỗ trợ đọc luồng phản hồi.');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
        buffer = buffer.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        let separatorIndex = buffer.indexOf('\n\n');
        while (separatorIndex >= 0) {
            const block = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            emitSseBlock(block, onEvent);
            separatorIndex = buffer.indexOf('\n\n');
        }

        if (done) {
            break;
        }
    }

    if (buffer.trim()) {
        emitSseBlock(buffer, onEvent);
    }
};
