import { useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { Button, Input, Upload, message } from 'antd';
import { CloseOutlined, MinusCircleOutlined, PlusOutlined, SoundOutlined } from '@ant-design/icons';
import type { CreateSectionDto } from '@/features/exams/types/exam.types';
import type { TiptapQxEditorRef } from '@/features/exams/components/TiptapQxEditor';
import {
    SKILL_COLORS,
    applySharedListeningAudioUrl,
    countSectionQuestions,
    emptyListeningPart,
    getMaxQuestionNumber,
    getSharedListeningAudioUrl,
    reorderQuestionNumbers,
    EXAM_LIMITS,
} from './examEditor.helpers';
import { QuestionGroupsEditor } from './QuestionGroupsEditor';
import { getCleanPastedInputValue, type SharedSectionEditorProps } from './sectionEditor.utils';

export interface ListeningSectionEditorProps extends SharedSectionEditorProps {
    uploading: boolean;
    globalAudioUrl: string | null;
    setGlobalAudioUrl: Dispatch<SetStateAction<string | null>>;
    handleUploadFile: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
    handleGenerateListeningTranscript?: (audioUrl: string, listeningParts?: CreateSectionDto['listeningParts']) => Promise<string[]>;
    activeEditorRef: MutableRefObject<TiptapQxEditorRef | null>;
}

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

