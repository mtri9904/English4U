import type { ClipboardEvent, Dispatch, MutableRefObject, SetStateAction } from 'react';
import { Button, Input, InputNumber, Upload, message } from 'antd';
import { CloseOutlined, MinusCircleOutlined, PictureOutlined, PlusOutlined, SoundOutlined, BoldOutlined } from '@ant-design/icons';
import type {
    CreateSectionDto,
} from '../../types/exam.types';
import type { TiptapQxEditorRef } from '../../components/TiptapQxEditor';
import {
    buildCleanPastedValue,
    SKILL_COLORS,
    emptyListeningPart,
    emptyPassage,
    emptySpeakingPart,
    emptySpeakingQuestion,
    emptyWritingTask,
    reorderQuestionNumbers,
} from './examEditor.helpers';
import { QuestionGroupsEditor } from './QuestionGroupsEditor';

interface SharedSectionEditorProps {
    section: CreateSectionDto;
    sIdx: number;
    updateSection: (sIdx: number, partial: Partial<CreateSectionDto>) => void;
}

interface ReadingSectionEditorProps extends SharedSectionEditorProps {
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
}

interface ListeningSectionEditorProps extends SharedSectionEditorProps {
    uploading: boolean;
    globalAudioUrl: string | null;
    setGlobalAudioUrl: Dispatch<SetStateAction<string | null>>;
    handleUploadFile: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
}

interface WritingSectionEditorProps extends SharedSectionEditorProps {
    uploading: boolean;
    handleUploadFile: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

const getCleanPastedInputValue = (
    event: ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    currentValue: string,
) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return null;

    event.preventDefault();
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    return buildCleanPastedValue(
        currentValue,
        pasted,
        target.selectionStart,
        target.selectionEnd,
    );
};

