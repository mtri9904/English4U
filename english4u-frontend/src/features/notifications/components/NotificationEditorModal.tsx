import React from 'react';
import { Modal, Form, Input, Select, Empty, Skeleton, Avatar, Button, type FormInstance } from 'antd';
import { Send, Pencil, Trash2 } from 'lucide-react';
import type { EditorMode, NotificationFormValues } from '../constants/notification.constants';
import { DEFAULT_FORM, ROLE_OPTIONS } from '../constants/notification.constants';
import type { UserOverviewDto } from '@/features/students';

interface NotificationEditorModalProps {
    open: boolean;
    editorMode: EditorMode;
    isSaving: boolean;
    form: FormInstance<NotificationFormValues>;
    userOptions: Array<{ label: React.ReactNode; value: string; searchValue: string }>;
    isUsersLoading: boolean;
    selectedUsers: UserOverviewDto[];
    onSearchUsers: (term: string) => void;
    onUsersChange: (values: string[]) => void;
    onSubmit: () => void;
    onClose: () => void;
}

export const NotificationEditorModal: React.FC<NotificationEditorModalProps> = ({
    open,
    editorMode,
    isSaving,
    form,
    userOptions,
    isUsersLoading,
    selectedUsers,
    onSearchUsers,
    onUsersChange,
    onSubmit,
    onClose,
}) => {
    return (
        <Modal
            open={open}
            onCancel={onClose}
            onOk={onSubmit}
            okText={editorMode === 'create' ? 'Gửi thông báo' : 'Lưu thay đổi'}
            cancelText="Hủy"
            confirmLoading={isSaving}
            destroyOnClose
            width={540}
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0' }}>
                    <div
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: 9,
                            background:
                                editorMode === 'create'
                                    ? 'linear-gradient(135deg,#6366f1,#8b5cf6)'
                                    : 'linear-gradient(135deg,#0ea5e9,#06b6d4)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        {editorMode === 'create' ? <Send size={16} color="#fff" /> : <Pencil size={16} color="#fff" />}
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0f172a' }}>
                        {editorMode === 'create' ? 'Tạo thông báo hệ thống' : 'Chỉnh sửa thông báo'}
                    </span>
                </div>
            }
            styles={{
                header: { borderBottom: '1px solid #f1f5f9', paddingBottom: 16, marginBottom: 0 },
                body: { paddingTop: 20 },
            }}
        >
            <Form layout="vertical" form={form} preserve={false} initialValues={DEFAULT_FORM}>
                {editorMode === 'create' && (
                    <Form.Item
                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Hình thức gửi</span>}
                        name="targetType"
                        rules={[{ required: true }]}
                    >
                        <Select
                            size="large"
                            style={{ borderRadius: 10 }}
                            options={[
                                { label: 'Gửi theo Vai trò (Role)', value: 'role' },
                                { label: 'Gửi cho Người dùng cụ thể', value: 'users' },
                            ]}
                        />
                    </Form.Item>
                )}

                <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.targetType !== currentValues.targetType}>
                    {({ getFieldValue }) => {
                        const targetType = getFieldValue('targetType');
                        if (targetType === 'users' && editorMode === 'create') {
                            return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
                                    <Form.Item
                                        label={<span style={{ fontWeight: 600, color: '#334155' }}>Chọn người dùng nhận thông báo</span>}
                                        name="targetUserIds"
                                        rules={[{ required: true, message: 'Vui lòng chọn ít nhất một người dùng.' }]}
                                        style={{ marginBottom: 0 }}
                                    >
                                        <Select
                                            mode="multiple"
                                            size="large"
                                            placeholder="Nhập tên hoặc email để tìm kiếm..."
                                            filterOption={(input, option) =>
                                                (option?.searchValue ?? '').toLowerCase().includes(input.toLowerCase())
                                            }
                                            onSearch={onSearchUsers}
                                            onChange={onUsersChange}
                                            options={userOptions}
                                            tagRender={() => <></>}
                                            style={{ borderRadius: 10 }}
                                            notFoundContent={
                                                isUsersLoading ? (
                                                    <Skeleton active paragraph={{ rows: 1 }} />
                                                ) : (
                                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                                                )
                                            }
                                        />
                                    </Form.Item>

                                    {selectedUsers.length > 0 && (
                                        <div
                                            style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                                                gap: 12,
                                                maxHeight: 180,
                                                overflowY: 'auto',
                                                padding: '4px',
                                                border: '1px solid #f1f5f9',
                                                borderRadius: 12,
                                                background: '#f8fafc',
                                            }}
                                        >
                                            {selectedUsers.map((user) => (
                                                <div
                                                    key={user.id}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        background: '#fff',
                                                        border: '1px solid #e2e8f0',
                                                        borderRadius: 10,
                                                        padding: '8px 12px',
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                                                        <Avatar src={user.avatarUrl || undefined} size="small" style={{ backgroundColor: '#0ea5e9' }}>
                                                            {(user.displayName || user.email).charAt(0).toUpperCase()}
                                                        </Avatar>
                                                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, lineHeight: 1.2 }}>
                                                            <span
                                                                style={{
                                                                    fontWeight: 700,
                                                                    color: '#0f172a',
                                                                    fontSize: '0.8rem',
                                                                    whiteSpace: 'nowrap',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                }}
                                                            >
                                                                {user.displayName || 'Chưa đặt tên'}
                                                            </span>
                                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                                {user.roleName || 'Học viên'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        type="text"
                                                        size="small"
                                                        danger
                                                        icon={<Trash2 size={13} />}
                                                        onClick={() => {
                                                            const newValues = selectedUsers
                                                                .filter((u) => u.id !== user.id)
                                                                .map((u) => u.id);
                                                            onUsersChange(newValues);
                                                        }}
                                                        style={{ flexShrink: 0 }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        }

                        return (
                            <Form.Item
                                label={<span style={{ fontWeight: 600, color: '#334155' }}>Vai trò nhận thông báo</span>}
                                name="targetRole"
                                rules={[{ required: true, message: 'Vui lòng chọn vai trò.' }]}
                            >
                                <Select
                                    size="large"
                                    disabled={editorMode === 'edit'}
                                    options={ROLE_OPTIONS}
                                    style={{ borderRadius: 10 }}
                                />
                            </Form.Item>
                        );
                    }}
                </Form.Item>

                <Form.Item
                    label={<span style={{ fontWeight: 600, color: '#334155' }}>Tiêu đề thông báo</span>}
                    name="title"
                    rules={[
                        { required: true, message: 'Vui lòng nhập tiêu đề.' },
                        { max: 255, message: 'Tối đa 255 ký tự.' },
                    ]}
                >
                    <Input
                        size="large"
                        maxLength={255}
                        showCount
                        placeholder="Ví dụ: Thông báo lịch thi tháng 7..."
                        style={{ borderRadius: 10 }}
                    />
                </Form.Item>

                <Form.Item
                    label={<span style={{ fontWeight: 600, color: '#334155' }}>Nội dung chi tiết</span>}
                    name="message"
                    rules={[{ max: 2000, message: 'Tối đa 2000 ký tự.' }]}
                >
                    <Input.TextArea
                        rows={5}
                        showCount
                        maxLength={2000}
                        placeholder="Nhập nội dung thông báo gửi đến người dùng..."
                        style={{ borderRadius: 10, resize: 'none' }}
                    />
                </Form.Item>

                {editorMode === 'edit' && (
                    <div
                        style={{
                            background: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: 10,
                            padding: '10px 14px',
                            color: '#92400e',
                            fontSize: '0.82rem',
                            lineHeight: 1.5,
                            display: 'flex',
                            gap: 8,
                            alignItems: 'flex-start',
                        }}
                    >
                        <span style={{ fontSize: '1rem' }}>ℹ️</span>
                        Vai trò nhận được giữ nguyên khi chỉnh sửa để tránh thay đổi nhầm phạm vi đã gửi.
                    </div>
                )}
            </Form>
        </Modal>
    );
};

