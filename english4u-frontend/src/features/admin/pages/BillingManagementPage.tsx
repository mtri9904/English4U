import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    Badge,
    Button,
    Card,
    Form,
    Input,
    InputNumber,
    Modal,
    Pagination,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    CheckCircleOutlined,
    EditOutlined,
    PlusOutlined,
    ReloadOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import { Wallet, Package, ReceiptText, Clock3 } from 'lucide-react';
import {
    useBillingOverviewQuery,
    useBillingPaymentsQuery,
    useBillingSubscriptionsQuery,
    useCreateSubscriptionMutation,
    useToggleSubscriptionStatusMutation,
    useUpdateSubscriptionMutation,
    type PaymentListItemDto,
    type SubscriptionListItemDto,
} from '@/features/admin/api/billing.api';
import { formatDateTimeToMinute } from '@/shared/lib/dateTime';

type PackageFormValues = {
    name: string;
    price: number;
    durationDays: number;
    features?: string;
    isActive: boolean;
};

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.06 },
    },
};

const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
};

const statusColorMap: Record<string, string> = {
    Success: 'green',
    Pending: 'gold',
    Failed: 'red',
    Cancelled: 'default',
};

export const BillingManagementPage = () => {
    const LIVE_REFRESH_INTERVAL_MS = 15_000;
    const PACKAGE_FORM_DESCRIPTION_MAX = 1500;

    const [isPackageModalOpen, setIsPackageModalOpen] = useState(false);
    const [editingPackage, setEditingPackage] = useState<SubscriptionListItemDto | null>(null);
    const [paymentSearch, setPaymentSearch] = useState('');
    const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('ALL');
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>('ALL');
    const [paymentPage, setPaymentPage] = useState(1);
    const [paymentPageSize, setPaymentPageSize] = useState(10);
    const [packageForm] = Form.useForm<PackageFormValues>();

    const paymentQueryParams = useMemo(
        () => ({
            pageNumber: paymentPage,
            pageSize: paymentPageSize,
            searchTerm: paymentSearch.trim() || undefined,
            status: paymentStatusFilter === 'ALL' ? undefined : paymentStatusFilter,
            method: paymentMethodFilter === 'ALL' ? undefined : paymentMethodFilter,
        }),
        [paymentPage, paymentPageSize, paymentSearch, paymentStatusFilter, paymentMethodFilter]
    );

    const { data: overview, isLoading: isOverviewLoading, refetch: refetchOverview } = useBillingOverviewQuery({
        refetchInterval: LIVE_REFRESH_INTERVAL_MS,
        refetchOnWindowFocus: true,
    });

    const { data: subscriptions, isLoading: isSubscriptionsLoading, refetch: refetchSubscriptions } = useBillingSubscriptionsQuery({
        refetchInterval: LIVE_REFRESH_INTERVAL_MS,
        refetchOnWindowFocus: true,
    });

    const { data: pagedPayments, isLoading: isPaymentsLoading, isFetching: isPaymentsFetching, refetch: refetchPayments } = useBillingPaymentsQuery(
        paymentQueryParams,
        {
            refetchInterval: LIVE_REFRESH_INTERVAL_MS,
            refetchOnWindowFocus: true,
        }
    );

    const createSubscriptionMutation = useCreateSubscriptionMutation();
    const updateSubscriptionMutation = useUpdateSubscriptionMutation();
    const toggleSubscriptionStatusMutation = useToggleSubscriptionStatusMutation();

    const openCreatePackageModal = () => {
        setEditingPackage(null);
        setIsPackageModalOpen(true);
    };

    const openEditPackageModal = (item: SubscriptionListItemDto) => {
        setEditingPackage(item);
        setIsPackageModalOpen(true);
    };

    useEffect(() => {
        if (!isPackageModalOpen) {
            return;
        }

        if (editingPackage) {
            packageForm.setFieldsValue({
                name: editingPackage.name,
                price: editingPackage.price,
                durationDays: editingPackage.durationDays,
                features: editingPackage.features ?? '',
                isActive: editingPackage.isActive,
            });
            return;
        }

        packageForm.setFieldsValue({
            name: '',
            price: 0,
            durationDays: 30,
            features: '',
            isActive: true,
        });
    }, [isPackageModalOpen, editingPackage, packageForm]);

    const handleClosePackageModal = () => {
        if (createSubscriptionMutation.isPending || updateSubscriptionMutation.isPending) {
            return;
        }

        setIsPackageModalOpen(false);
        setEditingPackage(null);
        packageForm.resetFields();
    };

    const handleSubmitPackage = async () => {
        try {
            const values = await packageForm.validateFields();
            const payload = {
                name: values.name.trim(),
                price: Number(values.price),
                durationDays: Number(values.durationDays),
                features: values.features?.trim() || undefined,
                isActive: values.isActive,
            };

            if (!payload.name) {
                message.error('Vui lòng nhập tên gói.');
                return;
            }

            if (editingPackage) {
                await updateSubscriptionMutation.mutateAsync({
                    id: editingPackage.id,
                    payload,
                });
                message.success('Đã cập nhật gói thành công.');
            } else {
                await createSubscriptionMutation.mutateAsync(payload);
                message.success('Đã tạo gói mới thành công.');
            }

            handleClosePackageModal();
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'errorFields' in error) {
                return;
            }
            message.error('Lưu gói thất bại.');
        }
    };

    const handleTogglePackageStatus = async (item: SubscriptionListItemDto) => {
        try {
            await toggleSubscriptionStatusMutation.mutateAsync({
                id: item.id,
                payload: { isActive: !item.isActive },
            });
            message.success(`Đã ${item.isActive ? 'ẩn' : 'mở'} gói ${item.name}.`);
        } catch {
            message.error('Cập nhật trạng thái gói thất bại.');
        }
    };

    const packageColumns: ColumnsType<SubscriptionListItemDto> = [
        {
            title: 'Tên gói',
            dataIndex: 'name',
            key: 'name',
            render: (value: string, record) => (
                <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{value}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{record.durationDays} ngày</div>
                </div>
            ),
        },
        {
            title: 'Giá (VND)',
            dataIndex: 'price',
            key: 'price',
            width: 140,
            render: (value: number) => <b>{value.toLocaleString('vi-VN')} đ</b>,
        },
        {
            title: 'Người dùng',
            dataIndex: 'activeUsers',
            key: 'activeUsers',
            width: 130,
            render: (value: number) => <Tag color="blue">{value} đang dùng</Tag>,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'isActive',
            key: 'isActive',
            width: 130,
            render: (value: boolean) => (
                <Badge
                    color={value ? '#16a34a' : '#94a3b8'}
                    text={value ? 'Đang mở' : 'Tạm ẩn'}
                />
            ),
        },
        {
            title: 'Mô tả',
            dataIndex: 'features',
            key: 'features',
            width: 420,
            render: (value: string | null) => {
                const description = value?.trim() || 'Chưa có mô tả quyền lợi.';
                return (
                    <Tooltip title={description} placement="topLeft">
                        <span
                            style={{
                                display: 'inline-block',
                                maxWidth: 400,
                                color: '#475569',
                                fontSize: '0.8125rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}
                        >
                            {description}
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Thao tác',
            key: 'action',
            width: 180,
            render: (_, item) => (
                <Space>
                    <Tooltip title="Sửa gói">
                        <Button icon={<EditOutlined />} size="small" onClick={() => openEditPackageModal(item)}>
                            Sửa
                        </Button>
                    </Tooltip>
                    <Tooltip title={item.isActive ? 'Ẩn gói này' : 'Mở lại gói này'}>
                        <Button
                            size="small"
                            icon={<CheckCircleOutlined />}
                            onClick={() => handleTogglePackageStatus(item)}
                            loading={toggleSubscriptionStatusMutation.isPending && toggleSubscriptionStatusMutation.variables?.id === item.id}
                        >
                            {item.isActive ? 'Ẩn' : 'Mở'}
                        </Button>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const paymentColumns: ColumnsType<PaymentListItemDto> = [
        {
            title: 'Người dùng',
            key: 'user',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{record.userDisplayName}</div>
                    <div style={{ color: '#64748b', fontSize: '0.75rem' }}>{record.userEmail}</div>
                </div>
            ),
        },
        {
            title: 'Gói',
            dataIndex: 'subscriptionName',
            key: 'subscriptionName',
            width: 170,
            render: (value: string | null) => value || 'Chưa xác định',
        },
        {
            title: 'Số tiền',
            dataIndex: 'amount',
            key: 'amount',
            width: 130,
            render: (value: number) => <b>{value.toLocaleString('vi-VN')} đ</b>,
        },
        {
            title: 'Phương thức',
            dataIndex: 'paymentMethod',
            key: 'paymentMethod',
            width: 130,
            render: (value: string | null) => <Tag>{value || 'N/A'}</Tag>,
        },
        {
            title: 'Trạng thái',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (value: string | null) => <Tag color={statusColorMap[value || ''] || 'default'}>{value || 'N/A'}</Tag>,
        },
        {
            title: 'Mã giao dịch',
            dataIndex: 'transactionId',
            key: 'transactionId',
            render: (value: string | null) => (
                <span style={{ color: '#475569', fontSize: '0.75rem' }}>
                    {value || 'Chưa có'}
                </span>
            ),
        },
        {
            title: 'Thời gian',
            dataIndex: 'createdAt',
            key: 'createdAt',
            width: 160,
            render: (value: string) => formatDateTimeToMinute(value) || 'N/A',
        },
    ];

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
        >
            <motion.div variants={itemVariants}>
                <div
                    style={{
                        borderRadius: 18,
                        padding: 22,
                        background: 'radial-gradient(circle at 0% 0%, #0ea5e9 0%, #0f172a 72%)',
                        border: '1px solid rgba(148, 163, 184, 0.35)',
                        color: '#fff',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: '1.55rem', fontWeight: 800, marginBottom: 6 }}>Thanh Toán & Gói</div>
                            <div style={{ color: 'rgba(226, 232, 240, 0.92)' }}>
                                Quản trị danh mục gói học và theo dõi lịch sử thanh toán VNPay trong CMS.
                            </div>
                        </div>
                        <Button
                            icon={<ReloadOutlined spin={isPaymentsFetching} />}
                            onClick={() => {
                                refetchOverview();
                                refetchSubscriptions();
                                refetchPayments();
                            }}
                            style={{ borderRadius: 10, fontWeight: 700 }}
                        >
                            Làm mới
                        </Button>
                    </div>
                </div>
            </motion.div>

            <motion.div
                variants={itemVariants}
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 12,
                }}
            >
                <Card loading={isOverviewLoading} style={{ borderRadius: 14, border: '1px solid #dbeafe' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Tổng gói</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                                {overview?.totalPackages ?? 0}
                            </div>
                        </div>
                        <Package size={20} color="#2563eb" />
                    </div>
                </Card>
                <Card loading={isOverviewLoading} style={{ borderRadius: 14, border: '1px solid #dcfce7' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Gói đang mở</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                                {overview?.activePackages ?? 0}
                            </div>
                        </div>
                        <Wallet size={20} color="#16a34a" />
                    </div>
                </Card>
                <Card loading={isOverviewLoading} style={{ borderRadius: 14, border: '1px solid #fee2e2' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Giao dịch thành công</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.55rem' }}>
                                {overview?.successfulTransactions ?? 0}
                            </div>
                        </div>
                        <ReceiptText size={20} color="#dc2626" />
                    </div>
                </Card>
                <Card loading={isOverviewLoading} style={{ borderRadius: 14, border: '1px solid #ede9fe' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ color: '#64748b', fontSize: '0.82rem' }}>Doanh thu xác nhận</div>
                            <div style={{ color: '#0f172a', fontWeight: 800, fontSize: '1.4rem' }}>
                                {(overview?.totalRevenue ?? 0).toLocaleString('vi-VN')} đ
                            </div>
                        </div>
                        <Clock3 size={20} color="#7c3aed" />
                    </div>
                </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card
                    title="Danh mục gói học"
                    extra={
                        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                            <Button
                                icon={<PlusOutlined />}
                                type="primary"
                                onClick={openCreatePackageModal}
                                style={{
                                    borderRadius: 10,
                                    border: 'none',
                                    height: 40,
                                    paddingInline: 16,
                                    fontWeight: 700,
                                    background: 'linear-gradient(135deg, #22d3ee 0%, #2563eb 58%, #4338ca 100%)',
                                    boxShadow: '0 8px 20px rgba(37, 99, 235, 0.35)',
                                }}
                            >
                                Thêm gói
                            </Button>
                        </motion.div>
                    }
                    style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}
                >
                    <Table
                        rowKey="id"
                        columns={packageColumns}
                        dataSource={subscriptions ?? []}
                        loading={isSubscriptionsLoading}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                    />
                </Card>
            </motion.div>

            <motion.div variants={itemVariants}>
                <Card title="Lịch sử thanh toán" style={{ borderRadius: 14, border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
                        <Input
                            value={paymentSearch}
                            onChange={(event) => {
                                setPaymentSearch(event.target.value);
                                setPaymentPage(1);
                            }}
                            allowClear
                            prefix={<SearchOutlined style={{ color: '#94a3b8' }} />}
                            placeholder="Tìm theo email, tên hoặc mã giao dịch..."
                            style={{ minWidth: 260, flex: 2, borderRadius: 10 }}
                        />
                        <Select
                            value={paymentStatusFilter}
                            onChange={(value) => {
                                setPaymentStatusFilter(value);
                                setPaymentPage(1);
                            }}
                            style={{ minWidth: 170, flex: 1 }}
                            options={[
                                { value: 'ALL', label: 'Tất cả trạng thái' },
                                { value: 'Pending', label: 'Pending' },
                                { value: 'Success', label: 'Success' },
                                { value: 'Failed', label: 'Failed' },
                                { value: 'Cancelled', label: 'Cancelled' },
                            ]}
                        />
                        <Select
                            value={paymentMethodFilter}
                            onChange={(value) => {
                                setPaymentMethodFilter(value);
                                setPaymentPage(1);
                            }}
                            style={{ minWidth: 150, flex: 1 }}
                            options={[
                                { value: 'ALL', label: 'Tất cả cổng' },
                                { value: 'VNPAY', label: 'VNPAY' },
                            ]}
                        />
                    </div>

                    <Table
                        rowKey="id"
                        columns={paymentColumns}
                        dataSource={pagedPayments?.items ?? []}
                        loading={isPaymentsLoading}
                        pagination={false}
                        scroll={{ x: 'max-content' }}
                    />

                    <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                        <Pagination
                            current={paymentPage}
                            pageSize={paymentPageSize}
                            total={pagedPayments?.totalCount ?? 0}
                            showSizeChanger
                            pageSizeOptions={['10', '20', '50', '100']}
                            onChange={(page, size) => {
                                setPaymentPage(page);
                                setPaymentPageSize(size);
                            }}
                        />
                    </div>
                </Card>
            </motion.div>

            <Modal
                title={editingPackage ? 'Cập nhật gói học' : 'Tạo gói học mới'}
                open={isPackageModalOpen}
                onCancel={handleClosePackageModal}
                onOk={handleSubmitPackage}
                okText={editingPackage ? 'Lưu thay đổi' : 'Tạo gói'}
                cancelText="Hủy"
                confirmLoading={createSubscriptionMutation.isPending || updateSubscriptionMutation.isPending}
                destroyOnClose
                centered
                forceRender
                width={760}
            >
                <div
                    style={{
                        marginTop: 8,
                        borderRadius: 14,
                        border: '1px solid #e2e8f0',
                        background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 52%)',
                        padding: 14,
                    }}
                >
                    <div
                        style={{
                            marginBottom: 14,
                            borderRadius: 10,
                            border: '1px solid #dbeafe',
                            background: '#eff6ff',
                            padding: '10px 12px',
                        }}
                    >
                        <Typography.Text strong style={{ color: '#0f172a' }}>
                            Thông tin gói học
                        </Typography.Text>
                        <div style={{ color: '#475569', fontSize: '0.8rem', marginTop: 2 }}>
                            Mô tả rõ quyền lợi để đội vận hành và học viên dễ theo dõi.
                        </div>
                    </div>

                    <Form form={packageForm} layout="vertical" preserve={false}>
                        <Form.Item
                            label="Tên gói"
                            name="name"
                            rules={[
                                { required: true, message: 'Vui lòng nhập tên gói.' },
                                { max: 255, message: 'Tên gói tối đa 255 ký tự.' },
                            ]}
                        >
                            <Input size="large" placeholder="Ví dụ: Premium 3 tháng" />
                        </Form.Item>

                        <div
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: 12,
                                alignItems: 'start',
                            }}
                        >
                            <Form.Item label="Giá (VND)" name="price" rules={[{ required: true, message: 'Vui lòng nhập giá gói.' }]}>
                                <InputNumber
                                    size="large"
                                    min={0}
                                    style={{ width: '100%' }}
                                    placeholder="0"
                                    controls={false}
                                    formatter={(value) => (value ? Number(value).toLocaleString('vi-VN') : '')}
                                    parser={(value) => Number((value || '').replace(/\./g, '').replace(/,/g, ''))}
                                />
                            </Form.Item>
                            <Form.Item
                                label="Thời lượng (ngày)"
                                name="durationDays"
                                rules={[{ required: true, message: 'Vui lòng nhập thời lượng.' }]}
                            >
                                <InputNumber size="large" min={1} style={{ width: '100%' }} placeholder="30" />
                            </Form.Item>
                            <Form.Item label="Trạng thái mở bán" name="isActive" valuePropName="checked" initialValue={true}>
                                <Switch checkedChildren="Đang mở" unCheckedChildren="Tạm ẩn" />
                            </Form.Item>
                        </div>

                        <Form.Item
                            label="Mô tả quyền lợi"
                            name="features"
                            extra="Nội dung sẽ hiển thị ở cột Mô tả trong danh sách gói học."
                        >
                            <Input.TextArea
                                rows={8}
                                showCount
                                maxLength={PACKAGE_FORM_DESCRIPTION_MAX}
                                placeholder="Ví dụ: - Không giới hạn chấm chữa AI 4 kỹ năng. - Mở toàn bộ kho đề Full Test. - Ưu tiên hỗ trợ kỹ thuật."
                                style={{ minHeight: 180, resize: 'vertical' }}
                            />
                        </Form.Item>
                    </Form>
                </div>
            </Modal>
        </motion.div>
    );
};