export const ReadingSectionEditor = ({
    section,
    sIdx,
    updateSection,
    activeEditorRef,
}: ReadingSectionEditorProps) => {
    const passages = section.readingPassages ?? [];
    let currentQNum = 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {passages.map((passage, pIdx) => (
                <div key={pIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, color: SKILL_COLORS.Reading }}>Passage {pIdx + 1}</span>
                        {passages.length > 1 && (
                            <Button
                                type="text"
                                danger
                                icon={<MinusCircleOutlined />}
                                size="small"
                                onClick={() => updateSection(sIdx, { readingPassages: passages.filter((_, index) => index !== pIdx) })}
                            />
                        )}
                    </div>
                    <Input
                        value={passage.title ?? ''}
                        placeholder="Tiêu đề Passage"
                        onChange={(event) => {
                            const updatedPassages = [...passages];
                            updatedPassages[pIdx] = { ...passage, title: event.target.value };
                            updateSection(sIdx, { readingPassages: updatedPassages });
                        }}
                        size="large"
                        style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '16px' }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>Nội dung bài đọc (Paragraphs) *</label>
                        <Button
                            size="small"
                            icon={<BoldOutlined />}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                const activeElement = document.activeElement as HTMLTextAreaElement;
                                if (!activeElement || activeElement.tagName !== 'TEXTAREA') return;

                                const start = activeElement.selectionStart;
                                const end = activeElement.selectionEnd;
                                const text = activeElement.value;
                                const selected = text.substring(start, end);
                                if (!selected) return;

                                const newValue = text.substring(0, start) + `**${selected}**` + text.substring(end);
                                const updatedPassages = [...passages];
                                updatedPassages[pIdx] = { ...passage, paragraphsData: newValue };
                                updateSection(sIdx, { readingPassages: updatedPassages });
                            }}
                        >
                            In đậm
                        </Button>
                    </div>
                    <Input.TextArea
                        value={passage.paragraphsData ?? ''}
                        placeholder="Nội dung chi tiết của bài đọc..."
                        autoSize={{ minRows: 8, maxRows: 20 }}
                        size="small"
                        style={{ marginBottom: '10px' }}
                        onPaste={(event) => {
                            const newValue = getCleanPastedInputValue(event, passage.paragraphsData ?? '');
                            if (newValue === null) return;

                            const updatedPassages = [...passages];
                            updatedPassages[pIdx] = { ...passage, paragraphsData: newValue };
                            updateSection(sIdx, { readingPassages: updatedPassages });
                            message.info('Văn bản đã được tự động dàn lại trang');
                        }}
                        onChange={(event) => {
                            const updatedPassages = [...passages];
                            updatedPassages[pIdx] = { ...passage, paragraphsData: event.target.value };
                            updateSection(sIdx, { readingPassages: updatedPassages });
                        }}
                    />
                    {(() => {
                        const startOfPassage = currentQNum;
                        const questionsInPassage = passage.questionGroups.reduce((acc, group) => acc + group.questions.length, 0);
                        const editor = (
                            <QuestionGroupsEditor
                                groups={passage.questionGroups}
                                skill="Reading"
                                startQNum={startOfPassage}
                                activeEditorRef={activeEditorRef}
                                onUpdate={(groups) => {
                                    const updatedPassages = [...passages];
                                    updatedPassages[pIdx] = { ...passage, questionGroups: groups };

                                    let questionNum = 1;
                                    const reindexedPassages = updatedPassages.map((item) => {
                                        const newGroups = reorderQuestionNumbers(item.questionGroups, questionNum);
                                        questionNum += newGroups.reduce((acc, group) => acc + (group.questions?.length || 0), 0);
                                        return { ...item, questionGroups: newGroups };
                                    });

                                    updateSection(sIdx, { readingPassages: reindexedPassages });
                                }}
                            />
                        );

                        currentQNum += questionsInPassage;
                        return editor;
                    })()}
                </div>
            ))}
            <Button
                type="default"
                icon={<PlusOutlined />}
                block
                style={{
                    background: '#f0fdf4',
                    borderColor: SKILL_COLORS.Reading,
                    color: SKILL_COLORS.Reading,
                    fontWeight: 600,
                    height: '38px',
                    borderRadius: '8px',
                    marginTop: '8px',
                }}
                onClick={() => {
                    const updatedPassages = [...passages, { ...emptyPassage(), passageNumber: passages.length + 1 }];
                    updateSection(sIdx, { readingPassages: updatedPassages });
                }}
            >
                Thêm Passage mới cho phần Reading
            </Button>
        </div>
    );
};

