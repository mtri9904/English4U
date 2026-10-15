import { LandingHeader } from '../components/LandingHeader'
import { LandingFooter } from '../components/LandingFooter'
import { ShieldCheck, Lock, Eye, FileText, UserCheck, Mail, Database, CheckCircle2, Globe, Server, AlertCircle } from 'lucide-react'

export function PrivacyPolicyPage() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg, #f8fafc)', color: '#1e293b' }}>
            <LandingHeader />

            <main style={{ paddingTop: '120px', paddingBottom: '90px' }}>
                <div className="container-app" style={{ maxWidth: '960px', margin: '0 auto', padding: '0 24px' }}>
                    {/* Header Banner */}
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
                            <ShieldCheck size={20} />
                            English4U Official Privacy Policy & Data Protection
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
                            Chính Sách Quyền Riêng Tư (Privacy Policy)
                        </h1>
                        <p style={{
                            fontSize: '1.05rem',
                            color: '#64748b',
                            lineHeight: 1.6,
                            maxWidth: '750px',
                            margin: '0 auto'
                        }}>
                            Nền tảng luyện thi IELTS thông minh <strong>English4U</strong> (Website: <a href="https://www.english4you.id.vn" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>https://www.english4you.id.vn</a>).<br />
                            <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Phiên bản có hiệu lực: Ngày 15 tháng 10 năm 2026 · Áp dụng cho mọi người dùng và học viên</span>
                        </p>
                    </div>

                    {/* Policy Content Container */}
                    <div style={{
                        background: '#ffffff',
                        borderRadius: '24px',
                        padding: 'clamp(24px, 5vw, 56px)',
                        boxShadow: '0 20px 45px rgba(15, 23, 42, 0.05)',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '40px',
                        fontSize: '1rem',
                        lineHeight: 1.8,
                        color: '#334155'
                    }}>
                        {/* Summary Box for Google Verification Reviewers */}
                        <div style={{
                            background: '#f8fafc',
                            border: '1px solid #cbd5e1',
                            borderLeft: '5px solid #2563eb',
                            borderRadius: '12px',
                            padding: '24px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1e3a8a', fontWeight: 700, fontSize: '1.1rem' }}>
                                <Globe size={20} color="#2563eb" />
                                Quick Summary for Users & Google OAuth Reviewers (Tóm tắt nhanh)
                            </div>
                            <p style={{ margin: 0, fontSize: '0.95rem', color: '#334155' }}>
                                <strong>English4U</strong> is an online IELTS exam preparation platform dedicated to transparent data privacy.
                                We only collect essential account and exam data to deliver personalized practice tests and AI scoring feedback.
                                We <strong>DO NOT</strong> sell, rent, or share user data or Google user data with any third parties or advertisers.
                                Users can permanently delete their data anytime by emailing <a href="mailto:minhtritamm@gmail.com" style={{ color: '#2563eb', fontWeight: 600 }}>minhtritamm@gmail.com</a>.
                            </p>
                        </div>

                        {/* Section 1: Introduction */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <FileText size={24} color="#2563eb" />
                                1. Giới thiệu và Phạm vi áp dụng (Introduction & Scope)
                            </h2>
                            <p>
                                Chào mừng bạn đến với nền tảng <strong>English4U</strong> (truy cập tại: <a href="https://www.english4you.id.vn" target="_blank" rel="noreferrer" style={{ color: '#2563eb' }}>https://www.english4you.id.vn</a>).
                                English4U cung cấp môi trường luyện thi trực tuyến chuyên sâu cho 4 kỹ năng IELTS (Listening, Reading, Writing, Speaking) kết hợp công nghệ AI hỗ trợ phản hồi và chấm điểm.
                            </p>
                            <p style={{ marginTop: '10px' }}>
                                Chúng tôi tôn trọng tuyệt đối quyền riêng tư của bạn. Chính sách này quy định chi tiết cách English4U thu thập, xử lý, lưu trữ, bảo mật và hủy dữ liệu khi bạn sử dụng dịch vụ của chúng tôi, bao gồm cả khi bạn sử dụng phương thức <strong>Đăng nhập bằng Google (Google Sign-In)</strong>.
                            </p>
                        </section>

                        {/* Section 2: Data Collection */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Database size={24} color="#2563eb" />
                                2. Dữ liệu chúng tôi thu thập (Information We Collect)
                            </h2>
                            <p>
                                English4U chỉ thu thập các dữ liệu cần thiết phục vụ trực tiếp cho hoạt động học tập và quản lý tài khoản của bạn:
                            </p>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginTop: '16px' }}>
                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', background: '#f8fafc' }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={18} color="#16a34a" />
                                        Thông tin Google OAuth 2.0
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
                                        Khi bạn đăng nhập bằng Google, chúng tôi chỉ yêu cầu các quyền truy cập cơ bản (Non-sensitive scopes: <code>email</code>, <code>profile</code>, <code>openid</code>):
                                    </p>
                                    <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.875rem', color: '#475569' }}>
                                        <li>Địa chỉ Email xác thực</li>
                                        <li>Tên hiển thị (Display Name)</li>
                                        <li>Ảnh đại diện công khai (Avatar URL)</li>
                                    </ul>
                                </div>

                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', background: '#f8fafc' }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={18} color="#16a34a" />
                                        Thông tin tài khoản đăng ký
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
                                        Trường hợp bạn đăng ký trực tiếp:
                                    </p>
                                    <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.875rem', color: '#475569' }}>
                                        <li>Họ và tên</li>
                                        <li>Địa chỉ email</li>
                                        <li>Mật khẩu (đã băm mã hóa một chiều an toàn)</li>
                                    </ul>
                                </div>

                                <div style={{ border: '1px solid #e2e8f0', borderRadius: '12px', padding: '18px', background: '#f8fafc' }}>
                                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <CheckCircle2 size={18} color="#16a34a" />
                                        Dữ liệu học tập & Làm bài thi
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>
                                        Để tính điểm và lưu lại lịch sử học tập:
                                    </p>
                                    <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '0.875rem', color: '#475569' }}>
                                        <li>Đáp án bài làm trắc nghiệm Listening & Reading</li>
                                        <li>Bài luận viết (Writing essays) do bạn nhập</li>
                                        <li>Bản ghi âm giọng nói bài thi Speaking</li>
                                        <li>Điểm số bài thi, lịch sử luyện tập, thời gian làm bài</li>
                                    </ul>
                                </div>
                            </div>
                        </section>

                        {/* Section 3: Purpose of Collection */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Eye size={24} color="#2563eb" />
                                3. Mục đích sử dụng dữ liệu (How We Use Your Information)
                            </h2>
                            <p>Chúng tôi sử dụng thông tin thu thập được cho các mục đích hợp pháp sau đây:</p>
                            <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <li>
                                    <strong>Xác thực tài khoản và Quản trị phiên học:</strong> Nhận diện người dùng, duy trì phiên đăng nhập bảo mật và bảo vệ tài khoản khỏi truy cập trái phép.
                                </li>
                                <li>
                                    <strong>Cung cấp dịch vụ thi thử & Chấm điểm:</strong> Xử lý bài thi, đối chiếu đáp án, tính toán Band Score IELTS và lưu lại lịch sử làm bài để học viên theo dõi tiến trình.
                                </li>
                                <li>
                                    <strong>Hỗ trợ phản hồi AI (AI-Assisted Scoring):</strong> Sử dụng mô hình Google Gemini để nhận diện phát âm phần thi Speaking, phân tích ngữ pháp, từ vựng và chấm điểm bài Writing với phản hồi chi tiết.
                                </li>
                                <li>
                                    <strong>Cá nhân hóa lộ trình học:</strong> Phân tích điểm mạnh, điểm yếu theo từng dạng câu hỏi nhằm gợi ý bài luyện tập phù hợp.
                                </li>
                                <li>
                                    <strong>Liên hệ & Hỗ trợ kỹ thuật:</strong> Gửi thông báo xác nhận email, khôi phục mật khẩu hoặc phản hồi các yêu cầu trợ giúp từ người dùng.
                                </li>
                            </ul>

                            {/* Google Limited Use Compliance Notice */}
                            <div style={{
                                marginTop: '18px',
                                padding: '18px 20px',
                                background: '#eff6ff',
                                borderLeft: '5px solid #2563eb',
                                borderRadius: '8px',
                                color: '#1e40af',
                                fontSize: '0.925rem'
                            }}>
                                📌 <strong>Tuân thủ chính sách dữ liệu người dùng Google (Google API Services User Data Policy):</strong><br />
                                Việc English4U sử dụng và chuyển tiếp thông tin nhận được từ các API của Google đến bất kỳ ứng dụng nào khác sẽ tuân thủ đầy đủ <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" style={{ color: '#1d4ed8', textDecoration: 'underline' }}>Chính Sách Dữ Liệu Người Dùng Dịch Vụ API của Google</a>, bao gồm các yêu cầu về <em>Sử dụng có giới hạn (Limited Use requirements)</em>.
                            </div>
                        </section>

                        {/* Section 4: Data Storage & Security */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Lock size={24} color="#2563eb" />
                                4. Lưu trữ và Bảo vệ dữ liệu (Data Storage, Security & Retention)
                            </h2>
                            <p>English4U áp dụng các biện pháp kỹ thuật và tổ chức nghiêm ngặt nhằm bảo vệ thông tin người dùng:</p>
                            <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <li>
                                    <strong>Mã hóa đường truyền (HTTPS/TLS):</strong> Toàn bộ dữ liệu truyền tải giữa trình duyệt của người dùng và hệ thống máy chủ được mã hóa bằng giao thức HTTPS/TLS 1.3 với chứng chỉ SSL chuẩn cao cấp.
                                </li>
                                <li>
                                    <strong>Bảo vệ mật khẩu:</strong> Mật khẩu tài khoản nội bộ được băm một chiều (hash) bằng thuật toán PBKDF2 với muối ngẫu nhiên (salt) an toàn, không thể dịch ngược.
                                </li>
                                <li>
                                    <strong>Xác thực bảo mật qua Token JWT:</strong> Phiên đăng nhập được quản lý bằng JSON Web Token (JWT) có thời hạn xác thực giới hạn, ngăn chặn nguy cơ giả mạo phiên.
                                </li>
                                <li>
                                    <strong>Hạ tầng lưu trữ chuẩn quốc tế:</strong> Cơ sở dữ liệu và file đa phương tiện bài thi được lưu trữ trên hệ thống máy chủ điện toán đám mây bảo mật cao, có tường lửa và phân quyền truy cập nghiêm ngặt.
                                </li>
                                <li>
                                    <strong>Thời hạn lưu trữ (Data Retention):</strong> Dữ liệu người dùng và lịch sử thi được lưu trữ trong suốt thời gian tài khoản hoạt động. Nếu người dùng yêu cầu xóa tài khoản, toàn bộ dữ liệu sẽ được xóa vĩnh viễn khỏi hệ thống trong vòng 24 - 48 giờ.
                                </li>
                            </ul>
                        </section>

                        {/* Section 5: Third-party Sharing */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Server size={24} color="#2563eb" />
                                5. Chia sẻ dữ liệu với bên thứ ba (Third-Party Disclosure)
                            </h2>
                            <div style={{
                                padding: '16px 20px',
                                background: '#f0fdf4',
                                borderLeft: '5px solid #16a34a',
                                borderRadius: '8px',
                                color: '#166534',
                                fontWeight: 600,
                                marginBottom: '16px'
                            }}>
                                🛡️ CAM KẾT VỮNG CHẮC: English4U KHÔNG bán, KHÔNG cho thuê, KHÔNG trao đổi và KHÔNG chia sẻ thông tin cá nhân của người dùng hay thông tin tài khoản Google với bất kỳ bên thứ ba, nhà quảng cáo hoặc tổ chức tiếp thị nào vì mục đích thương mại.
                            </div>
                            <p>Chúng tôi chỉ tương tác kỹ thuật với các đối tác cung cấp dịch vụ hạ tầng cần thiết sau:</p>
                            <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <li>
                                    <strong>Google Identity Platform (Google OAuth 2.0):</strong> Phục vụ xác thực đăng nhập người dùng an toàn.
                                </li>
                                <li>
                                    <strong>Google Gemini API:</strong> Phục vụ phân tích văn bản bài viết và phản hồi phát âm bài nói thi thử IELTS. Dữ liệu gửi sang API chỉ là nội dung câu hỏi và câu trả lời bài thi, hoàn toàn không kèm theo thông tin định danh cá nhân người dùng và không được dùng để huấn luyện mô hình công cộng.
                                </li>
                                <li>
                                    <strong>Cơ quan pháp luật có thẩm quyền:</strong> Chỉ tiết lộ khi có yêu cầu bằng văn bản hợp pháp theo quy định của pháp luật hiện hành.
                                </li>
                            </ul>
                        </section>

                        {/* Section 6: User Rights & Data Deletion */}
                        <section>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <UserCheck size={24} color="#2563eb" />
                                6. Quyền của người dùng & Hướng dẫn yêu cầu xóa dữ liệu (User Rights & Data Deletion)
                            </h2>
                            <p>Người học luôn có toàn quyền kiểm soát tuyệt đối đối với dữ liệu của mình tại English4U:</p>
                            <ul style={{ paddingLeft: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <li><strong>Quyền truy cập & Xem thông tin:</strong> Xem toàn bộ thông tin tài khoản và lịch sử bài thi trong trang cá nhân (Profile).</li>
                                <li><strong>Quyền chỉnh sửa:</strong> Cập nhật hoặc điều chỉnh thông tin cá nhân bất cứ lúc nào.</li>
                                <li><strong>Quyền hủy liên kết tài khoản Google:</strong> Bạn có thể thu hồi quyền truy cập của English4U bất kỳ lúc nào tại <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer" style={{ color: '#2563eb', textDecoration: 'underline' }}>Trang Quản lý quyền tài khoản Google của bạn</a>.</li>
                                <li>
                                    <strong>Quyền yêu cầu xóa toàn bộ dữ liệu (Permanent Data Deletion):</strong> Bạn có quyền yêu cầu xóa vĩnh viễn tài khoản, thông tin cá nhân và toàn bộ lịch sử thi cử khỏi hệ thống English4U.
                                </li>
                            </ul>

                            {/* Data Deletion Step by Step Box */}
                            <div style={{
                                marginTop: '16px',
                                border: '1px solid #cbd5e1',
                                borderRadius: '12px',
                                padding: '20px',
                                background: '#f8fafc'
                            }}>
                                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <AlertCircle size={20} color="#2563eb" />
                                    Quy trình gửi yêu cầu xóa dữ liệu (How to request data deletion):
                                </div>
                                <ol style={{ paddingLeft: '20px', margin: 0, display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.95rem' }}>
                                    <li>Gửi một email từ địa chỉ email bạn đã dùng để đăng ký tài khoản đến: <a href="mailto:minhtritamm@gmail.com" style={{ color: '#2563eb', fontWeight: 600 }}>minhtritamm@gmail.com</a>.</li>
                                    <li>Tiêu đề email: <code>[English4U] Yêu cầu xóa dữ liệu tài khoản / Request Account Deletion</code>.</li>
                                    <li>Nội dung email nêu rõ: Họ tên và Địa chỉ email liên kết với tài khoản cần xóa.</li>
                                    <li>Đội ngũ quản trị viên English4U sẽ xác minh và tiến hành xóa toàn bộ dữ liệu người dùng, kết quả bài thi, bản ghi âm trong vòng <strong>24 đến 48 giờ làm việc</strong>, đồng thời gửi email thông báo xác nhận hoàn tất.</li>
                                </ol>
                            </div>
                        </section>

                        {/* Section 7: Contact Information */}
                        <section style={{ borderTop: '1px solid #e2e8f0', paddingTop: '32px' }}>
                            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Mail size={24} color="#2563eb" />
                                7. Thông tin liên hệ chính thức (Contact Information)
                            </h2>
                            <p>
                                Mọi câu hỏi, thắc mắc hoặc đề nghị liên quan đến Chính sách Quyền riêng tư này xin vui lòng gửi về cho chúng tôi theo các kênh chính thức sau:
                            </p>
                            <div style={{
                                marginTop: '16px',
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '20px 24px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '10px',
                                fontSize: '0.95rem'
                            }}>
                                <div><strong>Tên ứng dụng / Nền tảng:</strong> English4U — Nền tảng luyện thi IELTS thông minh</div>
                                <div><strong>Trang web chính thức:</strong> <a href="https://www.english4you.id.vn" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>https://www.english4you.id.vn</a></div>
                                <div><strong>Trang Chính sách Bảo mật trực tuyến:</strong> <a href="https://www.english4you.id.vn/privacy-policy" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>https://www.english4you.id.vn/privacy-policy</a></div>
                                <div><strong>Email hỗ trợ người dùng & Xác thực quyền riêng tư:</strong> <a href="mailto:minhtritamm@gmail.com" style={{ color: '#2563eb', fontWeight: 600 }}>minhtritamm@gmail.com</a></div>
                                <div><strong>Chủ sở hữu & Vận hành:</strong> Ban Quản Trị English4U</div>
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
