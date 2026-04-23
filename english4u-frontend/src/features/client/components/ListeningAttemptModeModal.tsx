import { AudioOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { Button, Modal, Space, Typography } from 'antd';
import type { ListeningAttemptMode } from '../lib/listeningSessionState';

const { Paragraph, Text, Title } = Typography;

interface ListeningAttemptModeModalProps {
    open: boolean;
    loading?: boolean;
    onCancel: () => void;
    onSelectMode: (mode: ListeningAttemptMode) => void;
}

export const ListeningAttemptModeModal = ({
    open,
    loading = false,
    onCancel,
    onSelectMode,
}: ListeningAttemptModeModalProps) => (
    <Modal
        open={open}
        onCancel={onCancel}
        footer={null}
        centered
        width={620}
        title="Chọn cách làm bài Listening"
    >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Paragraph style={{ margin: 0, color: '#64748b' }}>
                Bạn có thể vào bài theo chế độ thi thật hoặc luyện tập. Cả hai chế độ đều vẫn lưu đáp án như bình thường.
            </Paragraph>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 14,
                }}
            >
                <div
                    role="button"
                    tabIndex={loading ? -1 : 0}
                    onClick={() => !loading && onSelectMode('mock')}
                    onKeyDown={(event) => {
                        if (!loading && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            onSelectMode('mock');
                        }
                    }}
                    style={{
                        textAlign: 'left',
                        border: '1px solid #bfdbfe',
                        borderRadius: 18,
                        padding: 18,
                        background: 'linear-gradient(135deg, #eff6ff 0%, #ffffff 100%)',
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Space size={10}>
                            <div
                                style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 14,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: '#2563eb',
                                    color: '#fff',
                                }}
                            >
                                <AudioOutlined />
                            </div>
                            <div>
                                <Title level={5} style={{ margin: 0 }}>Mock test</Title>
                                <Text type="secondary">Giống thi thật</Text>
                            </div>
                        </Space>
                        <Paragraph style={{ margin: 0, color: '#334155' }}>
                            Audio tự phát sau khoảng 10 giây, chạy một mạch tới cuối, không có nút dừng hay tua.
                        </Paragraph>
                        <Button type="primary" loading={loading} block>
                            Vào thi mock test
                        </Button>
                    </Space>
                </div>

                <div
                    role="button"
                    tabIndex={loading ? -1 : 0}
                    onClick={() => !loading && onSelectMode('practice')}
                    onKeyDown={(event) => {
                        if (!loading && (event.key === 'Enter' || event.key === ' ')) {
                            event.preventDefault();
                            onSelectMode('practice');
                        }
                    }}
                    style={{
                        textAlign: 'left',
                        border: '1px solid #dbeafe',
                        borderRadius: 18,
                        padding: 18,
                        background: '#fff',
                        cursor: loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    <Space direction="vertical" size={12} style={{ width: '100%' }}>
                        <Space size={10}>
                            <div
                                style={{
                                    width: 42,
                                    height: 42,
                                    borderRadius: 14,
                                    display: 'grid',
                                    placeItems: 'center',
                                    background: '#e0f2fe',
                                    color: '#0369a1',
                                }}
                            >
                                <PlayCircleOutlined />
                            </div>
                            <div>
                                <Title level={5} style={{ margin: 0 }}>Luyện tập</Title>
                                <Text type="secondary">Chủ động điều khiển audio</Text>
                            </div>
                        </Space>
                        <Paragraph style={{ margin: 0, color: '#334155' }}>
                            Bạn có thể phát, tạm dừng và tua audio như hiện tại để luyện nghe theo tốc độ của mình.
                        </Paragraph>
                        <Button block loading={loading}>
                            Vào chế độ luyện tập
                        </Button>
                    </Space>
                </div>
            </div>
        </Space>
    </Modal>
);
