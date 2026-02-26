import { LandingHeader } from '../components/LandingHeader'
import { LandingFooter } from '../components/LandingFooter'
import { Rocket, Target, ShieldCheck, Star } from 'lucide-react'

export function AboutPage() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg)' }}>
            <LandingHeader />

            <main style={{ paddingTop: '120px' }}>
                {/* Hero Section */}
                <section className="container-app" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '64px', alignItems: 'center', padding: '40px 24px 80px' }}>
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 16px', background: '#eff6ff', borderRadius: '100px', marginBottom: '24px' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 16 16 12 12 8"></polyline>
                                <line x1="8" y1="12" x2="16" y2="12"></line>
                            </svg>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Về chúng tôi</span>
                        </div>

                        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '3.5rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-0.02em' }}>
                            Sứ mệnh nâng<br />tầm <span style={{ color: 'var(--color-primary)' }}>tiếng Anh</span> cho người Việt
                        </h1>

                        <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.7, maxWidth: '480px' }}>
                            Chúng tôi tin rằng rào cản ngôn ngữ không nên là trở ngại cho ước mơ vươn ra thế giới. English4U được xây dựng để khai phá tiềm năng ngôn ngữ thông qua công nghệ đột phá.
                        </p>
                    </div>

                    <div style={{ position: 'relative' }}>
                        <div style={{ background: '#1c4a5a', borderRadius: '24px', padding: '0', overflow: 'hidden', boxShadow: '0 24px 60px rgba(28, 74, 90, 0.2)' }}>
                            <img
                                src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1000&auto=format&fit=crop"
                                alt="Learning with Tech"
                                style={{ width: '100%', height: '400px', objectFit: 'cover', opacity: 0.9 }}
                            />
                        </div>
                        {/* Floating Stats Card */}
                        <div style={{ position: 'absolute', bottom: '-20px', left: '-20px', background: '#fff', padding: '16px 24px', borderRadius: '16px', boxShadow: '0 12px 32px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <div style={{ width: '48px', height: '48px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                                    <circle cx="9" cy="7" r="4"></circle>
                                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                                    <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                                </svg>
                            </div>
                            <div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>50,000+</div>
                                <div style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>Học viên tin tưởng</div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Who We Are Section */}
                <section style={{ background: '#fff', padding: '100px 24px' }}>
                    <div className="container-app" style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
                        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '40px' }}>
                            Chúng tôi là ai?
                        </h2>

                        <div style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', lineHeight: 1.8, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            <p>
                                English4U không chỉ là một trung tâm đào tạo, mà là một hệ sinh thái học tập tiếng Anh toàn diện được xây dựng bởi đội ngũ chuyên gia sư phạm hàng đầu và các nhà khoa học máy tính tâm huyết. Được thành lập với tầm nhìn tái định nghĩa cách người Việt học tiếng Anh, chúng tôi đã không ngừng nghiên cứu và ứng dụng những tiến bộ mới nhất của trí tuệ nhân tạo (AI) vào giáo dục.
                            </p>
                            <p>
                                Tầm nhìn của chúng tôi là trở thành nền tảng học thuật số một, nơi công nghệ AI không chỉ là công cụ bổ trợ mà còn là "người đồng hành" cá nhân hóa cho từng học viên. Chúng tôi tập trung vào việc tạo ra môi trường học tập tương tác cao, giúp học viên không chỉ giỏi về lý thuyết mà còn tự tin trong giao tiếp thực tế. Sứ mệnh của English4U là xóa bỏ khoảng cách về chất lượng giáo dục giữa các vùng miền, mang cơ hội học tiếng Anh chuẩn quốc tế đến với mọi gia đình Việt Nam.
                            </p>
                        </div>
                    </div>
                </section>

                {/* Core Values Section */}
                <section style={{ padding: '100px 24px', background: '#f8fafc' }}>
                    <div className="container-app" style={{ textAlign: 'center' }}>
                        <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                            Giá trị cốt lõi
                        </h2>
                        <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', marginBottom: '64px' }}>
                            Kim chỉ nam cho mọi hoạt động của chúng tôi
                        </p>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '24px' }}>
                            {/* Card 1 */}
                            <div style={{ background: '#fff', padding: '40px 24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                                <div style={{ width: '48px', height: '48px', margin: '0 auto 20px', background: '#eff6ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#3b82f6' }}>
                                    <Rocket size={24} />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>Sáng tạo đột phá</h3>
                                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>Luôn tiên phong ứng dụng công nghệ AI để tối ưu hóa trải nghiệm học tập.</p>
                            </div>

                            {/* Card 2 */}
                            <div style={{ background: '#fff', padding: '40px 24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                                <div style={{ width: '48px', height: '48px', margin: '0 auto 20px', background: '#ecfdf5', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                                    <Target size={24} />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>Lấy học viên làm gốc</h3>
                                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>Mọi lộ trình học đều được cá nhân hóa dựa trên năng lực và mục tiêu riêng.</p>
                            </div>

                            {/* Card 3 */}
                            <div style={{ background: '#fff', padding: '40px 24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                                <div style={{ width: '48px', height: '48px', margin: '0 auto 20px', background: '#fffbeb', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b' }}>
                                    <ShieldCheck size={24} />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>Minh bạch tuyệt đối</h3>
                                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>Cam kết đầu ra bằng văn bản và hệ thống đánh giá tiến độ rõ ràng.</p>
                            </div>

                            {/* Card 4 */}
                            <div style={{ background: '#fff', padding: '40px 24px', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                                <div style={{ width: '48px', height: '48px', margin: '0 auto 20px', background: '#f3e8ff', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7' }}>
                                    <Star size={24} />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>Chất lượng xuất sắc</h3>
                                <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>Không ngừng cải tiến học liệu và phương pháp giảng dạy đạt chuẩn quốc tế.</p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Team Section */}
                <section style={{ padding: '100px 24px', background: '#fff' }}>
                    <div className="container-app">
                        <div style={{ marginBottom: '64px' }}>
                            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                                Đội ngũ chuyên gia
                            </h2>
                            <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', maxWidth: '400px', lineHeight: 1.6 }}>
                                Những người đứng sau sự thành công của hàng ngàn học viên English4U.
                            </p>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '32px' }}>
                            {/* Member 1 */}
                            <div>
                                <div style={{ background: '#fde68a', borderRadius: '20px', overflow: 'hidden', marginBottom: '20px', height: '320px' }}>
                                    <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=600&auto=format&fit=crop" alt="Dr. Nguyen Anh" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Dr. Nguyen Anh</h3>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '8px' }}>Trưởng bộ môn IELTS - 9.0 Band</div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>Cựu giám khảo chấm thi quốc tế với 15 năm kinh nghiệm giảng dạy.</p>
                            </div>

                            {/* Member 2 */}
                            <div>
                                <div style={{ background: '#fdba74', borderRadius: '20px', overflow: 'hidden', marginBottom: '20px', height: '320px' }}>
                                    <img src="https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=600&auto=format&fit=crop" alt="ThS. Le Hoang" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>ThS. Le Hoang</h3>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '8px' }}>Giám đốc Công nghệ (CTO)</div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>Chuyên gia NLP & AI, tốt nghiệp Đại học Stanford.</p>
                            </div>

                            {/* Member 3 */}
                            <div>
                                <div style={{ background: '#86efac', borderRadius: '20px', overflow: 'hidden', marginBottom: '20px', height: '320px' }}>
                                    <img src="https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=600&auto=format&fit=crop" alt="Ms. Lan Huong" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Ms. Lan Huong</h3>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '8px' }}>Chuyên gia Writing - 8.5 Band</div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>Tác giả của bộ giáo trình "Writing Logic" và nhiều tài liệu tham khảo.</p>
                            </div>

                            {/* Member 4 */}
                            <div>
                                <div style={{ background: '#e2e8f0', borderRadius: '20px', overflow: 'hidden', marginBottom: '20px', height: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                </div>
                                <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Dr. Robert Miller</h3>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-primary)', fontWeight: 600, marginBottom: '8px' }}>Cố vấn Sư phạm Quốc tế</div>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>Chuyên gia ngôn ngữ học ứng dụng từ Đại học Cambridge.</p>
                            </div>
                        </div>
                    </div>
                </section>
            </main>

            <LandingFooter />
        </div>
    )
}
