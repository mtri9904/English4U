import { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Input,
    Space,
    Tag,
    Typography,
    Upload,
    message,
} from 'antd';
import { CopyOutlined, EyeOutlined, InboxOutlined } from '@ant-design/icons';
import { useReviewPdfRawMutation } from '../api/exam.api';
import type {
    PdfRawQuestionInstructionPreviewDto,
    PdfRawReviewAnswerSectionDto,
    PdfRawReviewExplanationSectionDto,
    PdfRawReviewPassageDto,
    PdfRawReviewRequestTraceDto,
} from '../types/exam.types';

const { Title, Text } = Typography;
const { Dragger } = Upload;

const copyText = async (content: string, successMessage: string) => {
    try {
        await navigator.clipboard.writeText(content);
        message.success(successMessage);
    } catch {
        message.error('Không thể sao chép vào clipboard.');
    }
};

const InstructionCard = ({
    item,
}: {
    item: PdfRawQuestionInstructionPreviewDto;
}) => {
    const rangeLabel =
        item.startQuestion === item.endQuestion
            ? `Question ${item.startQuestion}`
            : `Questions ${item.startQuestion}-${item.endQuestion}`;
    const tagsLabel = item.tags?.trim() || rangeLabel;
    const visualPreviewItems = item.visualPreviewItems?.length
        ? item.visualPreviewItems
        : item.diagramPreviewImageDataUrl
            ? [{
                imageDataUrl: item.diagramPreviewImageDataUrl,
                pageNumber: item.diagramPreviewPageNumber ?? 0,
                note: item.diagramPreviewNote ?? null,
            }]
            : [];
    return (
        <Card
            size="small"
            style={{ borderRadius: 10, border: '1px solid #dbeafe' }}
            title={
                <Space size={8} wrap>
                    <Tag color="gold">Passage {item.passageNumber}</Tag>
                    <Tag color="blue">{tagsLabel}</Tag>
                    {item.groupType ? <Tag color="purple">{item.groupType}</Tag> : null}
                </Space>
            }
            extra={
                <Button
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => copyText(item.instruction || '', `Đã copy instruction ${rangeLabel}.`)}
                >
                    Copy
                </Button>
            }
        >
            <Input.TextArea
                value={item.instruction || '[INSTRUCTION_NOT_FOUND]'}
                autoSize={{ minRows: 3, maxRows: 8 }}
                readOnly
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
            />
            {item.typeEvidence ? (
                <div style={{ marginTop: 10 }}>
                    <Text type="secondary">{item.typeEvidence}</Text>
                </div>
            ) : null}
            {item.questionPreview ? (
                <Input.TextArea
                    value={item.questionPreview}
                    autoSize={{ minRows: 4, maxRows: 10 }}
                    readOnly
                    style={{
                        marginTop: 10,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                        fontSize: '0.78rem',
                    }}
                />
            ) : null}
            {visualPreviewItems.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                    <div style={{ marginBottom: 6 }}>
                        <Text strong>
                            {item.groupType === 'MAP_LABELLING' || item.groupType === 'FLOWCHART_COMPLETION'
                                ? 'Diagram Preview'
                                : 'Visual Preview'}
                        </Text>
                    </div>
                    <div style={{ display: 'grid', gap: 10 }}>
                        {visualPreviewItems.map((preview, index) => (
                            <div key={`${rangeLabel}-visual-${preview.pageNumber}-${index}`}>
                                <div style={{ marginBottom: 6 }}>
                                    <Text type="secondary">
                                        {preview.pageNumber > 0 ? `page ${preview.pageNumber}` : `preview ${index + 1}`}
                                    </Text>
                                </div>
                                <img
                                    src={preview.imageDataUrl}
                                    alt={`Visual preview ${index + 1} for ${rangeLabel}`}
                                    style={{
                                        width: '100%',
                                        maxHeight: 420,
                                        objectFit: 'contain',
                                        borderRadius: 10,
                                        border: '1px solid #dbeafe',
                                        background: '#f8fafc',
                                    }}
                                />
                                {preview.note ? (
                                    <div style={{ marginTop: 6 }}>
                                        <Text type="secondary">{preview.note}</Text>
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ) : null}
            {item.visualPreviewNote ? (
                <div style={{ marginTop: 10 }}>
                    <Text type="secondary">{item.visualPreviewNote}</Text>
                </div>
            ) : null}
            {item.diagramPreviewNote && visualPreviewItems.length === 0 && !item.visualPreviewNote ? (
                <div style={{ marginTop: 10 }}>
                    <Text type="secondary">{item.diagramPreviewNote}</Text>
                </div>
            ) : null}
        </Card>
    );
};

const TraceCard = ({ item }: { item: PdfRawReviewRequestTraceDto }) => (
    <Card
        size="small"
        style={{ borderRadius: 10, border: '1px solid #e2e8f0' }}
        title={
            <Space size={8} wrap>
                <Tag color={item.status === 'completed' ? 'green' : item.status === 'skipped' ? 'default' : 'orange'}>
                    {item.status}
                </Tag>
                <Text strong>{item.stepName}</Text>
                <Text type="secondary">in: {item.inputLength.toLocaleString()}</Text>
                <Text type="secondary">out: {item.outputLength.toLocaleString()}</Text>
            </Space>
        }
    >
        <Text type="secondary">{item.notes || '-'}</Text>
    </Card>
);

const PassageReviewCard = ({
    passage,
}: {
    passage: PdfRawReviewPassageDto;
}) => (
    <Card
        size="small"
        style={{ borderRadius: 12, border: '1px solid #dbeafe' }}
        title={
            <Space size={8} wrap>
                <Tag color="green">Passage {passage.passageNumber}</Tag>
                <Text strong>{passage.title}</Text>
                {passage.questionRange ? <Tag color="blue">{passage.questionRange}</Tag> : null}
                <Tag color="purple">{passage.questionGroups.length} groups</Tag>
            </Space>
        }
        extra={
            <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => copyText(passage.rawText, `Đã copy raw text Passage ${passage.passageNumber}.`)}
            >
                Copy
            </Button>
        }
    >
        <Input.TextArea
            value={passage.rawText}
            autoSize={{ minRows: 8, maxRows: 20 }}
            readOnly
            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
        />
        <div style={{ marginTop: 12, display: 'grid', gap: 10 }}>
            {passage.questionGroups.length === 0 ? (
                <Alert
                    type="warning"
                    showIcon
                    message="Không tìm thấy question groups cho passage này"
                    description="AI và fallback deterministic đều chưa lấy được instruction hợp lệ."
                />
            ) : (
                passage.questionGroups.map((item) => (
                    <InstructionCard
                        key={`instruction-${item.passageNumber}-${item.startQuestion}-${item.endQuestion}`}
                        item={item}
                    />
                ))
            )}
        </div>
    </Card>
);

const buildAnswerText = (section: PdfRawReviewAnswerSectionDto | null | undefined) =>
    !section
        ? ''
        : section.answers
            .map((item) => `${item.questionNumber}. ${item.answer}`)
            .join('\n');

const buildExplanationText = (section: PdfRawReviewExplanationSectionDto | null | undefined) =>
    !section
        ? ''
        : section.explanations
            .map((item) => `${item.questionNumber}. ${item.answer}${item.explanation ? ` | ${item.explanation}` : ''}`)
            .join('\n\n');

export const PdfRawPreviewPage = () => {
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const reviewMutation = useReviewPdfRawMutation();

    const summary = useMemo(() => {
        const data = reviewMutation.data;
        if (!data) {
            return null;
        }

        return {
            passages: data.passages.length,
            questionGroups: data.passages.reduce((sum, passage) => sum + passage.questionGroups.length, 0),
            answers: data.solutionSection?.answers.length ?? 0,
            explanations: data.reviewSection?.explanations.length ?? 0,
            steps: data.requestTrace.length,
        };
    }, [reviewMutation.data]);

    const parsedAnswerText = useMemo(
        () => buildAnswerText(reviewMutation.data?.solutionSection),
        [reviewMutation.data],
    );

    const parsedExplanationText = useMemo(
        () => buildExplanationText(reviewMutation.data?.reviewSection),
        [reviewMutation.data],
    );

    const handleReview = () => {
        if (!selectedFile) {
            message.warning('Vui lòng chọn file PDF.');
            return;
        }

        reviewMutation.mutate(selectedFile, {
            onError: (error: any) => {
                const apiMessage = error?.response?.data?.message;
                message.error(typeof apiMessage === 'string' ? apiMessage : 'Không thể review raw text từ PDF.');
            },
        });
    };

    return (
        <div style={{ display: 'grid', gap: 16 }}>
            <Card style={{ borderRadius: 14, border: '1px solid #dbeafe' }}>
                <Space direction="vertical" size={10} style={{ width: '100%' }}>
                    <Title level={4} style={{ margin: 0 }}>
                        Raw PDF Review Pipeline
                    </Title>
                    <Text type="secondary">
                        Upload PDF, scan ra raw text trước, rồi backend sẽ chạy nhiều request AI nhỏ để tách passage,
                        question-group instruction, solution và review/explanations.
                    </Text>

                    <Dragger
                        accept=".pdf"
                        maxCount={1}
                        multiple={false}
                        beforeUpload={(file) => {
                            setSelectedFile(file);
                            return false;
                        }}
                        showUploadList={false}
                        disabled={reviewMutation.isPending}
                    >
                        <p style={{ marginBottom: 8 }}>
                            <InboxOutlined style={{ fontSize: 30, color: '#2563eb' }} />
                        </p>
                        <p style={{ fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>
                            Kéo thả hoặc bấm để chọn PDF
                        </p>
                        <p style={{ color: '#64748b', margin: 0 }}>Chỉ hỗ trợ .pdf</p>
                    </Dragger>

                    <Space wrap>
                        <Button
                            type="primary"
                            icon={<EyeOutlined />}
                            loading={reviewMutation.isPending}
                            onClick={handleReview}
                            disabled={!selectedFile}
                        >
                            Review raw text
                        </Button>
                        {selectedFile ? <Tag color="blue">{selectedFile.name}</Tag> : null}
                    </Space>

                    {summary ? (
                        <Space wrap>
                            <Tag color="geekblue">Passages: {summary.passages}</Tag>
                            <Tag color="purple">Groups: {summary.questionGroups}</Tag>
                            <Tag color="gold">Answers: {summary.answers}</Tag>
                            <Tag color="cyan">Explanations: {summary.explanations}</Tag>
                            <Tag color="green">Steps: {summary.steps}</Tag>
                        </Space>
                    ) : null}
                </Space>
            </Card>

            {reviewMutation.data ? (
                <>
                    <Card
                        style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                        title={`Raw Text (${reviewMutation.data.rawTextLength.toLocaleString()} chars)`}
                        extra={
                            <Space size={8} wrap>
                                <Tag color="blue">{reviewMutation.data.extractionEngine}</Tag>
                                <Tag color="gold">{reviewMutation.data.pageCount} pages</Tag>
                                <Button
                                    size="small"
                                    icon={<CopyOutlined />}
                                    onClick={() => copyText(reviewMutation.data.rawText, 'Đã copy raw text.')}
                                >
                                    Copy
                                </Button>
                            </Space>
                        }
                    >
                        <Input.TextArea
                            value={reviewMutation.data.rawText}
                            autoSize={{ minRows: 12, maxRows: 28 }}
                            readOnly
                            style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
                        />
                    </Card>

                    <Card
                        style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                        title={`AI Request Trace (${reviewMutation.data.requestTrace.length} steps)`}
                    >
                        <div style={{ display: 'grid', gap: 10 }}>
                            {reviewMutation.data.requestTrace.map((item, index) => (
                                <TraceCard key={`${item.stepName}-${index}`} item={item} />
                            ))}
                        </div>
                    </Card>

                    <Card
                        style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                        title={`Document Structure (${reviewMutation.data.structure.passages.length} passages)`}
                    >
                        <div style={{ display: 'grid', gap: 10 }}>
                            {reviewMutation.data.structure.passages.map((item) => (
                                <Card
                                    key={`seed-${item.passageNumber}`}
                                    size="small"
                                    style={{ borderRadius: 10, border: '1px solid #dbeafe' }}
                                    title={
                                        <Space size={8} wrap>
                                            <Tag color="green">Passage {item.passageNumber}</Tag>
                                            <Text strong>{item.title}</Text>
                                            {item.questionRange ? <Tag color="blue">{item.questionRange}</Tag> : null}
                                        </Space>
                                    }
                                >
                                    <Input.TextArea
                                        value={item.rawText}
                                        autoSize={{ minRows: 4, maxRows: 10 }}
                                        readOnly
                                        style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
                                    />
                                </Card>
                            ))}
                        </div>
                    </Card>

                    <div style={{ display: 'grid', gap: 14 }}>
                        {reviewMutation.data.passages.map((passage) => (
                            <PassageReviewCard
                                key={`passage-${passage.passageNumber}`}
                                passage={passage}
                            />
                        ))}
                    </div>

                    <Card
                        style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                        title={`Solution Section (${reviewMutation.data.solutionSection?.answers.length ?? 0} answers)`}
                        extra={
                            <Button
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => copyText(parsedAnswerText, 'Đã copy parsed answers.')}
                                disabled={!parsedAnswerText}
                            >
                                Copy
                            </Button>
                        }
                    >
                        {!reviewMutation.data.solutionSection ? (
                            <Alert type="warning" showIcon message="Không có solution section." />
                        ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                                <Input.TextArea
                                    value={reviewMutation.data.solutionSection.rawText}
                                    autoSize={{ minRows: 8, maxRows: 18 }}
                                    readOnly
                                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
                                />
                                <Input.TextArea
                                    value={parsedAnswerText}
                                    autoSize={{ minRows: 5, maxRows: 14 }}
                                    readOnly
                                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
                                />
                            </div>
                        )}
                    </Card>

                    <Card
                        style={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
                        title={`Review and Explanations (${reviewMutation.data.reviewSection?.explanations.length ?? 0} items)`}
                        extra={
                            <Button
                                size="small"
                                icon={<CopyOutlined />}
                                onClick={() => copyText(parsedExplanationText, 'Đã copy parsed explanations.')}
                                disabled={!parsedExplanationText}
                            >
                                Copy
                            </Button>
                        }
                    >
                        {!reviewMutation.data.reviewSection ? (
                            <Alert type="warning" showIcon message="Không có review/explanations section." />
                        ) : (
                            <div style={{ display: 'grid', gap: 10 }}>
                                <Input.TextArea
                                    value={reviewMutation.data.reviewSection.rawText}
                                    autoSize={{ minRows: 8, maxRows: 18 }}
                                    readOnly
                                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
                                />
                                <Input.TextArea
                                    value={parsedExplanationText}
                                    autoSize={{ minRows: 6, maxRows: 18 }}
                                    readOnly
                                    style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem' }}
                                />
                            </div>
                        )}
                    </Card>
                </>
            ) : null}
        </div>
    );
};
