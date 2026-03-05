import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Divider, FloatButton, Input, InputNumber, Result, Select, Spin, Tabs, message } from 'antd';
import { ArrowLeftOutlined, MinusCircleOutlined, PlusOutlined, SaveOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useCreateExamMutation, useExamDetailQuery, useUpdateExamMutation } from '../api/exam.api';
import { uploadToCloudinary } from '@/shared/lib/cloudinary';
import type { TiptapQxEditorRef } from '../components/TiptapQxEditor';
import type { CreateExamDto, CreateSectionDto } from '../types/exam.types';
import type { SkillType } from '../constants/questionTypes';
import { emptySection, SKILL_COLORS } from './exam-editor/examEditor.helpers';
import {
    ListeningSectionEditor,
    ReadingSectionEditor,
    SpeakingSectionEditor,
    WritingSectionEditor,
} from './exam-editor/SectionEditors';

export const ExamEditorPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const isEdit = !!id;
    const activeEditorRef = useRef<TiptapQxEditorRef | null>(null);

    const { data: initialData, isLoading: isLoadingData, error: loadError } = useExamDetailQuery(id || '');
    const createMutation = useCreateExamMutation();
    const updateMutation = useUpdateExamMutation();

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
            setForm({
                title: initialData.title,
                description: initialData.description || '',
                durationMinutes: initialData.durationMinutes || 60,
                totalPoints: initialData.totalPoints || 0,
                examType: initialData.examType || 'IELTS',
                isPublished: initialData.isPublished,
                sections: initialData.sections as any,
            });

            const allAudios = (initialData.sections || [])
                .flatMap((section: any) => section.listeningParts || [])
                .map((part: any) => part.audioUrl);

            if (allAudios.length > 1 && allAudios.every((audio: string) => audio === allAudios[0] && audio !== '')) {
                setGlobalAudioUrl(allAudios[0]);
            } else {
                setGlobalAudioUrl(null);
            }
        }
    }, [isEdit, initialData]);

    const updateForm = (partial: Partial<CreateExamDto>) => setForm((prev) => ({ ...prev, ...partial }));

    const updateSection = (sIdx: number, partial: Partial<CreateSectionDto>) => {
        setForm((prev) => ({
            ...prev,
            sections: prev.sections.map((section, index) => (index === sIdx ? { ...section, ...partial } : section)),
        }));
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

        const submitData: CreateExamDto = {
            ...form,
            totalPoints: calculatedTotalPoints,
        };

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
        const skill = section.skillType as SkillType;

        switch (skill) {
            case 'Reading':
                return (
                    <ReadingSectionEditor
                        section={section}
                        sIdx={sIdx}
                        updateSection={updateSection}
                        activeEditorRef={activeEditorRef}
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
                            <Input value={form.title} onChange={(event) => updateForm({ title: event.target.value })} placeholder="VD: IELTS Mock Test 2026" />
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
                                                <Select
                                                    value={skill}
                                                    style={{ width: 180 }}
                                                    onChange={(value: SkillType) => {
                                                        const newSection = emptySection(value);
                                                        newSection.orderIndex = sIdx;
                                                        const updatedSections = [...form.sections];
                                                        updatedSections[sIdx] = newSection;
                                                        setForm((prev) => ({ ...prev, sections: updatedSections }));
                                                    }}
                                                    options={[
                                                        { label: '📖 Reading', value: 'Reading' },
                                                        { label: '🎧 Listening', value: 'Listening' },
                                                        { label: '✍️ Writing', value: 'Writing' },
                                                        { label: '🎤 Speaking', value: 'Speaking' },
                                                    ]}
                                                />
                                                <Input
                                                    value={section.title ?? ''}
                                                    style={{ flex: 1 }}
                                                    placeholder="Tiêu đề section"
                                                    onChange={(event) => updateSection(sIdx, { title: event.target.value })}
                                                />
                                                {form.sections.length > 1 && (
                                                    <Button
                                                        danger
                                                        icon={<MinusCircleOutlined />}
                                                        onClick={() => {
                                                            const updatedSections = form.sections.filter((_, index) => index !== sIdx);
                                                            updateForm({ sections: updatedSections });
                                                        }}
                                                    />
                                                )}
                                            </div>
                                            {renderSectionContent(section, sIdx)}
                                        </motion.div>
                                    </AnimatePresence>
                                ),
                            };
                        })}
                    />

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {(['Reading', 'Listening', 'Writing', 'Speaking'] as SkillType[]).map((skill) => (
                            <Button
                                key={skill}
                                type="dashed"
                                size="small"
                                icon={<PlusOutlined />}
                                onClick={() => handleAddSection(skill)}
                                style={{ borderColor: SKILL_COLORS[skill], color: SKILL_COLORS[skill] }}
                            >
                                + {skill}
                            </Button>
                        ))}
                    </div>
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
