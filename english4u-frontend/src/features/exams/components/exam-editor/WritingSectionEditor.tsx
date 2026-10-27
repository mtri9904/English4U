import { Button, Input, InputNumber, Upload } from 'antd';
import { CloseOutlined, MinusCircleOutlined, PictureOutlined, PlusOutlined } from '@ant-design/icons';
import { parseWritingTaskAssetsData, serializeWritingTaskAssetsData } from '@/shared/lib/writingTaskAssets';
import {
    SKILL_COLORS,
    emptyWritingTask,
    EXAM_LIMITS,
} from './examEditor.helpers';
import { getCleanPastedInputValue, type SharedSectionEditorProps } from './sectionEditor.utils';

export interface WritingSectionEditorProps extends SharedSectionEditorProps {
    uploading: boolean;
    handleUploadFile: (file: File, type: 'image' | 'video' | 'raw' | 'auto') => Promise<string>;
}

export const WritingSectionEditor = ({
    section,
    sIdx,
    updateSection,
    uploading,
    handleUploadFile,
}: WritingSectionEditorProps) => {
    const tasks = section.writingTasks ?? [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {tasks.map((task, taskIdx) => {
                const writingAssets = parseWritingTaskAssetsData(task.assetsData);

                return (
                    <div key={taskIdx} style={{ background: '#fff', borderRadius: '12px', padding: '16px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 700, color: SKILL_COLORS.Writing }}>Task {task.taskNumber ?? taskIdx + 1}</span>
                            {tasks.length > 1 && (
                                <Button
                                    type="text"
                                    danger
                                    icon={<MinusCircleOutlined />}
                                    size="small"
                                    onClick={() => updateSection(sIdx, { writingTasks: tasks.filter((_, index) => index !== taskIdx) })}
                                />
                            )}
                        </div>
                        <Input.TextArea
                            value={task.promptText}
                            placeholder="Đề bài Writing (mô tả task, yêu cầu...)"
                            autoSize={{ minRows: 4, maxRows: 15 }}
                            style={{ marginBottom: '10px' }}
                            onPaste={(event) => {
                                const nextValue = getCleanPastedInputValue(event, task.promptText ?? '');
                                if (nextValue === null) return;

                                const updatedTasks = [...tasks];
                                updatedTasks[taskIdx] = { ...task, promptText: nextValue };
                                updateSection(sIdx, { writingTasks: updatedTasks });
                            }}
                            onChange={(event) => {
                                const updatedTasks = [...tasks];
                                updatedTasks[taskIdx] = { ...task, promptText: event.target.value };
                                updateSection(sIdx, { writingTasks: updatedTasks });
                            }}
                        />
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>Số từ tối thiểu:</span>
                            <InputNumber
                                value={task.minWords}
                                min={50}
                                max={500}
                                onChange={(value) => {
                                    const updatedTasks = [...tasks];
                                    updatedTasks[taskIdx] = { ...task, minWords: value ?? 150 };
                                    updateSection(sIdx, { writingTasks: updatedTasks });
                                }}
                                size="small"
                                style={{ width: 90 }}
                            />
                        </div>
                        {(task.taskNumber === 1 || taskIdx === 0) && (
                            <div style={{ padding: '12px', background: '#fffbeb', borderRadius: '8px', border: '1px dashed #f59e0b' }}>
                                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
                                    <PictureOutlined /> Hình ảnh Task 1
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    <Upload
                                        accept="image/*"
                                        maxCount={1}
                                        showUploadList={false}
                                        beforeUpload={async (file) => {
                                            const url = await handleUploadFile(file, 'image');
                                            if (url) {
                                                const updatedTasks = [...tasks];
                                                updatedTasks[taskIdx] = {
                                                    ...task,
                                                    assetsData: serializeWritingTaskAssetsData({
                                                        imageUrl: url,
                                                        hiddenDataText: writingAssets.hiddenDataText,
                                                    }),
                                                };
                                                updateSection(sIdx, { writingTasks: updatedTasks });
                                            }
                                            return false;
                                        }}
                                    >
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
                                                    const updatedTasks = [...tasks];
                                                    updatedTasks[taskIdx] = {
                                                        ...task,
                                                        assetsData: serializeWritingTaskAssetsData({
                                                            imageUrl: '',
                                                            hiddenDataText: writingAssets.hiddenDataText,
                                                        }),
                                                    };
                                                    updateSection(sIdx, { writingTasks: updatedTasks });
                                                }}
                                            />
                                        ) : null}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
            {tasks.length < EXAM_LIMITS.Writing.tasks && (
                <Button
                    type="default"
                    icon={<PlusOutlined />}
                    block
                    style={{
                        background: '#fffbeb',
                        borderColor: SKILL_COLORS.Writing,
                        color: '#92400e',
                        fontWeight: 600,
                        height: '38px',
                        borderRadius: '8px',
                        marginTop: '12px',
                    }}
                    onClick={() => {
                        if (tasks.length >= EXAM_LIMITS.Writing.tasks) return;
                        updateSection(sIdx, { writingTasks: [...tasks, emptyWritingTask(tasks.length + 1)] });
                    }}
                >
                    Thêm Writing Task mới (Tối đa {EXAM_LIMITS.Writing.tasks})
                </Button>
            )}
        </div>
    );
};

