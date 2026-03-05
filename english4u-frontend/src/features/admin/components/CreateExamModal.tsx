import { useState, useMemo, useEffect } from 'react';
import { Modal, Input, Select, InputNumber, Button, Divider, message, Upload, Tabs, Tag } from 'antd';
import { PlusOutlined, MinusCircleOutlined, SoundOutlined, PictureOutlined, BoldOutlined, CloseOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useCreateExamMutation, useUpdateExamMutation } from '../api/exam.api';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import type {
    ExamDto,
    CreateExamDto, CreateSectionDto,
    CreateReadingPassageDto, CreateListeningPartDto,
    CreateWritingTaskDto, CreateSpeakingPartDto, CreateSpeakingQuestionDto,
    CreateQuestionGroupDto, CreateQuestionDto, CreateQuestionOptionDto,
} from '../types/exam.types';
import {
    QUESTION_TYPES, TFNG_OPTIONS, YNNG_OPTIONS,
    SINGLE_CHOICE_TYPES, MULTI_CHOICE_TYPES, MATCHING_TYPES, FILL_TYPES,
    READING_QUESTION_TYPE_OPTIONS, LISTENING_QUESTION_TYPE_OPTIONS,
    type SkillType,
} from '../constants/questionTypes';
import { cleanUpClipboardText } from '../pages/exam-editor/examEditor.helpers';

interface Props {
    open: boolean;
    onClose: () => void;
    initialData?: ExamDto | null;
}

const SKILL_COLORS: Record<SkillType, string> = {
    Reading: '#10b981', Listening: '#6366f1', Writing: '#f59e0b', Speaking: '#ef4444',
};

const emptyOption = (idx = 0): CreateQuestionOptionDto => ({
    optionText: '', isCorrect: false, orderIndex: idx,
});

const emptyQuestion = (): CreateQuestionDto => ({
    content: '', correctAnswer: undefined, points: 1, options: [],
});

const emptyGroup = (groupType = 'MCQ_SINGLE'): CreateQuestionGroupDto => ({
    groupType, instruction: '', questions: [emptyQuestion()],
});

const emptyPassage = (): CreateReadingPassageDto => ({
    title: '', paragraphsData: '', questionGroups: [emptyGroup()],
});

const emptyListeningPart = (): CreateListeningPartDto => ({
    partNumber: 1, audioUrl: '', contextDescription: '', questionGroups: [emptyGroup()],
});

const reorderQuestionNumbers = (groups: CreateQuestionGroupDto[], startQNum: number) => {
    let currentQ = startQNum;
    return groups.map(group => {
        const isComplex = [
            'TABLE_COMPLETION', 'MATCHING_TABLE', 'NOTE_COMPLETION', 'FORM_COMPLETION', 'MAP_LABELLING', 'DIAGRAM_LABELLING'
        ].includes(group.groupType ?? '');

        let newGroup: CreateQuestionGroupDto;

        if (isComplex && group.contentData) {
            const regex = /\[Q(\d+)\]/g;
            const matches = [...group.contentData.matchAll(regex)];
            const oldToNew = new Map<number, number>();
            const orderedOldNums: number[] = [];
            const seen = new Set<number>();

            matches.forEach(m => {
                const old = parseInt(m[1], 10);
                if (!seen.has(old)) {
                    seen.add(old);
                    orderedOldNums.push(old);
                }
            });

            const startVal = currentQ;
            orderedOldNums.forEach(old => {
                oldToNew.set(old, currentQ++);
            });
            const endVal = currentQ - 1;

            const newContent = group.contentData.replace(/\[Q(\d+)\]/g, (_, p1) => {
                const old = parseInt(p1, 10);
                return `[Q${oldToNew.get(old) || p1}]`;
            });

            const newQs = orderedOldNums.map(old => {
                const existing = group.questions.find(q => q.questionNumber === old);
                const newNum = oldToNew.get(old)!;
                return existing ? { ...existing, questionNumber: newNum } : { ...emptyQuestion(), questionNumber: newNum };
            });

            newGroup = { ...group, contentData: newContent, questions: newQs, startQuestion: startVal, endQuestion: endVal };
        } else {
            const startVal = currentQ;
            const newQs = group.questions.map(q => ({
                ...q,
                questionNumber: currentQ++
            }));
            const endVal = currentQ - 1;
            newGroup = { ...group, questions: newQs, startQuestion: startVal, endQuestion: endVal };
        }
        return newGroup;
    });
};

const emptyWritingTask = (taskNumber = 1): CreateWritingTaskDto => ({
    taskNumber, promptText: '', minWords: taskNumber === 1 ? 150 : 250,
});

const emptySpeakingQuestion = (): CreateSpeakingQuestionDto => ({
    content: '', cueCardPoints: undefined, audioPromptUrl: undefined,
});

const emptySpeakingPart = (partNumber = 1): CreateSpeakingPartDto => ({
    partNumber, description: '', questions: [emptySpeakingQuestion()],
});

const cleanUpText = (text: string) => cleanUpClipboardText(text);

