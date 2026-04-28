import { useState, useMemo, useEffect } from 'react';
import { Modal, Input, Select, InputNumber, Button, Divider, message, Upload, Tabs, Tag } from 'antd';
import { PlusOutlined, MinusCircleOutlined, SoundOutlined, PictureOutlined, BoldOutlined, CloseOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import {
    useCreateExamMutation,
    useGenerateListeningTranscriptMutation,
    useUpdateExamMutation,
} from '../api/exam.api';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import type {
    ExamDto,
    CreateExamDto, CreateSectionDto,
    CreateQuestionGroupDto, CreateQuestionDto,
} from '../types/exam.types';
import {
    QUESTION_TYPES,
    SINGLE_CHOICE_TYPES, MULTI_CHOICE_TYPES, MATCHING_TYPES, FILL_TYPES,
    type SkillType,
} from '../constants/questionTypes';
import { getCleanPastedInputValue, cleanUpText } from '@/shared/utils/input';
import { TruthValueDefinitionTable } from '@/shared/components/TruthValueDefinitionTable';

interface Props {
    open: boolean;
    onClose: () => void;
    initialData?: ExamDto | null;
}

import { getOptionLabel } from '@/shared/utils/optionLabel.utils';
import {
    emptyOption, emptyQuestion, emptyGroup, emptyPassage, emptyListeningPart,
    applySharedListeningAudioUrl, getSharedListeningAudioUrl, normalizeListeningPartsToSharedAudio,
    reorderQuestionNumbers, emptyWritingTask, emptySpeakingQuestion, emptySpeakingPart,
    emptySection, GROUP_TYPE_OPTIONS, SKILL_COLORS, getOptionsForType, EXAM_LIMITS, getMaxQuestionNumber,
    applyBoldToTextarea, sanitizeSpeakingSectionsForSubmit, validateExamStructureLimits,
} from '../pages/exam-editor/examEditor.helpers';
import { FlowchartCompletionEditor } from '../pages/exam-editor/FlowchartCompletionEditor';
import { ListeningMultiSelectEditor } from '../pages/exam-editor/ListeningMultiSelectEditor';
import { parseWritingTaskAssetsData, serializeWritingTaskAssetsData } from '@/shared/lib/writingTaskAssets';
import { serializeListeningTranscriptData, splitListeningTranscriptSegmentsByPart } from '@/shared/lib/listeningTranscript';

const buildBlankOptions = (count: number, existingOptions: CreateQuestionDto['options'] = []) =>
    Array.from({ length: count }, (_, index) => ({
        ...(existingOptions[index] ?? emptyOption(index)),
        orderIndex: index,
    }));

const FIXED_OPTION_MATCHING_TYPES = new Set<string>([
    QUESTION_TYPES.MATCHING_CLASSIFICATION,
]);

const closeActiveSelectDropdown = () => {
    requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof HTMLElement) {
            active.blur();
        }
    });
};

const normalizeSingleQuestionToken = (value: string, questionNumber: number) => {
    const token = `[Q${questionNumber}]`;
    let hasToken = false;

    return value.replace(/\[Q\d+\]/g, () => {
        if (hasToken) {
            return '';
        }
        hasToken = true;
        return token;
    });
};

const hasQuestionToken = (value?: string | null) => /\[Q\d+\]/.test(value ?? '');

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

                        applyBoldToTextarea(el, tableData[focused.r][focused.c] || '', (v) => {
                            const newData = tableData.map(row => [...row]);
                            newData[focused.r][focused.c] = v;
                            updateTable(newData);
                        });
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
                                            onKeyDown={e => {
                                                if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                                                    applyBoldToTextarea(e.currentTarget, cell || '', (v) => {
                                                        const newData = tableData.map(r => [...r]);
                                                        newData[rIdx][cIdx] = v;
                                                        updateTable(newData);
                                                    });
                                                }
                                            }}
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