export const ListeningSectionEditor = ({
    section,
    sIdx,
    updateSection,
    uploading,
    globalAudioUrl,
    setGlobalAudioUrl,
    handleUploadFile,
    activeEditorRef,
}: ListeningSectionEditorProps) => {
    const parts = section.listeningParts ?? [];
    let currentQNum = 1;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {parts.map((part, pIdx) => (
                <div key={pIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, color: SKILL_COLORS.Listening }}>Part {pIdx + 1}</span>
                        {parts.length > 1 && (
                            <Button
                                type="text"
                                danger
                                icon={<MinusCircleOutlined />}
                                size="small"
                                onClick={() => updateSection(sIdx, { listeningParts: parts.filter((_, index) => index !== pIdx) })}
                            />
                        )}
                    </div>
                    <div style={{ padding: '12px', background: '#eef2ff', borderRadius: '8px', border: '1px dashed #6366f1', marginBottom: '10px' }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#3730a3', marginBottom: '6px' }}>
                            <SoundOutlined /> Audio
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                            <Upload
                                accept="audio/*"
                                maxCount={1}
                                showUploadList={false}
                                disabled={globalAudioUrl !== null && pIdx !== 0}
                                beforeUpload={async (file) => {
                                    const url = await handleUploadFile(file, 'video');
                                    if (url) {
                                        if (globalAudioUrl !== null) {
                                            setGlobalAudioUrl(url);
                                            const updatedParts = parts.map((item) => ({ ...item, audioUrl: url }));
                                            updateSection(sIdx, { listeningParts: updatedParts });
                                        } else {
                                            const updatedParts = [...parts];
                                            updatedParts[pIdx] = { ...part, audioUrl: url };
                                            updateSection(sIdx, { listeningParts: updatedParts });
                                        }
                                    }
                                    return false;
                                }}
                            >
                                <Button
                                    type="primary"
                                    icon={<SoundOutlined />}
                                    size="small"
                                    loading={uploading}
                                    disabled={globalAudioUrl !== null && pIdx !== 0}
                                    style={{ background: SKILL_COLORS.Listening, borderColor: SKILL_COLORS.Listening }}
                                >
                                    Tải Audio {globalAudioUrl !== null && pIdx !== 0 ? '(Khoá)' : ''}
                                </Button>
                            </Upload>
                            <Input
                                value={globalAudioUrl || part.audioUrl}
                                readOnly
                                placeholder={pIdx === 0 ? 'Chưa có file audio nào' : 'Dùng chung audio với Part 1'}
                                size="small"
                                style={{ flex: 1, background: '#f8fafc', color: '#475569' }}
                                suffix={(globalAudioUrl || part.audioUrl) && !(globalAudioUrl !== null && pIdx !== 0) ? (
                                    <CloseOutlined
                                        style={{ color: '#ef4444', cursor: 'pointer' }}
                                        onClick={() => {
                                            if (globalAudioUrl !== null) {
                                                setGlobalAudioUrl('');
                                                const updatedParts = parts.map((item) => ({ ...item, audioUrl: '' }));
                                                updateSection(sIdx, { listeningParts: updatedParts });
                                            } else {
                                                const updatedParts = [...parts];
                                                updatedParts[pIdx] = { ...part, audioUrl: '' };
                                                updateSection(sIdx, { listeningParts: updatedParts });
                                            }
                                        }}
                                    />
                                ) : null}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                            {globalAudioUrl === null && parts.length > 1 && part.audioUrl && (
                                <Button
                                    size="small"
                                    type="link"
                                    onClick={() => {
                                        setGlobalAudioUrl(part.audioUrl);
                                        const updatedParts = parts.map((item) => ({ ...item, audioUrl: part.audioUrl }));
                                        updateSection(sIdx, { listeningParts: updatedParts });
                                        message.success('Đã bật chế độ Audio chung cho đề thi!');
                                    }}
                                >
                                    Áp dụng cho tất cả Parts
                                </Button>
                            )}
                            {globalAudioUrl !== null && pIdx === 0 && (
                                <Button
                                    size="small"
                                    type="link"
                                    danger
                                    onClick={() => {
                                        setGlobalAudioUrl(null);
                                        message.info('Đã tắt chế độ Audio chung. Bạn có thể chỉnh audio riêng cho từng part.');
                                    }}
                                >
                                    Tắt Audio chung
                                </Button>
                            )}
                        </div>
                    </div>
                    <Input.TextArea
                        value={part.contextDescription ?? ''}
                        placeholder="Mô tả context / transcript..."
                        autoSize={{ minRows: 3, maxRows: 10 }}
                        style={{ marginBottom: '12px' }}
                        onPaste={(event) => {
                            const nextValue = getCleanPastedInputValue(event, part.contextDescription ?? '');
                            if (nextValue === null) return;

                            const updatedParts = [...parts];
                            updatedParts[pIdx] = { ...part, contextDescription: nextValue };
                            updateSection(sIdx, { listeningParts: updatedParts });
                        }}
                        onChange={(event) => {
                            const updatedParts = [...parts];
                            updatedParts[pIdx] = { ...part, contextDescription: event.target.value };
                            updateSection(sIdx, { listeningParts: updatedParts });
                        }}
                    />
                    {(() => {
                        const startOfPart = currentQNum;
                        const questionsInPart = part.questionGroups.reduce((acc, group) => acc + group.questions.length, 0);
                        const editor = (
                            <QuestionGroupsEditor
                                groups={part.questionGroups}
                                skill="Listening"
                                startQNum={startOfPart}
                                activeEditorRef={activeEditorRef}
                                uploading={uploading}
                                handleUploadFile={handleUploadFile}
                                onUpdate={(groups) => {
                                    const updatedParts = [...parts];
                                    updatedParts[pIdx] = { ...part, questionGroups: groups };

                                    let questionNum = 1;
                                    const reindexedParts = updatedParts.map((item) => {
                                        const newGroups = reorderQuestionNumbers(item.questionGroups, questionNum);
                                        questionNum += newGroups.reduce((acc, group) => acc + (group.questions?.length || 0), 0);
                                        return { ...item, questionGroups: newGroups };
                                    });

                                    updateSection(sIdx, { listeningParts: reindexedParts });
                                }}
                            />
                        );

                        currentQNum += questionsInPart;
                        return editor;
                    })()}
                </div>
            ))}
            <Button
                type="default"
                icon={<PlusOutlined />}
                block
                style={{
                    background: '#eef2ff',
                    borderColor: SKILL_COLORS.Listening,
                    color: SKILL_COLORS.Listening,
                    fontWeight: 600,
                    height: '38px',
                    borderRadius: '8px',
                    marginTop: '8px',
                }}
                onClick={() => {
                    const newPart = { ...emptyListeningPart(), partNumber: parts.length + 1 };
                    if (globalAudioUrl) {
                        newPart.audioUrl = globalAudioUrl;
                    }
                    updateSection(sIdx, { listeningParts: [...parts, newPart] });
                }}
            >
                Thêm Listening Part mới
            </Button>
        </div>
    );
};