const GenericTableEditor = ({ contentData, onChange, nextQNum }: { contentData?: string | null, onChange: (val: string) => void, nextQNum: number }) => {
    const tableData: string[][] = useMemo(() => {
        try {
            const data = JSON.parse(contentData || '[]');
            if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) return data;
        } catch { }
        return [['Cột 1', 'Cột 2'], ['ND 1', 'ND 2']];
    }, [contentData]);

    const [focused, setFocused] = useState<{ r: number, c: number } | null>(null);

    const updateTable = (newData: string[][]) => onChange(JSON.stringify(newData));

    const insertQ = () => {
        if (!focused) return;
        const newData = tableData.map(row => [...row]);
        newData[focused.r][focused.c] = (newData[focused.r][focused.c] || '') + ` [Q${nextQNum}]`;
        updateTable(newData);
    };

    return (
        <div style={{ padding: '12px', border: '1px solid #d9d9d9', borderRadius: '6px', background: '#fafafa', marginBottom: '10px' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.8125rem' }}>Bảng Điền Từ (Layout Động)</div>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                <Button size="small" type="primary" onClick={insertQ} disabled={!focused}>
                    Thêm ô trống [Q{nextQNum}]
                </Button>
                <Button size="small" onClick={() => updateTable([...tableData, Array(tableData[0]?.length || 1).fill('')])}>
                    + Thêm Hàng
                </Button>
                <Button size="small" onClick={() => updateTable(tableData.map(r => [...r, '']))}>
                    + Thêm Cột
                </Button>
                <Button size="small" danger onClick={() => updateTable(tableData.map(r => r.slice(0, r.length - 1)))}>
                    - Xoá Cột Cuối
                </Button>
                <Button
                    size="small"
                    icon={<BoldOutlined />}
                    onMouseDown={e => {
                        e.preventDefault(); // Prevent focus loss
                        if (!focused) return;
                        const el = document.activeElement as HTMLTextAreaElement;
                        if (!el || el.tagName !== 'TEXTAREA') return;

                        const start = el.selectionStart;
                        const end = el.selectionEnd;
                        const text = el.value;
                        const selected = text.substring(start, end);

                        let newText;
                        if (selected) {
                            newText = text.substring(0, start) + `**${selected}**` + text.substring(end);
                        } else {
                            newText = text + ' ****';
                        }

                        const newData = tableData.map(r => [...r]);
                        newData[focused.r][focused.c] = newText;
                        updateTable(newData);
                    }}
                >
                    In đậm
                </Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ minWidth: '100%', borderCollapse: 'collapse', background: '#fff' }}>
                    <tbody>
                        {tableData.map((row, rIdx) => (
                            <tr key={rIdx}>
                                {row.map((cell, cIdx) => (
                                    <td key={cIdx} style={{ border: '1px solid #d9d9d9', padding: '0' }}>
                                        <Input.TextArea
                                            value={cell}
                                            autoSize={{ minRows: 2, maxRows: 5 }}
                                            placeholder="Nhập nội dung..."
                                            style={{ border: 'none', borderRadius: 0, resize: 'none', boxShadow: 'none' }}
                                            onChange={e => {
                                                const newData = tableData.map(r => [...r]);
                                                newData[rIdx][cIdx] = e.target.value;
                                                updateTable(newData);
                                            }}
                                            onFocus={() => setFocused({ r: rIdx, c: cIdx })}
                                        />
                                    </td>
                                ))}
                                {tableData.length > 1 && (
                                    <td style={{ width: 30, textAlign: 'center', border: '1px solid #d9d9d9', background: '#fff' }}>
                                        <MinusCircleOutlined style={{ color: '#ef4444', cursor: 'pointer' }} onClick={() => updateTable(tableData.filter((_, i) => i !== rIdx))} />
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const emptySection = (skill: SkillType): CreateSectionDto => {
    const base: CreateSectionDto = { skillType: skill, title: `${skill} Section`, orderIndex: 0 };
    if (skill === 'Reading') base.readingPassages = [emptyPassage()];
    if (skill === 'Listening') base.listeningParts = [emptyListeningPart()];
    if (skill === 'Writing') base.writingTasks = [emptyWritingTask(1), emptyWritingTask(2)];
    if (skill === 'Speaking') base.speakingParts = [emptySpeakingPart(1), emptySpeakingPart(2), emptySpeakingPart(3)];
    return base;
};

const GROUP_TYPE_OPTIONS: Record<string, { label: string; value: string }[]> = {
    Reading: READING_QUESTION_TYPE_OPTIONS,
    Listening: LISTENING_QUESTION_TYPE_OPTIONS,
};

export const CreateExamModal = ({ open, onClose, initialData }: Props) => {
    const createMutation = useCreateExamMutation();
    const updateMutation = useUpdateExamMutation();
    const [uploading, setUploading] = useState(false);
    const [globalAudioUrl, setGlobalAudioUrl] = useState<string | null>(null);

    const [form, setForm] = useState<CreateExamDto>({
        title: '', description: '', durationMinutes: 60, totalPoints: 0,
        examType: 'IELTS', isPublished: false, sections: [emptySection('Reading')],
    });

    const isEdit = !!initialData;

    useEffect(() => {
        if (open && initialData) {
            setForm({
                title: initialData.title,
                description: initialData.description || '',
                durationMinutes: initialData.durationMinutes || 60,
                totalPoints: initialData.totalPoints || 0,
                examType: initialData.examType || 'IELTS',
                isPublished: initialData.isPublished,
                sections: initialData.sections as any,
            });

            // Re-detect global audio url from parts
            const allAudios = (initialData.sections || [])
                .flatMap((s: any) => s.listeningParts || [])
                .map((p: any) => p.audioUrl);
            if (allAudios.length > 1 && allAudios.every((a: string) => a === allAudios[0] && a !== '')) {
                setGlobalAudioUrl(allAudios[0]);
            } else {
                setGlobalAudioUrl(null);
            }
        } else if (open && !initialData) {
            setForm({
                title: '', description: '', durationMinutes: 60, totalPoints: 0,
                examType: 'IELTS', isPublished: false, sections: [emptySection('Reading')]
            });
            setGlobalAudioUrl(null);
        }
    }, [open, initialData]);

    const updateForm = (partial: Partial<CreateExamDto>) => setForm(prev => ({ ...prev, ...partial }));

    const updateSection = (sIdx: number, partial: Partial<CreateSectionDto>) => {
        setForm(prev => ({
            ...prev,
            sections: prev.sections.map((s, i) => (i === sIdx ? { ...s, ...partial } : s)),
        }));
    };

    const handleAddSection = (skill: SkillType) => {
        setForm(prev => ({
            ...prev,
            sections: [...prev.sections, { ...emptySection(skill), orderIndex: prev.sections.length }],
        }));
    };

    const handleSubmit = async () => {
        if (!form.title.trim()) { message.warning('Vui lòng nhập tên đề thi!'); return; }
        try {
            if (isEdit && initialData) {
                await updateMutation.mutateAsync({ id: initialData.id, data: form });
                message.success('Cập nhật đề thi thành công!');
            } else {
                await createMutation.mutateAsync(form);
                message.success('Tạo đề thi thành công!');
            }
            onClose();
        } catch {
            message.error(isEdit ? 'Cập nhật đề thi thất bại!' : 'Tạo đề thi thất bại!');
        }
    };

    const handleUploadFile = async (file: File, type: 'image' | 'video' | 'raw' | 'auto') => {
        setUploading(true);
        try {
            const url = await uploadToCloudinary(file, type);
            message.success('Upload thành công!');
            return url;
        } catch {
            message.error('Upload thất bại!');
            return '';
        } finally {
            setUploading(false);
        }
    };

    const renderReadingSection = (section: CreateSectionDto, sIdx: number) => {
        const passages = section.readingPassages ?? [];
        let currentQNum = 1;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {passages.map((passage, pIdx) => (
                    <div key={pIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, color: SKILL_COLORS.Reading }}>Passage {pIdx + 1}</span>
                            {passages.length > 1 && (
                                <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                    onClick={() => updateSection(sIdx, { readingPassages: passages.filter((_, i) => i !== pIdx) })} />
                            )}
                        </div>
                        <Input value={passage.title ?? ''} placeholder="Tiêu đề Passage"
                            onChange={e => {
                                const updated = [...passages];
                                updated[pIdx] = { ...passage, title: e.target.value };
                                updateSection(sIdx, { readingPassages: updated });
                            }} size="small" style={{ marginBottom: '8px' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b' }}>Nội dung bài đọc (Paragraphs) *</label>
                            <Button
                                size="small"
                                icon={<BoldOutlined />}
                                onMouseDown={e => {
                                    e.preventDefault();
                                    const el = document.activeElement as HTMLTextAreaElement;
                                    if (!el || el.tagName !== 'TEXTAREA') return;
                                    const start = el.selectionStart;
                                    const end = el.selectionEnd;
                                    const text = el.value;
                                    const selected = text.substring(start, end);
                                    if (selected) {
                                        const newVal = text.substring(0, start) + `**${selected}**` + text.substring(end);
                                        const updated = [...passages];
                                        updated[pIdx] = { ...passage, paragraphsData: newVal };
                                        updateSection(sIdx, { readingPassages: updated });
                                    }
                                }}
                            >
                                In đậm
                            </Button>
                        </div>
                        <Input.TextArea value={passage.paragraphsData ?? ''} placeholder="Nội dung chi tiết của bài đọc..."
                            autoSize={{ minRows: 8, maxRows: 20 }} size="small" style={{ marginBottom: '10px' }}
                            onPaste={(e) => {
                                e.preventDefault();
                                const text = e.clipboardData.getData('text');
                                if (!text) return;

                                const cleaned = cleanUpText(text);

                                // Insert at cursor position
                                const target = e.target as HTMLTextAreaElement;
                                const start = target.selectionStart;
                                const end = target.selectionEnd;
                                const currentVal = passage.paragraphsData || '';
                                const newVal = currentVal.substring(0, start) + cleaned + currentVal.substring(end);

                                const updated = [...passages];
                                updated[pIdx] = { ...passage, paragraphsData: newVal };
                                updateSection(sIdx, { readingPassages: updated });
                                message.info('Văn bản đã được tự động dàn lại trang');
                            }}
                            onChange={e => {
                                const updated = [...passages];
                                updated[pIdx] = { ...passage, paragraphsData: e.target.value };
                                updateSection(sIdx, { readingPassages: updated });
                            }} />
                        {(() => {
                            const startOfPassage = currentQNum;
                            const questionsInPassage = passage.questionGroups.reduce((acc: number, g: CreateQuestionGroupDto) => acc + g.questions.length, 0);
                            const result = renderQuestionGroups(passage.questionGroups, 'Reading', (groups) => {
                                const updated = [...passages];
                                updated[pIdx] = { ...passage, questionGroups: groups };

                                // Auto re-index everything in Reading section
                                let qNum = 1;
                                const reindexedPassages = updated.map(p => {
                                    const newGroups = reorderQuestionNumbers(p.questionGroups, qNum);
                                    qNum += newGroups.reduce((acc: number, g: CreateQuestionGroupDto) => acc + (g.questions?.length || 0), 0);
                                    return { ...p, questionGroups: newGroups };
                                });

                                updateSection(sIdx, { readingPassages: reindexedPassages });
                            }, startOfPassage);
                            currentQNum += questionsInPassage;
                            return result;
                        })()}
                    </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} block
                    onClick={() => {
                        const updated = [...passages, { ...emptyPassage(), passageNumber: passages.length + 1 }];
                        updateSection(sIdx, { readingPassages: updated });
                    }}>
                    Thêm Passage
                </Button>
            </div>
        );
    };

    const renderListeningSection = (section: CreateSectionDto, sIdx: number) => {
        const parts = section.listeningParts ?? [];
        let currentQNum = 1;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {parts.map((part, pIdx) => (
                    <div key={pIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, color: SKILL_COLORS.Listening }}>Part {pIdx + 1}</span>
                            {parts.length > 1 && (
                                <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                    onClick={() => updateSection(sIdx, { listeningParts: parts.filter((_, i) => i !== pIdx) })} />
                            )}
                        </div>
                        <div style={{ padding: '12px', background: '#eef2ff', borderRadius: '8px', border: '1px dashed #6366f1', marginBottom: '10px' }}>
                            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#3730a3', marginBottom: '6px' }}>
                                <SoundOutlined /> Audio
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                                <Upload accept="audio/*" maxCount={1} showUploadList={false}
                                    disabled={globalAudioUrl !== null && pIdx !== 0}
                                    beforeUpload={async (file) => {
                                        const url = await handleUploadFile(file, 'video');
                                        if (url) {
                                            if (globalAudioUrl !== null) {
                                                setGlobalAudioUrl(url);
                                                const updated = parts.map(p => ({ ...p, audioUrl: url }));
                                                updateSection(sIdx, { listeningParts: updated });
                                            } else {
                                                const updated = [...parts];
                                                updated[pIdx] = { ...part, audioUrl: url };
                                                updateSection(sIdx, { listeningParts: updated });
                                            }
                                        }
                                        return false;
                                    }}>
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
                                    placeholder={pIdx === 0 ? "Chưa có file audio nào" : "Dùng chung audio với Part 1"}
                                    size="small"
                                    style={{ flex: 1, background: '#f8fafc', color: '#475569' }}
                                    suffix={(globalAudioUrl || part.audioUrl) && !(globalAudioUrl !== null && pIdx !== 0) ? (
                                        <CloseOutlined
                                            style={{ color: '#ef4444', cursor: 'pointer' }}
                                            onClick={() => {
                                                if (globalAudioUrl !== null) {
                                                    setGlobalAudioUrl('');
                                                    const updated = parts.map(p => ({ ...p, audioUrl: '' }));
                                                    updateSection(sIdx, { listeningParts: updated });
                                                } else {
                                                    const updated = [...parts];
                                                    updated[pIdx] = { ...part, audioUrl: '' };
                                                    updateSection(sIdx, { listeningParts: updated });
                                                }
                                            }}
                                        />
                                    ) : null}
                                />
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                {globalAudioUrl === null && parts.length > 1 && part.audioUrl && (
                                    <Button size="small" type="link" onClick={() => {
                                        setGlobalAudioUrl(part.audioUrl);
                                        const updated = parts.map(p => ({ ...p, audioUrl: part.audioUrl }));
                                        updateSection(sIdx, { listeningParts: updated });
                                        message.success('Đã bật chế độ Audio chung cho đề thi!');
                                    }}>
                                        Áp dụng cho tất cả Parts
                                    </Button>
                                )}

                                {globalAudioUrl !== null && pIdx === 0 && (
                                    <Button size="small" type="link" danger onClick={() => {
                                        setGlobalAudioUrl(null);
                                        message.info('Đã tắt chế độ Audio chung. Bạn có thể chỉnh audio riêng cho từng part.');
                                    }}>
                                        Tắt Audio chung
                                    </Button>
                                )}
                            </div>
                        </div>
                        <Input.TextArea value={part.contextDescription ?? ''} placeholder="Mô tả context / transcript..."
                            autoSize={{ minRows: 3, maxRows: 10 }} style={{ marginBottom: '12px' }}
                            onChange={e => {
                                const updated = [...parts];
                                updated[pIdx] = { ...part, contextDescription: e.target.value };
                                updateSection(sIdx, { listeningParts: updated });
                            }} />
                        {(() => {
                            const startOfPart = currentQNum;
                            // Pre-calculate questions in this part to update global currentQNum
                            const questionsInPart = part.questionGroups.reduce((acc: number, g: CreateQuestionGroupDto) => acc + g.questions.length, 0);
                            const result = renderQuestionGroups(part.questionGroups, 'Listening', (groups) => {
                                const updated = [...parts];
                                updated[pIdx] = { ...part, questionGroups: groups };

                                // Auto re-index everything in Listening section
                                let qNum = 1;
                                const reindexedParts = updated.map(p => {
                                    const newGroups = reorderQuestionNumbers(p.questionGroups, qNum);
                                    qNum += newGroups.reduce((acc: number, g: CreateQuestionGroupDto) => acc + (g.questions?.length || 0), 0);
                                    return { ...p, questionGroups: newGroups };
                                });

                                updateSection(sIdx, { listeningParts: reindexedParts });
                            }, startOfPart);
                            currentQNum += questionsInPart;
                            return result;
                        })()}
                    </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} block
                    onClick={() => {
                        const newPart = { ...emptyListeningPart(), partNumber: parts.length + 1 };
                        if (globalAudioUrl) newPart.audioUrl = globalAudioUrl;
                        updateSection(sIdx, { listeningParts: [...parts, newPart] });
                    }}>
                    Thêm Part
                </Button>
            </div>
        );
    };

    const renderWritingSection = (section: CreateSectionDto, sIdx: number) => {
        const tasks = section.writingTasks ?? [];
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {tasks.map((task, tIdx) => (
                    <div key={tIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, color: SKILL_COLORS.Writing }}>Task {task.taskNumber ?? tIdx + 1}</span>
                            {tasks.length > 1 && (
                                <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                    onClick={() => updateSection(sIdx, { writingTasks: tasks.filter((_, i) => i !== tIdx) })} />
                            )}
                        </div>
                        <Input.TextArea value={task.promptText} placeholder="Đề bài Writing (mô tả task, yêu cầu...)"
                            autoSize={{ minRows: 4, maxRows: 15 }} style={{ marginBottom: '10px' }}
                            onChange={e => {
                                const updated = [...tasks];
                                updated[tIdx] = { ...task, promptText: e.target.value };
                                updateSection(sIdx, { writingTasks: updated });
                            }} />
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Số từ tối thiểu:</span>
                            <InputNumber value={task.minWords} min={50} max={500}
                                onChange={v => {
                                    const updated = [...tasks];
                                    updated[tIdx] = { ...task, minWords: v ?? 150 };
                                    updateSection(sIdx, { writingTasks: updated });
                                }} size="small" style={{ width: 90 }} />
                        </div>
                        {(task.taskNumber === 1 || tIdx === 0) && (
                            <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '8px', border: '1px dashed #f59e0b' }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                    <PictureOutlined /> Hình ảnh Task 1
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <Upload accept="image/*" maxCount={1} showUploadList={false}
                                        beforeUpload={async (file) => {
                                            const url = await handleUploadFile(file, 'image');
                                            if (url) {
                                                const updated = [...tasks];
                                                updated[tIdx] = { ...task, assetsData: url };
                                                updateSection(sIdx, { writingTasks: updated });
                                            }
                                            return false;
                                        }}>
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
                                                    const updated = [...tasks];
                                                    updated[tIdx] = { ...task, assetsData: '' };
                                                    updateSection(sIdx, { writingTasks: updated });
                                                }}
                                            />
                                        ) : null}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} block
                    onClick={() => updateSection(sIdx, { writingTasks: [...tasks, emptyWritingTask(tasks.length + 1)] })}>
                    Thêm Task
                </Button>
            </div>
        );
    };

    const renderSpeakingSection = (section: CreateSectionDto, sIdx: number) => {
        const parts = section.speakingParts ?? [];
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {parts.map((part, pIdx) => (
                    <div key={pIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, color: SKILL_COLORS.Speaking }}>Part {part.partNumber ?? pIdx + 1}</span>
                            {parts.length > 1 && (
                                <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                    onClick={() => updateSection(sIdx, { speakingParts: parts.filter((_, i) => i !== pIdx) })} />
                            )}
                        </div>
                        <Input.TextArea value={part.description ?? ''} placeholder="Mô tả chủ đề Part..."
                            autoSize={{ minRows: 2, maxRows: 6 }} style={{ marginBottom: '10px' }}
                            onChange={e => {
                                const updated = [...parts];
                                updated[pIdx] = { ...part, description: e.target.value };
                                updateSection(sIdx, { speakingParts: updated });
                            }} />
                        {part.questions.map((sq, sqIdx) => (
                            <div key={sqIdx} style={{ padding: '10px', background: '#fef2f2', borderRadius: '8px', marginBottom: '8px', border: '1px solid #fecaca' }}>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '6px' }}>
                                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#991b1b' }}>Q{sqIdx + 1}</span>
                                    {part.questions.length > 1 && (
                                        <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                            onClick={() => {
                                                const updated = [...parts];
                                                updated[pIdx] = { ...part, questions: part.questions.filter((_, i) => i !== sqIdx) };
                                                updateSection(sIdx, { speakingParts: updated });
                                            }} />
                                    )}
                                </div>
                                <Input.TextArea value={sq.content} placeholder="Câu hỏi Speaking..."
                                    autoSize={{ minRows: 2, maxRows: 5 }}
                                    onChange={e => {
                                        const updated = [...parts];
                                        const qs = [...part.questions];
                                        qs[sqIdx] = { ...sq, content: e.target.value };
                                        updated[pIdx] = { ...part, questions: qs };
                                        updateSection(sIdx, { speakingParts: updated });
                                    }} />
                                {(part.partNumber === 2) && (
                                    <Input.TextArea value={sq.cueCardPoints ?? ''} placeholder="Cue Card gợi ý..."
                                        autoSize={{ minRows: 2, maxRows: 5 }} style={{ marginTop: '6px' }}
                                        onChange={e => {
                                            const updated = [...parts];
                                            const qs = [...part.questions];
                                            qs[sqIdx] = { ...sq, cueCardPoints: e.target.value };
                                            updated[pIdx] = { ...part, questions: qs };
                                            updateSection(sIdx, { speakingParts: updated });
                                        }} />
                                )}
                            </div>
                        ))}
                        <Button type="dashed" size="small" icon={<PlusOutlined />} block
                            onClick={() => {
                                const updated = [...parts];
                                updated[pIdx] = { ...part, questions: [...part.questions, { ...emptySpeakingQuestion(), orderIndex: part.questions.length }] };
                                updateSection(sIdx, { speakingParts: updated });
                            }}>
                            Thêm câu hỏi
                        </Button>
                    </div>
                ))}
                <Button type="dashed" icon={<PlusOutlined />} block
                    onClick={() => updateSection(sIdx, { speakingParts: [...parts, emptySpeakingPart(parts.length + 1)] })}>
                    Thêm Part
                </Button>
            </div>
        );
    };

    const renderQuestionGroups = (
        groups: CreateQuestionGroupDto[],
        skill: 'Reading' | 'Listening',
        onUpdate: (groups: CreateQuestionGroupDto[]) => void,
        startQNum: number = 1
    ) => {
        const typeOptions = GROUP_TYPE_OPTIONS[skill] ?? [];
        let runningQNum = startQNum;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {groups.map((group, fIdx) => {
                    const gIdx = fIdx;
                    runningQNum += group.questions.length;
                    const isComplexLayout = [
                        'TABLE_COMPLETION', 'MATCHING_TABLE', 'NOTE_COMPLETION', 'FORM_COMPLETION', 'MAP_LABELLING', 'DIAGRAM_LABELLING',
                        'SUMMARY_COMPLETION', 'SENTENCE_COMPLETION', 'FLOWCHART_COMPLETION'
                    ].includes(group.groupType ?? '');
                    const isMatchingType = MATCHING_TYPES.has(group.groupType ?? '');
                    const isSummaryType = group.groupType === 'SUMMARY_COMPLETION';
                    const isTableType = ['TABLE_COMPLETION', 'MATCHING_TABLE'].includes(group.groupType ?? '');
                    const showOptionsBox = isMatchingType || isSummaryType;

                    // Auto-sync questions array based on [Qx] in contentData
                    const handleContentChange = (newContent: string) => {
                        const regex = /\[Q(\d+)\]/g;
                        let match;
                        const foundNumbers = new Set<number>();
                        while ((match = regex.exec(newContent)) !== null) {
                            foundNumbers.add(parseInt(match[1], 10));
                        }
                        const sortedNumbers = Array.from(foundNumbers).sort((a, b) => a - b);

                        const newQs = sortedNumbers.map(num => {
                            const existing = group.questions.find(q => q.questionNumber === num);
                            return existing || { ...emptyQuestion(), questionNumber: num };
                        });

                        const updated = [...groups];
                        updated[gIdx] = { ...group, contentData: newContent, questions: newQs };
                        onUpdate(updated);
                    };

                    const insertBlankAtCursor = () => {
                        const nextQNum = runningQNum;
                        const el = document.activeElement as HTMLTextAreaElement;
                        const currentContent = group.contentData || '';

                        // More robust check: check if it's a textarea and has our specific placeholder hint
                        if (el && el.tagName === 'TEXTAREA' && (el.placeholder.includes('Ví dụ') || el.placeholder.includes('Template'))) {
                            const start = el.selectionStart;
                            const end = el.selectionEnd;
                            // Use the element's value directly to be safe with selection offsets
                            const val = el.value;
                            const newVal = val.substring(0, start) + `[Q${nextQNum}]` + val.substring(end);
                            handleContentChange(newVal);

                            // Optional: set cursor after the inserted [Qx]
                            setTimeout(() => {
                                el.focus();
                                const newPos = start + `[Q${nextQNum}]`.length;
                                el.setSelectionRange(newPos, newPos);
                            }, 10);
                        } else {
                            handleContentChange(currentContent + ` [Q${nextQNum}] `);
                        }
                    };
                    return (
                        <div key={gIdx} style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', border: '1px solid #e2e8f0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: SKILL_COLORS[skill] }}>
                                    Nhóm câu hỏi {gIdx + 1}
                                </span>
                                {groups.length > 1 && (
                                    <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                        onClick={() => onUpdate(groups.filter((_, i) => i !== gIdx))} />
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                <Select value={group.groupType} style={{ minWidth: 200, flex: 1 }} size="small"
                                    options={typeOptions}
                                    placeholder="Chọn dạng bài..."
                                    onChange={v => {
                                        const updated = [...groups];
                                        updated[gIdx] = { ...group, groupType: v, questions: group.questions.map(q => ({ ...q, options: getOptionsForType(v) })) };
                                        onUpdate(updated);
                                    }} />
                            </div>
                            <Input.TextArea value={group.instruction ?? ''} placeholder="Instruction / hướng dẫn nhóm câu hỏi"
                                autoSize={{ minRows: 1, maxRows: 3 }} size="small" style={{ marginBottom: '8px' }}
                                onPaste={e => {
                                    e.preventDefault();
                                    const text = e.clipboardData.getData('text');
                                    if (!text) return;
                                    const cleaned = cleanUpText(text);
                                    const target = e.target as HTMLTextAreaElement;
                                    const start = target.selectionStart;
                                    const end = target.selectionEnd;
                                    const currentVal = group.instruction || '';
                                    const newVal = currentVal.substring(0, start) + cleaned + currentVal.substring(end);
                                    const updated = [...groups];
                                    updated[gIdx] = { ...group, instruction: newVal };
                                    onUpdate(updated);
                                }}
                                onChange={e => {
                                    const updated = [...groups];
                                    updated[gIdx] = { ...group, instruction: e.target.value };
                                    onUpdate(updated);
                                }} />

                            {isComplexLayout && (
                                <div style={{ border: '1px solid #d9d9d9', borderRadius: '6px', padding: '10px', background: '#fff', marginBottom: '10px' }}>
                                    {isTableType ? (
                                        <GenericTableEditor
                                            contentData={group.contentData}
                                            onChange={handleContentChange}
                                            nextQNum={runningQNum}
                                        />
                                    ) : (
                                        <>
                                            <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '0.8125rem' }}>Khung Template Bài Tập (HTML/Text)</div>
                                            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                <Button size="small" type="primary" onMouseDown={e => {
                                                    e.preventDefault();
                                                    insertBlankAtCursor();
                                                }}>
                                                    Thêm chỗ trống [Qx]
                                                </Button>
                                                <Button
                                                    size="small"
                                                    icon={<BoldOutlined />}
                                                    onMouseDown={e => {
                                                        e.preventDefault();
                                                        const el = document.activeElement as HTMLTextAreaElement;
                                                        if (!el || el.tagName !== 'TEXTAREA') return;
                                                        const start = el.selectionStart;
                                                        const end = el.selectionEnd;
                                                        const text = el.value;
                                                        const selected = text.substring(start, end);
                                                        const newText = selected
                                                            ? text.substring(0, start) + `**${selected}**` + text.substring(end)
                                                            : text + ' ****';
                                                        handleContentChange(newText);
                                                    }}
                                                >
                                                    In đậm
                                                </Button>
                                            </div>
                                            <Input.TextArea value={group.contentData ?? ''} placeholder={`Ví dụ: <p>Name: [Q1]</p>\n<p>Age: [Q2]</p>`}
                                                autoSize={{ minRows: 8, maxRows: 15 }} size="small" style={{ marginBottom: '8px', fontFamily: 'monospace' }}
                                                onPaste={e => {
                                                    e.preventDefault();
                                                    const text = e.clipboardData.getData('text');
                                                    if (!text) return;
                                                    const cleaned = cleanUpText(text);
                                                    const target = e.target as HTMLTextAreaElement;
                                                    const start = target.selectionStart;
                                                    const end = target.selectionEnd;
                                                    const currentVal = group.contentData || '';
                                                    const newVal = currentVal.substring(0, start) + cleaned + currentVal.substring(end);
                                                    handleContentChange(newVal);
                                                    message.info('Đã tự động dọn dẹp văn bản dán vào');
                                                }}
                                                onChange={e => handleContentChange(e.target.value)} />
                                        </>
                                    )}


                                    <div style={{ fontWeight: 600, marginBottom: '6px', fontSize: '0.8125rem', color: '#64748b' }}>Ảnh minh họa / Bản đồ / Sơ đồ</div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <Upload accept="image/*" maxCount={1} showUploadList={false}
                                            beforeUpload={async (file) => {
                                                const url = await handleUploadFile(file, 'image');
                                                if (url) {
                                                    const updated = [...groups];
                                                    updated[gIdx] = { ...group, assetsData: url };
                                                    onUpdate(updated);
                                                }
                                                return false;
                                            }}>
                                            <Button
                                                type="primary"
                                                icon={<PictureOutlined />}
                                                size="small"
                                                loading={uploading}
                                                style={{ background: '#0ea5e9', borderColor: '#0ea5e9' }}
                                            >
                                                Tải ảnh lên
                                            </Button>
                                        </Upload>
                                        <Input
                                            value={group.assetsData ?? ''}
                                            placeholder="Chưa có ảnh nào được tải lên"
                                            readOnly
                                            size="small"
                                            style={{ flex: 1, background: '#f8fafc', color: '#64748b' }}
                                            suffix={group.assetsData ? (
                                                <CloseOutlined
                                                    style={{ color: '#ef4444', cursor: 'pointer' }}
                                                    onClick={() => {
                                                        const updated = [...groups];
                                                        updated[gIdx] = { ...group, assetsData: '' };
                                                        onUpdate(updated);
                                                    }}
                                                />
                                            ) : null}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Layout-specific components (Matching, Table, Summary Box, etc.) */}
                            {(isMatchingType || isComplexLayout) && (
                                <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', background: '#f0f9ff', padding: '12px', borderRadius: '12px', marginTop: '10px', border: '1px solid #bae6fd', flexDirection: (isComplexLayout && !isMatchingType && !isSummaryType) ? 'column' : 'row', flexWrap: 'wrap' }}>

                                    {/* Left Side: Questions or Answer Declaration */}
                                    <div style={{ flex: isSummaryType || isMatchingType ? 7 : 1, minWidth: '300px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        {isComplexLayout ? (
                                            <>
                                                <div style={{ fontWeight: 600, color: '#0369a1', fontSize: '0.8125rem' }}>1. Khai báo đáp án (Tương quan với các ô trống [Qx])</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                                                    {group.questions.map((q, qIdx) => (
                                                        <div key={q.questionNumber} style={{ background: '#fff', padding: '10px', borderRadius: '8px', border: '1px solid #bae6fd', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <span style={{ fontWeight: 'bold', fontSize: '0.8125rem', minWidth: '35px' }}>Q{q.questionNumber}:</span>
                                                            {group.questions[0]?.options?.length > 0 ? (
                                                                <Select size="small" style={{ flex: 1 }} value={q.correctAnswer} placeholder="Chọn A-Z"
                                                                    options={(group.questions[0]?.options || []).map((_, i) => ({ label: String.fromCharCode(65 + i), value: String.fromCharCode(65 + i) }))}
                                                                    onChange={v => {
                                                                        const updated = [...groups];
                                                                        updated[gIdx].questions[qIdx] = { ...q, correctAnswer: v };
                                                                        onUpdate(updated);
                                                                    }} />
                                                            ) : (
                                                                <Input size="small" placeholder="Đáp án (vd|vd2)..." value={q.correctAnswer ?? ''} style={{ flex: 1, borderColor: '#10b981' }} onChange={e => {
                                                                    const updated = [...groups];
                                                                    updated[gIdx].questions[qIdx] = { ...q, correctAnswer: e.target.value };
                                                                    onUpdate(updated);
                                                                }} />
                                                            )}
                                                            <InputNumber size="small" value={q.points} min={1} style={{ width: '55px' }} onChange={v => {
                                                                const updated = [...groups];
                                                                updated[gIdx].questions[qIdx] = { ...q, points: v ?? 1 };
                                                                onUpdate(updated);
                                                            }} />
                                                        </div>
                                                    ))}
                                                    {group.questions.length === 0 && <span style={{ color: '#64748b', fontSize: '0.8125rem' }}>Chưa có ô trống nào.</span>}
                                                </div>
                                            </>
                                        ) : isMatchingType ? (
                                            <>
                                                <div style={{ fontWeight: 600, color: '#0369a1', fontSize: '0.8125rem' }}>1. Danh sách Items cần match (Bên trái)</div>
                                                {group.questions.map((q, qIdx) => (
                                                    <div key={q.questionNumber || qIdx} style={{ background: '#fff', padding: '8px', borderRadius: '8px', border: '1px solid #bae6fd', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: 'bold', fontSize: '0.8125rem', minWidth: '35px' }}>Q{q.questionNumber}:</span>
                                                        <Input size="small" placeholder="Ví dụ: Simon, Liz..." value={q.content ?? ''} style={{ flex: 1 }} onChange={e => {
                                                            const updated = [...groups];
                                                            updated[gIdx].questions[qIdx] = { ...q, content: e.target.value };
                                                            onUpdate(updated);
                                                        }} />
                                                        <Input size="small" placeholder="Đáp án (A-Z)" value={q.correctAnswer ?? ''} style={{ width: '100px', borderColor: '#10b981' }} onChange={e => {
                                                            const updated = [...groups];
                                                            updated[gIdx].questions[qIdx] = { ...q, correctAnswer: e.target.value };
                                                            onUpdate(updated);
                                                        }} />
                                                        <InputNumber size="small" value={q.points} min={1} style={{ width: '55px' }} onChange={v => {
                                                            const updated = [...groups];
                                                            updated[gIdx].questions[qIdx] = { ...q, points: v || 1 };
                                                            onUpdate(updated);
                                                        }} />
                                                        <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                                            onClick={() => {
                                                                const updated = [...groups];
                                                                updated[gIdx] = { ...group, questions: group.questions.filter((_, i) => i !== qIdx) };
                                                                onUpdate(updated);
                                                            }} />
                                                    </div>
                                                ))}
                                                <Button type="dashed" size="small" icon={<PlusOutlined />} block onClick={() => {
                                                    const updated = [...groups];
                                                    const newQ = { ...emptyQuestion(), questionNumber: runningQNum, options: group.questions[0]?.options || [] };
                                                    updated[gIdx] = { ...group, questions: [...group.questions, newQ] };
                                                    onUpdate(updated);
                                                }}>Thêm Item</Button>
                                            </>
                                        ) : null}
                                    </div>

                                    {/* Right Side: Shared Options Box */}
                                    {showOptionsBox && (
                                        <div style={{ flex: 4, minWidth: '250px', background: '#fff', border: '2px solid #bae6fd', borderRadius: '12px', padding: '12px', alignSelf: 'stretch' }}>
                                            <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '10px', fontSize: '0.8125rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span>{isSummaryType ? 'DANH SÁCH TỪ VỰNG (BOX)' : '2. DANH SÁCH OPTIONS CHUNG'}</span>
                                                <Tag color="blue">{group.questions[0]?.options?.length || 0} mục</Tag>
                                            </div>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {(group.questions[0]?.options || []).map((opt, oIdx) => (
                                                    <div key={oIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        <b style={{ color: '#0ea5e9', width: '20px', textAlign: 'center' }}>{String.fromCharCode(65 + oIdx)}</b>
                                                        <Input size="small" value={opt.optionText} placeholder="Nội dung..." style={{ flex: 1 }}
                                                            onChange={e => {
                                                                const updated = [...groups];
                                                                const newOpts = [...(group.questions[0]?.options || [])];
                                                                newOpts[oIdx] = { ...opt, optionText: e.target.value };
                                                                updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                                onUpdate(updated);
                                                            }} />
                                                        <Button type="text" danger icon={<MinusCircleOutlined />} size="small" onClick={() => {
                                                            const updated = [...groups];
                                                            const newOpts = (group.questions[0]?.options || []).filter((_, i) => i !== oIdx);
                                                            updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                            onUpdate(updated);
                                                        }} />
                                                    </div>
                                                ))}
                                                <Button type="dashed" size="small" icon={<PlusOutlined />} block onClick={() => {
                                                    const updated = [...groups];
                                                    const newOpts = [...(group.questions[0]?.options || []), emptyOption(group.questions[0]?.options?.length || 0)];
                                                    updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                    onUpdate(updated);
                                                }}>Thêm lựa chọn (A, B, C...)</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Standard Question List (for non-complex non-matching types) */}
                            {!isComplexLayout && !isMatchingType && (
                                <div style={{ marginTop: '10px' }}>
                                    {group.questions.map((q, qIdx) => renderQuestion(q, qIdx, group, gIdx, groups, onUpdate))}
                                    <Button type="dashed" icon={<PlusOutlined />} block size="small" style={{ marginTop: '8px' }}
                                        onClick={() => {
                                            const updated = [...groups];
                                            const newQ = { ...emptyQuestion(), questionNumber: runningQNum, options: getOptionsForType(group.groupType) };
                                            updated[gIdx] = { ...group, questions: [...group.questions, newQ] };
                                            onUpdate(updated);
                                        }}>Thêm câu hỏi</Button>
                                </div>
                            )}
                        </div>
                    );
                })}
                <Button type="dashed" size="small" icon={<PlusOutlined />} block
                    onClick={() => onUpdate([...groups, emptyGroup()])}>
                    Thêm nhóm câu hỏi
                </Button>
            </div>
        );
    };

    const getOptionsForType = (groupType?: string): CreateQuestionOptionDto[] => {
        if (!groupType) return [];
        if (groupType === QUESTION_TYPES.TFNG) return TFNG_OPTIONS.map(o => ({ ...o }));
        if (groupType === QUESTION_TYPES.YNNG) return YNNG_OPTIONS.map(o => ({ ...o }));
        if (groupType === QUESTION_TYPES.MATCHING_TABLE || MATCHING_TYPES.has(groupType))
            return [emptyOption(0), emptyOption(1), emptyOption(2), emptyOption(3)];
        if (SINGLE_CHOICE_TYPES.has(groupType) || MULTI_CHOICE_TYPES.has(groupType))
            return [emptyOption(0), emptyOption(1), emptyOption(2), emptyOption(3)];
        return [];
    };

    const renderQuestion = (
        q: CreateQuestionDto, qIdx: number,
        group: CreateQuestionGroupDto, gIdx: number,
        groups: CreateQuestionGroupDto[],
        onUpdate: (groups: CreateQuestionGroupDto[]) => void,
    ) => {
        const gType = group.groupType ?? '';
        const hasOpts = SINGLE_CHOICE_TYPES.has(gType) || MULTI_CHOICE_TYPES.has(gType) || MATCHING_TYPES.has(gType);
        const isFill = FILL_TYPES.has(gType) || gType === QUESTION_TYPES.SUMMARY_COMPLETION;
        const isTFNG = gType === QUESTION_TYPES.TFNG || gType === QUESTION_TYPES.YNNG;

        const updateQ = (partial: Partial<CreateQuestionDto>) => {
            const updated = [...groups];
            const qs = [...group.questions];
            qs[qIdx] = { ...q, ...partial };
            updated[gIdx] = { ...group, questions: qs };
            onUpdate(updated);
        };

        return (
            <div key={qIdx} style={{ padding: '10px', background: '#fff', borderRadius: '8px', marginBottom: '6px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', minWidth: 45 }}>Câu {q.questionNumber || qIdx + 1}</span>
                    <InputNumber value={q.points} min={0} size="small" style={{ width: 70 }} placeholder="Điểm"
                        onChange={v => updateQ({ points: v ?? 1 })} />
                    {group.questions.length > 1 && (
                        <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                            onClick={() => {
                                const updated = [...groups];
                                updated[gIdx] = { ...group, questions: group.questions.filter((_, i) => i !== qIdx) };
                                onUpdate(updated);
                            }} />
                    )}
                </div>
                <Input.TextArea value={q.content ?? ''} placeholder={isFill ? 'Nội dung (dùng ___ cho chỗ trống)' : 'Nội dung câu hỏi'}
                    autoSize={{ minRows: 1, maxRows: 4 }} size="small" style={{ marginBottom: '6px' }}
                    onChange={e => updateQ({ content: e.target.value })} />

                {isFill && (
                    <Input value={q.correctAnswer ?? ''} placeholder="Đáp án đúng (dùng | phân cách nhiều đáp án)"
                        size="small" style={{ borderColor: '#10b981', marginBottom: '4px' }}
                        onChange={e => updateQ({ correctAnswer: e.target.value })} />
                )}

                {hasOpts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {q.options.map((opt, oIdx) => (
                            <div key={oIdx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                <input type="checkbox" checked={opt.isCorrect}
                                    onChange={e => {
                                        const isChecked = e.target.checked;
                                        let opts = [...q.options];
                                        if (SINGLE_CHOICE_TYPES.has(gType)) {
                                            // Radio behavior: only one can be correct
                                            opts = opts.map((o, idx) => ({ ...o, isCorrect: idx === oIdx ? isChecked : false }));
                                        } else {
                                            opts[oIdx] = { ...opt, isCorrect: isChecked };
                                        }
                                        updateQ({ options: opts });
                                    }} />
                                <Input value={opt.optionText} disabled={isTFNG}
                                    placeholder={isTFNG ? opt.optionText : `Lựa chọn ${String.fromCharCode(65 + oIdx)}`}
                                    size="small" style={{ flex: 1 }}
                                    onChange={e => {
                                        const opts = [...q.options];
                                        opts[oIdx] = { ...opt, optionText: e.target.value };
                                        updateQ({ options: opts });
                                    }} />
                                {!isTFNG && q.options.length > 1 && (
                                    <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                        onClick={() => updateQ({ options: q.options.filter((_, i) => i !== oIdx) })} />
                                )}
                            </div>
                        ))}
                        {!isTFNG && (
                            <Button type="dashed" size="small" icon={<PlusOutlined />} style={{ marginTop: '2px' }}
                                onClick={() => updateQ({ options: [...q.options, emptyOption(q.options.length)] })}>
                                Thêm lựa chọn
                            </Button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderSectionContent = (section: CreateSectionDto, sIdx: number) => {
        const skill = section.skillType as SkillType;
        switch (skill) {
            case 'Reading': return renderReadingSection(section, sIdx);
            case 'Listening': return renderListeningSection(section, sIdx);
            case 'Writing': return renderWritingSection(section, sIdx);
            case 'Speaking': return renderSpeakingSection(section, sIdx);
            default: return null;
        }
    };

    return (
        <Modal
            title={isEdit ? "Chỉnh sửa đề thi" : "Tạo đề thi mới"}
            open={open}
            onCancel={onClose}
            width={1100}
            footer={[
                <Button key="back" onClick={onClose}>Hủy</Button>,
                <Button key="submit" type="primary" loading={createMutation.isPending || updateMutation.isPending} onClick={handleSubmit}
                    style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', border: 'none' }}>
                    {isEdit ? "Cập nhật đề thi" : "Lưu đề thi"}
                </Button>
            ]}
            centered
            styles={{ body: { padding: '24px 0', background: '#f8fafc' } }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto', padding: '4px 24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>Tên đề thi *</label>
                        <Input value={form.title} onChange={e => updateForm({ title: e.target.value })} placeholder="VD: IELTS Mock Test 2026" />
                    </div>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>Loại đề</label>
                        <Select value={form.examType} onChange={v => updateForm({ examType: v })} style={{ width: '100%' }}
                            options={[{ label: 'IELTS', value: 'IELTS' }, { label: 'TOEIC', value: 'TOEIC' }]} />
                    </div>
                </div>
                <Input.TextArea value={form.description} onChange={e => updateForm({ description: e.target.value })}
                    placeholder="Mô tả đề thi..." autoSize={{ minRows: 2, maxRows: 4 }} />
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155' }}>Thời gian (phút)</label>
                        <InputNumber value={form.durationMinutes} onChange={v => updateForm({ durationMinutes: v ?? 60 })} min={1} style={{ width: '100%' }} />
                    </div>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155' }}>Tổng điểm</label>
                        <InputNumber value={form.totalPoints} onChange={v => updateForm({ totalPoints: v ?? 0 })} min={0} style={{ width: '100%' }} />
                    </div>
                </div>

                <Divider style={{ margin: '8px 0' }} />

                <Tabs
                    type="card"
                    items={form.sections.map((section, sIdx) => {
                        const skill = section.skillType as SkillType;
                        return {
                            key: String(sIdx),
                            label: (
                                <span style={{ color: SKILL_COLORS[skill], fontWeight: 600 }}>
                                    {skill === 'Reading' ? '📖' : skill === 'Listening' ? '🎧' : skill === 'Writing' ? '✍️' : '🎤'} {skill}
                                </span>
                            ),
                            children: (
                                <AnimatePresence mode="wait">
                                    <motion.div key={sIdx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
                                            <Select value={skill} style={{ width: 180 }}
                                                onChange={(v: SkillType) => {
                                                    const newSection = emptySection(v);
                                                    newSection.orderIndex = sIdx;
                                                    const updated = [...form.sections];
                                                    updated[sIdx] = newSection;
                                                    setForm(prev => ({ ...prev, sections: updated }));
                                                }}
                                                options={[
                                                    { label: '📖 Reading', value: 'Reading' },
                                                    { label: '🎧 Listening', value: 'Listening' },
                                                    { label: '✍️ Writing', value: 'Writing' },
                                                    { label: '🎤 Speaking', value: 'Speaking' },
                                                ]} />
                                            <Input value={section.title ?? ''} style={{ flex: 1 }} placeholder="Tiêu đề section"
                                                onChange={e => updateSection(sIdx, { title: e.target.value })} />
                                        </div>
                                        {renderSectionContent(section, sIdx)}
                                    </motion.div>
                                </AnimatePresence>
                            ),
                        };
                    })}
                />

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(['Reading', 'Listening', 'Writing', 'Speaking'] as SkillType[]).map(s => (
                        <Button key={s} type="dashed" size="small" icon={<PlusOutlined />}
                            onClick={() => handleAddSection(s)}
                            style={{ borderColor: SKILL_COLORS[s], color: SKILL_COLORS[s] }}>
                            + {s}
                        </Button>
                    ))}
                </div>
            </div>
        </Modal>
    );
};
