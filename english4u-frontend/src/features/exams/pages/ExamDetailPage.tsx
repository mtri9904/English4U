import { Tag, Empty, Button, FloatButton, Modal, Alert } from 'antd';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { PageLoadingState, PageErrorState } from '@/components';
import { APP_EMPTY_IMAGE } from '@/components/AppEmpty';
import { useExamDetailQuery } from '@/features/exams/hooks/useExamQueries';
import { BookOutlined, ArrowLeftOutlined, EditOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import { SKILL_COLORS } from '../constants/examDetail.constants';
import { renderFormattedText } from '../utils/examDetail.utils';
import { ExamDetailSectionView } from '../components/exam-detail/ExamDetailSectionView';

export const ExamDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: exam, isLoading, error, refetch } = useExamDetailQuery(id ?? '');

    if (isLoading) {
        return <PageLoadingState type="spin" tip="Đang tải chi tiết đề thi..." />;
    }

    if (error) {
        return (
            <PageErrorState
                title="Không thể tải chi tiết đề thi"
                error={error}
                onRetry={() => refetch()}
                backUrl="/admin/exams"
                backText="Quay về danh sách"
            />
        );
    }

    if (!exam) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <Empty image={APP_EMPTY_IMAGE} imageStyle={{ height: 88 }} description="Không tìm thấy đề thi" />
                <Button type="primary" onClick={() => navigate('/admin/exams')} style={{ marginTop: 16 }}>
                    Quay về danh sách
                </Button>
            </div>
        );
    }

    const primarySection = exam.sections[0];
    const hasLegacyMultiSection = exam.sections.length > 1;
    const primarySkill = (primarySection?.skillType ?? '').trim().toUpperCase();
    const isObjectiveSection = primarySkill === 'READING' || primarySkill === 'LISTENING';
    const scoreSummaryLabel = isObjectiveSection
        ? `Tổng số câu objective: ${exam.totalPoints ?? '—'}`
        : 'Thang điểm: 0-10';

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/exams')}>
                        Quay lại
                    </Button>
                    <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Chi tiết đề thi</h2>
                </div>
                <Button
                    type="primary"
                    icon={<EditOutlined />}
                    onClick={() => {
                        if (exam?.isPublished) {
                            Modal.warning({
                                title: 'Không thể chỉnh sửa đề thi đang công khai',
                                content: (
                                    <div>
                                        <p>Đề thi này đang ở trạng thái <strong>Công khai (Xuất bản)</strong>.</p>
                                        <p>Vui lòng chuyển trạng thái về <strong>Nháp</strong> tại trang Quản lý đề thi trước khi chỉnh sửa để tránh ảnh hưởng đến học viên.</p>
                                    </div>
                                ),
                                okText: 'Đã hiểu',
                                centered: true,
                            });
                            return;
                        }
                        navigate(`/admin/exams/edit/${id}`);
                    }}
                    style={{ fontWeight: 600, borderRadius: '8px', background: '#4f46e5' }}
                >
                    Chỉnh sửa đề thi
                </Button>
            </div>

            <div
                style={{
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '16px',
                    padding: '32px',
                    color: '#fff',
                }}
            >
                <h2 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800 }}>{exam.title}</h2>
                <p style={{ margin: '12px 0 0', opacity: 0.85, fontSize: '1.125rem', whiteSpace: 'pre-wrap' }}>
                    {exam.description ? renderFormattedText(exam.description) : 'Không có mô tả'}
                </p>
                <div style={{ display: 'flex', gap: '16px', marginTop: '24px', flexWrap: 'wrap' }}>
                    <Tag
                        style={{
                            background: 'rgba(255,255,255,0.2)',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '6px 16px',
                            fontSize: '1rem',
                        }}
                    >
                        {exam.examType || 'N/A'}
                    </Tag>
                    {primarySection ? (
                        <Tag
                            style={{
                                background: 'rgba(255,255,255,0.2)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '6px 16px',
                                fontSize: '1rem',
                            }}
                        >
                            {primarySection.skillType}
                        </Tag>
                    ) : null}
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>⏱ {exam.durationMinutes ?? '—'} phút</span>
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>{scoreSummaryLabel}</span>
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>{exam.isPublished ? '✓ Đã xuất bản' : '✎ Nháp'}</span>
                </div>
            </div>

            {hasLegacyMultiSection && (
                <Alert
                    type="info"
                    showIcon
                    style={{ borderRadius: '16px', marginBottom: '16px' }}
                    message="Đề thi tích hợp nhiều kỹ năng"
                    description={`Đề thi này bao gồm ${exam.sections.length} phần thi kỹ năng. Chi tiết bên dưới đang hiển thị theo phần thi chính (${primarySection?.skillType || 'Kỹ năng chính'}).`}
                />
            )}

            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #f1f5f9' }}>
                {primarySection ? (
                    <div>
                        <div style={{ fontWeight: 700, fontSize: '1.125rem', marginBottom: '16px', color: '#0f172a' }}>
                            <BookOutlined
                                style={{
                                    marginRight: '8px',
                                    color: SKILL_COLORS[primarySection.skillType] || '#0ea5e9',
                                }}
                            />
                            {primarySection.title || primarySection.skillType}
                        </div>
                        <div>
                            <ExamDetailSectionView section={primarySection} />
                        </div>
                    </div>
                ) : (
                    <Empty image={APP_EMPTY_IMAGE} imageStyle={{ height: 88 }} description="Đề thi chưa có section nào." />
                )}
                <FloatButton.BackTop
                    type="primary"
                    shape="circle"
                    style={{ right: 40, bottom: 40, width: 48, height: 48 }}
                    icon={<VerticalAlignTopOutlined style={{ fontSize: 20 }} />}
                    tooltip={<div>Lên đầu trang</div>}
                />
            </div>
        </motion.div>
    );
};
