import { useState, useEffect, useRef } from 'react';
import { Modal, Input, Select, InputNumber, Button, Divider, message, Tabs } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import {
    useCreateExamMutation,
    useGenerateListeningTranscriptMutation,
    useUpdateExamMutation,
} from '@/features/exams/hooks/useExamQueries';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import type {
    ExamDto,
    CreateExamDto,
    CreateSectionDto,
} from '@/features/exams/types/exam.types';
import type { SkillType } from './questionTypes';
import { getCleanPastedInputValue } from '@/shared/utils/input';
import {
    emptySection,
    SKILL_COLORS,
    countObjectiveQuestions,
    getDefaultDurationForSkill,
    normalizeListeningPartsToSharedAudio,
    normalizeObjectiveQuestionPointsForSubmit,
    sanitizeSpeakingSectionsForSubmit,
    validateExamStructureLimits,
} from './exam-editor/examEditor.helpers';
import {
    ListeningSectionEditor,
    ReadingSectionEditor,
    SpeakingSectionEditor,
    WritingSectionEditor,
} from './exam-editor/SectionEditors';
import { serializeListeningTranscriptData, splitListeningTranscriptSegmentsByPart } from '@/shared/lib/listeningTranscript';
import type { TiptapQxEditorRef } from './TiptapQxEditor';
import { normalizeSkillType } from '@/shared/lib/examDisplay';

interface Props {
    open: boolean;
    onClose: () => void;
    initialData?: ExamDto | null;
}

