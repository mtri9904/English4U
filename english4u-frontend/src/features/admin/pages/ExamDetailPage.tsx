import { Spin, Tag, Collapse, Empty, Button, FloatButton } from 'antd';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamDetailQuery } from '../api/exam.api';
import { BookOutlined, QuestionCircleOutlined, ArrowLeftOutlined, SoundOutlined, VerticalAlignTopOutlined } from '@ant-design/icons';
import type { QuestionGroupDto, QuestionDto, SectionDetailDto } from '../types/exam.types';

const typeColorMap: Record<string, string> = {
    MCQ_SINGLE: '#7c3aed', MCQ_MULTIPLE: '#8b5cf6',
    TFNG: '#10b981', YNNG: '#10b981',
    MATCHING_HEADINGS: '#f59e0b', MATCHING_INFO: '#d97706', MATCHING_FEATURES: '#b45309',
    SENTENCE_COMPLETION: '#3b82f6', SUMMARY_COMPLETION: '#2563eb',
    TABLE_COMPLETION: '#1d4ed8', MATCHING_TABLE: '#1e40af', FLOWCHART_COMPLETION: '#1e40af',
    MAP_LABELLING: '#0ea5e9',
    SHORT_ANSWER: '#ec4899',
};

const MATCHING_TYPES = new Set(['MATCHING_HEADINGS', 'MATCHING_INFO', 'MATCHING_FEATURES', 'MATCHING_TABLE', 'MAP_LABELLING']);
const TABLE_TYPES = new Set(['TABLE_COMPLETION', 'MATCHING_TABLE']);
const TABLE_TITLE_PLACEHOLDER = 'Tiêu đề bảng';

const SKILL_COLORS: Record<string, string> = {
    Reading: '#10b981', Listening: '#6366f1', Writing: '#f59e0b', Speaking: '#ef4444',
};

