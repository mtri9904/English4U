import { useMemo } from 'react';
import { Button, Empty, Image, Input, InputNumber, Select, Upload } from 'antd';
import { CloseOutlined, MinusCircleOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import type { CreateQuestionGroupDto, CreateQuestionOptionDto } from '../../types/exam.types';
import { emptyOption, emptyQuestion } from './examEditor.helpers';
import { getCleanPastedInputValue } from '@/shared/utils/input';

interface MapLabellingEditorProps {
    group: CreateQuestionGroupDto;
    groups: CreateQuestionGroupDto[];
    groupIdx: number;
    groupStartNum: number;
    onUpdate: (groups: CreateQuestionGroupDto[]) => void;
    uploading?: boolean;
    handleUploadFile?: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

interface MapAssetData {
    layout: 'map_labelling';
    imageUrl: string;
    width: number;
    zoom: number;
}

const MIN_MAP_WIDTH = 280;
const MAX_MAP_WIDTH = 1200;
const DEFAULT_MAP_WIDTH = 720;
const MIN_MAP_ZOOM = 40;
const MAX_MAP_ZOOM = 200;
const DEFAULT_MAP_ZOOM = 100;
const MIN_OPTION_COUNT = 1;
const MAX_OPTION_COUNT = 26;
const DEFAULT_OPTION_COUNT = 8;

const toLetter = (index: number) => String.fromCharCode(65 + index);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const createDefaultMapAssets = (): MapAssetData => ({
    layout: 'map_labelling',
    imageUrl: '',
    width: DEFAULT_MAP_WIDTH,
    zoom: DEFAULT_MAP_ZOOM,
});

const createDefaultMapOptions = (): CreateQuestionOptionDto[] => (
    Array.from({ length: DEFAULT_OPTION_COUNT }, (_, index) => emptyOption(index))
);

const parseMapAssetsData = (assetsData?: string): MapAssetData => {
    const defaults = createDefaultMapAssets();
    if (!assetsData) return defaults;

    try {
        const parsed = JSON.parse(assetsData) as unknown;

        if (typeof parsed === 'string') {
            return { ...defaults, imageUrl: parsed };
        }

        if (parsed && typeof parsed === 'object') {
            const imageUrl = typeof (parsed as { imageUrl?: unknown }).imageUrl === 'string'
                ? (parsed as { imageUrl: string }).imageUrl
                : (typeof (parsed as { url?: unknown }).url === 'string' ? (parsed as { url: string }).url : '');
            const width = typeof (parsed as { width?: unknown }).width === 'number'
                ? clamp((parsed as { width: number }).width, MIN_MAP_WIDTH, MAX_MAP_WIDTH)
                : defaults.width;
            const zoom = typeof (parsed as { zoom?: unknown }).zoom === 'number'
                ? clamp((parsed as { zoom: number }).zoom, MIN_MAP_ZOOM, MAX_MAP_ZOOM)
                : defaults.zoom;

            return {
                layout: 'map_labelling',
                imageUrl,
                width,
                zoom,
            };
        }
    } catch {
        return { ...defaults, imageUrl: assetsData };
    }

    return defaults;
};

const serializeMapAssetsData = (assetsData: MapAssetData) => JSON.stringify(assetsData);

const normalizeAnswer = (value?: string) => {
    if (!value) return undefined;
    const normalized = value.trim().toUpperCase();
    return /^[A-Z]$/.test(normalized) ? normalized : undefined;
};

const normalizeOptionCount = (count?: number | null) => {
    const fallback = count ?? DEFAULT_OPTION_COUNT;
    const normalized = Number.isFinite(fallback) ? Math.trunc(fallback) : DEFAULT_OPTION_COUNT;
    return clamp(normalized, MIN_OPTION_COUNT, MAX_OPTION_COUNT);
};

const adjustAnswerForOptionCount = (answer: string | undefined, optionCount: number) => {
    if (!answer) return undefined;
    const answerIndex = answer.charCodeAt(0) - 65;
    return answerIndex >= optionCount ? undefined : answer;
};

const cloneOptions = (options: CreateQuestionOptionDto[]) => (
    options.map((option, index) => ({
        ...option,
        orderIndex: index,
    }))
);



export const MapLabellingEditor = ({
    group,
    groups,
    groupIdx,
    groupStartNum,
    onUpdate,
    uploading = false,
    handleUploadFile,
}: MapLabellingEditorProps) => {
    const mapAssets = useMemo(() => parseMapAssetsData(group.assetsData), [group.assetsData]);
    const sharedOptions = useMemo(() => {
        const current = group.questions[0]?.options ?? [];
        return current.length > 0 ? cloneOptions(current) : createDefaultMapOptions();
    }, [group.questions]);

    const updateGroup = (partial: Partial<CreateQuestionGroupDto>) => {
        const updatedGroups = [...groups];
        updatedGroups[groupIdx] = {
            ...group,
            ...partial,
        };
        onUpdate(updatedGroups);
    };

    const updateMapAssets = (partial: Partial<MapAssetData>) => {
        const nextAssets: MapAssetData = {
            ...mapAssets,
            ...partial,
        };
        updateGroup({ assetsData: serializeMapAssetsData(nextAssets) });
    };

    const updateOptionCount = (count?: number | null) => {
        const nextCount = normalizeOptionCount(count);
        const resizedOptions = Array.from({ length: nextCount }, (_, index) => {
            const existing = sharedOptions[index];
            return existing
                ? { ...existing, orderIndex: index }
                : emptyOption(index);
        });

        const baseQuestions = group.questions.length > 0
            ? group.questions
            : [{ ...emptyQuestion(), options: cloneOptions(sharedOptions) }];

        updateGroup({
            questions: baseQuestions.map((question) => ({
                ...question,
                options: cloneOptions(resizedOptions),
                correctAnswer: adjustAnswerForOptionCount(
                    normalizeAnswer(question.correctAnswer),
                    nextCount,
                ),
            })),
        });
    };

    const previewWidth = Math.round((mapAssets.width * mapAssets.zoom) / 100);
    const answerOptions = sharedOptions.map((_, index) => {
        const letter = toLetter(index);
        return { label: letter, value: letter };
    });

    return (
        <div style={{ background: '#fff', border: '1px solid #dbeafe', borderRadius: '12px', padding: '12px', marginBottom: '10px' }}>
            <div style={{ fontWeight: 700, color: '#1e3a8a', fontSize: '0.875rem', marginBottom: '10px' }}>
                Label the Map
            </div>

            <div style={{ background: '#fffbeb', border: '1px dashed #f59e0b', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '6px', fontSize: '0.8125rem' }}>
                    <PictureOutlined /> Map / Diagram
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <Upload
                        accept="image/*"
                        maxCount={1}
                        showUploadList={false}
                        disabled={!handleUploadFile}
                        beforeUpload={async (file) => {
                            if (!handleUploadFile) return false;
                            const url = await handleUploadFile(file, 'image');
                            if (url) {
                                updateMapAssets({ imageUrl: url });
                            }
                            return false;
                        }}
                    >
                        <Button
                            size="small"
                            type="primary"
                            icon={<PictureOutlined />}
                            loading={uploading}
                            disabled={!handleUploadFile}
                            style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                        >
                            Tải ảnh lên
                        </Button>
                    </Upload>
                    <Input
                        value={mapAssets.imageUrl}
                        size="small"
                        placeholder="Chưa có hình map/diagram"
                        title="Link hình map hoặc diagram"
                        style={{ flex: 1, minWidth: 240, background: '#fffcf0', color: '#92400e' }}
                        suffix={mapAssets.imageUrl ? (
                            <CloseOutlined
                                style={{ color: '#ef4444', cursor: 'pointer' }}
                                onClick={() => updateMapAssets({ imageUrl: '' })}
                            />
                        ) : null}
                        onPaste={(event) => {
                            const nextValue = getCleanPastedInputValue(event, mapAssets.imageUrl ?? '');
                            if (nextValue === null) return;
                            updateMapAssets({ imageUrl: nextValue });
                        }}
                        onChange={(event) => updateMapAssets({ imageUrl: event.target.value })}
                    />
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Width</span>
                        <InputNumber
                            value={mapAssets.width}
                            min={MIN_MAP_WIDTH}
                            max={MAX_MAP_WIDTH}
                            size="middle"
                            style={{ width: 110 }}
                            onChange={(value) => updateMapAssets({
                                width: clamp(value ?? DEFAULT_MAP_WIDTH, MIN_MAP_WIDTH, MAX_MAP_WIDTH),
                            })}
                        />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Zoom (%)</span>
                        <InputNumber
                            value={mapAssets.zoom}
                            min={MIN_MAP_ZOOM}
                            max={MAX_MAP_ZOOM}
                            size="middle"
                            style={{ width: 110 }}
                            onChange={(value) => updateMapAssets({
                                zoom: clamp(value ?? DEFAULT_MAP_ZOOM, MIN_MAP_ZOOM, MAX_MAP_ZOOM),
                            })}
                        />
                    </div>
                </div>
                <div style={{ border: '1px dashed #bfdbfe', borderRadius: '10px', padding: '10px', minHeight: '180px', overflow: 'auto', background: '#fff' }}>
                    {mapAssets.imageUrl ? (
                        <Image
                            src={mapAssets.imageUrl}
                            alt="Map preview"
                            style={{
                                width: `${previewWidth}px`,
                                maxHeight: '320px',
                                objectFit: 'contain',
                                display: 'block',
                                margin: '0 auto',
                                borderRadius: '8px',
                                cursor: 'zoom-in',
                            }}
                            preview={{
                                mask: <span style={{ fontSize: '12px' }}>Click để phóng to</span>,
                            }}
                        />
                    ) : (
                        <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="Chưa có hình map/diagram"
                        />
                    )}
                </div>
            </div>

            <div style={{ background: '#f8fbff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '8px', fontSize: '0.8125rem' }}>Options</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <span style={{ color: '#334155', fontSize: '0.8125rem', fontWeight: 600 }}>Số lượng options</span>
                    <InputNumber
                        value={sharedOptions.length}
                        min={MIN_OPTION_COUNT}
                        max={MAX_OPTION_COUNT}
                        size="middle"
                        style={{ width: 120 }}
                        onChange={updateOptionCount}
                    />
                </div>
            </div>

            <div style={{ background: '#f8fbff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '12px' }}>
                <div style={{ fontWeight: 700, color: '#1e40af', marginBottom: '8px', fontSize: '0.8125rem' }}>Questions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {group.questions.map((question, questionIdx) => (
                        <div key={questionIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 46, fontWeight: 700, color: '#334155' }}>
                                {question.questionNumber ?? groupStartNum + questionIdx}
                            </div>
                            <Input
                                value={question.content ?? ''}
                                size="middle"
                                placeholder="Nội dung câu hỏi cần gắn nhãn..."
                                title="Nội dung câu hỏi map label"
                                style={{ flex: 1, minWidth: 240, height: '38px' }}
                                onPaste={(event) => {
                                    const nextValue = getCleanPastedInputValue(event, question.content ?? '');
                                    if (nextValue === null) return;

                                    const updatedGroups = [...groups];
                                    const nextQuestions = [...group.questions];
                                    nextQuestions[questionIdx] = {
                                        ...question,
                                        content: nextValue,
                                    };
                                    updatedGroups[groupIdx] = { ...group, questions: nextQuestions };
                                    onUpdate(updatedGroups);
                                }}
                                onChange={(event) => {
                                    const updatedGroups = [...groups];
                                    const nextQuestions = [...group.questions];
                                    nextQuestions[questionIdx] = {
                                        ...question,
                                        content: event.target.value,
                                    };
                                    updatedGroups[groupIdx] = { ...group, questions: nextQuestions };
                                    onUpdate(updatedGroups);
                                }}
                            />
                            <Select
                                value={normalizeAnswer(question.correctAnswer)}
                                size="middle"
                                placeholder="Đáp án"
                                style={{ width: 110 }}
                                options={answerOptions}
                                onChange={(value) => {
                                    const updatedGroups = [...groups];
                                    const nextQuestions = [...group.questions];
                                    nextQuestions[questionIdx] = {
                                        ...question,
                                        correctAnswer: value,
                                    };
                                    updatedGroups[groupIdx] = { ...group, questions: nextQuestions };
                                    onUpdate(updatedGroups);
                                }}
                            />
                            {group.questions.length > 1 && (
                                <Button
                                    type="text"
                                    danger
                                    icon={<MinusCircleOutlined />}
                                    onClick={() => {
                                        updateGroup({
                                            questions: group.questions.filter((_, index) => index !== questionIdx),
                                        });
                                    }}
                                />
                            )}
                        </div>
                    ))}
                </div>
                <Button
                    type="default"
                    size="middle"
                    icon={<PlusOutlined />}
                    style={{ marginTop: '10px', height: '36px' }}
                    onClick={() => {
                        updateGroup({
                            questions: [
                                ...group.questions,
                                {
                                    ...emptyQuestion(),
                                    options: cloneOptions(sharedOptions),
                                },
                            ],
                        });
                    }}
                >
                    Add question
                </Button>
            </div>
        </div>
    );
};