export const CreateExamModal = ({ open, onClose, initialData }: Props) => {
    const createMutation = useCreateExamMutation();
    const updateMutation = useUpdateExamMutation();
    const generateListeningTranscriptMutation = useGenerateListeningTranscriptMutation();
    const activeEditorRef = useRef<TiptapQxEditorRef | null>(null);
    const [uploading, setUploading] = useState(false);
    const [globalAudioUrl, setGlobalAudioUrl] = useState<string | null>(null);

    const [form, setForm] = useState<CreateExamDto>({
        title: '',
        description: '',
        durationMinutes: 60,
        totalPoints: 0,
        examType: 'IELTS',
        isPublished: false,
        sections: [emptySection('Reading')],
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
                title: '',
                description: '',
                durationMinutes: 60,
                totalPoints: 0,
                examType: 'IELTS',
                isPublished: false,
                sections: [emptySection('Reading')],
            });
            setGlobalAudioUrl(null);
        }
    }, [open, initialData]);

    const updateForm = (partial: Partial<CreateExamDto>) => setForm((prev) => ({ ...prev, ...partial }));

    const updateSection = (sIdx: number, partial: Partial<CreateSectionDto>) => {
        setForm((prev) => ({
            ...prev,
            sections: prev.sections.map((s, i) => (i === sIdx ? { ...s, ...partial } : s)),
        }));
    };

    const handleGenerateListeningTranscript = async (
        audioUrl: string,
        listeningParts?: CreateSectionDto['listeningParts'],
    ) => {
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
            return splitResult.segmentsByPart.map((partSegments) =>
                serializeListeningTranscriptData({
                    segments: partSegments,
                }),
            );
        } catch (error: any) {
            throw new Error(error?.response?.data?.message || 'Không thể generate transcript từ audio.');
        }
    };

    const handleAddSection = (skill: SkillType) => {
        setForm((prev) => ({
            ...prev,
            sections: [...prev.sections, { ...emptySection(skill), orderIndex: prev.sections.length }],
        }));
    };

    const handleSubmit = async () => {
        if (!form.title.trim()) {
            message.warning('Vui lòng nhập tên đề thi!');
            return;
        }
        const normalizedSections = normalizeObjectiveQuestionPointsForSubmit(
            sanitizeSpeakingSectionsForSubmit(
                form.sections.map((section) =>
                    section.skillType === 'Listening'
                        ? { ...section, listeningParts: normalizeListeningPartsToSharedAudio(section.listeningParts ?? []) }
                        : section,
                ),
            ),
        );
        const normalizedForm: CreateExamDto = {
            ...form,
            totalPoints: countObjectiveQuestions(normalizedSections),
            sections: normalizedSections,
        };
        const limitErrors = validateExamStructureLimits(normalizedForm);
        if (limitErrors.length > 0) {
            message.error(limitErrors[0]);
            return;
        }
        try {
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

    const renderSectionContent = (section: CreateSectionDto, sIdx: number) => {
        const skill = (normalizeSkillType(section.skillType) || 'Reading') as SkillType;
        switch (skill) {
            case 'Reading':
                return (
                    <ReadingSectionEditor
                        section={section}
                        sIdx={sIdx}
                        updateSection={updateSection}
                        activeEditorRef={activeEditorRef}
                        uploading={uploading}
                        handleUploadFile={handleUploadFile}
                    />
                );
            case 'Listening':
                return (
                    <ListeningSectionEditor
                        section={section}
                        sIdx={sIdx}
                        updateSection={updateSection}
                        uploading={uploading}
                        globalAudioUrl={globalAudioUrl}
                        setGlobalAudioUrl={setGlobalAudioUrl}
                        handleUploadFile={handleUploadFile}
                        handleGenerateListeningTranscript={handleGenerateListeningTranscript}
                        activeEditorRef={activeEditorRef}
                    />
                );
            case 'Writing':
                return (
                    <WritingSectionEditor
                        section={section}
                        sIdx={sIdx}
                        updateSection={updateSection}
                        uploading={uploading}
                        handleUploadFile={handleUploadFile}
                    />
                );
            case 'Speaking':
                return (
                    <SpeakingSectionEditor
                        section={section}
                        sIdx={sIdx}
                        updateSection={updateSection}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <Modal
            title={isEdit ? 'Chỉnh sửa đề thi' : 'Tạo đề thi mới'}
            open={open}
            onCancel={onClose}
            width={1100}
            footer={[
                <Button key="back" onClick={onClose}>
                    Hủy
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    loading={createMutation.isPending || updateMutation.isPending}
                    onClick={handleSubmit}
                    style={{ background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', border: 'none' }}
                >
                    {isEdit ? 'Cập nhật đề thi' : 'Lưu đề thi'}
                </Button>,
            ]}
            centered
            styles={{ body: { padding: '24px 0', background: '#f8fafc' } }}
        >
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px',
                    maxHeight: '70vh',
                    overflowY: 'auto',
                    padding: '4px 24px',
                }}
            >
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                        <label
                            style={{
                                fontWeight: 600,
                                fontSize: '0.8125rem',
                                color: '#334155',
                                display: 'block',
                                marginBottom: '4px',
                            }}
                        >
                            Tên đề thi *
                        </label>
                        <Input
                            value={form.title}
                            onPaste={(e) => {
                                const newVal = getCleanPastedInputValue(e, form.title || '');
                                if (newVal === null) return;
                                updateForm({ title: newVal });
                            }}
                            onChange={(e) => updateForm({ title: e.target.value })}
                            placeholder="VD: IELTS Mock Test 2026"
                        />
                    </div>
                    <div>
                        <label
                            style={{
                                fontWeight: 600,
                                fontSize: '0.8125rem',
                                color: '#334155',
                                display: 'block',
                                marginBottom: '4px',
                            }}
                        >
                            Loại đề
                        </label>
                        <Select
                            value={form.examType}
                            onChange={(v) => updateForm({ examType: v })}
                            style={{ width: '100%' }}
                            options={[
                                { label: 'IELTS', value: 'IELTS' },
                            ]}
                        />
                    </div>
                </div>
                <Input.TextArea
                    value={form.description}
                    onPaste={(e) => {
                        const newVal = getCleanPastedInputValue(e, form.description || '');
                        if (newVal === null) return;
                        updateForm({ description: newVal });
                    }}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    placeholder="Mô tả đề thi..."
                    autoSize={{ minRows: 2, maxRows: 4 }}
                />
                <div style={{ display: 'flex', gap: '12px' }}>
                    <div>
                        <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155' }}>
                            Thời gian (phút)
                        </label>
                        <InputNumber
                            value={form.durationMinutes}
                            onChange={(v) => updateForm({ durationMinutes: v ?? 60 })}
                            min={1}
                            style={{ width: '100%' }}
                        />
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
                                    {skill === 'Reading' ? '📖' : skill === 'Listening' ? '🎧' : skill === 'Writing' ? '✍️' : '🎤'}{' '}
                                    {skill}
                                </span>
                            ),
                            children: (
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={sIdx}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        <div
                                            style={{
                                                display: 'flex',
                                                gap: '10px',
                                                marginBottom: '12px',
                                                flexWrap: 'wrap',
                                            }}
                                        >
                                            <Select
                                                value={skill}
                                                style={{ width: 180 }}
                                                onChange={(v: SkillType) => {
                                                    const newSection = emptySection(v);
                                                    newSection.orderIndex = sIdx;
                                                    const updated = [...form.sections];
                                                    updated[sIdx] = newSection;
                                                    setForm((prev) => ({
                                                        ...prev,
                                                        durationMinutes: getDefaultDurationForSkill(v),
                                                        sections: updated,
                                                    }));
                                                }}
                                                options={[
                                                    {
                                                        label: 'Reading',
                                                        value: 'Reading',
                                                        disabled: form.sections.some(
                                                            (sec, i) => sec.skillType === 'Reading' && i !== sIdx,
                                                        ),
                                                    },
                                                    {
                                                        label: 'Listening',
                                                        value: 'Listening',
                                                        disabled: form.sections.some(
                                                            (sec, i) => sec.skillType === 'Listening' && i !== sIdx,
                                                        ),
                                                    },
                                                    {
                                                        label: 'Writing',
                                                        value: 'Writing',
                                                        disabled: form.sections.some(
                                                            (sec, i) => sec.skillType === 'Writing' && i !== sIdx,
                                                        ),
                                                    },
                                                    {
                                                        label: 'Speaking',
                                                        value: 'Speaking',
                                                        disabled: form.sections.some(
                                                            (sec, i) => sec.skillType === 'Speaking' && i !== sIdx,
                                                        ),
                                                    },
                                                ].map((o) => ({
                                                    ...o,
                                                    label:
                                                        (o.value === 'Reading'
                                                            ? '📖 '
                                                            : o.value === 'Listening'
                                                              ? '🎧 '
                                                              : o.value === 'Writing'
                                                                ? '✍️ '
                                                                : '🎤 ') +
                                                        o.label +
                                                        (o.disabled ? ' (Đã có)' : ''),
                                                }))}
                                            />
                                        </div>
                                        {renderSectionContent(section, sIdx)}
                                    </motion.div>
                                </AnimatePresence>
                            ),
                        };
                    })}
                />

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {(['Reading', 'Listening', 'Writing', 'Speaking'] as SkillType[]).map((s) => {
                        const isAdded = form.sections.some((sec) => sec.skillType === s);
                        if (isAdded) return null;
                        return (
                            <Button
                                key={s}
                                type="dashed"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => handleAddSection(s)}
                                style={{
                                    borderColor: SKILL_COLORS[s],
                                    color: SKILL_COLORS[s],
                                }}
                            >
                                + {s}
                            </Button>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
};
