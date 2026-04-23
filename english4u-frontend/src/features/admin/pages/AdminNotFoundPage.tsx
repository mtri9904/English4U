import { Button, Card } from 'antd';
import { CompassOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export const AdminNotFoundPage = () => {
    const navigate = useNavigate();

    return (
        <div
            style={{
                minHeight: '52vh',
                display: 'grid',
                placeItems: 'center',
                padding: '24px 0',
            }}
        >
            <Card
                style={{
                    width: 'min(560px, 100%)',
                    borderRadius: 16,
                    border: '1px solid #dbeafe',
                    background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
                }}
            >
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                    <div
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: 14,
                            background: 'linear-gradient(135deg, #dbeafe 0%, #eff6ff 100%)',
                            color: '#1d4ed8',
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 24,
                        }}
                    >
                        <CompassOutlined />
                    </div>
                    <div style={{ fontSize: '1.7rem', fontWeight: 800, color: '#0f172a' }}>404</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#1e293b' }}>Trang không tồn tại</div>
                    <div style={{ color: '#64748b', textAlign: 'center' }}>
                        Đường dẫn CMS bạn truy cập không hợp lệ hoặc đã bị thay đổi.
                    </div>
                    <Button
                        type="primary"
                        size="large"
                        style={{ borderRadius: 10, height: 42, fontWeight: 700, padding: '0 22px' }}
                        onClick={() => navigate('/admin/dashboard')}
                    >
                        Quay lại Dashboard
                    </Button>
                </div>
            </Card>
        </div>
    );
};