export const CreateExamModal = ({ open, onClose, initialData }: Props) => {
    const createMutation = useCreateExamMutation();
    const updateMutation = useUpdateExamMutation();
    const generateListeningTranscriptMutation = useGenerateListeningTranscriptMutation();
    const [uploading, setUploading] = useState(false);
    const [globalAudioUrl, setGlobalAudioUrl] = useState<string | null>(null);
    const [generatingListeningTranscriptKey, setGeneratingListeningTranscriptKey] = useState<string | null>(null);

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
            setGlobalAudioUrl(allAudios.find((audio: string) => !!audio)?.trim() || null);
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

    const handleGenerateListeningTranscript = async (audioUrl: string, listeningParts?: CreateSectionDto['listeningParts']) => {
        if (!audioUrl.trim()) {
            throw new Error('Chưa có audio URL để tạo transcript.');
        }

        try {
            const result = await generateListeningTranscriptMutation.mutateAsync({
                audioUrl: audioUrl.trim(),
                language: 'en',
            });

            const partCount = Math.max(1, listeningParts?.length ?? 1);
            const splitResult = splitListeningTranscriptSegmentsByPart(result.segments, partCount);
            message.success(
                splitResult.usedDetectedBoundaries
                    ? `Đã sinh ${result.segmentCount} transcript segments và chia thành ${partCount} part. AI review sẽ tự suy luận evidence/replay theo part + câu hỏi + đáp án.`
                    : `Đã sinh ${result.segmentCount} transcript segments. Chưa thấy marker chia part rõ, AI review sẽ fallback suy luận trong transcript audio.`,
            );
            return splitResult.segmentsByPart.map((partSegments) => serializeListeningTranscriptData({
                segments: partSegments,
            }));
        } catch (error: any) {
            throw new Error(error?.response?.data?.message || 'Không thể generate transcript từ audio.');
        }
    };

    const handleAddSection = (skill: SkillType) => {
        setForm(prev => ({
            ...prev,
            sections: [...prev.sections, { ...emptySection(skill), orderIndex: prev.sections.length }],
        }));
    };

    const handleSubmit = async () => {
        if (!form.title.trim()) { message.warning('Vui lòng nhập tên đề thi!'); return; }
        const limitErrors = validateExamStructureLimits(form);
        if (limitErrors.length > 0) {
            message.error(limitErrors[0]);
            return;
        }
        try {
            const normalizedForm: CreateExamDto = {
                ...form,
                sections: sanitizeSpeakingSectionsForSubmit(
                    form.sections.map((section) => (
                        section.skillType === 'Listening'
                            ? { ...section, listeningParts: normalizeListeningPartsToSharedAudio(section.listeningParts ?? []) }
                            : section
                    )),
                ),
            };
            if (isEdit && initialData) {
                await updateMutation.mutateAsync({ id: initialData.id, data: normalizedForm });
                message.success('Cập nhật đề thi thành công!');
            } else {
                await createMutation.mutateAsync(normalizedForm);
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

    const hasMultiSelectLayout = (contentData?: string) => {
        if (!contentData) return false;

        try {
            const parsed = JSON.parse(contentData) as unknown;
            return parsed
                && typeof parsed === 'object'
                && (parsed as { layout?: unknown }).layout === 'listening_multi_select';
        } catch {
            return false;
        }
    };

const buildMultiSelectContentData = (prompt = '') => JSON.stringify({
    layout: 'listening_multi_select',
    prompt,
});

const parseGroupAssetsData = (assetsData?: string | null) => {
    if (!assetsData) return {} as Record<string, unknown>;

    try {
        const parsed = JSON.parse(assetsData) as unknown;
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
            ? parsed as Record<string, unknown>
            : {};
    } catch {
        return {};
    }
};

const getListeningMcqOptionInputMode = (assetsData: string | null | undefined, questionKey: string): 'text' | 'image' => {
    const parsed = parseGroupAssetsData(assetsData);
    const rawMap = parsed.optionInputModeByQuestion;
    if (rawMap && typeof rawMap === 'object' && !Array.isArray(rawMap)) {
        return (rawMap as Record<string, unknown>)[questionKey] === 'image' ? 'image' : 'text';
    }

    return 'text';
};

const setListeningMcqOptionInputMode = (
    assetsData: string | null | undefined,
    questionKey: string,
    mode: 'text' | 'image',
) => {
    const parsed = parseGroupAssetsData(assetsData);
    const nextMap = parsed.optionInputModeByQuestion && typeof parsed.optionInputModeByQuestion === 'object' && !Array.isArray(parsed.optionInputModeByQuestion)
        ? { ...(parsed.optionInputModeByQuestion as Record<string, unknown>) }
        : {};

    if (mode === 'image') nextMap[questionKey] = 'image';
    else delete nextMap[questionKey];

    const nextPayload: Record<string, unknown> = { ...parsed };
    if (Object.keys(nextMap).length > 0) nextPayload.optionInputModeByQuestion = nextMap;
    else delete nextPayload.optionInputModeByQuestion;

    return Object.keys(nextPayload).length > 0 ? JSON.stringify(nextPayload) : undefined;
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
                            onPaste={e => {
                                const newVal = getCleanPastedInputValue(e, passage.title || '');
                                if (newVal === null) return;
                                const updated = [...passages];
                                updated[pIdx] = { ...passage, title: newVal };
                                updateSection(sIdx, { readingPassages: updated });
                            }}
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
                                    applyBoldToTextarea(el, passage.paragraphsData || '', (v) => {
                                        const updated = [...passages];
                                        updated[pIdx] = { ...passage, paragraphsData: v };
                                        updateSection(sIdx, { readingPassages: updated });
                                    });
                                }}
                            >
                                In đậm
                            </Button>
                        </div>
                        <Input.TextArea value={passage.paragraphsData ?? ''} placeholder="Nội dung chi tiết của bài đọc..."
                            autoSize={{ minRows: 8, maxRows: 20 }} size="small" style={{ marginBottom: '10px' }}
                            onKeyDown={e => {
                                if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                                    applyBoldToTextarea(e.currentTarget, passage.paragraphsData || '', (v) => {
                                        const updated = [...passages];
                                        updated[pIdx] = { ...passage, paragraphsData: v };
                                        updateSection(sIdx, { readingPassages: updated });
                                    });
                                }
                            }}
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
                            const result = renderQuestionGroups(passage.questionGroups, 'Reading', (groups) => {
                                const updated = [...passages];
                                updated[pIdx] = { ...passage, questionGroups: groups };

                                // Auto re-index everything in Reading section
                                let qNum = 1;
                                const reindexedPassages = updated.map(p => {
                                    const newGroups = reorderQuestionNumbers(p.questionGroups, qNum);
                                    qNum = Math.max(qNum, getMaxQuestionNumber(newGroups) + 1);
                                    return { ...p, questionGroups: newGroups };
                                });

                                updateSection(sIdx, { readingPassages: reindexedPassages });
                            }, startOfPassage);
                            currentQNum = Math.max(currentQNum, getMaxQuestionNumber(passage.questionGroups) + 1);
                            return result;
                        })()}
                    </div>
                ))}
                {passages.length < EXAM_LIMITS.Reading.passages && (
                    <Button type="dashed" icon={<PlusOutlined />} block
                        onClick={() => {
                            if (passages.length >= EXAM_LIMITS.Reading.passages) {
                                message.warning(`Reading chỉ có tối đa ${EXAM_LIMITS.Reading.passages} passages!`);
                                return;
                            }
                            setForm(prev => {
                                const sec = prev.sections[sIdx];
                                const current = sec.readingPassages ?? [];
                                if (current.length >= EXAM_LIMITS.Reading.passages) return prev;
                                const updated = [...current, { ...emptyPassage(), passageNumber: current.length + 1 }];
                                return {
                                    ...prev,
                                    sections: prev.sections.map((s, i) => i === sIdx ? { ...s, readingPassages: updated } : s)
                                };
                            });
                        }}>
                        Thêm Passage (Tối đa {EXAM_LIMITS.Reading.passages})
                    </Button>
                )}
            </div>
        );
    };

    const renderListeningSection = (section: CreateSectionDto, sIdx: number) => {
        const parts = section.listeningParts ?? [];
        const sharedAudioUrl = globalAudioUrl || getSharedListeningAudioUrl(parts);
        let currentQNum = 1;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '14px', background: '#eef2ff', borderRadius: '12px', border: '1px dashed #6366f1' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#3730a3', marginBottom: '8px' }}>
                        <SoundOutlined /> Audio chung cho toàn bài Listening
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <Upload accept="audio/*" maxCount={1} showUploadList={false}
                            beforeUpload={async (file) => {
                                const url = await handleUploadFile(file, 'video');
                                if (url) {
                                    setGlobalAudioUrl(url);
                                    updateSection(sIdx, { listeningParts: applySharedListeningAudioUrl(parts, url) });
                                }
                                return false;
                            }}>
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
                                    loading={generatingListeningTranscriptKey === `${sIdx}-${pIdx}`}
                                    disabled={!sharedAudioUrl}
                                    onClick={async () => {
                                        if (!sharedAudioUrl) {
                                            return;
                                        }

                                        const loadingKey = `${sIdx}-${pIdx}`;
                                        setGeneratingListeningTranscriptKey(loadingKey);
                                        try {
                                            const transcriptDataByPart = await handleGenerateListeningTranscript(sharedAudioUrl, parts);
                                            const updated = parts.map((item, index) => ({
                                                ...item,
                                                transcriptData: transcriptDataByPart[index] ?? transcriptDataByPart[0] ?? '',
                                            }));
                                            updateSection(sIdx, { listeningParts: updated });
                                        } catch (error) {
                                            message.error(
                                                error instanceof Error
                                                    ? error.message
                                                    : 'Không thể generate transcript cho audio này.',
                                            );
                                        } finally {
                                            setGeneratingListeningTranscriptKey((current) => current === loadingKey ? null : current);
                                        }
                                    }}
                                >
                                    Generate transcript
                                </Button>
                                {parts.length > 1 && (
                                    <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                        onClick={() => updateSection(sIdx, { listeningParts: parts.filter((_, i) => i !== pIdx) })} />
                                )}
                            </div>
                        </div>
                        <Input.TextArea value={part.contextDescription ?? ''} placeholder="Nội dung hiển thị của part: note/form/map/instruction..."
                            autoSize={{ minRows: 3, maxRows: 10 }} style={{ marginBottom: '12px' }}
                            onPaste={e => {
                                const newVal = getCleanPastedInputValue(e, part.contextDescription || '');
                                if (newVal === null) return;
                                const updated = [...parts];
                                updated[pIdx] = { ...part, contextDescription: newVal };
                                updateSection(sIdx, { listeningParts: updated });
                            }}
                            onChange={e => {
                                const updated = [...parts];
                                updated[pIdx] = { ...part, contextDescription: e.target.value };
                                updateSection(sIdx, { listeningParts: updated });
                            }} />
                        <Input.TextArea value={part.transcriptData ?? ''} placeholder='Transcript JSON cho AI replay, ví dụ: {"schemaVersion":3,"segments":[{"startTime":115,"endTime":125,"text":"..."}]}'
                            autoSize={{ minRows: 4, maxRows: 12 }} style={{ marginBottom: '12px' }}
                            onPaste={e => {
                                const newVal = getCleanPastedInputValue(e, part.transcriptData || '');
                                if (newVal === null) return;
                                const updated = [...parts];
                                updated[pIdx] = { ...part, transcriptData: newVal };
                                updateSection(sIdx, { listeningParts: updated });
                            }}
                            onChange={e => {
                                const updated = [...parts];
                                updated[pIdx] = { ...part, transcriptData: e.target.value };
                                updateSection(sIdx, { listeningParts: updated });
                            }} />
                        <div style={{ marginTop: '-4px', marginBottom: '12px', fontSize: '0.75rem', color: '#475569', lineHeight: 1.6 }}>
                            Field này dùng riêng cho AI gia sư tìm timestamp audio và trích transcript. Nội dung hiển thị trên đề vẫn lấy từ `contextDescription`. Schema mới chỉ cần `segments` có `startTime`, `endTime`, `text`; AI review tự suy luận evidence/replay theo part + câu hỏi + đáp án.
                        </div>
                        {(() => {
                            const startOfPart = currentQNum;
                            // Pre-calculate questions in this part to update global currentQNum
                            const result = renderQuestionGroups(part.questionGroups, 'Listening', (groups) => {
                                const updated = [...parts];
                                updated[pIdx] = { ...part, questionGroups: groups };

                                // Auto re-index everything in Listening section
                                let qNum = 1;
                                const reindexedParts = updated.map(p => {
                                    const newGroups = reorderQuestionNumbers(p.questionGroups, qNum);
                                    qNum = Math.max(qNum, getMaxQuestionNumber(newGroups) + 1);
                                    return { ...p, questionGroups: newGroups };
                                });

                                updateSection(sIdx, { listeningParts: reindexedParts });
                            }, startOfPart);
                            currentQNum = Math.max(currentQNum, getMaxQuestionNumber(part.questionGroups) + 1);
                            return result;
                        })()}
                    </div>
                ))}
                {parts.length < EXAM_LIMITS.Listening.parts && (
                    <Button type="dashed" icon={<PlusOutlined />} block
                        onClick={() => {
                            if (parts.length >= EXAM_LIMITS.Listening.parts) {
                                message.warning(`Listening chỉ có tối đa ${EXAM_LIMITS.Listening.parts} parts!`);
                                return;
                            }
                            setForm(prev => {
                                const sec = prev.sections[sIdx];
                                const current = sec.listeningParts ?? [];
                                if (current.length >= EXAM_LIMITS.Listening.parts) return prev;
                                const newPart = { ...emptyListeningPart(), partNumber: current.length + 1 };
                                if (sharedAudioUrl) newPart.audioUrl = sharedAudioUrl;
                                const updated = [...current, newPart];
                                return {
                                    ...prev,
                                    sections: prev.sections.map((s, i) => i === sIdx ? { ...s, listeningParts: updated } : s)
                                };
                            });
                        }}>
                        Thêm Part (Tối đa {EXAM_LIMITS.Listening.parts})
                    </Button>
                )}
            </div>
        );
    };

    const renderWritingSection = (section: CreateSectionDto, sIdx: number) => {
        const tasks = section.writingTasks ?? [];
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {tasks.map((task, tIdx) => {
                    const writingAssets = parseWritingTaskAssetsData(task.assetsData);

                    return (
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
                            onPaste={e => {
                                const newVal = getCleanPastedInputValue(e, task.promptText || '');
                                if (newVal === null) return;
                                const updated = [...tasks];
                                updated[tIdx] = { ...task, promptText: newVal };
                                updateSection(sIdx, { writingTasks: updated });
                            }}
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
                                                updated[tIdx] = {
                                                    ...task,
                                                    assetsData: serializeWritingTaskAssetsData({
                                                        imageUrl: url,
                                                        hiddenDataText: writingAssets.hiddenDataText,
                                                    }),
                                                };
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
                                        value={writingAssets.primaryImageUrl ?? ''}
                                        placeholder="Chưa có ảnh biểu đồ"
                                        readOnly
                                        size="small"
                                        style={{ flex: 1, background: '#fffcf0', color: '#92400e' }}
                                        suffix={writingAssets.primaryImageUrl ? (
                                            <CloseOutlined
                                                style={{ color: '#ef4444', cursor: 'pointer' }}
                                                onClick={() => {
                                                    const updated = [...tasks];
                                                    updated[tIdx] = {
                                                        ...task,
                                                        assetsData: serializeWritingTaskAssetsData({
                                                            imageUrl: '',
                                                            hiddenDataText: writingAssets.hiddenDataText,
                                                        }),
                                                    };
                                                    updateSection(sIdx, { writingTasks: updated });
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
                    <Button type="dashed" icon={<PlusOutlined />} block
                        onClick={() => {
                            if (tasks.length >= EXAM_LIMITS.Writing.tasks) {
                                message.warning(`Writing chỉ có tối đa ${EXAM_LIMITS.Writing.tasks} tasks!`);
                                return;
                            }
                            setForm(prev => {
                                const sec = prev.sections[sIdx];
                                const current = sec.writingTasks ?? [];
                                if (current.length >= EXAM_LIMITS.Writing.tasks) return prev;
                                const updated = [...current, emptyWritingTask(current.length + 1)];
                                return {
                                    ...prev,
                                    sections: prev.sections.map((s, i) => i === sIdx ? { ...s, writingTasks: updated } : s)
                                };
                            });
                        }}>
                        Thêm Task (Tối đa {EXAM_LIMITS.Writing.tasks})
                    </Button>
                )}
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
                                    onPaste={e => {
                                        const newVal = getCleanPastedInputValue(e, sq.content || '');
                                        if (newVal === null) return;
                                        const updated = [...parts];
                                        const qs = [...part.questions];
                                        qs[sqIdx] = { ...sq, content: newVal };
                                        updated[pIdx] = { ...part, questions: qs };
                                        updateSection(sIdx, { speakingParts: updated });
                                    }}
                                    onChange={e => {
                                        const updated = [...parts];
                                        const qs = [...part.questions];
                                        qs[sqIdx] = { ...sq, content: e.target.value };
                                        updated[pIdx] = { ...part, questions: qs };
                                        updateSection(sIdx, { speakingParts: updated });
                                    }} />
                                {part.partNumber === 2 && sqIdx === 0 && (
                                    <Input.TextArea value={sq.cueCardPoints ?? ''} placeholder="Cue Card gợi ý..."
                                        autoSize={{ minRows: 2, maxRows: 5 }} style={{ marginTop: '6px' }}
                                        onPaste={e => {
                                            const newVal = getCleanPastedInputValue(e, sq.cueCardPoints || '');
                                            if (newVal === null) return;
                                            const updated = [...parts];
                                            const qs = [...part.questions];
                                            qs[sqIdx] = { ...sq, cueCardPoints: newVal };
                                            updated[pIdx] = { ...part, questions: qs };
                                            updateSection(sIdx, { speakingParts: updated });
                                        }}
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
                {parts.length < EXAM_LIMITS.Speaking.parts && (
                    <Button type="dashed" icon={<PlusOutlined />} block
                        onClick={() => {
                            if (parts.length >= EXAM_LIMITS.Speaking.parts) {
                                message.warning(`Speaking chỉ có tối đa ${EXAM_LIMITS.Speaking.parts} parts!`);
                                return;
                            }
                            setForm(prev => {
                                const sec = prev.sections[sIdx];
                                const current = sec.speakingParts ?? [];
                                if (current.length >= EXAM_LIMITS.Speaking.parts) return prev;
                                const updated = [...current, emptySpeakingPart(current.length + 1)];
                                return {
                                    ...prev,
                                    sections: prev.sections.map((s, i) => i === sIdx ? { ...s, speakingParts: updated } : s)
                                };
                            });
                        }}>
                        Thêm Part (Tối đa {EXAM_LIMITS.Speaking.parts})
                    </Button>
                )}
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
                    const groupStartNum = runningQNum;
                    runningQNum += group.questions.length;
                    const isComplexLayout = [
                        'TABLE_COMPLETION', 'MATCHING_TABLE', 'NOTE_COMPLETION', 'FORM_COMPLETION', 'MAP_LABELLING', 'DIAGRAM_LABELLING',
                        'SUMMARY_COMPLETION', 'SENTENCE_COMPLETION'
                    ].includes(group.groupType ?? '');
                    const isMatchingType = MATCHING_TYPES.has(group.groupType ?? '');
                    const isMatchingHeadingsType = group.groupType === QUESTION_TYPES.MATCHING_HEADINGS;
                    const isClassificationMatchingType = group.groupType === QUESTION_TYPES.MATCHING_CLASSIFICATION;
                    const isSummaryType = group.groupType === 'SUMMARY_COMPLETION';
                    const isTableType = ['TABLE_COMPLETION', 'MATCHING_TABLE'].includes(group.groupType ?? '');
                    const isFlowchartType = group.groupType === QUESTION_TYPES.FLOWCHART_COMPLETION;
                    const isVisualMatchingType = group.groupType === QUESTION_TYPES.MATCHING_VISUALS;
                    const usesLegacySharedMultiSelectLayout =
                        group.groupType === QUESTION_TYPES.MCQ_CHOOSE_N
                        || (group.groupType === QUESTION_TYPES.MCQ_MULTIPLE && hasMultiSelectLayout(group.contentData));
                    const showOptionsBox = (isMatchingType && !isMatchingHeadingsType) || isSummaryType;
                    const matchingHeadingOptionCount = Math.max(1, group.questions[0]?.options?.length || 4);
                    const matchingHeadingAnswerOptions = Array.from({ length: matchingHeadingOptionCount }, (_, index) => {
                        const label = getOptionLabel(index, group.optionLabelType || 'alpha');
                        return { label, value: label };
                    });
                    const updateSharedOptionCount = (countValue?: number | null) => {
                        const nextCount = Math.max(1, Math.min(26, countValue ?? matchingHeadingOptionCount));
                        const existingOptions = group.questions[0]?.options ?? [];
                        const nextOptions = buildBlankOptions(nextCount, existingOptions);
                        const allowedAnswers = new Set(nextOptions.map((_, index) => getOptionLabel(index, group.optionLabelType || 'alpha')));
                        const updated = [...groups];
                        updated[gIdx] = {
                            ...group,
                            questions: group.questions.map((question) => ({
                                ...question,
                                options: nextOptions,
                                correctAnswer: question.correctAnswer && allowedAnswers.has(question.correctAnswer)
                                    ? question.correctAnswer
                                    : undefined,
                            })),
                        };
                        onUpdate(updated);
                    };

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
                                        const previousType = group.groupType ?? '';
                                        const previousIsMapLabelling = previousType === QUESTION_TYPES.MAP_LABELLING;
                                        const nextIsMapLabelling = v === QUESTION_TYPES.MAP_LABELLING;
                                        const previousIsFlowchart = previousType === QUESTION_TYPES.FLOWCHART_COMPLETION;
                                        const nextIsFlowchart = v === QUESTION_TYPES.FLOWCHART_COMPLETION;
                                        const nextIsSharedMultiSelect = v === QUESTION_TYPES.MCQ_CHOOSE_N;
                                        const nextIsMultiQuestionMulti = v === QUESTION_TYPES.MCQ_MULTIPLE;
                                        let nextAssetsData = group.assetsData;

                                        if (nextIsMapLabelling) {
                                            nextAssetsData = previousIsMapLabelling ? group.assetsData : undefined;
                                        }

                                        if (nextIsFlowchart) {
                                            nextAssetsData = previousIsFlowchart ? group.assetsData : undefined;
                                        }

                                        if (!nextIsMapLabelling && previousIsMapLabelling) {
                                            nextAssetsData = undefined;
                                        }

                                        if (!nextIsFlowchart && previousIsFlowchart) {
                                            nextAssetsData = undefined;
                                        }

                                        let nextQuestions = nextIsFlowchart
                                            ? (group.questions.length > 0
                                                ? group.questions.map((q, index) => ({
                                                    ...q,
                                                    questionNumber: q.questionNumber ?? groupStartNum + index,
                                                    options: [],
                                                }))
                                                : Array.from({ length: 5 }, (_, index) => ({
                                                    ...emptyQuestion(),
                                                    questionNumber: groupStartNum + index,
                                                })))
                                                : group.questions.map(q => ({ ...q, options: q.options.length > 0 ? q.options : getOptionsForType(v) }));
                                        let nextContentData = group.contentData;

                                        if (v === QUESTION_TYPES.MATCHING_CLASSIFICATION && previousType !== v) {
                                            const classificationOptions = getOptionsForType(v);
                                            const baseQuestions = nextQuestions.length > 0
                                                ? nextQuestions
                                                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: classificationOptions }];
                                            nextQuestions = baseQuestions.map((question, index) => ({
                                                ...question,
                                                questionNumber: question.questionNumber ?? groupStartNum + index,
                                                options: classificationOptions.map((option) => ({ ...option })),
                                            }));
                                        }

                                        if (nextIsMultiQuestionMulti) {
                                            const baseQuestions = nextQuestions.length > 0
                                                ? nextQuestions
                                                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: getOptionsForType(v) }];
                                            nextQuestions = baseQuestions.map((question, index) => ({
                                                ...question,
                                                questionNumber: question.questionNumber ?? groupStartNum + index,
                                                options: question.options.length > 0 ? question.options : getOptionsForType(v),
                                            }));
                                            nextContentData = undefined;
                                        }

                                        if (nextIsSharedMultiSelect) {
                                            const baseQuestions = nextQuestions.length > 0
                                                ? nextQuestions
                                                : [{ ...emptyQuestion(), questionNumber: groupStartNum, options: getOptionsForType(v) }];
                                            nextQuestions = baseQuestions.map((question, index) => ({
                                                ...question,
                                                content: '',
                                                questionNumber: question.questionNumber ?? groupStartNum + index,
                                                options: question.options.length > 0 ? question.options : getOptionsForType(v),
                                            }));
                                            nextContentData = hasMultiSelectLayout(group.contentData)
                                                ? group.contentData
                                                : buildMultiSelectContentData('');
                                        }

                                        const updated = [...groups];
                                        updated[gIdx] = {
                                            ...group,
                                            groupType: v,
                                            assetsData: nextAssetsData,
                                            optionLabelType: nextIsFlowchart
                                                ? (previousIsFlowchart ? (group.optionLabelType || 'alpha') : 'alpha')
                                                : group.optionLabelType,
                                            contentData: (nextIsFlowchart || nextIsMapLabelling)
                                                ? undefined
                                                : nextContentData,
                                            questions: nextQuestions,
                                        };
                                        onUpdate(updated);
                                    }} />
                                {isMatchingHeadingsType && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Số đáp án:</span>
                                        <InputNumber
                                            size="small"
                                            min={1}
                                            max={26}
                                            value={matchingHeadingOptionCount}
                                            onChange={updateSharedOptionCount}
                                            style={{ width: 72 }}
                                        />
                                    </div>
                                )}
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
                            <TruthValueDefinitionTable groupType={group.groupType} />

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
                                                        applyBoldToTextarea(el, group.contentData || '', handleContentChange);
                                                    }}
                                                >
                                                    In đậm
                                                </Button>
                                            </div>
                                            <Input.TextArea value={group.contentData ?? ''} placeholder={`Ví dụ: <p>Name: [Q1]</p>\n<p>Age: [Q2]</p>`}
                                                autoSize={{ minRows: 8, maxRows: 15 }} size="small" style={{ marginBottom: '8px', fontFamily: 'monospace' }}
                                                onKeyDown={e => {
                                                    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
                                                        applyBoldToTextarea(e.currentTarget, group.contentData || '', handleContentChange);
                                                    }
                                                }}
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

                            {isFlowchartType && (
                                <FlowchartCompletionEditor
                                    group={group}
                                    groups={groups}
                                    groupIdx={gIdx}
                                    groupStartNum={groupStartNum}
                                    onUpdate={onUpdate}
                                    uploading={uploading}
                                    handleUploadFile={handleUploadFile}
                                />
                            )}

                            {usesLegacySharedMultiSelectLayout && (
                                <ListeningMultiSelectEditor
                                    group={group}
                                    groups={groups}
                                    groupIdx={gIdx}
                                    groupStartNum={groupStartNum}
                                    onUpdate={onUpdate}
                                />
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
                                                            {group.questions[0]?.options?.length > 0 && !isSummaryType ? (
                                                                <Select
                                                                    size="small"
                                                                    style={{ flex: 1 }}
                                                                    value={q.correctAnswer}
                                                                    placeholder={`Chọn ${group.optionLabelType === 'roman' ? 'i-viii' : 'A-Z'}`}
                                                                    options={(group.questions[0]?.options || []).map((_, i) => ({
                                                                        label: getOptionLabel(i, group.optionLabelType || 'alpha'),
                                                                        value: getOptionLabel(i, group.optionLabelType || 'alpha'),
                                                                    }))}
                                                                    onChange={v => {
                                                                        const updated = [...groups];
                                                                        updated[gIdx].questions[qIdx] = { ...q, correctAnswer: v };
                                                                        onUpdate(updated);
                                                                    }}
                                                                />
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
                                                        <Input size="small" placeholder={isClassificationMatchingType ? 'Ví dụ: The Mayor, shopkeeper...' : 'Ví dụ: Simon, Liz...'} value={q.content ?? ''} style={{ flex: 1 }} onChange={e => {
                                                            const updated = [...groups];
                                                            updated[gIdx].questions[qIdx] = { ...q, content: e.target.value };
                                                            onUpdate(updated);
                                                        }} />
                                                        {isMatchingHeadingsType ? (
                                                            <Select
                                                                size="small"
                                                                placeholder="Đáp án"
                                                                value={q.correctAnswer || undefined}
                                                                style={{ width: 100, border: '1px solid #10b981', borderRadius: 4 }}
                                                                options={matchingHeadingAnswerOptions}
                                                                onChange={value => {
                                                                    const updated = [...groups];
                                                                    updated[gIdx].questions[qIdx] = { ...q, correctAnswer: value };
                                                                    onUpdate(updated);
                                                                    closeActiveSelectDropdown();
                                                                }}
                                                            />
                                                        ) : isClassificationMatchingType ? (
                                                            <Select
                                                                size="small"
                                                                placeholder="Đáp án"
                                                                value={q.correctAnswer || undefined}
                                                                style={{ width: 120, border: '1px solid #10b981', borderRadius: 4 }}
                                                                options={(group.questions[0]?.options || []).map((_, i) => ({
                                                                    label: getOptionLabel(i, group.optionLabelType || 'alpha'),
                                                                    value: getOptionLabel(i, group.optionLabelType || 'alpha'),
                                                                }))}
                                                                onChange={value => {
                                                                    const updated = [...groups];
                                                                    updated[gIdx].questions[qIdx] = { ...q, correctAnswer: value };
                                                                    onUpdate(updated);
                                                                    closeActiveSelectDropdown();
                                                                }}
                                                            />
                                                        ) : (
                                                            <Input size="small" placeholder={`Đáp án (${group.optionLabelType === 'roman' ? 'i-viii' : 'A-Z'})`} value={q.correctAnswer ?? ''} style={{ width: isSummaryType ? '220px' : '100px', borderColor: '#10b981' }} onChange={e => {
                                                                const updated = [...groups];
                                                                updated[gIdx].questions[qIdx] = { ...q, correctAnswer: e.target.value };
                                                                onUpdate(updated);
                                                            }} />
                                                        )}
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
                                                    const newQ = { ...emptyQuestion(), questionNumber: runningQNum, options: group.questions[0]?.options || buildBlankOptions(matchingHeadingOptionCount) };
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
                                                    <div
                                                        key={oIdx}
                                                        style={{
                                                            display: 'flex',
                                                            gap: '8px',
                                                            alignItems: 'center',
                                                            padding: isVisualMatchingType ? '10px' : 0,
                                                            border: isVisualMatchingType ? '1px solid #e2e8f0' : 'none',
                                                            borderRadius: isVisualMatchingType ? '10px' : 0,
                                                            background: isVisualMatchingType ? '#f8fafc' : 'transparent',
                                                        }}
                                                    >
                                                        <b style={{ color: '#0ea5e9', width: '20px', textAlign: 'center' }}>{getOptionLabel(oIdx, group.optionLabelType || 'alpha')}</b>
                                                        {isVisualMatchingType ? (
                                                            <>
                                                                <div
                                                                    style={{
                                                                        width: 120,
                                                                        height: 90,
                                                                        borderRadius: '8px',
                                                                        border: '1px dashed #cbd5e1',
                                                                        background: '#fff',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        overflow: 'hidden',
                                                                        flexShrink: 0,
                                                                    }}
                                                                >
                                                                    {opt.optionText ? (
                                                                        <img
                                                                            src={opt.optionText}
                                                                            alt={`Option ${getOptionLabel(oIdx, group.optionLabelType || 'alpha')}`}
                                                                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                                        />
                                                                    ) : (
                                                                        <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '0 8px' }}>
                                                                            Chưa có ảnh
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <Upload
                                                                    accept="image/*"
                                                                    showUploadList={false}
                                                                    beforeUpload={async (file) => {
                                                                        const url = await handleUploadFile(file, 'image');
                                                                        if (!url) return false;

                                                                        const updated = [...groups];
                                                                        const newOpts = [...(group.questions[0]?.options || [])];
                                                                        newOpts[oIdx] = { ...opt, optionText: url };
                                                                        updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                                        onUpdate(updated);
                                                                        return false;
                                                                    }}
                                                                >
                                                                    <Button size="small" loading={uploading}>Upload ảnh</Button>
                                                                </Upload>
                                                                {opt.optionText ? (
                                                                    <Button
                                                                        size="small"
                                                                        onClick={() => {
                                                                            const updated = [...groups];
                                                                            const newOpts = [...(group.questions[0]?.options || [])];
                                                                            newOpts[oIdx] = { ...opt, optionText: '' };
                                                                            updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                                            onUpdate(updated);
                                                                        }}
                                                                    >
                                                                        Xóa ảnh
                                                                    </Button>
                                                                ) : null}
                                                            </>
                                                        ) : (
                                                            <Input size="small" value={opt.optionText} placeholder="Nội dung..." style={{ flex: 1 }}
                                                                onChange={e => {
                                                                    const updated = [...groups];
                                                                    const newOpts = [...(group.questions[0]?.options || [])];
                                                                    newOpts[oIdx] = { ...opt, optionText: e.target.value };
                                                                    updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                                    onUpdate(updated);
                                                                }} />
                                                        )}
                                                        <Button
                                                            type="text"
                                                            danger
                                                            icon={<MinusCircleOutlined />}
                                                            size="small"
                                                            disabled={isClassificationMatchingType && (group.questions[0]?.options?.length ?? 0) <= 2}
                                                            onClick={() => {
                                                            const updated = [...groups];
                                                            const newOpts = (group.questions[0]?.options || []).filter((_, i) => i !== oIdx);
                                                            updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                            onUpdate(updated);
                                                        }}
                                                        />
                                                    </div>
                                                ))}
                                                <Button
                                                    type="dashed"
                                                    size="small"
                                                    icon={<PlusOutlined />}
                                                    block
                                                    disabled={FIXED_OPTION_MATCHING_TYPES.has(group.groupType ?? '')}
                                                    onClick={() => {
                                                    const updated = [...groups];
                                                    const newOpts = [...(group.questions[0]?.options || []), emptyOption(group.questions[0]?.options?.length || 0)];
                                                    updated[gIdx].questions = group.questions.map(q => ({ ...q, options: newOpts }));
                                                    onUpdate(updated);
                                                }}
                                                >
                                                    {isClassificationMatchingType ? 'Dạng này dùng cố định 2 cột A/B' : 'Thêm lựa chọn'}
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Standard Question List (for non-complex non-matching types) */}
                            {!isComplexLayout && !isMatchingType && !isFlowchartType && !usesLegacySharedMultiSelectLayout && (
                                <div style={{ marginTop: '10px' }}>
                                    {group.questions.map((q, qIdx) => renderQuestion(q, qIdx, group, gIdx, groups, onUpdate, groupStartNum))}
                                    {group.groupType !== QUESTION_TYPES.MCQ_CHOOSE_N && (
                                        <Button type="dashed" icon={<PlusOutlined />} block size="small" style={{ marginTop: '8px' }}
                                            onClick={() => {
                                                const updated = [...groups];
                                                const newQ = { ...emptyQuestion(), questionNumber: runningQNum, options: getOptionsForType(group.groupType) };
                                                updated[gIdx] = { ...group, questions: [...group.questions, newQ] };
                                                onUpdate(updated);
                                            }}>Thêm câu hỏi</Button>
                                    )}
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

    const renderQuestion = (
        q: CreateQuestionDto, qIdx: number,
        group: CreateQuestionGroupDto, gIdx: number,
        groups: CreateQuestionGroupDto[],
        onUpdate: (groups: CreateQuestionGroupDto[]) => void,
        groupStartNum: number,
    ) => {
        const gType = group.groupType ?? '';
        const hasOpts = SINGLE_CHOICE_TYPES.has(gType) || MULTI_CHOICE_TYPES.has(gType) || MATCHING_TYPES.has(gType);
        const isFill = FILL_TYPES.has(gType) || gType === QUESTION_TYPES.SUMMARY_COMPLETION;
        const isTFNG = gType === QUESTION_TYPES.TFNG || gType === QUESTION_TYPES.YNNG;
        const isShortAnswerTemplateType = gType === QUESTION_TYPES.SHORT_ANSWER;
        const supportsOptionImageUpload = skill === 'Listening' && gType === QUESTION_TYPES.MCQ_SINGLE && !isTFNG;
        const displayQuestionNumber = q.questionNumber ?? groupStartNum + qIdx;
        const optionInputMode = supportsOptionImageUpload ? getListeningMcqOptionInputMode(group.assetsData, String(displayQuestionNumber)) : 'text';
        const textareaKey = `short-answer-${gIdx}-${qIdx}-${displayQuestionNumber}`;

        const updateQ = (partial: Partial<CreateQuestionDto>) => {
            const updated = [...groups];
            const qs = [...group.questions];
            qs[qIdx] = { ...q, ...partial };
            updated[gIdx] = { ...group, questions: qs };
            onUpdate(updated);
        };

        const insertShortAnswerToken = () => {
            if (hasQuestionToken(q.content)) return;

            const token = `[Q${displayQuestionNumber}]`;
            const activeElement = document.activeElement as HTMLTextAreaElement | null;
            const currentContent = q.content ?? '';

            if (activeElement?.tagName === 'TEXTAREA' && activeElement.dataset.shortAnswerKey === textareaKey) {
                const start = activeElement.selectionStart ?? currentContent.length;
                const end = activeElement.selectionEnd ?? currentContent.length;
                updateQ({
                    content: normalizeSingleQuestionToken(
                        `${currentContent.slice(0, start)}${token}${currentContent.slice(end)}`,
                        displayQuestionNumber,
                    ),
                });
                return;
            }

            updateQ({
                content: normalizeSingleQuestionToken(
                    currentContent ? `${currentContent} ${token}` : token,
                    displayQuestionNumber,
                ),
            });
        };

        return (
            <div key={qIdx} style={{ padding: '10px', background: '#fff', borderRadius: '8px', marginBottom: '6px', border: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#64748b', minWidth: 45 }}>Câu {displayQuestionNumber}</span>
                    {supportsOptionImageUpload && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Kiểu đáp án:</span>
                            <Radio.Group
                                size="small"
                                value={optionInputMode}
                                onChange={(event) => {
                                    const nextMode = event.target.value as 'text' | 'image';
                                    const updated = [...groups];
                                    updated[gIdx] = {
                                        ...group,
                                        assetsData: setListeningMcqOptionInputMode(group.assetsData, String(displayQuestionNumber), nextMode),
                                    };
                                    onUpdate(updated);
                                }}
                            >
                                <Radio.Button value="text">Text</Radio.Button>
                                <Radio.Button value="image">Image</Radio.Button>
                            </Radio.Group>
                        </div>
                    )}
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
                {isShortAnswerTemplateType && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: '0.75rem', color: '#0369a1', fontWeight: 700 }}>
                            Chèn [Qx] vào đúng vị trí cần điền
                        </span>
                        <Button
                            size="small"
                            type={hasQuestionToken(q.content) ? 'default' : 'primary'}
                            disabled={hasQuestionToken(q.content)}
                            onMouseDown={(event) => {
                                event.preventDefault();
                                insertShortAnswerToken();
                            }}
                        >
                            {hasQuestionToken(q.content) ? `Đã có [Q${displayQuestionNumber}]` : `Thêm [Q${displayQuestionNumber}]`}
                        </Button>
                    </div>
                )}
                <Input.TextArea
                    data-short-answer-key={textareaKey}
                    value={q.content ?? ''}
                    placeholder={isShortAnswerTemplateType ? `Nhập câu hỏi và chèn [Q${displayQuestionNumber}] tại chỗ trống` : 'Nội dung câu hỏi'}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    size="small"
                    style={{ marginBottom: '6px' }}
                    onChange={e => updateQ({
                        content: isShortAnswerTemplateType
                            ? normalizeSingleQuestionToken(e.target.value, displayQuestionNumber)
                            : e.target.value,
                    })}
                />

                {isFill && (
                    <Input value={q.correctAnswer ?? ''} placeholder="Đáp án đúng (dùng | phân cách nhiều đáp án)"
                        size="small" style={{ borderColor: '#10b981', marginBottom: '4px' }}
                        onChange={e => updateQ({ correctAnswer: e.target.value })} />
                )}

                {hasOpts && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {q.options.map((opt, oIdx) => (
                            <div
                                key={oIdx}
                                style={{
                                    display: 'flex',
                                    gap: '6px',
                                    alignItems: supportsOptionImageUpload ? 'flex-start' : 'center',
                                    padding: supportsOptionImageUpload ? '8px' : 0,
                                    border: supportsOptionImageUpload ? '1px solid #e2e8f0' : 'none',
                                    borderRadius: supportsOptionImageUpload ? '10px' : 0,
                                    background: supportsOptionImageUpload ? '#f8fafc' : 'transparent',
                                }}
                            >
                                <input type="checkbox" checked={opt.isCorrect}
                                    style={{ marginTop: supportsOptionImageUpload ? '8px' : 0 }}
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
                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {!supportsOptionImageUpload || optionInputMode === 'text' ? (
                                        <Input value={opt.optionText} disabled={isTFNG}
                                            placeholder={isTFNG ? opt.optionText : `Lựa chọn ${getOptionLabel(oIdx, group.optionLabelType || 'alpha')}`}
                                            size="small" style={{ flex: 1 }}
                                            onChange={e => {
                                                const opts = [...q.options];
                                                opts[oIdx] = { ...opt, optionText: e.target.value };
                                                updateQ({ options: opts });
                                            }} />
                                    ) : null}
                                    {supportsOptionImageUpload && optionInputMode === 'image' && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div
                                                style={{
                                                    width: 140,
                                                    height: 100,
                                                    borderRadius: '8px',
                                                    border: '1px dashed #cbd5e1',
                                                    background: '#fff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                {opt.imageUrl ? (
                                                    <img
                                                        src={opt.imageUrl}
                                                        alt={`Option ${getOptionLabel(oIdx, group.optionLabelType || 'alpha')}`}
                                                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                                    />
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', padding: '0 8px' }}>
                                                        Chưa có ảnh
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                <Upload
                                                    accept="image/*"
                                                    showUploadList={false}
                                                    beforeUpload={async (file) => {
                                                        const url = await handleUploadFile(file, 'image');
                                                        if (!url) return false;

                                                        const opts = [...q.options];
                                                        opts[oIdx] = { ...opt, imageUrl: url };
                                                        updateQ({ options: opts });
                                                        return false;
                                                    }}
                                                >
                                                    <Button size="small" loading={uploading}>Upload ảnh</Button>
                                                </Upload>
                                                {opt.imageUrl ? (
                                                    <Button
                                                        size="small"
                                                        onClick={() => {
                                                            const opts = [...q.options];
                                                            opts[oIdx] = { ...opt, imageUrl: '' };
                                                            updateQ({ options: opts });
                                                        }}
                                                    >
                                                        Xóa ảnh
                                                    </Button>
                                                ) : null}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {!isTFNG && q.options.length > 1 && (
                                    <Button type="text" danger icon={<MinusCircleOutlined />} size="small"
                                        style={{ marginTop: supportsOptionImageUpload ? '4px' : 0 }}
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
                        <Input value={form.title} onPaste={e => {
                            const newVal = getCleanPastedInputValue(e, form.title || '');
                            if (newVal === null) return;
                            updateForm({ title: newVal });
                        }} onChange={e => updateForm({ title: e.target.value })} placeholder="VD: IELTS Mock Test 2026" />
                    </div>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>Loại đề</label>
                        <Select value={form.examType} onChange={v => updateForm({ examType: v })} style={{ width: '100%' }}
                            options={[{ label: 'IELTS', value: 'IELTS' }, { label: 'TOEIC', value: 'TOEIC' }]} />
                    </div>
                </div>
                <Input.TextArea value={form.description} onPaste={e => {
                    const newVal = getCleanPastedInputValue(e, form.description || '');
                    if (newVal === null) return;
                    updateForm({ description: newVal });
                }} onChange={e => updateForm({ description: e.target.value })}
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
                                                    { label: 'Reading', value: 'Reading', disabled: form.sections.some((sec, i) => sec.skillType === 'Reading' && i !== sIdx) },
                                                    { label: 'Listening', value: 'Listening', disabled: form.sections.some((sec, i) => sec.skillType === 'Listening' && i !== sIdx) },
                                                    { label: 'Writing', value: 'Writing', disabled: form.sections.some((sec, i) => sec.skillType === 'Writing' && i !== sIdx) },
                                                    { label: 'Speaking', value: 'Speaking', disabled: form.sections.some((sec, i) => sec.skillType === 'Speaking' && i !== sIdx) },
                                                ].map(o => ({ ...o, label: (o.value === 'Reading' ? '📖 ' : o.value === 'Listening' ? '🎧 ' : o.value === 'Writing' ? '✍️ ' : '🎤 ') + o.label + (o.disabled ? ' (Đã có)' : '') }))} />
                                            <Input value={section.title ?? ''} style={{ flex: 1 }} placeholder="Tiêu đề section"
                                                onPaste={e => {
                                                    const newVal = getCleanPastedInputValue(e, section.title || '');
                                                    if (newVal === null) return;
                                                    updateSection(sIdx, { title: newVal });
                                                }}
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
                    {(['Reading', 'Listening', 'Writing', 'Speaking'] as SkillType[]).map(s => {
                        const isAdded = form.sections.some(sec => sec.skillType === s);
                        if (isAdded) return null;
                        return (
                            <Button key={s} type="dashed" size="small" icon={<PlusOutlined />}
                                onClick={() => handleAddSection(s)}
                                style={{
                                    borderColor: SKILL_COLORS[s],
                                    color: SKILL_COLORS[s]
                                }}>
                                + {s}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
};
