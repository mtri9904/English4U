import { LandingHeader } from '../components/LandingHeader'
import { LandingFooter } from '../components/LandingFooter'
import { MapPin, Phone, Mail, Send } from 'lucide-react'

const FAQ_LIST = [
    {
        question: 'Làm thế nào để đăng ký kiểm tra trình độ đầu vào?',
        answer: 'Bạn có thể thực hiện bài kiểm tra đầu vào trực tuyến ngay trên nền tảng của chúng tôi thông qua mục "Kiểm tra trình độ". Bài thi bao gồm 4 kỹ năng được mô phỏng theo chuẩn IELTS thực tế và có kết quả ngay sau khi hoàn thành đối với các phần trắc nghiệm. Kết quả Speaking/Writing sẽ được giáo viên chấm và gửi lại trong vòng 24 giờ.'
    },
    {
        question: 'Hệ thống AI chấm Speaking hoạt động chính xác đến mức nào?',
        answer: 'Công nghệ AI của English4U sử dụng mô hình Deep Learning được huấn luyện trên hàng triệu mẫu giọng nói của các thí sinh đạt điểm cao. Độ chính xác tương đương 95% so với giám khảo thật về các tiêu chí: Phát âm (Pronunciation), Độ lưu loát (Fluency) và Từ vựng (Vocabulary). Đây là công cụ đắc lực để luyện tập hàng ngày trước khi thi thật.'
    },
    {
        question: 'Tôi có thể thanh toán học phí qua những hình thức nào?',
        answer: 'English4U hỗ trợ đa dạng các hình thức thanh toán bảo mật: Chuyển khoản ngân hàng trực tiếp, Thanh toán qua thẻ tín dụng/ghi nợ quốc tế (Visa/Mastercard), Ví điện tử (Momo, VNPay) và đặc biệt là chương trình trả góp học phí lãi suất 0% thông qua các ngân hàng đối tác liên kết.'
    },
    {
        question: 'Lỗi không nghe được âm thanh trong phần thi Mock Test phải xử lý thế nào?',
        answer: 'Đầu tiên, hãy kiểm tra quyền truy cập microphone/audio trên trình duyệt web. Chúng tôi khuyên dùng Google Chrome phiên bản mới nhất để có trải nghiệm tốt nhất. Nếu vẫn gặp sự cố, bạn hãy xóa cache trình duyệt hoặc liên hệ ngay hotline hỗ trợ kỹ thuật 1900 6789 để kỹ thuật viên hỗ trợ điều khiển từ xa qua UltraView/AnyDesk.'
    },
    {
        question: 'Lộ trình học cá nhân hóa được xây dựng như thế nào?',
        answer: 'Dựa trên kết quả bài test đầu vào và mục tiêu điểm số (Target Band) của bạn, thuật toán thông minh sẽ tự động phân tích các điểm yếu (ví dụ: yếu phần Matching Headings trong Reading). Hệ thống sẽ ưu tiên đề xuất các bài học và bài tập chuyên sâu vào phần đó, giúp bạn tối ưu thời gian học tập và đạt mục tiêu nhanh nhất.'
    },
]

