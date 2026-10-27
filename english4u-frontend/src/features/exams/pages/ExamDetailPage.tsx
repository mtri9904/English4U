import { Spin, Tag, Empty, Button, FloatButton } from 'antd';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamDetailQuery } from '@/features/exams/hooks/useExamQueries';
import { BookOutlined, ArrowLeftOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import { SKILL_COLORS } from '../constants/examDetail.constants';
import { renderFormattedText } from '../utils/examDetail.utils';
import { ExamDetailSectionView } from '../components/exam-detail/ExamDetailSectionView';

export const ExamDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: exam, isLoading, error } = useExamDetailQuery(id ?? '');

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        const errorMessage =
            (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
            (error as { message?: string })?.message ||
            'Không tải được chi tiết đề thi.';

        return (
            <div style={{ padding: '40px' }}>
                <Empty description={errorMessage} />
                <Button type="primary" onClick={() => navigate('/admin/exams')} style={{ marginTop: 16 }}>
                    Quay về danh sách
                </Button>
            </div>
        );
    }

    if (!exam) {
        return (
            <div style={{ padding: '40px' }}>
                <Empty description="Không tìm thấy đề thi" />
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/exams')}>
                    Quay lại
                </Button>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Chi tiết đề thi</h2>
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
                <div
                    style={{
                        background: '#fff7ed',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        border: '1px solid #fdba74',
                        color: '#9a3412',
                    }}
                >
                    Đề này đang có nhiều section từ cấu trúc cũ. CMS hiện ưu tiên hiển thị section đầu tiên để khớp với mô hình một đề một kỹ năng.
                </div>
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
                    <Empty description="Đề thi chưa có section nào." />
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
