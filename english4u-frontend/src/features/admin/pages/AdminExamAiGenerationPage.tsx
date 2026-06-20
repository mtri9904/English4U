import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Progress, Radio, Upload, Alert, Space, Typography, Tag, message } from 'antd';
import {
    ArrowLeftOutlined,
    UploadOutlined,
    ThunderboltOutlined,
    BookOutlined,
    FileTextOutlined,
    GlobalOutlined,
    CheckCircleOutlined,
    DashboardOutlined,
} from '@ant-design/icons';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGenerateExamAiMutation } from '../api/exam.api';
import { REALTIME_BROWSER_EVENT } from '@/features/realtime/hooks/useRealtimeSync';

const { Title, Text, Paragraph } = Typography;

type RealtimeEnvelope = {
    type?: string;
    payload?: unknown;
};

type PdfGenerationProgressPayload = {
    clientRequestId?: string | null;
    uploadId?: string;
    uploadedBy?: string;
    status?: string;
    progressPercent?: number;
    stage?: string;
    message?: string;
    passageNumber?: number | null;
    totalPassages?: number | null;
    examId?: string | null;
};

const RANDOM_UUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
};

export const AdminExamAiGenerationPage = () => {
    const navigate = useNavigate();
    const generateMutation = useGenerateExamAiMutation();

    const [form] = Form.useForm();
    const [inputMode, setInputMode] = useState<'random' | 'topic' | 'document'>('random');
    const [fileList, setFileList] = useState<any[]>([]);
    

    const [activeClientId, setActiveClientId] = useState<string | null>(null);
    const [progress, setProgress] = useState<PdfGenerationProgressPayload | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    

    const [qualityMetrics, setQualityMetrics] = useState<{
        accuracy?: number;
        passages?: Array<{
            num: number;
            fk: number;
            fog: number;
            words: number;
            awl: number;
        }>;
    } | null>(null);

    useEffect(() => {
        const handleRealtimeEvent = (event: Event) => {
            const customEvent = event as CustomEvent<RealtimeEnvelope>;
            const detail = customEvent.detail;
            if (!detail || detail.type !== 'exam.pdf-generation.progress' || !detail.payload) {
                return;
            }

            const payload = detail.payload as PdfGenerationProgressPayload;
            const eventClientRequestId = payload.clientRequestId?.trim() || null;
            const activeId = activeClientId?.trim() || null;

            if (activeId && eventClientRequestId && activeId.toLowerCase() === eventClientRequestId.toLowerCase()) {
                setProgress(payload);
                if (payload.status === 'completed') {
                    setIsGenerating(false);
                    message.success('Sinh đề thi IELTS thành công!');
                } else if (payload.status === 'failed') {
                    setIsGenerating(false);
                    message.error(payload.message || 'Sinh đề thất bại do lỗi hệ thống.');
                }
            }
        };

        window.addEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent as EventListener);
        return () => {
            window.removeEventListener(REALTIME_BROWSER_EVENT, handleRealtimeEvent as EventListener);
        };
    }, [activeClientId]);

    const handleStartGeneration = async (values: any) => {
        const clientReqId = RANDOM_UUID();
        setActiveClientId(clientReqId);
        setIsGenerating(true);
        setQualityMetrics(null);
        setProgress({
            clientRequestId: clientReqId,
            status: 'processing',
            progressPercent: 1,
            stage: 'uploading',
            message: 'Đang gửi yêu cầu khởi tạo luồng sinh đề thi...',
        });

        try {
            const file = inputMode === 'document' && fileList.length > 0 ? (fileList[0].originFileObj || fileList[0]) : null;
            await generateMutation.mutateAsync({
                file,
                inputMode,
                topicDescription: values.topicDescription,
                languageCode: 'en',
                clientRequestId: clientReqId,
            });
        } catch (error: any) {
            setIsGenerating(false);
            setProgress((prev) => ({
                ...prev,
                status: 'failed',
                message: error?.response?.data?.message || 'Có lỗi xảy ra khi bắt đầu tiến trình sinh đề.',
            }));
        }
    };

    const handleBeforeUpload = (file: File) => {
        const isPdfOrTxt = file.type === 'application/pdf' || file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.pdf');
        if (!isPdfOrTxt) {
            message.error('Hệ thống chỉ hỗ trợ tệp PDF hoặc tệp văn bản thô (.txt)!');
            return Upload.LIST_IGNORE;
        }
        setFileList([{
            uid: (file as any).uid || RANDOM_UUID(),
            name: file.name,
            status: 'done',
            originFileObj: file
        }]);
        return false;
    };


    useEffect(() => {
        if (progress?.status === 'completed' && progress.examId) {
            void fetchExamQuality(progress.examId);
        }
    }, [progress?.status, progress?.examId]);

    const fetchExamQuality = async (examId: string) => {
        try {
            const { axiosInstance } = await import('@/apis/axios.instance');
            const res = await axiosInstance.get<any>(`/exam/${examId}`);
            const description = res.data?.description || '';
            

            const accuracyMatch = /Validator Agent Accuracy:\s*([\d\.]+)%/.exec(description);
            const accuracy = accuracyMatch ? parseFloat(accuracyMatch[1]) : undefined;
            
            const passages: any[] = [];
            const passageRegex = /Passage (\d+) Quality Log[^:]*:\s*- Flesch-Kincaid Grade:\s*([\d\.]+)\s*- Gunning Fog:\s*([\d\.]+)\s*- Word Count:\s*(\d+)\s*- AWL Ratio:\s*([\d\.]+)%/g;
            let match;
            while ((match = passageRegex.exec(description)) !== null) {
                passages.push({
                    num: parseInt(match[1]),
                    fk: parseFloat(match[2]),
                    fog: parseFloat(match[3]),
                    words: parseInt(match[4]),
                    awl: parseFloat(match[5]),
                });
            }
            
            if (accuracy !== undefined || passages.length > 0) {
                setQualityMetrics({ accuracy, passages });
            }
        } catch (err) {
            console.error('Failed to load quality metrics', err);
        }
    };

    return (
        <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', minHeight: '100vh', background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '28px' }}>
                <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/admin/exams')} style={{ borderRadius: '10px' }} />
                <div>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: 900, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' }}>
                        AI IELTS Exam Generator
                    </h2>
                    <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        Tự động sinh đề IELTS Academic Reading đạt chuẩn thông qua mô hình Generative AI
                    </span>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isGenerating || progress ? '1fr' : '1fr', gap: '24px' }}>
                <AnimatePresence mode="wait">
                    {!isGenerating && !progress ? (
                        <motion.div
                            key="form-container"
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -15 }}
                        >
                            <Card
                                style={{
                                    borderRadius: '20px',
                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                                    border: '1px solid rgba(226, 232, 240, 0.8)',
                                }}
                            >
                                <Form form={form} layout="vertical" onFinish={handleStartGeneration}>
                                    <Form.Item label={<span style={{ fontWeight: 700, color: '#334155' }}>Chọn chế độ đầu vào</span>}>
                                        <Radio.Group
                                            value={inputMode}
                                            onChange={(e) => setInputMode(e.target.value)}
                                            style={{ width: '100%', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}
                                        >
                                            <Radio.Button
                                                value="random"
                                                style={{
                                                    height: '110px',
                                                    borderRadius: '16px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    textAlign: 'center',
                                                    border: '2px solid rgba(226, 232, 240, 0.8)',
                                                }}
                                            >
                                                <GlobalOutlined style={{ fontSize: '24px', color: '#6366f1', marginBottom: '8px' }} />
                                                <div style={{ fontWeight: 800 }}>Chủ đề ngẫu nhiên</div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>AI tự chọn chủ đề khoa học</div>
                                            </Radio.Button>

                                            <Radio.Button
                                                value="topic"
                                                style={{
                                                    height: '110px',
                                                    borderRadius: '16px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    textAlign: 'center',
                                                    border: '2px solid rgba(226, 232, 240, 0.8)',
                                                }}
                                            >
                                                <BookOutlined style={{ fontSize: '24px', color: '#0ea5e9', marginBottom: '8px' }} />
                                                <div style={{ fontWeight: 800 }}>Mô tả chủ đề</div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Tùy ý chỉ định chủ đề học thuật</div>
                                            </Radio.Button>

                                            <Radio.Button
                                                value="document"
                                                style={{
                                                    height: '110px',
                                                    borderRadius: '16px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    textAlign: 'center',
                                                    border: '2px solid rgba(226, 232, 240, 0.8)',
                                                }}
                                            >
                                                <FileTextOutlined style={{ fontSize: '24px', color: '#10b981', marginBottom: '8px' }} />
                                                <div style={{ fontWeight: 800 }}>Tài liệu khoa học</div>
                                                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Sinh bài từ file PDF/TXT thô</div>
                                            </Radio.Button>
                                        </Radio.Group>
                                    </Form.Item>

                                    {inputMode === 'topic' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <Form.Item
                                                name="topicDescription"
                                                label={<span style={{ fontWeight: 700, color: '#334155' }}>Mô tả chủ đề học thuật</span>}
                                                rules={[{ required: true, message: 'Vui lòng nhập mô tả chủ đề!' }]}
                                            >
                                                <Input.TextArea
                                                    rows={4}
                                                    placeholder="Ví dụ: Sự tiến hóa của trí tuệ nhân tạo, tác động của biến đổi khí hậu lên các loài sinh vật biển sâu, hoặc nghiên cứu khảo cổ về nền văn minh Maya..."
                                                    style={{ borderRadius: '12px' }}
                                                />
                                            </Form.Item>
                                        </motion.div>
                                    )}

                                    {inputMode === 'document' && (
                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                                            <Form.Item
                                                label={<span style={{ fontWeight: 700, color: '#334155' }}>Tải lên tài liệu khoa học thô (.pdf, .txt)</span>}
                                                required
                                            >
                                                <Upload
                                                    beforeUpload={handleBeforeUpload}
                                                    fileList={fileList}
                                                    onRemove={() => setFileList([])}
                                                    maxCount={1}
                                                >
                                                    <Button icon={<UploadOutlined />} style={{ borderRadius: '10px' }}>
                                                        Chọn tệp tài liệu
                                                    </Button>
                                                </Upload>
                                                <Paragraph style={{ color: '#64748b', fontSize: '12px', marginTop: '8px' }}>
                                                    Hệ thống sẽ trích xuất văn bản cốt lõi và biên soạn thành 3 bài đọc IELTS Academic hoàn toàn mới theo cấu trúc chuẩn.
                                                </Paragraph>
                                            </Form.Item>
                                        </motion.div>
                                    )}

                                    <Form.Item style={{ marginTop: '24px', marginBottom: 0 }}>
                                        <Button
                                            type="primary"
                                            htmlType="submit"
                                            icon={<ThunderboltOutlined />}
                                            style={{
                                                width: '100%',
                                                height: '48px',
                                                borderRadius: '14px',
                                                fontWeight: 800,
                                                fontSize: '1rem',
                                                border: 'none',
                                                background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                                                boxShadow: '0 10px 20px rgba(99, 102, 241, 0.25)',
                                            }}
                                        >
                                            Bắt đầu Sinh đề AI
                                        </Button>
                                    </Form.Item>
                                </Form>
                            </Card>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="progress-container"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                        >
                            <Card
                                style={{
                                    borderRadius: '20px',
                                    boxShadow: '0 10px 25px -5px rgba(0,0,0,0.05)',
                                    border: '1px solid rgba(226, 232, 240, 0.8)',
                                    padding: '12px',
                                }}
                            >
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 12px' }}>
                                    <div
                                        style={{
                                            position: 'relative',
                                            width: '150px',
                                            height: '150px',
                                            marginBottom: '28px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                        }}
                                    >
                                        {isGenerating && (
                                            <motion.div
                                                animate={{ scale: [1, 1.25, 1], opacity: [0.15, 0, 0.15] }}
                                                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                                                style={{
                                                    position: 'absolute',
                                                    width: '180px',
                                                    height: '180px',
                                                    borderRadius: '999px',
                                                    background: 'rgba(99, 102, 241, 0.1)',
                                                }}
                                            />
                                        )}
                                        <Progress
                                            type="circle"
                                            percent={progress?.progressPercent ?? 0}
                                            strokeColor={{ '0%': '#6366f1', '100%': '#0ea5e9' }}
                                            strokeWidth={8}
                                            width={140}
                                        />
                                    </div>

                                    <Title level={4} style={{ fontWeight: 800, margin: '0 0 8px 0', color: '#1e293b' }}>
                                        {progress?.message || 'Đang xử lý dữ liệu...'}
                                    </Title>
                                    <Text type="secondary" style={{ fontSize: '13px', marginBottom: '24px' }}>
                                        Giai đoạn: <Tag color="blue" style={{ fontWeight: 700 }}>{progress?.stage?.toUpperCase() || 'KHỞI TẠO'}</Tag>
                                    </Text>

                                    {progress?.passageNumber && progress?.totalPassages ? (
                                        <Alert
                                            message={
                                                <div style={{ fontWeight: 700, color: '#1e3a8a' }}>
                                                    Đang xử lý Bài đọc {progress.passageNumber} / {progress.totalPassages}
                                                </div>
                                            }
                                            type="info"
                                            showIcon
                                            style={{ width: '100%', maxWidth: '400px', borderRadius: '12px', marginBottom: '24px' }}
                                        />
                                    ) : null}


                                    {progress?.status === 'failed' && (
                                        <Alert
                                            message={<span style={{ fontWeight: 700 }}>Thất bại</span>}
                                            description={progress.message}
                                            type="error"
                                            showIcon
                                            style={{ width: '100%', maxWidth: '500px', borderRadius: '12px', marginBottom: '24px' }}
                                        />
                                    )}


                                    {progress?.status === 'completed' && qualityMetrics && (
                                        <motion.div
                                            initial={{ opacity: 0, y: 15 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            style={{ width: '100%', maxWidth: '600px', marginTop: '12px', marginBottom: '28px' }}
                                        >
                                            <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '16px', border: '1px solid #bbf7d0', marginBottom: '16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                                    <CheckCircleOutlined style={{ color: '#16a34a', fontSize: '20px' }} />
                                                    <span style={{ fontWeight: 800, color: '#14532d', fontSize: '14px' }}>BÁO CÁO KIỂM ĐỊNH CHẤT LƯỢNG (AI QA PIPELINE)</span>
                                                </div>
                                                <Space direction="vertical" size="small" style={{ width: '100%', fontSize: '13px' }}>
                                                    <div>
                                                        Độ chính xác giải đề của <strong>Validator Agent</strong>:{' '}
                                                        <Tag color={qualityMetrics.accuracy && qualityMetrics.accuracy >= 90 ? 'green' : 'orange'} style={{ fontWeight: 800 }}>
                                                            {qualityMetrics.accuracy?.toFixed(1)}%
                                                        </Tag>
                                                    </div>
                                                    
                                                    {qualityMetrics.passages?.map((p) => (
                                                        <div key={p.num} style={{ marginTop: '8px', borderTop: '1px dashed rgba(20, 83, 45, 0.15)', paddingTop: '8px' }}>
                                                            <strong>Passage {p.num} Readability Metrics:</strong>
                                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginTop: '4px', fontSize: '12px' }}>
                                                                <div>FK Grade: <strong style={{ color: '#16a34a' }}>{p.fk.toFixed(1)}</strong></div>
                                                                <div>Gunning Fog: <strong style={{ color: '#16a34a' }}>{p.fog.toFixed(1)}</strong></div>
                                                                <div>Words: <strong style={{ color: '#16a34a' }}>{p.words}</strong></div>
                                                                <div>AWL Ratio: <strong style={{ color: '#16a34a' }}>{p.awl.toFixed(1)}%</strong></div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </Space>
                                            </div>
                                        </motion.div>
                                    )}


                                    <Space size="middle" style={{ marginTop: '12px' }}>
                                        {progress?.status === 'completed' && progress.examId && (
                                            <Button
                                                type="primary"
                                                icon={<DashboardOutlined />}
                                                onClick={() => navigate(`/admin/exams/${progress.examId}`)}
                                                style={{
                                                    height: '44px',
                                                    borderRadius: '12px',
                                                    fontWeight: 800,
                                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                                    border: 'none',
                                                    padding: '0 28px',
                                                    boxShadow: '0 8px 16px rgba(16, 185, 129, 0.2)',
                                                }}
                                            >
                                                Mở đề thi vừa tạo
                                            </Button>
                                        )}
                                        
                                        {(!isGenerating || progress?.status === 'failed') && (
                                            <Button
                                                onClick={() => {
                                                    setProgress(null);
                                                    setFileList([]);
                                                    form.resetFields();
                                                }}
                                                style={{ height: '44px', borderRadius: '12px', fontWeight: 700, padding: '0 24px' }}
                                            >
                                                Quay lại
                                            </Button>
                                        )}
                                    </Space>
                                </div>
                            </Card>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};
