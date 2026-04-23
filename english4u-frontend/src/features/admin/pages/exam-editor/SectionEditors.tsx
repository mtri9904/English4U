import { useRef, useState, type ClipboardEvent, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Button, Input, InputNumber, Upload, Tag, message } from 'antd';
import { CloseOutlined, MinusCircleOutlined, PictureOutlined, PlusOutlined, SoundOutlined, BoldOutlined } from '@ant-design/icons';
import type {
    CreateSectionDto,
} from '../../types/exam.types';
import { TiptapQxEditor, type TiptapQxEditorRef } from '../../components/TiptapQxEditor';
import { parseWritingTaskAssetsData, serializeWritingTaskAssetsData } from '@/shared/lib/writingTaskAssets';
import {
    buildCleanPastedValue,
    applySharedListeningAudioUrl,
    SKILL_COLORS,
    emptyListeningPart,
    emptyPassage,
    emptySpeakingPart,
    emptySpeakingQuestion,
    emptyWritingTask,
    reorderQuestionNumbers,
    EXAM_LIMITS,
    countSectionQuestions,
    getMaxQuestionNumber,
    getSharedListeningAudioUrl,
} from './examEditor.helpers';
import { QuestionGroupsEditor } from './QuestionGroupsEditor';

interface SharedSectionEditorProps {
    section: CreateSectionDto;
    sIdx: number;
    updateSection: (sIdx: number, partial: Partial<CreateSectionDto>) => void;
}

