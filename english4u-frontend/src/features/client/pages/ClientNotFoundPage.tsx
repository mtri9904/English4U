import { Button } from 'antd';
import { ArrowLeftOutlined, HomeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

export const ClientNotFoundPage = () => {
    const navigate = useNavigate();

    return (
        <div
            style={{
                minHeight: '100dvh',
                background: 'linear-gradient(180deg, #d7deef 0%, #e8edf8 100%)',
                padding: '32px 18px',
                display: 'grid',
                placeItems: 'center',
            }}
        >
            <div
                style={{
                    width: 'min(1120px, 100%)',
                    background: '#ffffff',
                    borderRadius: 24,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 24px 60px rgba(15, 23, 42, 0.12)',
                    padding: '24px 28px 34px',
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        width: 260,
                        height: 260,
                        borderRadius: '999px',
                        background: 'rgba(252, 165, 165, 0.12)',
                        left: -120,
                        top: -70,
                    }}
                />
                <div
                    style={{
                        position: 'absolute',
                        width: 340,
                        height: 340,
                        borderRadius: '999px',
                        background: 'rgba(147, 197, 253, 0.18)',
                        right: -130,
                        bottom: -140,
                    }}
                />

                <div
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                        marginBottom: 30,
                    }}
                >
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1.1rem' }}>English4U</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 18, color: '#475569', fontWeight: 600 }}>
                        <span>Home</span>
                        <span>Practice</span>
                        <span>About us</span>
                    </div>
                </div>

                <div
                    style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'grid',
                        gridTemplateColumns: '1.05fr 1fr',
                        gap: 20,
                    }}
                >
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 12 }}>
                        <div style={{ fontSize: '3rem', lineHeight: 1, fontWeight: 900, color: '#1e3a8a' }}>Oops...</div>
                        <div style={{ fontSize: '1.15rem', color: '#334155', fontWeight: 600 }}>
                            Trang bạn đang tìm không tồn tại.
                        </div>
                        <div style={{ color: '#64748b', maxWidth: 460 }}>
                            Có thể đường dẫn đã thay đổi hoặc bị xóa. Bạn có thể quay về trang chủ hoặc dashboard để tiếp tục.
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                            <Button
                                type="primary"
                                size="large"
                                icon={<HomeOutlined />}
                                style={{ height: 42, borderRadius: 10, fontWeight: 700, padding: '0 18px' }}
                                onClick={() => navigate('/')}
                            >
                                Go Home
                            </Button>
                            <Button
                                size="large"
                                icon={<ArrowLeftOutlined />}
                                style={{ height: 42, borderRadius: 10, fontWeight: 700, padding: '0 18px' }}
                                onClick={() => navigate('/app')}
                            >
                                Quay lại Dashboard
                            </Button>
                        </div>
                    </div>

                    <div
                        style={{
                            minHeight: 320,
                            display: 'grid',
                            placeItems: 'center',
                            position: 'relative',
                        }}
                    >
                        <div
                            style={{
                                width: 'min(430px, 100%)',
                                aspectRatio: '1 / 1',
                                borderRadius: '999px',
                                background: 'radial-gradient(circle at 35% 30%, #bfdbfe 0%, #dbeafe 38%, #eff6ff 100%)',
                                border: '1px dashed #93c5fd',
                                display: 'grid',
                                placeItems: 'center',
                            }}
                        >
                            <div style={{ fontSize: 'clamp(5rem, 15vw, 8.6rem)', fontWeight: 900, color: '#0f172a' }}>
                                404
                            </div>
                        </div>
                        <div
                            style={{
                                position: 'absolute',
                                left: 26,
                                bottom: 34,
                                width: 66,
                                height: 28,
                                borderRadius: 999,
                                background: '#fb923c',
                            }}
                        />
                        <div
                            style={{
                                position: 'absolute',
                                right: 34,
                                top: 48,
                                width: 30,
                                height: 30,
                                borderRadius: 999,
                                background: '#93c5fd',
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};
