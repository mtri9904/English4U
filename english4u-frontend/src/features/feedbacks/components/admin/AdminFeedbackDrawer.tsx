import React, { useEffect } from 'react';
import { Drawer, Tag, Form, Select, Input, Button, Image, Popconfirm, message } from 'antd';
import {
    FileText,
    Lightbulb,
    Laptop,
    Clock,
    CheckCircle2,
    User,
    Shield,
    Trash2,
} from 'lucide-react';
import type { FeedbackStatus } from '../../types/feedback.types';
import {
    FEEDBACK_PRIORITIES,
    FEEDBACK_STATUSES,
    FEEDBACK_TYPES,
    formatMediaUrl,
} from '../../constants/feedback.constants';
import {
    useFeedbackDetailQuery,
    useUpdateFeedbackStatusMutation,
    useDeleteFeedbackMutation,
} from '../../hooks/useFeedbackQueries';

interface AdminFeedbackDrawerProps {
    feedbackId: string | null;
    open: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const AdminFeedbackDrawer: React.FC<AdminFeedbackDrawerProps> = ({
    feedbackId,
    open,
    onClose,
    onSuccess,
}) => {
    const [actionForm] = Form.useForm();
    const {
        data: detail,
        isLoading,
        refetch,
    } = useFeedbackDetailQuery(feedbackId || undefined, {
        enabled: open && !!feedbackId,
    });

    const updateStatusMutation = useUpdateFeedbackStatusMutation();
    const deleteMutation = useDeleteFeedbackMutation();

    useEffect(() => {
        if (detail) {
            actionForm.setFieldsValue({
                status: detail.status === 'RECEIVED' ? 'IN_PROGRESS' : detail.status,
                note: '',
            });
        }
    }, [detail, actionForm]);

    const handleUpdateStatus = async (values: { status: FeedbackStatus; note?: string }) => {
        if (!feedbackId) return;
        try {
            await updateStatusMutation.mutateAsync({
                id: feedbackId,
                payload: {
                    status: values.status,
                    note: values.note?.trim() || undefined,
                },
            });
            message.success('Cập nhật tiến độ xử lý thành công!');
            actionForm.setFieldValue('note', '');
            refetch();
            onSuccess?.();
        } catch (error: any) {
            const msg = error?.response?.data?.message || 'Cập nhật thất bại. Vui lòng thử lại!';
            message.error(msg);
        }
    };

    const handleDeleteFeedback = async () => {
        if (!feedbackId) return;
        try {
            await deleteMutation.mutateAsync(feedbackId);
            message.success('Đã xóa phản hồi và dọn dẹp các tệp đính kèm trên Cloudinary thành công!');
            onSuccess?.();
            onClose();
        } catch (error: any) {
            const msg = error?.response?.data?.message || 'Không thể xóa phản hồi. Vui lòng thử lại!';
            message.error(msg);
        }
    };

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={680}
            title={
                detail ? (
                    <div className="flex items-center justify-between pr-4">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-slate-800">
                                {detail.code}
                            </span>
                            <Tag color={FEEDBACK_STATUSES[detail.status]?.tagColor ?? 'default'}>
                                {FEEDBACK_STATUSES[detail.status]?.label ?? detail.status}
                            </Tag>
                        </div>
                    </div>
                ) : (
                    'Chi tiết phản hồi'
                )
            }
        >
            {isLoading || !detail ? (
                <div className="py-20 text-center text-slate-400">Đang tải dữ liệu...</div>
            ) : (
                <div className="space-y-6 pb-12">
                    {/* Title & Classification */}
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="flex items-center gap-2">
                            <span
                                className="px-2 py-0.5 rounded text-xs font-semibold"
                                style={{
                                    background: FEEDBACK_TYPES[detail.type]?.bgLight,
                                    color: FEEDBACK_TYPES[detail.type]?.color,
                                }}
                            >
                                {FEEDBACK_TYPES[detail.type]?.label}
                            </span>
                            <span
                                className="px-2 py-0.5 rounded text-xs font-semibold"
                                style={{
                                    background: FEEDBACK_PRIORITIES[detail.priority]?.bgLight,
                                    color: FEEDBACK_PRIORITIES[detail.priority]?.color,
                                }}
                            >
                                Mức độ: {FEEDBACK_PRIORITIES[detail.priority]?.label}
                            </span>
                        </div>
                        <h3 className="text-base font-bold text-slate-900 m-0">
                            {detail.title}
                        </h3>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                            <span className="text-slate-500 font-medium">Người gửi:</span>
                            <div className="font-semibold text-slate-800 mt-0.5">
                                {detail.senderName} ({detail.senderRole})
                            </div>
                            <div className="text-slate-400 text-[11px]">{detail.senderEmail}</div>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200/80">
                            <span className="text-slate-500 font-medium">Thời gian tạo:</span>
                            <div className="font-semibold text-slate-800 mt-0.5">{detail.createdAt}</div>
                            <div className="text-slate-400 text-[11px]">
                                Cập nhật: {detail.updatedAt}
                            </div>
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <FileText size={14} className="text-blue-500" />
                            Mô tả chi tiết
                        </div>
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {detail.description}
                        </div>
                    </div>

                    {/* Suggested Solution */}
                    {detail.suggestedSolution && (
                        <div>
                            <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Lightbulb size={14} className="text-amber-500" />
                                Đề xuất giải pháp từ người dùng
                            </div>
                            <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/60 text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                                {detail.suggestedSolution}
                            </div>
                        </div>
                    )}

                    {/* Attachments */}
                    {detail.attachments && detail.attachments.length > 0 && (
                        <div>
                            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                                Hình ảnh đính kèm ({detail.attachments.length})
                            </div>
                            <Image.PreviewGroup>
                                <div className="grid grid-cols-3 gap-2">
                                    {detail.attachments.map((url, i) => (
                                        <div
                                            key={i}
                                            className="aspect-video rounded-lg overflow-hidden border border-slate-200 bg-slate-950 flex items-center justify-center p-1.5 group"
                                        >
                                            <Image
                                                src={formatMediaUrl(url)}
                                                alt={`attachment-${i}`}
                                                className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                                                wrapperClassName="w-full h-full !flex !items-center !justify-center"
                                                style={{ objectFit: 'contain', width: '100%', height: '100%' }}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </Image.PreviewGroup>
                        </div>
                    )}

                    {/* Browser Info */}
                    {detail.browserInfo && (
                        <div>
                            <div className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                                <Laptop size={14} className="text-slate-400" />
                                Thông tin trình duyệt
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 font-mono text-[11px] text-slate-600 break-all">
                                {detail.browserInfo}
                            </div>
                        </div>
                    )}

                    {/* Progress History Timeline */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                <Clock size={14} className="text-blue-500" />
                                Lịch sử tiến độ & nhật ký xử lý
                            </div>
                            <span className="text-xs text-slate-500">
                                {detail.activityLogs?.length || 0} mốc
                            </span>
                        </div>

                        <div className="relative pl-6 space-y-3.5 before:content-[''] before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                            {detail.activityLogs?.map((log) => {
                                const logStatus =
                                    FEEDBACK_STATUSES[log.status] ?? FEEDBACK_STATUSES.RECEIVED;
                                return (
                                    <div key={log.id} className="relative">
                                        <div
                                            className="absolute -left-6 top-1.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white shadow"
                                            style={{ background: logStatus.color }}
                                        >
                                            <CheckCircle2 size={11} className="text-white" />
                                        </div>
                                        <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="flex items-center gap-1.5">
                                                    <Tag color={logStatus.tagColor}>
                                                        {logStatus.label}
                                                    </Tag>
                                                    {log.isCurrent && (
                                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-orange-100 text-orange-700 border border-orange-200">
                                                            Hiện tại
                                                        </span>
                                                    )}
                                                </div>
                                                <span className="text-xs text-slate-400">
                                                    {log.createdAt}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-700 m-0 leading-relaxed">
                                                {log.note || 'Không có ghi chú'}
                                            </p>
                                            <div className="flex items-center gap-1 text-[11px] text-slate-500 pt-1 border-t border-slate-200/60">
                                                <User size={12} className="text-slate-400" />
                                                <span>Người xử lý: </span>
                                                <span className="font-semibold text-slate-700">
                                                    {log.actorName}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Admin Action Box: Update Status & Append Progress Note */}
                    <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200/80 space-y-3">
                        <div className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                            <Shield size={14} className="text-blue-600" />
                            Cập nhật tiến độ & Gắn tag xử lý
                        </div>

                        <Form
                            form={actionForm}
                            layout="vertical"
                            onFinish={handleUpdateStatus}
                            className="space-y-3"
                        >
                            <Form.Item
                                name="status"
                                label="Gắn trạng thái mới"
                                rules={[{ required: true, message: 'Vui lòng chọn trạng thái!' }]}
                                className="m-0"
                            >
                                <Select
                                    options={[
                                        { label: 'Đang xử lý', value: 'IN_PROGRESS' },
                                        { label: 'Đã xử lý', value: 'RESOLVED' },
                                        { label: 'Từ chối', value: 'REJECTED' },
                                    ]}
                                />
                            </Form.Item>

                            <Form.Item
                                name="note"
                                label="Nhật ký xử lý / Ghi chú phản hồi cho học viên"
                                className="m-0"
                            >
                                <Input.TextArea
                                    rows={3}
                                    placeholder="Ví dụ: Đã khắc phục sự cố trên phiên bản 1.2.3 hoặc Hướng dẫn học viên cách thao tác lại..."
                                />
                            </Form.Item>

                            <div className="pt-2 flex items-center justify-between gap-2">
                                <Popconfirm
                                    title="Xóa phản hồi này?"
                                    description="Hành động này sẽ xóa vĩnh viễn phản hồi"
                                    okText="Xóa luôn"
                                    cancelText="Hủy"
                                    okButtonProps={{ danger: true, loading: deleteMutation.isPending }}
                                    onConfirm={handleDeleteFeedback}
                                >
                                    <Button
                                        danger
                                        icon={<Trash2 size={14} />}
                                        loading={deleteMutation.isPending}
                                    >
                                        Xóa phản hồi
                                    </Button>
                                </Popconfirm>

                                <Button
                                    type="primary"
                                    htmlType="submit"
                                    loading={updateStatusMutation.isPending}
                                    className="bg-blue-600 hover:bg-blue-700 font-semibold"
                                >
                                    Lưu cập nhật tiến độ
                                </Button>
                            </div>
                        </Form>
                    </div>
                </div>
            )}
        </Drawer>
    );
};

