import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Divider, FloatButton, Input, InputNumber, Result, Select, Spin, Tag, message } from 'antd';
import { ArrowLeftOutlined, SaveOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import {
    useCreateExamMutation,
    useExamDetailQuery,
    useGenerateListeningTranscriptMutation,
    useUpdateExamMutation,
} from '../api/exam.api';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import type { TiptapQxEditorRef } from '../components/TiptapQxEditor';
import type { CreateExamDto, CreateQuestionGroupDto, CreateSectionDto } from '../types/exam.types';
import type { SkillType } from '../constants/questionTypes';
import {
    emptySection,
    normalizeListeningPartsToSharedAudio,
    sanitizeSpeakingSectionsForSubmit,
    SKILL_COLORS,
    validateExamStructureLimits,
} from './exam-editor/examEditor.helpers';
import { serializeListeningTranscriptData, splitListeningTranscriptSegmentsByPart } from '@/shared/lib/listeningTranscript';
import {
    ListeningSectionEditor,
    ReadingSectionEditor,
    SpeakingSectionEditor,
    WritingSectionEditor,
} from './exam-editor/SectionEditors';
import { getCleanPastedInputValue } from '@/shared/utils/input';
import { getEffectiveMcqGroupType, normalizeSkillType } from '@/shared/lib/examDisplay';

const normalizeQuestionGroupType = (group: CreateQuestionGroupDto): CreateQuestionGroupDto => {
    const effectiveType = getEffectiveMcqGroupType({
        groupType: group.groupType,
        contentData: group.contentData,
        questionCount: group.questions.length,
        hasQuestionContent: group.questions.some((question) => !!question.content?.trim()),
    });

    return effectiveType ? { ...group, groupType: effectiveType } : group;
};

const normalizeSectionQuestionTypes = (section: CreateSectionDto): CreateSectionDto => ({
    ...section,
    readingPassages: section.readingPassages?.map((passage) => ({
        ...passage,
        questionGroups: passage.questionGroups.map(normalizeQuestionGroupType),
    })),
    listeningParts: section.listeningParts?.map((part) => ({
        ...part,
        questionGroups: part.questionGroups.map(normalizeQuestionGroupType),
    })),
});

export const ExamEditorPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isEdit = !!id;
    const activeEditorRef = useRef<TiptapQxEditorRef | null>(null);

    const { data: initialData, isLoading: isLoadingData, error: loadError } = useExamDetailQuery(id || '');
    const createMutation = useCreateExamMutation();
    const updateMutation = useUpdateExamMutation();
    const generateListeningTranscriptMutation = useGenerateListeningTranscriptMutation();

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

    const calculatedTotalPoints = useMemo(() => {
        const sumQuestionPoints = (questionGroups: { questions: { points: number }[] }[] = []) => {
            return questionGroups.reduce((groupAcc, group) => (
                groupAcc + group.questions.reduce((questionAcc, question) => questionAcc + (question.points ?? 0), 0)
            ), 0);
        };

        return form.sections.reduce((sectionAcc, section) => {
            const readingPoints = (section.readingPassages ?? []).reduce((passageAcc, passage) => (
                passageAcc + sumQuestionPoints(passage.questionGroups as { questions: { points: number }[] }[])
            ), 0);

            const listeningPoints = (section.listeningParts ?? []).reduce((partAcc, part) => (
                partAcc + sumQuestionPoints(part.questionGroups as { questions: { points: number }[] }[])
            ), 0);

            return sectionAcc + readingPoints + listeningPoints;
        }, 0);
    }, [form.sections]);

    useEffect(() => {
        if (isEdit && initialData) {
            const rawFirstSection = (initialData.sections?.[0] as CreateSectionDto | undefined) ?? emptySection('Reading');
            const firstSectionSkill = (normalizeSkillType(rawFirstSection.skillType) || 'Reading') as SkillType;
            const firstSection = normalizeSectionQuestionTypes({ ...rawFirstSection, skillType: firstSectionSkill });
            setForm({
                title: initialData.title,
                description: initialData.description || '',
                durationMinutes: initialData.durationMinutes || 60,
                totalPoints: initialData.totalPoints || 0,
                examType: initialData.examType || 'IELTS',
                isPublished: initialData.isPublished,
                sections: [{ ...firstSection, orderIndex: 0 }],
            });

            const allAudios = (firstSection.listeningParts || [])
                .map((part: any) => part.audioUrl);
            setGlobalAudioUrl(allAudios.find((audio: string) => !!audio)?.trim() || null);
        }
    }, [isEdit, initialData]);

    const updateForm = (partial: Partial<CreateExamDto>) => setForm((prev) => ({ ...prev, ...partial }));

    const updateSection = (sIdx: number, partial: Partial<CreateSectionDto>) => {
        setForm((prev) => ({
            ...prev,
            sections: prev.sections.map((section, index) => (index === sIdx ? { ...section, ...partial } : section)),
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

    const handleSubmit = async () => {
        if (!form.title.trim()) {
            message.warning('Vui lòng nhập tên đề thi!');
            return;
        }

        const submitData: CreateExamDto = {
            ...form,
            totalPoints: calculatedTotalPoints,
            sections: sanitizeSpeakingSectionsForSubmit(
                form.sections
                    .map(normalizeSectionQuestionTypes)
                    .map((section) => (
                        section.skillType === 'Listening'
                            ? { ...section, listeningParts: normalizeListeningPartsToSharedAudio(section.listeningParts ?? []) }
                            : section
                    )),
            ),
        };
        const limitErrors = validateExamStructureLimits(submitData);
        if (limitErrors.length > 0) {
            message.error(limitErrors[0]);
            return;
        }

        try {
            if (isEdit && id) {
                await updateMutation.mutateAsync({ id, data: submitData });
                message.success('Cập nhật đề thi thành công!');
            } else {
                await createMutation.mutateAsync(submitData);
                message.success('Tạo đề thi thành công!');
            }
            navigate('/admin/exams');
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

    if (isEdit && isLoadingData) {
        return (
            <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
                <Spin size="large" />
                <span style={{ color: '#64748b' }}>Đang tải dữ liệu đề thi...</span>
            </div>
        );
    }

    if (isEdit && loadError) {
        return (
            <div style={{ padding: '48px' }}>
                <Result
                    status="error"
                    title="Lỗi tải dữ liệu"
                    subTitle="Không thể tìm thấy đề thi hoặc có lỗi xảy ra khi kết nối server."
                    extra={<Button type="primary" onClick={() => navigate('/admin/exams')}>Quay lại danh sách</Button>}
                />
            </div>
        );
    }

    const activeSection = form.sections[0] ?? emptySection('Reading');
    const activeSkill = (normalizeSkillType(activeSection.skillType) || 'Reading') as SkillType;
    const hasLegacyMultiSection = (initialData?.sections?.length ?? 0) > 1;

    const handleChangeSkill = (value: SkillType) => {
        setGlobalAudioUrl(null);
        updateForm({
            sections: [{ ...emptySection(value), orderIndex: 0 }],
        });
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', background: '#f8fafc', minHeight: '100vh' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/exams')} />
                    <div>
                        <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {isEdit ? 'Chỉnh sửa bài thi' : 'Tạo đề thi mới'}
                        </h2>
                        <span style={{ color: '#64748b', fontSize: '0.875rem' }}>
                            {isEdit ? `ID: ${id}` : 'Nhập thông tin đề thi để lưu vào hệ thống'}
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                    <Button onClick={() => navigate('/admin/exams')} style={{ height: '40px', fontWeight: 600, padding: '0 24px' }}>
                        Hủy
                    </Button>
                    <Button
                        type="primary"
                        icon={<SaveOutlined />}
                        loading={createMutation.isPending || updateMutation.isPending}
                        onClick={handleSubmit}
                        style={{
                            background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)',
                            border: 'none',
                            height: '40px',
                            fontWeight: 600,
                            padding: '0 24px',
                        }}
                    >
                        {isEdit ? 'Cập nhật đề thi' : 'Lưu đề thi'}
                    </Button>
                </div>
            </div>

            <Card styles={{ body: { padding: '24px' } }} style={{ borderRadius: '16px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>Tên đề thi *</label>
                            <Input value={form.title} onPaste={e => {
                                const newVal = getCleanPastedInputValue(e, form.title || '');
                                if (newVal === null) return;
                                updateForm({ title: newVal });
                            }} onChange={(event) => updateForm({ title: event.target.value })} placeholder="VD: IELTS Mock Test 2026" />
                        </div>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>Loại đề</label>
                            <Select
                                value={form.examType}
                                onChange={(value) => updateForm({ examType: value })}
                                style={{ width: '100%' }}
                                options={[{ label: 'IELTS', value: 'IELTS' }, { label: 'TOEIC', value: 'TOEIC' }]}
                            />
                        </div>
                    </div>
                    <Input.TextArea
                        value={form.description}
                        onPaste={e => {
                            const newVal = getCleanPastedInputValue(e, form.description || '');
                            if (newVal === null) return;
                            updateForm({ description: newVal });
                        }}
                        onChange={(event) => updateForm({ description: event.target.value })}
                        placeholder="Mô tả đề thi..."
                        autoSize={{ minRows: 2, maxRows: 4 }}
                    />
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>Thời gian (phút)</label>
                            <InputNumber value={form.durationMinutes} onChange={(value) => updateForm({ durationMinutes: value ?? 60 })} min={1} style={{ width: '100%' }} />
                        </div>
                        <div>
                            <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>Tổng điểm</label>
                            <InputNumber value={calculatedTotalPoints} readOnly controls={false} style={{ width: '100%', background: '#f8fafc' }} />
                        </div>
                    </div>

                    <Divider style={{ margin: '8px 0' }} />

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
                                Cấu hình kỹ năng
                            </div>
                            <div style={{ color: '#64748b', fontSize: '0.875rem' }}>
                                Mỗi đề thi chỉ gồm một kỹ năng và một section tương ứng.
                            </div>
                        </div>
                        <Tag
                            style={{
                                borderRadius: 999,
                                padding: '6px 12px',
                                margin: 0,
                                border: 'none',
                                background: `${SKILL_COLORS[activeSkill] || '#0ea5e9'}18`,
                                color: SKILL_COLORS[activeSkill] || '#0ea5e9',
                                fontWeight: 700,
                            }}
                        >
                            {activeSkill}
                        </Tag>
                    </div>

                    {hasLegacyMultiSection && (
                        <div
                            style={{
                                padding: '12px 14px',
                                borderRadius: 12,
                                background: '#fff7ed',
                                border: '1px solid #fdba74',
                                color: '#9a3412',
                                fontSize: '0.875rem',
                            }}
                        >
                            Đề này đang có dữ liệu nhiều section từ cấu trúc cũ. CMS hiện chỉ chỉnh sửa section đầu tiên để đồng bộ với mô hình một đề một kỹ năng.
                        </div>
                    )}

                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>
                                    Kỹ năng đề thi
                                </label>
                                <Select
                                    value={activeSkill}
                                    style={{ width: '100%' }}
                                    onChange={handleChangeSkill}
                                    options={[
                                        { label: '📖 Reading', value: 'Reading' },
                                        { label: '🎧 Listening', value: 'Listening' },
                                        { label: '✍️ Writing', value: 'Writing' },
                                        { label: '🎤 Speaking', value: 'Speaking' },
                                    ]}
                                />
                            </div>
                            <div>
                                <label style={{ fontWeight: 600, fontSize: '0.8125rem', color: '#334155', display: 'block', marginBottom: '4px' }}>
                                    Tiêu đề section
                                </label>
                                <Input
                                    value={activeSection.title ?? ''}
                                    placeholder="Tiêu đề section"
                                    onPaste={e => {
                                        const newVal = getCleanPastedInputValue(e, activeSection.title || '');
                                        if (newVal === null) return;
                                        updateSection(0, { title: newVal });
                                    }}
                                    onChange={(event) => updateSection(0, { title: event.target.value })}
                                />
                            </div>
                        </div>
                        {renderSectionContent(activeSection, 0)}
                    </motion.div>
                </div>
            </Card>

            <FloatButton.BackTop
                type="primary"
                shape="circle"
                style={{ right: 40, bottom: 40, width: 48, height: 48 }}
                icon={<VerticalAlignTopOutlined style={{ fontSize: 20 }} />}
                tooltip={<div>Lên đầu trang</div>}
            />
        </div>
    );
};
