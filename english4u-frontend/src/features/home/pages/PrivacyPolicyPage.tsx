import { LandingHeader } from '../components/LandingHeader'
import { LandingFooter } from '../components/LandingFooter'
import { ShieldCheck, Lock, Eye, FileText, UserCheck, Mail, Database } from 'lucide-react'

export function PrivacyPolicyPage() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg, #f8fafc)' }}>
            <LandingHeader />

            <main style={{ paddingTop: '120px', paddingBottom: '80px' }}>
                <div className="container-app" style={{ maxWidth: '900px', margin: '0 auto', padding: '0 24px' }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '48px' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(37, 99, 235, 0.08)',
                            color: '#2563eb',
                            padding: '6px 16px',
                            borderRadius: '9999px',
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            marginBottom: '16px'
                        }}>
                            <ShieldCheck size={18} />
                            English4U Privacy & Data Protection
                        </div>
                        <h1 style={{
                            fontFamily: 'var(--font-serif)',
                            fontSize: 'clamp(2rem, 3.5vw, 2.75rem)',
                            fontWeight: 800,
                            color: 'var(--color-text-primary, #0f172a)',
                            marginBottom: '16px',
                            lineHeight: 1.2
                        }}>
                            Chính Sách Quyền Riêng Tư (Privacy Policy)
                        </h1>
                        <p style={{
                            fontSize: '1rem',
                            color: 'var(--color-text-secondary, #64748b)',
                            lineHeight: 1.6
                        }}>
                            Cập nhật lần cuối: Ngày 15 tháng 10 năm 2026 · Nền tảng học và luyện thi IELTS trực tuyến <strong>English4U</strong> (Website: <a href="https://www.english4you.id.vn" style={{ color: '#2563eb' }}>https://www.english4you.id.vn</a>)
                        </p>
                    </div>

                    {/* Content Box */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '24px',
                        padding: '48px',
                        boxShadow: '0 12px 40px rgba(0, 0, 0, 0.04)',
                        border: '1px solid rgba(226, 232, 240, 0.8)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '36px',
                        fontSize: '0.95rem',
                        lineHeight: 1.7,
                        color: '#334155'
                    }}>
                        {/* 1. Giới thiệu */}
                        <section>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FileText size={22} color="#2563eb" />
                                1. Giới thiệu về English4U
                            </h2>
                            <p>
                                Chào mừng bạn đến với <strong>English4U</strong> (thuộc sở hữu và vận hành tại tên miền chính thức <code>https://www.english4you.id.vn</code>). Chúng tôi cam kết bảo vệ quyền riêng tư và thông tin cá nhân của người học khi tham gia luyện thi các kỹ năng Listening, Reading, Writing và Speaking trên hệ thống.
                            </p>
                            <p style={{ marginTop: '8px' }}>
                                Chính sách này mô tả cách <strong>English4U</strong> thu thập, sử dụng, lưu trữ và bảo vệ dữ liệu của bạn, bao gồm cả khi bạn sử dụng tính năng <em>Đăng nhập bằng Google (Google Sign-In / OAuth 2.0)</em>.
                            </p>
                        </section>

                        {/* 2. Dữ liệu chúng tôi thu thập */}
                        <section>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Database size={22} color="#2563eb" />
                                2. Thông tin chúng tôi thu thập
                            </h2>
                            <p>Chúng tôi chỉ thu thập các thông tin tối thiểu cần thiết để phục vụ trải nghiệm học tập của bạn:</p>
                            <ul style={{ paddingLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <li>
                                    <strong>Thông tin đăng nhập Google (OAuth 2.0):</strong> Khi bạn chọn đăng nhập bằng tài khoản Google, chúng tôi chỉ yêu cầu quyền cơ bản (non-sensitive scopes: <code>email</code>, <code>profile</code>, <code>openid</code>). Thông tin nhận được gồm: Họ tên hiển thị (DisplayName), Địa chỉ email và Ảnh đại diện (Avatar). Chúng tôi <strong>không bao giờ</strong> yêu cầu quyền truy cập danh bạ, Google Drive hay bất kỳ dữ liệu nhạy cảm nào khác.
                                </li>
                                <li>
                                    <strong>Thông tin tài khoản đăng ký truyền thống:</strong> Địa chỉ email và mật khẩu được mã hóa một chiều.
                                </li>
                                <li>
                                    <strong>Dữ liệu học tập & làm bài thi:</strong> Kết quả trả lời câu hỏi, bài luận Writing, bản ghi âm Speaking (khi bạn thực hiện bài thi nói), điểm số và lịch sử luyện tập trên hệ thống.
                                </li>
                            </ul>
                        </section>

                        {/* 3. Mục đích sử dụng dữ liệu */}
                        <section>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Eye size={22} color="#2563eb" />
                                3. Mục đích sử dụng thông tin
                            </h2>
                            <p>Dữ liệu người dùng được thu thập duy nhất cho các mục đích sau:</p>
                            <ul style={{ paddingLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <li>Xác thực danh tính và duy trì phiên đăng nhập của học viên vào hệ thống English4U.</li>
                                <li>Lưu trữ tiến độ làm bài, bảng thống kê điểm số IELTS và biểu đồ cải thiện năng lực.</li>
                                <li>Sử dụng AI phân tích và đưa ra phản hồi chấm điểm phát âm, ngữ pháp, độ trôi chảy cho bài làm của bạn.</li>
                                <li>Gửi thông báo về tiến độ học tập hoặc thông báo xác thực tài khoản khi cần thiết.</li>
                            </ul>
                            <div style={{
                                marginTop: '14px',
                                padding: '16px 20px',
                                background: '#f0fdf4',
                                borderLeft: '4px solid #16a34a',
                                borderRadius: '8px',
                                color: '#166534',
                                fontWeight: 500
                            }}>
                                🛡️ <strong>Cam kết:</strong> English4U <strong>không chia sẻ, bán, hoặc cho thuê</strong> thông tin cá nhân của người dùng cho bất kỳ bên thứ ba nào vì mục đích quảng cáo hoặc tiếp thị thương mại.
                            </div>
                        </section>

                        {/* 4. Bảo mật dữ liệu */}
                        <section>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Lock size={22} color="#2563eb" />
                                4. Bảo mật và Lưu trữ dữ liệu
                            </h2>
                            <p>
                                Mọi dữ liệu truyền tải giữa thiết bị của bạn và máy chủ English4U đều được mã hóa bằng giao thức HTTPS/TLS đạt chuẩn bảo mật quốc tế. Mật khẩu được băm (hash) bằng thuật toán mã hóa hiện đại PBKDF2 với muối ngẫu nhiên (salt) an toàn, ngăn chặn hoàn toàn nguy cơ rò rỉ dữ liệu.
                            </p>
                        </section>

                        {/* 5. Quyền của người dùng và Yêu cầu xóa dữ liệu */}
                        <section>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <UserCheck size={22} color="#2563eb" />
                                5. Quyền hạn của người dùng (Data Retention & Deletion)
                            </h2>
                            <p>
                                Học viên luôn có toàn quyền kiểm soát dữ liệu cá nhân của mình trên English4U:
                            </p>
                            <ul style={{ paddingLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <li>Xem và cập nhật thông tin cá nhân trong trang Hồ sơ cá nhân (Profile).</li>
                                <li>
                                    <strong>Quyền yêu cầu xóa tài khoản:</strong> Bạn có quyền yêu cầu xóa vĩnh viễn tài khoản và toàn bộ lịch sử thi cử, kết quả bài thi khỏi hệ thống bất cứ lúc nào. Để yêu cầu xóa dữ liệu, vui lòng gửi email tới <a href="mailto:minhtritamm@gmail.com" style={{ color: '#2563eb', fontWeight: 600 }}>minhtritamm@gmail.com</a>. Chúng tôi sẽ xử lý và hủy dữ liệu trong vòng 24 - 48 giờ làm việc.
                                </li>
                            </ul>
                        </section>

                        {/* 6. Liên hệ */}
                        <section style={{ borderTop: '1px solid #e2e8f0', paddingTop: '28px' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Mail size={22} color="#2563eb" />
                                6. Thông tin liên hệ
                            </h2>
                            <p>
                                Nếu bạn có bất kỳ thắc mắc, phản hồi hay câu hỏi nào liên quan đến Chính sách Quyền riêng tư của <strong>English4U</strong>, xin vui lòng liên hệ với ban quản trị:
                            </p>
                            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div><strong>Nền tảng:</strong> English4U — Luyện thi IELTS thông minh</div>
                                <div><strong>Tên miền trang web:</strong> <a href="https://www.english4you.id.vn" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>https://www.english4you.id.vn</a></div>
                                <div><strong>Email hỗ trợ / Quản trị viên:</strong> <a href="mailto:minhtritamm@gmail.com" style={{ color: '#2563eb' }}>minhtritamm@gmail.com</a></div>
                                <div><strong>Địa chỉ:</strong> 10/80c Song Hành Xa Lộ Hà Nội, Phường Tân Phú, TP. Thủ Đức, TP. Hồ Chí Minh, Việt Nam</div>
                            </div>
                        </section>
                    </div>
                </div>
            </main>

            <LandingFooter />
        </div>
    )
}
