import React, { useState, useRef } from 'react';
import { Modal, message, Spin } from 'antd';
import {
    X,
    UploadCloud,
    Send,
    Trash2,
    Clock,
    FileText,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import type { FeedbackType, FeedbackPriority, FeedbackListItem } from '../types/feedback.types';
import {
    FEEDBACK_TYPES,
    FEEDBACK_PRIORITIES,
    FEEDBACK_STATUSES,
} from '../constants/feedback.constants';
import {
    useCreateFeedbackMutation,
    useMyFeedbacksQuery,
    useRecentFeedbacksQuery,
    useUploadFeedbackImageMutation,
} from '../hooks/useFeedbackQueries';
import { FeedbackDetailModal } from './FeedbackDetailModal';

interface FeedbackModalProps {
    open: boolean;
    onClose: () => void;
    initialTab?: 'create' | 'recent' | 'my';
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
    open,
    onClose,
    initialTab = 'create',
}) => {
    const location = useLocation();
    const [activeTab, setActiveTab] = useState<'create' | 'recent' | 'my'>(initialTab);

    // Form fields
    const [type, setType] = useState<FeedbackType>('BUG');
    const [priority, setPriority] = useState<FeedbackPriority>('MEDIUM');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [suggestedSolution, setSuggestedSolution] = useState('');
    const [uploadedImages, setUploadedImages] = useState<Array<{ previewUrl: string; serverUrl: string }>>([]);
    const [isUploading, setIsUploading] = useState(false);

    // Detail modal state
    const [selectedFeedbackId, setSelectedFeedbackId] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Queries & mutations
    const createMutation = useCreateFeedbackMutation();
    const uploadImageMutation = useUploadFeedbackImageMutation();
    const { data: recentFeedbacks, isLoading: isRecentLoading } = useRecentFeedbacksQuery({
        enabled: open && activeTab === 'recent',
    });
    const { data: myFeedbacks, isLoading: isMyLoading } = useMyFeedbacksQuery({
        enabled: open && activeTab === 'my',
    });

    const resetForm = () => {
        setType('BUG');
        setPriority('MEDIUM');
        setTitle('');
        setDescription('');
        setSuggestedSolution('');
        uploadedImages.forEach((img) => {
            if (img.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(img.previewUrl);
            }
        });
        setUploadedImages([]);
    };

    const handleFileSelect = async (files: FileList | File[]) => {
        const fileList = Array.from(files);
        if (uploadedImages.length + fileList.length > 5) {
            message.warning('Tối đa đính kèm 5 hình ảnh.');
            return;
        }

        setIsUploading(true);
        try {
            for (const file of fileList) {
                if (file.size > 10 * 1024 * 1024) {
                    message.error(`File ${file.name} vượt quá dung lượng tối đa 10MB.`);
                    continue;
                }
                const blobPreview = URL.createObjectURL(file);
                try {
                    const result = await uploadImageMutation.mutateAsync(file);
                    if (result?.url) {
                        setUploadedImages((prev) => [
                            ...prev,
                            { previewUrl: blobPreview, serverUrl: result.url },
                        ]);
                    } else {
                        URL.revokeObjectURL(blobPreview);
                    }
                } catch {
                    URL.revokeObjectURL(blobPreview);
                    throw new Error('Upload failed');
                }
            }
        } catch {
            message.error('Tải ảnh thất bại. Vui lòng thử lại!');
        } finally {
            setIsUploading(false);
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleRemoveImage = (index: number) => {
        setUploadedImages((prev) => {
            const target = prev[index];
            if (target?.previewUrl?.startsWith('blob:')) {
                URL.revokeObjectURL(target.previewUrl);
            }
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmit = async () => {
        if (!title.trim()) {
            message.warning('Vui lòng nhập tiêu đề tóm tắt!');
            return;
        }
        if (!description.trim()) {
            message.warning('Vui lòng nhập mô tả chi tiết!');
            return;
        }

        try {
            await createMutation.mutateAsync({
                type,
                priority,
                title: title.trim(),
                description: description.trim(),
                suggestedSolution: suggestedSolution.trim() || undefined,
                attachmentUrls: uploadedImages.length > 0 ? uploadedImages.map((i) => i.serverUrl) : undefined,
                browserInfo: navigator.userAgent,
                currentPageUrl: location.pathname + location.search,
            });

            message.success('Gửi phản hồi thành công! Cảm ơn bạn đã đóng góp.');
            resetForm();
            setActiveTab('my');
        } catch (error: any) {
            const msg = error?.response?.data?.message || 'Có lỗi xảy ra khi gửi phản hồi.';
            message.error(msg);
        }
    };

    const renderFeedbackItem = (item: FeedbackListItem) => {
        const itemTypeConfig = FEEDBACK_TYPES[item.type] ?? FEEDBACK_TYPES.OTHER;
        const itemStatusConfig = FEEDBACK_STATUSES[item.status] ?? FEEDBACK_STATUSES.RECEIVED;
        const TypeIcon = itemTypeConfig.icon;

        return (
            <div
                key={item.id}
                onClick={() => setSelectedFeedbackId(item.id)}
                className="p-4 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 hover:bg-slate-800/80 transition-all cursor-pointer group shadow-sm"
            >
                <div className="flex items-start justify-between gap-3 mb-2.5">
                    <h4 className="text-sm font-semibold text-slate-100 group-hover:text-blue-400 transition-colors m-0 line-clamp-1">
                        {item.title}
                    </h4>
                    <span
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0"
                        style={{
                            background: `${itemStatusConfig.color}20`,
                            color: itemStatusConfig.color,
                            border: `1px solid ${itemStatusConfig.color}40`,
                        }}
                    >
                        <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: itemStatusConfig.color }}
                        />
                        {itemStatusConfig.label}
                    </span>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold shrink-0"
                            style={{
                                background: itemTypeConfig.bgLight,
                                color: itemTypeConfig.color,
                                border: `1px solid ${itemTypeConfig.color}40`,
                            }}
                        >
                            <TypeIcon size={12} />
                            {itemTypeConfig.label}
                        </span>
                    </div>

                    <span className="flex items-center gap-1 text-slate-400 text-[11px] shrink-0 font-medium">
                        <Clock size={11} />
                        {item.createdAt}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <>
            <Modal
                open={open}
                onCancel={onClose}
                footer={null}
                width={720}
                closable={false}
                centered
                className="feedback-modal"
                styles={{
                    content: {
                        background: '#131926',
                        borderRadius: 20,
                        border: '1px solid #1e293b',
                        padding: 0,
                        overflow: 'hidden',
                        color: '#f8fafc',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
                    },
                }}
            >
                {/* Header */}
                <div className="px-6 pt-5 pb-4 border-b border-slate-800/80 bg-[#151c2e]">
                    <div className="flex items-start justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-wide m-0">
                                Gửi phản hồi & Báo lỗi
                            </h2>
                            <p className="text-xs text-slate-400 mt-1 m-0">
                                Đóng góp ý kiến hoặc phản ánh sự cố ngay tại trang đang sử dụng
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex items-center gap-2 mt-4 p-1 rounded-xl bg-slate-900/90 border border-slate-800">
                        <button
                            type="button"
                            onClick={() => setActiveTab('create')}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === 'create'
                                    ? 'bg-slate-800 text-orange-400 shadow-sm border border-slate-700/80'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            Gửi mới
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('recent')}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === 'recent'
                                    ? 'bg-slate-800 text-orange-400 shadow-sm border border-slate-700/80'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            Phản hồi gần đây
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('my')}
                            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                                activeTab === 'my'
                                    ? 'bg-slate-800 text-orange-400 shadow-sm border border-slate-700/80'
                                    : 'text-slate-400 hover:text-slate-200'
                            }`}
                        >
                            Phản hồi của tôi
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="p-6 max-h-[72vh] overflow-y-auto space-y-5 scrollbar-thin scrollbar-thumb-slate-700">
                    {activeTab === 'create' ? (
                        <>
                            {/* Phân loại phản hồi */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                    Phân loại phản hồi <span className="text-red-400">*</span>
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {(Object.keys(FEEDBACK_TYPES) as FeedbackType[]).map((key) => {
                                        const config = FEEDBACK_TYPES[key];
                                        const Icon = config.icon;
                                        const isSelected = type === key;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setType(key)}
                                                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-xs font-semibold transition-all ${
                                                    isSelected
                                                        ? 'bg-slate-800/90 text-white shadow-md'
                                                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                                                }`}
                                                style={{
                                                    borderColor: isSelected ? config.borderColor : undefined,
                                                    boxShadow: isSelected
                                                        ? `0 0 12px ${config.color}33`
                                                        : undefined,
                                                }}
                                            >
                                                <Icon
                                                    size={15}
                                                    style={{ color: isSelected ? config.color : undefined }}
                                                />
                                                <span>{config.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Mức độ ưu tiên */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                                    Mức độ ưu tiên <span className="text-red-400">*</span>
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {(Object.keys(FEEDBACK_PRIORITIES) as FeedbackPriority[]).map((key) => {
                                        const config = FEEDBACK_PRIORITIES[key];
                                        const Icon = config.icon;
                                        const isSelected = priority === key;
                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setPriority(key)}
                                                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                                                    isSelected
                                                        ? 'bg-slate-800/90 text-white shadow-md'
                                                        : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                                                }`}
                                                style={{
                                                    borderColor: isSelected ? config.borderColor : undefined,
                                                    boxShadow: isSelected
                                                        ? `0 0 12px ${config.color}33`
                                                        : undefined,
                                                }}
                                            >
                                                <Icon
                                                    size={14}
                                                    style={{ color: isSelected ? config.color : undefined }}
                                                />
                                                <span>{config.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Tiêu đề tóm tắt */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                        Tiêu đề tóm tắt <span className="text-red-400">*</span>
                                    </label>
                                    <span className="text-xs text-slate-500 font-mono">
                                        {title.length}/250
                                    </span>
                                </div>
                                <input
                                    type="text"
                                    maxLength={250}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Ví dụ: Nút Lưu ở trang hồ sơ không phản hồi khi bấm"
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-colors"
                                />
                            </div>

                            {/* Mô tả chi tiết */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                                    Mô tả chi tiết sự cố / Ý kiến <span className="text-red-400">*</span>
                                </label>
                                <textarea
                                    rows={4}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Mô tả các bước tái hiện, hành vi thực tế so với kỳ vọng..."
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                />
                            </div>

                            {/* Đề xuất giải pháp (không bắt buộc) */}
                            <div>
                                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                                    Đề xuất giải pháp (Không bắt buộc)
                                </label>
                                <textarea
                                    rows={2}
                                    value={suggestedSolution}
                                    onChange={(e) => setSuggestedSolution(e.target.value)}
                                    placeholder="Nếu bạn có gợi ý cách xử lý, hãy ghi chú tại đây..."
                                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-blue-500 transition-colors resize-none"
                                />
                            </div>

                            {/* Upload hình ảnh / Bằng chứng đính kèm */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                                        Hình ảnh / Bằng chứng đính kèm
                                    </label>
                                    <span className="text-xs text-slate-500">
                                        {uploadedImages.length}/5 · Tối đa 10MB/tệp
                                    </span>
                                </div>

                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                                />

                                {/* Dropzone */}
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        if (e.dataTransfer.files) handleFileSelect(e.dataTransfer.files);
                                    }}
                                    className="border-2 border-dashed border-slate-800 hover:border-slate-600 rounded-xl p-5 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-900/50 hover:bg-slate-900/80 transition-all text-center"
                                >
                                    <div className="p-2.5 rounded-xl bg-slate-800 text-blue-400">
                                        <UploadCloud size={22} />
                                    </div>
                                    <div>
                                        <span className="text-xs font-medium text-slate-200">
                                            Nhấp để chọn ảnh hoặc kéo thả hình ảnh vào đây
                                        </span>
                                        <p className="text-[11px] text-slate-500 m-0 mt-0.5">
                                            PNG, JPG, WEBP · Tối đa 5 ảnh (10MB/tệp)
                                        </p>
                                    </div>
                                </div>

                                {/* Uploaded image thumbnails */}
                                {uploadedImages.length > 0 && (
                                    <div className="grid grid-cols-5 gap-2 mt-3">
                                        {uploadedImages.map((img, idx) => (
                                            <div
                                                key={idx}
                                                className="relative aspect-square rounded-lg overflow-hidden border border-slate-700 bg-slate-900 group"
                                            >
                                                <img
                                                    src={img.previewUrl}
                                                    alt={`preview-${idx}`}
                                                    className="w-full h-full object-cover"
                                                />
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveImage(idx);
                                                    }}
                                                    className="absolute top-1 right-1 p-1 rounded-md bg-red-600/80 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : activeTab === 'recent' ? (
                        <div className="space-y-3">
                            {isRecentLoading ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-2">
                                    <Spin size="small" />
                                    <span className="text-xs text-slate-400">Đang tải danh sách...</span>
                                </div>
                            ) : recentFeedbacks && recentFeedbacks.length > 0 ? (
                                recentFeedbacks.map(renderFeedbackItem)
                            ) : (
                                <div className="py-16 text-center text-slate-500">
                                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                                    <div className="text-sm">Chưa có phản hồi nào trong hệ thống</div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {isMyLoading ? (
                                <div className="py-20 flex flex-col items-center justify-center gap-2">
                                    <Spin size="small" />
                                    <span className="text-xs text-slate-400">Đang tải phản hồi của bạn...</span>
                                </div>
                            ) : myFeedbacks && myFeedbacks.length > 0 ? (
                                myFeedbacks.map(renderFeedbackItem)
                            ) : (
                                <div className="py-16 text-center text-slate-500">
                                    <FileText size={32} className="mx-auto mb-2 opacity-50" />
                                    <div className="text-sm">Bạn chưa gửi phản hồi nào</div>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab('create')}
                                        className="mt-3 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-orange-600 hover:bg-orange-500 text-white transition-colors"
                                    >
                                        Gửi phản hồi mới ngay
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800/80 bg-[#151c2e]">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    >
                        {activeTab === 'create' ? 'Hủy' : 'Đóng'}
                    </button>
                    {activeTab === 'create' && (
                        <button
                            type="button"
                            disabled={createMutation.isPending || isUploading}
                            onClick={handleSubmit}
                            className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {createMutation.isPending ? (
                                <Spin size="small" />
                            ) : (
                                <Send size={14} />
                            )}
                            <span>Gửi phản hồi</span>
                        </button>
                    )}
                </div>
            </Modal>

            {/* Read-only Feedback Detail Modal */}
            <FeedbackDetailModal
                open={!!selectedFeedbackId}
                feedbackId={selectedFeedbackId}
                onClose={() => setSelectedFeedbackId(null)}
            />
        </>
    );
};

