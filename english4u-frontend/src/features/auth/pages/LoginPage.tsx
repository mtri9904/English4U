import { Link } from 'react-router-dom'
import { LoginForm } from '../components/LoginForm'
import { RegisterForm } from '../components/RegisterForm'
import { ForgotForm } from '../components/ForgotForm'

export function LoginPage({ mode = 'login' }: { mode?: 'login' | 'register' | 'forgot' }) {
    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', backgroundColor: '#fff' }}>

            <div style={{
                flex: 1,
                maxWidth: '50%',
                background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
                padding: '40px',
                display: 'flex',
                flexDirection: 'column',
                position: 'relative'
            }} className="hidden lg:flex">


                <Link to="/" style={{ display: 'inline-flex', width: '40px', height: '40px', borderRadius: '10px', alignItems: 'center', justifyContent: 'center', textDecoration: 'none', marginBottom: '40px' }}>
                    <img
                        src="logo/Logo.png"
                        style={{
                            width: 80,
                            height: 80,
                            objectFit: 'contain'
                        }}
                    />
                </Link>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '480px', margin: '0 auto', width: '100%' }}>

                    <div style={{
                        background: '#fff',
                        padding: '10px',
                        borderRadius: '24px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
                        marginBottom: '40px',
                        transform: 'rotate(-1deg)'
                    }}>
                        <img
                            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?q=80&w=800&auto=format&fit=crop"
                            alt="Students studying"
                            style={{ width: '100%', height: '260px', objectFit: 'cover', borderRadius: '16px' }}
                        />
                    </div>

                    <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.2, marginBottom: '20px' }}>
                        Hành trình thông minh chinh phục tiếng Anh của bạn.
                    </h1>

                    <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: '40px' }}>
                        Khám phá thế giới bài học đa dạng, luyện tập với các công cụ thông minh và theo dõi tiến trình học tập của bạn từng bước một với nền tảng hỗ trợ trí tuệ nhân tạo của chúng tôi.
                    </p>


                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', marginLeft: '10px' }}>
                            {['https://i.pravatar.cc/150?img=11', 'https://i.pravatar.cc/150?img=12', 'https://i.pravatar.cc/150?img=13'].map((img, i) => (
                                <img key={i} src={img} alt="Avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', border: '2px solid #bae6fd', marginLeft: '-10px', background: '#fff' }} />
                            ))}
                        </div>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                            Đạt được điểm số 8.0+ ngay hôm nay!
                        </span>
                    </div>
                </div>
            </div>


            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '40px 24px', position: 'relative', overflowY: 'auto' }}>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', maxWidth: '440px', margin: '0 auto', width: '100%' }}>

                    {mode === 'login' && <LoginForm />}
                    {mode === 'register' && <RegisterForm />}
                    {mode === 'forgot' && <ForgotForm />}

                </div>
            </div>
        </div>
    )
}