export function ContactPage() {
    return (
        <div style={{ minHeight: '100vh', background: 'var(--color-bg)', fontFamily: 'var(--font-sans)' }}>
            <LandingHeader />

            <main style={{ paddingTop: '120px', paddingBottom: '80px' }}>
                <div className="container-app">
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: '64px' }}>
                        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '2.5rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
                            Liên hệ với chúng tôi
                        </h1>
                        <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)', maxWidth: '600px', margin: '0 auto', lineHeight: 1.6 }}>
                            Chúng tôi luôn sẵn sàng lắng nghe và hỗ trợ bạn trên con đường chinh phục tiếng Anh. Hãy để lại lời nhắn hoặc liên hệ trực tiếp với đội ngũ chuyên gia.
                        </p>
                    </div>

                    {/* Contact Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 1fr) 1.5fr', gap: '32px', marginBottom: '100px', alignItems: 'flex-start' }}>

                        {/* Info Section */}
                        <div style={{ background: '#fff', borderRadius: '24px', padding: '40px', display: 'flex', flexDirection: 'column', gap: '24px', boxShadow: '0 12px 40px rgba(0,0,0,0.04)' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)' }}>Thông tin liên hệ</h2>

                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#137dc5', flexShrink: 0 }}>
                                    <MapPin size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Trụ sở chính</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                        10/80c Song Hành Xa Lộ Hà Nội, Phường Tân Phú, Thủ Đức, Thành phố Hồ Chí Minh, Việt Nam
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#137dc5', flexShrink: 0 }}>
                                    <Phone size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Hotline hỗ trợ</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                        1900 6789 (Hỗ trợ 24/7)<br />
                                        028 7300 1234 (Phòng đào tạo)
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                                <div style={{ width: '40px', height: '40px', background: '#eff6ff', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#137dc5', flexShrink: 0 }}>
                                    <Mail size={20} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '4px' }}>Email chuyên môn</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                        support@english4u.edu.vn<br />
                                        academic@english4u.edu.vn
                                    </div>
                                </div>
                            </div>

                            {/* Map */}
                            <div style={{ marginTop: '8px', borderRadius: '16px', overflow: 'hidden', height: '220px', background: '#e2e8f0', position: 'relative' }}>
                                <iframe
                                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3918.427671239648!2d106.7828032!3d10.8550426!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3175276edaf178dd%3A0xe54c1fc9943fcfd4!2zMTAvODBjIFNvbmcgSMOgbmggeGEgbOG7mSBIw6AgTuG7mWksIFBoxrDhu51uZyBUw6JuIFBow7osIFRo4bunIMSQ4bupYywgVGjDoG5oIHBo4buRIEjhu5MgQ2jDrSBNaW5oLCBWaeG7h3QgTmFt!5e0!3m2!1svi!2s!4v1700000000000!5m2!1svi!2s"
                                    width="100%"
                                    height="100%"
                                    style={{ border: 0 }}
                                    allowFullScreen={true}
                                    loading="lazy"
                                    referrerPolicy="no-referrer-when-downgrade"
                                ></iframe>
                            </div>
                        </div>

                        {/* Form Section */}
                        <div style={{ background: '#fff', borderRadius: '24px', padding: '40px', boxShadow: '0 12px 40px rgba(0,0,0,0.04)' }}>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '24px' }}>Gửi lời nhắn cho chúng tôi</h2>

                            <form onSubmit={(e) => e.preventDefault()} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Họ và tên</label>
                                        <input type="text" placeholder="Nguyễn Văn A" style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s', fontFamily: 'var(--font-sans)' }} onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--color-border)'} />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Số điện thoại</label>
                                        <input type="tel" placeholder="090 123 4567" style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s', fontFamily: 'var(--font-sans)' }} onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--color-border)'} />
                                    </div>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Email</label>
                                    <input type="email" placeholder="example@gmail.com" style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s', fontFamily: 'var(--font-sans)' }} onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--color-border)'} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '8px' }}>Nội dung tin nhắn</label>
                                    <textarea placeholder="Vui lòng nhập nội dung chi tiết..." rows={5} style={{ width: '100%', padding: '12px 16px', border: '1px solid var(--color-border)', borderRadius: '10px', fontSize: '0.9375rem', outline: 'none', transition: 'border 0.2s', resize: 'vertical', fontFamily: 'var(--font-sans)' }} onFocus={e => e.target.style.borderColor = 'var(--color-primary)'} onBlur={e => e.target.style.borderColor = 'var(--color-border)'}></textarea>
                                </div>
                                <button type="submit" style={{ width: '100%', padding: '14px', background: '#3b82f6', color: '#fff', fontWeight: 600, fontSize: '1rem', borderRadius: '10px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', transition: 'all 0.2s', marginTop: '8px', fontFamily: 'var(--font-sans)' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#2563eb'}
                                    onMouseLeave={e => e.currentTarget.style.background = '#3b82f6'}
                                >
                                    Gửi thông tin <Send size={18} />
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* FAQ Section */}
                    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                            <h2 style={{ fontFamily: 'var(--font-serif)', fontSize: '2rem', fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: '12px' }}>
                                Câu hỏi thường gặp
                            </h2>
                            <p style={{ fontSize: '1.0625rem', color: 'var(--color-text-secondary)' }}>
                                Giải đáp nhanh các thắc mắc phổ biến về học tập và kỹ thuật.
                            </p>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {FAQ_LIST.map((faq, idx) => (
                                <div key={idx} style={{ background: '#fff', padding: '24px 32px', borderRadius: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.02)' }}>
                                    <h3 style={{ fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '12px' }}>{faq.question}</h3>
                                    <p style={{ fontSize: '0.9375rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>{faq.answer}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </main>

            <LandingFooter />
        </div>
    )
}
