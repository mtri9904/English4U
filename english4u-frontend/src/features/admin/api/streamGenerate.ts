import { useGenerationStore } from '../stores/useGenerationStore';

const AI_BASE_URL = (import.meta as unknown as Record<string, Record<string, string>>).env.VITE_AI_BASE_URL || 'http://localhost:8000';
const API_BASE_URL = (import.meta as unknown as Record<string, Record<string, string>>).env.VITE_API_BASE_URL || 'http://localhost:5000/api';

interface NdjsonMetadata {
    type: 'metadata';
    data: {
        title: string;
        description: string;
        durationMinutes: number;
        examType: string;
    };
}

interface NdjsonPassage {
    type: 'passage';
    index: number;
    total: number;
    data: Record<string, unknown>;
}

interface NdjsonDone {
    type: 'done';
}

interface NdjsonError {
    type: 'error';
    message: string;
}

type NdjsonEvent = NdjsonMetadata | NdjsonPassage | NdjsonDone | NdjsonError;

export async function streamGenerateExam(file: File) {
    const store = useGenerationStore.getState();
    store.startGeneration(file.name);

    const abortController = new AbortController();
    store.setAbortController(abortController);

    const form = new FormData();
    form.append('file', file);

    try {
        store.setProcessing('Đang gửi PDF đến AI Service...');
        store.setProgress(5);

        const response = await fetch(`${AI_BASE_URL}/api/ai/generate-exam-from-pdf`, {
            method: 'POST',
            body: form,
            signal: abortController.signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`AI Service error (${response.status}): ${errText}`);
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response stream');

        const decoder = new TextDecoder();
        let buffer = '';
        let metadata: NdjsonMetadata['data'] | null = null;
        const groups: Record<string, unknown>[] = [];

        store.setProcessing('AI đang phân tích PDF...');
        store.setProgress(10);

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const event: NdjsonEvent = JSON.parse(line);

                    if (event.type === 'metadata') {
                        metadata = event.data;
                        store.setProcessing(`Đề thi: ${metadata.title}`);
                        store.setProgress(15);
                    }

                    if (event.type === 'passage') {
                        groups.push(event.data);
                        store.setPassageProgress(event.index, event.total);
                    }

                    if (event.type === 'error') {
                        throw new Error(event.message);
                    }

                    if (event.type === 'done') {
                        store.setProcessing('Đang lưu đề thi vào hệ thống...');
                        store.setProgress(95);
                    }
                } catch (parseErr) {
                    if (parseErr instanceof Error && parseErr.message.startsWith('AI Service'))
                        throw parseErr;
                    console.warn('NDJSON parse warning:', parseErr);
                }
            }
        }

        if (!metadata) throw new Error('Không nhận được metadata từ AI');

        const examPayload = {
            title: metadata.title,
            description: metadata.description,
            durationMinutes: metadata.durationMinutes,
            totalPoints: groups.reduce(
                (sum, g) => {
                    const questions = (g.questions as Array<{ points?: number }>) || [];
                    return sum + questions.reduce((s, q) => s + (q.points ?? 1), 0);
                },
                0
            ),
            examType: metadata.examType || 'IELTS',
            isPublished: false,
            sections: [
                {
                    skillType: 'Reading',
                    title: 'Reading Section',
                    orderIndex: 0,
                    readingPassages: groups.map((g: any, i: number) => ({
                        passageNumber: i + 1,
                        title: g.title || `Passage ${i + 1}`,
                        paragraphsData: g.content || '',
                        questionGroups: [{
                            groupType: 'MCQ_SINGLE',
                            instruction: '',
                            startQuestion: 1,
                            endQuestion: Array.isArray(g.questions) ? g.questions.length : 0,
                            questions: (Array.isArray(g.questions) ? g.questions : []).map((q: any, qIdx: number) => ({
                                questionNumber: qIdx + 1,
                                content: q.content || '',
                                correctAnswer: q.correctAnswer || null,
                                explanation: q.explanation || null,
                                points: typeof q.points === 'number' ? q.points : 1.0,
                                options: (Array.isArray(q.options) ? q.options : []).map((o: any, oIdx: number) => ({
                                    optionText: typeof o.optionText === 'string' ? o.optionText
                                        : (o.text || o.option_text || String(o.label || '') || `Option ${oIdx + 1}`),
                                    isCorrect: Boolean(o.isCorrect),
                                    orderIndex: oIdx,
                                })),
                            })),
                        }],
                    })),
                },
            ],
        };

        const token = localStorage.getItem('token');
        const userId = localStorage.getItem('userId') || '00000000-0000-0000-0000-000000000000';

        const saveRes = await fetch(`${API_BASE_URL}/exam`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                'X-User-Id': userId,
            },
            body: JSON.stringify(examPayload),
        });

        if (!saveRes.ok) {
            const errText = await saveRes.text();
            throw new Error(`Lưu đề thi thất bại: ${errText}`);
        }

        const { id: examId } = await saveRes.json();
        store.setDone(examId);
    } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Lỗi không xác định';
        store.setError(msg);
    }
}