export const WritingSectionEditor = ({
    section,
    sIdx,
    updateSection,
    uploading,
    handleUploadFile,
}: WritingSectionEditorProps) => {
    const tasks = section.writingTasks ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tasks.map((task, taskIdx) => (
                <div key={taskIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, color: SKILL_COLORS.Writing }}>Task {task.taskNumber ?? taskIdx + 1}</span>
                        {tasks.length > 1 && (
                            <Button
                                type="text"
                                danger
                                icon={<MinusCircleOutlined />}
                                size="small"
                                onClick={() => updateSection(sIdx, { writingTasks: tasks.filter((_, index) => index !== taskIdx) })}
                            />
                        )}
                    </div>
                    <Input.TextArea
                        value={task.promptText}
                        placeholder="Đề bài Writing (mô tả task, yêu cầu...)"
                        autoSize={{ minRows: 4, maxRows: 15 }}
                        style={{ marginBottom: '10px' }}
                        onPaste={(event) => {
                            const nextValue = getCleanPastedInputValue(event, task.promptText ?? '');
                            if (nextValue === null) return;

                            const updatedTasks = [...tasks];
                            updatedTasks[taskIdx] = { ...task, promptText: nextValue };
                            updateSection(sIdx, { writingTasks: updatedTasks });
                        }}
                        onChange={(event) => {
                            const updatedTasks = [...tasks];
                            updatedTasks[taskIdx] = { ...task, promptText: event.target.value };
                            updateSection(sIdx, { writingTasks: updatedTasks });
                        }}
                    />
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Số từ tối thiểu:</span>
                        <InputNumber
                            value={task.minWords}
                            min={50}
                            max={500}
                            onChange={(value) => {
                                const updatedTasks = [...tasks];
                                updatedTasks[taskIdx] = { ...task, minWords: value ?? 150 };
                                updateSection(sIdx, { writingTasks: updatedTasks });
                            }}
                            size="small"
                            style={{ width: 90 }}
                        />
                    </div>
                    {(task.taskNumber === 1 || taskIdx === 0) && (
                        <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '8px', border: '1px dashed #f59e0b' }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                <PictureOutlined /> Hình ảnh Task 1
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <Upload
                                    accept="image/*"
                                    maxCount={1}
                                    showUploadList={false}
                                    beforeUpload={async (file) => {
                                        const url = await handleUploadFile(file, 'image');
                                        if (url) {
                                            const updatedTasks = [...tasks];
                                            updatedTasks[taskIdx] = { ...task, assetsData: url };
                                            updateSection(sIdx, { writingTasks: updatedTasks });
                                        }
                                        return false;
                                    }}
                                >
                                    <Button
                                        type="primary"
                                        icon={<PictureOutlined />}
                                        size="small"
                                        loading={uploading}
                                        style={{ background: SKILL_COLORS.Writing, borderColor: SKILL_COLORS.Writing }}
                                    >
                                        Tải ảnh lên
                                    </Button>
                                </Upload>
                                <Input
                                    value={task.assetsData ?? ''}
                                    placeholder="Chưa có ảnh biểu đồ"
                                    readOnly
                                    size="small"
                                    style={{ flex: 1, background: '#fffcf0', color: '#92400e' }}
                                    suffix={task.assetsData ? (
                                        <CloseOutlined
                                            style={{ color: '#ef4444', cursor: 'pointer' }}
                                            onClick={() => {
                                                const updatedTasks = [...tasks];
                                                updatedTasks[taskIdx] = { ...task, assetsData: '' };
                                                updateSection(sIdx, { writingTasks: updatedTasks });
                                            }}
                                        />
                                    ) : null}
                                />
                            </div>
                        </div>
                    )}
                </div>
            ))}
            <Button
                type="default"
                icon={<PlusOutlined />}
                block
                style={{
                    background: '#fffbeb',
                    borderColor: SKILL_COLORS.Writing,
                    color: '#92400e',
                    fontWeight: 600,
                    height: '38px',
                    borderRadius: '8px',
                    marginTop: '12px',
                }}
                onClick={() => updateSection(sIdx, { writingTasks: [...tasks, emptyWritingTask(tasks.length + 1)] })}
            >
                Thêm Writing Task mới
            </Button>
        </div>
    );
};

