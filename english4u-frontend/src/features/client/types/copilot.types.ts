export interface CopilotContextImagePayload {
    url: string;
    label?: string | null;
}

export interface CopilotFocusPayload {
    label: string;
    text: string;
    questionNumber?: number | null;
    images?: CopilotContextImagePayload[];
}

export interface CopilotChatContextPayload {
    reviewTitle: string;
    reviewDocumentText: string;
    skillType: string;
    currentLocationLabel?: string | null;
    currentLocationText?: string | null;
    currentFocusLabel?: string | null;
    currentFocusText?: string | null;
    focusedQuestionNumber?: number | null;
    selectedText?: string | null;
    selectedTextLabel?: string | null;
    contextImages?: CopilotContextImagePayload[];
}

export interface ReviewCopilotContext extends CopilotChatContextPayload {
    sessionId: string;
}

export interface CopilotChatHistoryItem {
    role: 'user' | 'model';
    content: string;
}

export interface CopilotReplayAction {
    audioUrl: string;
    playAtSecond: number;
    endAtSecond?: number | null;
    timestampLabel: string;
    answerTimestampLabel?: string | null;
    transcriptSnippet?: string | null;
    questionNumber?: number | null;
    matchType?: 'exact' | 'scope';
}

export interface CopilotChatMessage extends CopilotChatHistoryItem {
    id: string;
    createdAt: number;
    status?: 'streaming' | 'done' | 'error';
    replayAction?: CopilotReplayAction | null;
}

export interface CopilotChatRequest {
    context: CopilotChatContextPayload;
    userMessage: string;
    chatHistory: CopilotChatHistoryItem[];
}

export type CopilotStreamEventName = 'ready' | 'chunk' | 'done' | 'error';

export interface CopilotStreamEvent {
    event: CopilotStreamEventName;
    data: Record<string, unknown>;
}