interface ReadingSectionEditorProps extends SharedSectionEditorProps {
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
    uploading: boolean;
    handleUploadFile: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

interface ListeningSectionEditorProps extends SharedSectionEditorProps {
    uploading: boolean;
    globalAudioUrl: string | null;
    setGlobalAudioUrl: Dispatch<SetStateAction<string | null>>;
    handleUploadFile: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
    handleGenerateListeningTranscript?: (audioUrl: string, listeningParts?: CreateSectionDto['listeningParts']) => Promise<string[]>;
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
    uploading,
    handleUploadFile,
}: ReadingSectionEditorProps) => {
    const passages = section.readingPassages ?? [];
    let currentQNum = 1;
    const passageEditorRefs = useRef<Record<number, TiptapQxEditorRef | null>>({});
    const questionCount = countSectionQuestions(section, 'Reading');
    const hasQuestionCapacity = questionCount < EXAM_LIMITS.Reading.questions;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Tag color={questionCount > EXAM_LIMITS.Reading.questions ? 'red' : 'green'}>
                    Reading {questionCount}/{EXAM_LIMITS.Reading.questions} câu
                </Tag>
            </div>
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
                                const editorRef = passageEditorRefs.current[pIdx] ?? null;
                                activeEditorRef.current = editorRef;
                                editorRef?.toggleBold();
                            }}
                        >
                            In đậm
                        </Button>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <TiptapQxEditor
                            ref={(instance) => {
                                passageEditorRefs.current[pIdx] = instance;
                            }}
                            value={passage.paragraphsData ?? ''}
                            placeholder="Nội dung chi tiết của bài đọc..."
                            minHeight="260px"
                            enableMarkdownBold
                            onFocus={() => {
                                activeEditorRef.current = passageEditorRefs.current[pIdx] ?? null;
                            }}
                            onChange={(value) => {
                                const updatedPassages = [...passages];
                                updatedPassages[pIdx] = { ...passage, paragraphsData: value };
                                updateSection(sIdx, { readingPassages: updatedPassages });
                            }}
                        />
                    </div>
                    {(() => {
                        const startOfPassage = currentQNum;
                        const editor = (
                            <QuestionGroupsEditor
                                groups={passage.questionGroups}
                                skill="Reading"
                                startQNum={startOfPassage}
                                maxQuestionCount={EXAM_LIMITS.Reading.questions}
                                totalQuestionCount={questionCount}
                                activeEditorRef={activeEditorRef}
                                uploading={uploading}
                                handleUploadFile={handleUploadFile}
                                onUpdate={(groups) => {
                                    const updatedPassages = [...passages];
                                    updatedPassages[pIdx] = { ...passage, questionGroups: groups };

                                    let questionNum = 1;
                                    const reindexedPassages = updatedPassages.map((item) => {
                                        const newGroups = reorderQuestionNumbers(item.questionGroups, questionNum);
                                        questionNum = Math.max(questionNum, getMaxQuestionNumber(newGroups) + 1);
                                        return { ...item, questionGroups: newGroups };
                                    });

                                    updateSection(sIdx, { readingPassages: reindexedPassages });
                                }}
                            />
                        );

                        currentQNum = Math.max(currentQNum, getMaxQuestionNumber(passage.questionGroups) + 1);
                        return editor;
                    })()}
                </div>
            ))}
            {passages.length < EXAM_LIMITS.Reading.passages && hasQuestionCapacity && (
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
                        if (passages.length >= EXAM_LIMITS.Reading.passages) return;
                        const updatedPassages = [...passages, { ...emptyPassage(), passageNumber: passages.length + 1 }];
                        updateSection(sIdx, { readingPassages: updatedPassages });
                    }}
                >
                    Thêm Passage mới (Tối đa {EXAM_LIMITS.Reading.passages})
                </Button>
            )}
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
    handleGenerateListeningTranscript,
    activeEditorRef,
}: ListeningSectionEditorProps) => {
    const parts = section.listeningParts ?? [];
    const sharedAudioUrl = globalAudioUrl || getSharedListeningAudioUrl(parts);
    let currentQNum = 1;
    const questionCount = countSectionQuestions(section, 'Listening');
    const hasQuestionCapacity = questionCount < EXAM_LIMITS.Listening.questions;
    const [generatingTranscriptIndex, setGeneratingTranscriptIndex] = useState<number | null>(null);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Tag color={questionCount > EXAM_LIMITS.Listening.questions ? 'red' : 'green'}>
                    Listening {questionCount}/{EXAM_LIMITS.Listening.questions} câu
                </Tag>
            </div>
            <div style={{ padding: '14px', background: '#eef2ff', borderRadius: '12px', border: '1px dashed #6366f1' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3730a3', marginBottom: '8px' }}>
                    <SoundOutlined /> Audio chung cho toàn bài Listening
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Upload
                        accept="audio/*"
                        maxCount={1}
                        showUploadList={false}
                        beforeUpload={async (file) => {
                            const url = await handleUploadFile(file, 'video');
                            if (url) {
                                setGlobalAudioUrl(url);
                                updateSection(sIdx, { listeningParts: applySharedListeningAudioUrl(parts, url) });
                            }
                            return false;
                        }}
                    >
                        <Button
                            type="primary"
                            icon={<SoundOutlined />}
                            size="small"
                            loading={uploading}
                            style={{ background: SKILL_COLORS.Listening, borderColor: SKILL_COLORS.Listening }}
                        >
                            Tải audio toàn bài
                        </Button>
                    </Upload>
                    <Input
                        value={sharedAudioUrl}
                        readOnly
                        placeholder="Chưa có file audio dùng chung"
                        size="small"
                        style={{ flex: 1, background: '#f8fafc', color: '#475569' }}
                        suffix={sharedAudioUrl ? (
                            <CloseOutlined
                                style={{ color: '#ef4444', cursor: 'pointer' }}
                                onClick={() => {
                                    setGlobalAudioUrl('');
                                    updateSection(sIdx, { listeningParts: applySharedListeningAudioUrl(parts, '') });
                                }}
                            />
                        ) : null}
                    />
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.75rem', color: '#4338ca', lineHeight: 1.6 }}>
                    Listening giờ chỉ dùng một file audio cho toàn bộ bài. Các Part bên dưới chỉ còn để chia nhóm câu hỏi và nội dung hiển thị.
                </div>
            </div>
            {parts.map((part, pIdx) => (
                <div key={pIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontWeight: 700, color: SKILL_COLORS.Listening }}>Part {pIdx + 1}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Button
                                size="small"
                                type="default"
                                icon={<SoundOutlined />}
                                loading={generatingTranscriptIndex === pIdx}
                                disabled={!sharedAudioUrl || !handleGenerateListeningTranscript}
                                onClick={async () => {
                                    if (!sharedAudioUrl || !handleGenerateListeningTranscript) {
                                        return;
                                    }

                                    setGeneratingTranscriptIndex(pIdx);
                                    try {
                                        const transcriptDataByPart = await handleGenerateListeningTranscript(sharedAudioUrl, parts);
                                        const updatedParts = parts.map((item, index) => ({
                                            ...item,
                                            transcriptData: transcriptDataByPart[index] ?? transcriptDataByPart[0] ?? '',
                                        }));
                                        updateSection(sIdx, { listeningParts: updatedParts });
                                    } catch (error) {
                                        message.error(
                                            error instanceof Error
                                                ? error.message
                                                : 'Không thể generate transcript cho audio này.',
                                        );
                                    } finally {
                                        setGeneratingTranscriptIndex((current) => current === pIdx ? null : current);
                                    }
                                }}
                            >
                                Generate transcript
                            </Button>
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
                    </div>
                    <Input.TextArea
                        value={part.contextDescription ?? ''}
                        placeholder="Nội dung hiển thị của part: note/form/map/instruction..."
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
                    <Input.TextArea
                        value={part.transcriptData ?? ''}
                        placeholder='Transcript JSON cho AI replay, ví dụ: {"schemaVersion":3,"segments":[{"startTime":115,"endTime":125,"text":"..."}]}'
                        autoSize={{ minRows: 4, maxRows: 12 }}
                        style={{ marginBottom: '12px' }}
                        onPaste={(event) => {
                            const nextValue = getCleanPastedInputValue(event, part.transcriptData ?? '');
                            if (nextValue === null) return;

                            const updatedParts = [...parts];
                            updatedParts[pIdx] = { ...part, transcriptData: nextValue };
                            updateSection(sIdx, { listeningParts: updatedParts });
                        }}
                        onChange={(event) => {
                            const updatedParts = [...parts];
                            updatedParts[pIdx] = { ...part, transcriptData: event.target.value };
                            updateSection(sIdx, { listeningParts: updatedParts });
                        }}
                    />
                    <div style={{ marginTop: '-4px', marginBottom: '12px', fontSize: '0.75rem', color: '#475569', lineHeight: 1.6 }}>
                        Field này chỉ phục vụ AI gia sư tìm mốc audio và trích transcript. Không thay thế nội dung `contextDescription` đang hiển thị cho học viên. Schema mới chỉ cần `segments` có `startTime`, `endTime`, `text`; AI review tự suy luận evidence/replay theo part + câu hỏi + đáp án.
                    </div>
                    {(() => {
                        const startOfPart = currentQNum;
                        const editor = (
                            <QuestionGroupsEditor
                                groups={part.questionGroups}
                                skill="Listening"
                                startQNum={startOfPart}
                                maxQuestionCount={EXAM_LIMITS.Listening.questions}
                                totalQuestionCount={questionCount}
                                activeEditorRef={activeEditorRef}
                                uploading={uploading}
                                handleUploadFile={handleUploadFile}
                                onUpdate={(groups) => {
                                    const updatedParts = [...parts];
                                    updatedParts[pIdx] = { ...part, questionGroups: groups };

                                    let questionNum = 1;
                                    const reindexedParts = updatedParts.map((item) => {
                                        const newGroups = reorderQuestionNumbers(item.questionGroups, questionNum);
                                        questionNum = Math.max(questionNum, getMaxQuestionNumber(newGroups) + 1);
                                        return { ...item, questionGroups: newGroups };
                                    });

                                    updateSection(sIdx, { listeningParts: reindexedParts });
                                }}
                            />
                        );

                        currentQNum = Math.max(currentQNum, getMaxQuestionNumber(part.questionGroups) + 1);
                        return editor;
                    })()}
                </div>
            ))}
            {parts.length < EXAM_LIMITS.Listening.parts && hasQuestionCapacity && (
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
                        if (parts.length >= EXAM_LIMITS.Listening.parts) return;
                        const newPart = { ...emptyListeningPart(), partNumber: parts.length + 1 };
                        if (sharedAudioUrl) {
                            newPart.audioUrl = sharedAudioUrl;
                        }
                        updateSection(sIdx, { listeningParts: [...parts, newPart] });
                    }}
                >
                    Thêm Listening Part mới (Tối đa {EXAM_LIMITS.Listening.parts})
                </Button>
            )}
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
            {tasks.map((task, taskIdx) => {
                const writingAssets = parseWritingTaskAssetsData(task.assetsData);

                return (
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
                                            updatedTasks[taskIdx] = {
                                                ...task,
                                                assetsData: serializeWritingTaskAssetsData({
                                                    imageUrl: url,
                                                    hiddenDataText: writingAssets.hiddenDataText,
                                                }),
                                            };
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
                                    value={writingAssets.primaryImageUrl ?? ''}
                                    placeholder="Chưa có ảnh biểu đồ"
                                    readOnly
                                    size="small"
                                    style={{ flex: 1, background: '#fffcf0', color: '#92400e' }}
                                    suffix={writingAssets.primaryImageUrl ? (
                                        <CloseOutlined
                                            style={{ color: '#ef4444', cursor: 'pointer' }}
                                            onClick={() => {
                                                const updatedTasks = [...tasks];
                                                updatedTasks[taskIdx] = {
                                                    ...task,
                                                    assetsData: serializeWritingTaskAssetsData({
                                                        imageUrl: '',
                                                        hiddenDataText: writingAssets.hiddenDataText,
                                                    }),
                                                };
                                                updateSection(sIdx, { writingTasks: updatedTasks });
                                            }}
                                        />
                                    ) : null}
                                />
                            </div>
                            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#a16207', lineHeight: 1.6 }}>
                                Khi lưu đề, hệ thống sẽ tự đọc ảnh biểu đồ ở nền để chuẩn bị dữ liệu cho AI chấm và AI gia sư.
                            </div>
                        </div>
                    )}
                </div>
            )})}
            {tasks.length < EXAM_LIMITS.Writing.tasks && (
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
                    onClick={() => {
                        if (tasks.length >= EXAM_LIMITS.Writing.tasks) return;
                        updateSection(sIdx, { writingTasks: [...tasks, emptyWritingTask(tasks.length + 1)] });
                    }}
                >
                    Thêm Writing Task mới (Tối đa {EXAM_LIMITS.Writing.tasks})
                </Button>
            )}
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
            {parts.length < EXAM_LIMITS.Speaking.parts && (
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
                    onClick={() => {
                        if (parts.length >= EXAM_LIMITS.Speaking.parts) return;
                        updateSection(sIdx, { speakingParts: [...parts, emptySpeakingPart(parts.length + 1)] });
                    }}
                >
                    Thêm Speaking Part (Tối đa {EXAM_LIMITS.Speaking.parts})
                </Button>
            )}
        </div>
    );
};
