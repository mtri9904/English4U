import { LandingHeader } from '../components/LandingHeader'
import { LandingFooter } from '../components/LandingFooter'
import { FileCheck, ShieldAlert, Award, UserCheck, HelpCircle, Scale } from 'lucide-react'

export function TermsOfServicePage() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg, #f8fafc)', color: '#1e293b' }}>
            <LandingHeader />

            <main style={{ paddingTop: '120px', paddingBottom: '90px' }}>
                <div className="container-app" style={{ maxWidth: '960px', margin: '0 auto', padding: '0 24px' }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            background: 'rgba(37, 99, 235, 0.1)',
                            color: '#2563eb',
                            padding: '8px 20px',
                            borderRadius: '9999px',
                            fontWeight: 700,
                            fontSize: '0.875rem',
                            marginBottom: '16px',
                            border: '1px solid rgba(37, 99, 235, 0.2)'
                        }}>
                            <Scale size={20} />
                            English4U Terms of Service & User Agreement
                        </div>
                        <h1 style={{
                            fontFamily: 'var(--font-serif, serif)',
                            fontSize: 'clamp(2.2rem, 4vw, 3rem)',
                            fontWeight: 800,
                            color: '#0f172a',
                            marginBottom: '16px',
                            lineHeight: 1.25,
                            letterSpacing: '-0.02em'
                        }}>
                            Điều Khoản Dịch Vụ (Terms of Service)
                        </h1>
                        <p style={{
                            fontSize: '1.05rem',
                            color: '#64748b',
                            lineHeight: 1.6,
                            maxWidth: '750px',
                            margin: '0 auto'
                        }}>
                            Quy định sử dụng dịch vụ trên nền tảng luyện thi IELTS thông minh <strong>English4U</strong> (Website: <a href="https://www.english4you.id.vn" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>https://www.english4you.id.vn</a>).<br />
                            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Phiên bản áp dụng: Ngày 15 tháng 10 năm 2026</span>
                        </p>
                    </div>

                    {/* Content Box */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '24px',
                        padding: 'clamp(24px, 5vw, 56px)',
                        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.05)',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '36px',
                        fontSize: '1rem',
                        lineHeight: 1.8,
                        color: '#334155'
                    }}>
                        {/* 1. Chấp thuận điều khoản */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FileCheck size={22} color="#2563eb" />
                                1. Chấp thuận các điều khoản (Acceptance of Terms)
                            </h2>
                            <p>
                                Bằng việc truy cập, đăng ký tài khoản hoặc sử dụng bất kỳ tính năng nào trên nền tảng <strong>English4U</strong> (bao gồm cả hình thức đăng nhập bằng tài khoản Google hoặc tài khoản thông thường), bạn đồng ý tuân thủ toàn bộ các Điều khoản Dịch vụ này cùng với <a href="/privacy-policy" style={{ color: '#2563eb', textDecoration: 'underline' }}>Chính sách Quyền riêng tư (Privacy Policy)</a> của chúng tôi.
                            </p>
                            <p style={{ marginTop: '8px' }}>
                                Nếu bạn không đồng ý với bất kỳ phần nào của điều khoản, vui lòng ngừng sử dụng dịch vụ của English4U.
                            </p>
                        </section>

                        {/* 2. Dịch vụ cung cấp */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Award size={22} color="#2563eb" />
                                2. Mô tả dịch vụ (Service Description)
                            </h2>
                            <p>English4U cung cấp hệ sinh thái học tập và luyện thi IELTS trực tuyến bao gồm:</p>
                            <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <li>Kho đề thi thử IELTS 4 kỹ năng (Listening, Reading, Writing, Speaking) chuẩn format đề thi thực tế.</li>
                                <li>Hệ thống chấm điểm tự động và tính toán IELTS Band Score cho từng bài làm.</li>
                                <li>Công nghệ AI hỗ trợ phản hồi phát âm, chấm bài luận Writing và phân tích lỗi ngữ pháp.</li>
                                <li>Bảng thống kê và theo dõi tiến độ luyện tập cá nhân hóa.</li>
                            </ul>
                        </section>

                        {/* 3. Tài khoản và Bảo mật */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <UserCheck size={22} color="#2563eb" />
                                3. Đăng ký tài khoản và Trách nhiệm người dùng (Account & Responsibilities)
                            </h2>
                            <p>
                                Khi đăng ký tài khoản tại English4U (qua Google Sign-In hoặc Email):
                            </p>
                            <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <li>Bạn cam kết cung cấp thông tin chính xác, trung thực và cập nhật khi được yêu cầu.</li>
                                <li>Bạn có trách nhiệm tự bảo mật thông tin tài khoản và mật khẩu của mình. Bạn hoàn toàn chịu trách nhiệm về mọi hoạt động diễn ra dưới tài khoản của mình.</li>
                                <li>Bạn không được phép chia sẻ tài khoản cho người khác sử dụng chung hoặc bán lại tài khoản cho bên thứ ba.</li>
                                <li>Nghiêm cấm các hành vi gian lận, phá hoại hạ tầng mạng, phát tán mã độc hoặc can thiệp trái phép vào hệ thống của English4U.</li>
                            </ul>
                        </section>

                        {/* 4. Quyền sở hữu trí tuệ */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <ShieldAlert size={22} color="#2563eb" />
                                4. Quyền sở hữu trí tuệ (Intellectual Property)
                            </h2>
                            <p>
                                Toàn bộ giao diện, thiết kế, mã nguồn, tài liệu hướng dẫn và nội dung đề thi thuộc quyền sở hữu của English4U hoặc các đối tác cấp phép. Người dùng chỉ được cấp quyền sử dụng cho mục đích học tập cá nhân phi thương mại. Nghiêm cấm sao chép, trích xuất dữ liệu tự động (scraping) hoặc phân phối lại nội dung khi chưa có sự cho phép bằng văn bản từ English4U.
                            </p>
                        </section>

                        {/* 5. Chấm dứt sử dụng & Xóa tài khoản */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Scale size={22} color="#2563eb" />
                                5. Chấm dứt dịch vụ & Quyền xóa tài khoản (Termination & Deletion)
                            </h2>
                            <p>
                                Bạn có quyền dừng sử dụng dịch vụ và yêu cầu xóa vĩnh viễn tài khoản cũng như dữ liệu cá nhân bất kỳ lúc nào theo hướng dẫn tại <a href="/privacy-policy" style={{ color: '#2563eb', textDecoration: 'underline' }}>Chính sách Quyền riêng tư</a> bằng cách gửi email tới: <a href="mailto:minhtritamm@gmail.com" style={{ color: '#2563eb', fontWeight: 600 }}>minhtritamm@gmail.com</a>.
                            </p>
                            <p style={{ marginTop: '8px' }}>
                                English4U bảo lưu quyền tạm khóa hoặc chấm dứt vĩnh viễn tài khoản của người dùng nếu phát hiện vi phạm nghiêm trọng các điều khoản sử dụng hoặc có hành vi gây ảnh hưởng đến an ninh hệ thống.
                            </p>
                        </section>

                        {/* 6. Thông tin liên hệ */}
                        <section style={{ borderTop: '1px solid #e2e8f0', paddingTop: '28px' }}>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <HelpCircle size={22} color="#2563eb" />
                                6. Thông tin liên hệ hỗ trợ (Contact)
                            </h2>
                            <p>Nếu bạn có bất kỳ câu hỏi hoặc thắc mắc nào liên quan đến Điều khoản Dịch vụ của English4U, xin vui lòng liên hệ:</p>
                            <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.95rem' }}>
                                <div><strong>Nền tảng:</strong> English4U — Nền tảng luyện thi IELTS thông minh</div>
                                <div><strong>Trang web:</strong> <a href="https://www.english4you.id.vn" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>https://www.english4you.id.vn</a></div>
                                <div><strong>Email hỗ trợ:</strong> <a href="mailto:minhtritamm@gmail.com" style={{ color: '#2563eb', fontWeight: 600 }}>minhtritamm@gmail.com</a></div>
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