const QuestionItem = ({ q, qIdx, groupType }: { q: QuestionDto; qIdx: number; groupType: string | null }) => {
    const gType = groupType ?? '';
    const color = typeColorMap[gType] || '#64748b';
    const isMatchingType = new Set(['MATCHING_HEADINGS', 'MATCHING_INFO', 'MATCHING_FEATURES', 'MATCHING_TABLE', 'MAP_LABELLING']).has(gType);
    return (
        <div style={{ padding: '16px', background: '#fff', borderRadius: '10px', marginBottom: '8px', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <QuestionCircleOutlined style={{ color: '#0ea5e9', fontSize: '1.125rem' }} />
                <span style={{ fontWeight: 600, color: '#0f172a', fontSize: '1rem' }}>Câu {q.questionNumber ?? qIdx + 1}</span>
                {gType && <Tag style={{ background: `${color}15`, color, border: 'none', borderRadius: '6px', fontSize: '0.875rem' }}>{gType}</Tag>}
                <span style={{ marginLeft: 'auto', fontSize: '0.875rem', color: '#94a3b8' }}>{q.points} điểm</span>
            </div>
            <p style={{ margin: '4px 0 0', color: '#475569', fontSize: '0.9375rem', whiteSpace: 'pre-wrap' }}>
                {renderFormattedText(q.content || '')}
            </p>
            {q.correctAnswer && (
                <div style={{ marginTop: '8px', padding: '6px 12px', background: '#dcfce7', borderRadius: '6px', color: '#16a34a', fontWeight: 600, fontSize: '0.875rem' }}>
                    Đáp án: {q.correctAnswer}
                </div>
            )}
            {q.options.length > 0 && !isMatchingType && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {q.options.map((opt, oIdx) => (
                        <div key={oIdx} style={{
                            fontSize: '0.9375rem', padding: '6px 12px', borderRadius: '6px',
                            background: opt.isCorrect ? '#dcfce7' : 'transparent',
                            color: opt.isCorrect ? '#16a34a' : '#64748b',
                            fontWeight: opt.isCorrect ? 600 : 400,
                            border: opt.isCorrect ? '1px solid #bbf7d0' : '1px solid transparent'
                        }}>
                            {String.fromCharCode(65 + oIdx)}. {renderFormattedText(opt.optionText || '')}{opt.isCorrect && ' ✓'}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const renderFormattedText = (text: string) => {
    if (!text) return null;
    // Split by [Qn] and **bold**
    const parts = text.split(/(\[Q\d+\]|\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
        if (/^\[Q\d+\]$/.test(part)) {
            return (
                <b key={i} style={{ color: '#2563eb', padding: '0 4px', background: '#dbeafe', borderRadius: '3px', fontSize: '0.8125rem' }}>
                    {part}
                </b>
            );
        }
        if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={i} style={{ fontWeight: 800, color: '#1e293b' }}>{part.slice(2, -2)}</strong>;
        }
        return part;
    });
};

const renderGroupContent = (group: QuestionGroupDto) => {
    if (!group.contentData && !group.assetsData) return null;
    const parsedContentText = (() => {
        if (!group.contentData) return '';

        if (group.groupType === 'MCQ_MULTIPLE') {
            try {
                const parsed = JSON.parse(group.contentData);
                if (parsed && typeof parsed === 'object' && (parsed as { layout?: unknown }).layout === 'listening_multi_select') {
                    const prompt = (parsed as { prompt?: unknown }).prompt;
                    return typeof prompt === 'string' ? prompt : '';
                }
            } catch {
                return group.contentData;
            }
        }

        return group.contentData;
    })();
    const assetImageUrl = (() => {
        if (!group.assetsData) return null;

        if (group.groupType === 'MAP_LABELLING') {
            try {
                const parsed = JSON.parse(group.assetsData);
                if (typeof parsed === 'string') return parsed;
                if (parsed && typeof parsed === 'object') {
                    if (typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string') {
                        return (parsed as { imageUrl: string }).imageUrl;
                    }
                    if (typeof (parsed as { url?: unknown }).url === 'string') {
                        return (parsed as { url: string }).url;
                    }
                }
            } catch {
                return group.assetsData;
            }
        }

        return group.assetsData;
    })();

    if (TABLE_TYPES.has(group.groupType || '')) {
        try {
            const parsedData = JSON.parse(group.contentData || '[]');
            const tableData = Array.isArray(parsedData)
                ? parsedData
                : (parsedData && typeof parsedData === 'object' && Array.isArray((parsedData as { rows?: unknown }).rows)
                    ? (parsedData as { rows: unknown[] }).rows
                    : []);
            const tableTitle = parsedData && typeof parsedData === 'object' && !Array.isArray(parsedData)
                && typeof (parsedData as { title?: unknown }).title === 'string'
                ? (parsedData as { title: string }).title.trim()
                : '';
            const normalizedTableTitle = tableTitle === TABLE_TITLE_PLACEHOLDER ? '' : tableTitle;

            if (Array.isArray(tableData) && tableData.length > 0) {
                return (
                    <div style={{ overflowX: 'auto', marginBottom: '15px' }}>
                        {normalizedTableTitle && (
                            <div style={{ fontWeight: 700, fontSize: '1rem', color: '#1e293b', marginBottom: '8px' }}>
                                {renderFormattedText(normalizedTableTitle)}
                            </div>
                        )}
                        <table style={{ borderCollapse: 'collapse', width: '100%', background: '#fff', fontSize: '0.875rem' }}>
                            <tbody>
                                {tableData.map((row, rIdx) => (
                                    <tr key={rIdx}>
                                        {Array.isArray(row) && row.map((cell, cIdx: number) => (
                                            <td key={cIdx} style={{ border: '1px solid #cbd5e1', padding: '10px' }}>
                                                {renderFormattedText(typeof cell === 'string' ? cell : '')}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            }
        } catch (e) { }
    }

    return (
        <div style={{ marginBottom: '15px' }}>
            {assetImageUrl && (
                <div style={{ marginBottom: '12px', textAlign: 'center' }}>
                    <img src={assetImageUrl} alt="Question Asset" style={{ maxWidth: '100%', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                </div>
            )}
            {parsedContentText && (
                <div style={{ background: '#fff', border: '1px solid #e2e8f0', padding: '16px', borderRadius: '12px', fontSize: '0.9375rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {renderFormattedText(parsedContentText)}
                </div>
            )}
        </div>
    );
};

const QuestionGroupBlock = ({ group, gIdx }: { group: QuestionGroupDto; gIdx: number }) => (
    <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0', marginBottom: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontWeight: 600, color: '#334155', fontSize: '0.9375rem' }}>Nhóm {gIdx + 1}</span>
            {group.groupType && <Tag color="blue">{group.groupType}</Tag>}
            {group.startQuestion != null && group.endQuestion != null && (
                <span style={{ fontSize: '0.8125rem', color: '#94a3b8' }}>Câu {group.startQuestion}–{group.endQuestion}</span>
            )}
        </div>
        {group.instruction && (
            <div style={{ marginBottom: '10px', padding: '10px', background: '#eef2ff', borderRadius: '8px', color: '#3730a3', fontSize: '0.875rem', lineHeight: 1.5 }}>
                {renderFormattedText(group.instruction)}
            </div>
        )}
        {renderGroupContent(group)}
        {MATCHING_TYPES.has(group.groupType || '') && group.questions[0]?.options?.length > 0 && (
            <div style={{ background: '#fff', padding: '12px', border: '2px solid #0ea5e9', borderRadius: '12px', marginBottom: '15px' }}>
                <div style={{ fontWeight: 700, color: '#0369a1', marginBottom: '8px', fontSize: '0.875rem', textTransform: 'uppercase' }}>Danh sách lựa chọn (Options):</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '8px' }}>
                    {group.questions[0].options.map((opt, idx) => (
                        <div key={idx} style={{ fontSize: '0.9375rem', color: '#334155' }}>
                            <b style={{ color: '#0ea5e9', width: '25px', display: 'inline-block' }}>{String.fromCharCode(65 + idx)}.</b> {renderFormattedText(opt.optionText || '')}
                        </div>
                    ))}
                </div>
            </div>
        )}
        {group.questions.map((q, qIdx) => (
            <QuestionItem key={qIdx} q={q} qIdx={qIdx} groupType={group.groupType} />
        ))}
    </div>
);

const renderSectionBody = (section: SectionDetailDto) => {
    const skill = section.skillType;

    if (skill === 'Reading' || skill === 'READING') {
        const passages = section.readingPassages ?? [];
        if (passages.length === 0) return <Empty description="Chưa có passage" />;
        return passages.map((p, pIdx) => (
            <div key={pIdx} style={{ marginBottom: '16px' }}>
                <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Reading, margin: '0 0 8px' }}>Passage {p.passageNumber ?? pIdx + 1}: {p.title || ''}</h4>
                {p.paragraphsData && (
                    <Collapse ghost items={[{
                        key: '1',
                        label: <span style={{ color: '#0ea5e9', fontWeight: 600 }}>Nội dung đoạn văn</span>,
                        children: (
                            <div style={{ color: '#475569', fontSize: '1rem', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                {renderFormattedText(p.paragraphsData)}
                            </div>
                        )
                    }]} style={{ marginBottom: '12px', background: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
                )}
                {p.questionGroups
                    .sort((a, b) => {
                        const aStart = a.startQuestion ?? (a.questions[0]?.questionNumber || 0);
                        const bStart = b.startQuestion ?? (b.questions[0]?.questionNumber || 0);
                        return aStart - bStart;
                    })
                    .map((g, gIdx) => <QuestionGroupBlock key={gIdx} group={g} gIdx={gIdx} />)}
            </div>
        ));
    }

    if (skill === 'Listening' || skill === 'LISTENING') {
        const parts = section.listeningParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có listening part" />;
        return parts.map((lp, lpIdx) => (
            <div key={lpIdx} style={{ marginBottom: '16px' }}>
                <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Listening, margin: '0 0 8px' }}>Part {lp.partNumber ?? lpIdx + 1}</h4>
                {lp.audioUrl && (
                    <div style={{ background: '#eef2ff', borderRadius: '8px', padding: '10px', marginBottom: '10px', border: '1px dashed #6366f1' }}>
                        <SoundOutlined style={{ marginRight: '6px', color: '#3730a3' }} />
                        <audio controls src={lp.audioUrl} style={{ verticalAlign: 'middle' }} />
                    </div>
                )}
                {lp.contextDescription && (
                    <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '10px' }}>{lp.contextDescription}</p>
                )}
                {lp.questionGroups
                    .sort((a, b) => {
                        const aStart = a.startQuestion ?? (a.questions[0]?.questionNumber || 0);
                        const bStart = b.startQuestion ?? (b.questions[0]?.questionNumber || 0);
                        return aStart - bStart;
                    })
                    .map((g, gIdx) => <QuestionGroupBlock key={gIdx} group={g} gIdx={gIdx} />)}
            </div>
        ));
    }

    if (skill === 'Writing' || skill === 'WRITING') {
        const tasks = section.writingTasks ?? [];
        if (tasks.length === 0) return <Empty description="Chưa có writing task" />;
        return tasks.map((t, tIdx) => (
            <div key={tIdx} style={{ background: '#fffbeb', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: '1px solid #fde68a' }}>
                <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Writing, margin: '0 0 8px' }}>Task {t.taskNumber ?? tIdx + 1}</h4>
                <div style={{ whiteSpace: 'pre-wrap', color: '#475569', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '8px' }}>{t.promptText}</div>
                <span style={{ fontSize: '0.8125rem', color: '#92400e' }}>Tối thiểu {t.minWords} từ</span>
                {t.assetsData && <img src={t.assetsData} alt="Writing asset" style={{ maxWidth: '100%', marginTop: '10px', borderRadius: '8px' }} />}
            </div>
        ));
    }

    if (skill === 'Speaking' || skill === 'SPEAKING') {
        const parts = section.speakingParts ?? [];
        if (parts.length === 0) return <Empty description="Chưa có speaking part" />;
        return parts.map((sp, spIdx) => (
            <div key={spIdx} style={{ background: '#fef2f2', borderRadius: '12px', padding: '16px', marginBottom: '12px', border: '1px solid #fecaca' }}>
                <h4 style={{ fontWeight: 700, color: SKILL_COLORS.Speaking, margin: '0 0 8px' }}>Part {sp.partNumber ?? spIdx + 1}</h4>
                {sp.description && <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '10px' }}>{sp.description}</p>}
                {sp.questions.map((sq, sqIdx) => (
                    <div key={sqIdx} style={{ padding: '10px', background: '#fff', borderRadius: '8px', marginBottom: '6px', border: '1px solid #f1f5f9' }}>
                        <span style={{ fontWeight: 600, color: '#991b1b', marginRight: '6px' }}>Q{sqIdx + 1}.</span>
                        {sq.content}
                        {sq.cueCardPoints && (
                            <div style={{ marginTop: '6px', padding: '8px', background: '#fef2f2', borderRadius: '6px', fontSize: '0.8125rem', color: '#991b1b', whiteSpace: 'pre-wrap' }}>
                                Cue Card: {sq.cueCardPoints}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        ));
    }

    return <Empty description="Kỹ năng không xác định" />;
};

export const ExamDetailPage = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { data: exam, isLoading } = useExamDetailQuery(id ?? '');

    if (isLoading) {
        return (<div style={{ display: 'flex', justifyContent: 'center', padding: '100px' }}><Spin size="large" /></div>);
    }

    if (!exam) {
        return (
            <div style={{ padding: '40px' }}>
                <Empty description="Không tìm thấy đề thi" />
                <Button type="primary" onClick={() => navigate('/admin/exams')} style={{ marginTop: 16 }}>Quay về danh sách</Button>
            </div>
        );
    }

    return (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/exams')}>Quay lại</Button>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>Chi tiết đề thi</h2>
            </div>

            <div style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', borderRadius: '16px', padding: '32px', color: '#fff' }}>
                <h2 style={{ margin: 0, fontSize: '1.875rem', fontWeight: 800 }}>{exam.title}</h2>
                <p style={{ margin: '12px 0 0', opacity: 0.85, fontSize: '1.125rem' }}>{exam.description || 'Không có mô tả'}</p>
                <div style={{ display: 'flex', gap: '16px', marginTop: '24px', flexWrap: 'wrap' }}>
                    <Tag style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', borderRadius: '8px', padding: '6px 16px', fontSize: '1rem' }}>{exam.examType || 'N/A'}</Tag>
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>⏱ {exam.durationMinutes ?? '—'} phút</span>
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>📊 {exam.totalPoints ?? '—'} điểm</span>
                    <span style={{ opacity: 0.9, fontSize: '1rem' }}>{exam.isPublished ? '✅ Đã xuất bản' : '📝 Nháp'}</span>
                </div>
            </div>

            <div style={{ background: '#fff', borderRadius: '16px', padding: '24px', border: '1px solid #f1f5f9' }}>
                <Collapse
                    defaultActiveKey={exam.sections.map((_, i) => i.toString())}
                    style={{ background: 'transparent', border: 'none' }}
                    items={exam.sections.map((section, sIdx) => ({
                        key: sIdx.toString(),
                        label: (
                            <span style={{ fontWeight: 700, fontSize: '1.125rem' }}>
                                <BookOutlined style={{ marginRight: '8px', color: SKILL_COLORS[section.skillType] || '#0ea5e9' }} />
                                {section.title || section.skillType}
                            </span>
                        ),
                        children: <div>{renderSectionBody(section)}</div>,
                    }))}
                />
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