export const SpeakingSectionEditor = ({
    section,
    sIdx,
    updateSection,
}: SharedSectionEditorProps) => {
    const parts = section.speakingParts ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {parts.map((part, partIdx) => (
                <div key={partIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, color: SKILL_COLORS.Speaking }}>Part {part.partNumber ?? partIdx + 1}</span>
                        {parts.length > 1 && (
                            <Button
                                type="text"
                                danger
                                icon={<MinusCircleOutlined />}
                                size="small"
                                onClick={() => updateSection(sIdx, { speakingParts: parts.filter((_, index) => index !== partIdx) })}
                            />
                        )}
                    </div>
                    <Input.TextArea
                        value={part.description ?? ''}
                        placeholder="Mô tả chủ đề Part..."
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        style={{ marginBottom: '10px' }}
                        onPaste={(event) => {
                            const nextValue = getCleanPastedInputValue(event, part.description ?? '');
                            if (nextValue === null) return;

                            const updatedParts = [...parts];
                            updatedParts[partIdx] = { ...part, description: nextValue };
                            updateSection(sIdx, { speakingParts: updatedParts });
                        }}
                        onChange={(event) => {
                            const updatedParts = [...parts];
                            updatedParts[partIdx] = { ...part, description: event.target.value };
                            updateSection(sIdx, { speakingParts: updatedParts });
                        }}
                    />
                    {part.questions.map((question, questionIdx) => (
                        <div key={questionIdx} style={{ padding: '10px', background: '#fef2f2', borderRadius: '8px', marginBottom: '8px', border: '1px solid #fecaca' }}>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#991b1b' }}>Q{questionIdx + 1}</span>
                                {part.questions.length > 1 && (
                                    <Button
                                        type="text"
                                        danger
                                        icon={<MinusCircleOutlined />}
                                        size="small"
                                        onClick={() => {
                                            const updatedParts = [...parts];
                                            updatedParts[partIdx] = {
                                                ...part,
                                                questions: part.questions.filter((_, index) => index !== questionIdx),
                                            };
                                            updateSection(sIdx, { speakingParts: updatedParts });
                                        }}
                                    />
                                )}
                            </div>
                            <Input.TextArea
                                value={question.content}
                                placeholder="Câu hỏi Speaking..."
                                autoSize={{ minRows: 2, maxRows: 5 }}
                                onPaste={(event) => {
                                    const nextValue = getCleanPastedInputValue(event, question.content ?? '');
                                    if (nextValue === null) return;

                                    const updatedParts = [...parts];
                                    const updatedQuestions = [...part.questions];
                                    updatedQuestions[questionIdx] = { ...question, content: nextValue };
                                    updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                    updateSection(sIdx, { speakingParts: updatedParts });
                                }}
                                onChange={(event) => {
                                    const updatedParts = [...parts];
                                    const updatedQuestions = [...part.questions];
                                    updatedQuestions[questionIdx] = { ...question, content: event.target.value };
                                    updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                    updateSection(sIdx, { speakingParts: updatedParts });
                                }}
                            />
                            {part.partNumber === 2 && (
                                <Input.TextArea
                                    value={question.cueCardPoints ?? ''}
                                    placeholder="Cue Card gợi ý..."
                                    autoSize={{ minRows: 2, maxRows: 5 }}
                                    style={{ marginTop: '6px' }}
                                    onPaste={(event) => {
                                        const nextValue = getCleanPastedInputValue(event, question.cueCardPoints ?? '');
                                        if (nextValue === null) return;

                                        const updatedParts = [...parts];
                                        const updatedQuestions = [...part.questions];
                                        updatedQuestions[questionIdx] = { ...question, cueCardPoints: nextValue };
                                        updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                        updateSection(sIdx, { speakingParts: updatedParts });
                                    }}
                                    onChange={(event) => {
                                        const updatedParts = [...parts];
                                        const updatedQuestions = [...part.questions];
                                        updatedQuestions[questionIdx] = { ...question, cueCardPoints: event.target.value };
                                        updatedParts[partIdx] = { ...part, questions: updatedQuestions };
                                        updateSection(sIdx, { speakingParts: updatedParts });
                                    }}
                                />
                            )}
                        </div>
                    ))}
                    <Button
                        type="default"
                        size="small"
                        icon={<PlusOutlined />}
                        block
                        style={{
                            background: '#fef2f2',
                            borderColor: '#fecaca',
                            color: '#ef4444',
                            fontWeight: 600,
                            height: '32px',
                            borderRadius: '6px',
                        }}
                        onClick={() => {
                            const updatedParts = [...parts];
                            updatedParts[partIdx] = {
                                ...part,
                                questions: [
                                    ...part.questions,
                                    { ...emptySpeakingQuestion(), orderIndex: part.questions.length },
                                ],
                            };
                            updateSection(sIdx, { speakingParts: updatedParts });
                        }}
                    >
                        Thêm câu hỏi Speaking
                    </Button>
                </div>
            ))}
            <Button
                type="default"
                icon={<PlusOutlined />}
                block
                style={{
                    background: '#fef2f2',
                    borderColor: SKILL_COLORS.Speaking,
                    color: SKILL_COLORS.Speaking,
                    fontWeight: 600,
                    height: '38px',
                    borderRadius: '8px',
                    marginTop: '12px',
                }}
                onClick={() => updateSection(sIdx, { speakingParts: [...parts, emptySpeakingPart(parts.length + 1)] })}
            >
                Thêm Speaking Part
            </Button>
        </div>
    );
};
