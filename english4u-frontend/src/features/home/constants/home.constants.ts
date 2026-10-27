export interface HomeSkill {
    id: string;
    icon: string;
    title: string;
    description: string;
    color: string;
    bg: string;
    progress: number;
    tag: string;
    features: string[];
    animated?: boolean;
}

export const HOME_SKILLS: HomeSkill[] = [
    { 
        id: 'listening', 
        icon: '🎧', 
        title: 'Listening', 
        description: 'Luyện đề thi IELTS Listening trọn vẹn với audio liền mạch cho toàn bài thi. Giao diện phòng thi thật giúp nâng cao kỹ năng nghe hiểu và điền từ.', 
        color: '#137dc5', 
        bg: 'rgba(19,125,197,0.08)', 
        progress: 78, 
        tag: 'IELTS Band 7+', 
        features: ['Audio toàn bài liền mạch', 'Giao diện phòng thi thật', 'Chấm điểm tự động ngay'] 
    },
    { 
        id: 'speaking', 
        icon: '🎙️', 
        title: 'Speaking', 
        description: 'Luyện thi IELTS Speaking trực tiếp cùng 3D Avatar Examiner tương tác thời gian thực. Hệ thống AI phân tích giọng nói và chấm điểm theo 4 tiêu chí chuẩn IELTS.', 
        color: '#7c3aed', 
        bg: 'rgba(124,58,237,0.08)', 
        progress: 65, 
        tag: '3D Examiner AI', 
        features: ['3D Avatar tương tác trực quan', 'Chấm 4 tiêu chuẩn IELTS', 'Phân tích lỗi phát âm & ngắt nghỉ'], 
        animated: true 
    },
    { 
        id: 'reading', 
        icon: '📖', 
        title: 'Reading', 
        description: 'Đọc và trả lời câu hỏi trực tiếp trên giao diện split-screen chia đôi màn hình. Dễ dàng điều hướng và quản lý thời gian giữa 3 passage của đề thi.', 
        color: '#0891b2', 
        bg: 'rgba(8,145,178,0.08)', 
        progress: 82, 
        tag: '3 Passages', 
        features: ['Giao diện split-screen tiện lợi', 'Đủ 3 passage chuẩn Academic', 'Chấm điểm và hiển thị đáp án ngay'] 
    },
    { 
        id: 'writing', 
        icon: '✏️', 
        title: 'Writing', 
        description: 'Viết luận và nộp bài để nhận phản hồi chi tiết từ AI Review Copilot. Nhận gợi ý sửa lỗi ngữ pháp, từ vựng và tối ưu cấu trúc bài viết chỉ sau vài giây.', 
        color: '#c2410c', 
        bg: 'rgba(194,65,12,0.08)', 
        progress: 60, 
        tag: 'AI Copilot Review', 
        features: ['Chấm 4 tiêu chí IELTS Writing', 'Sửa lỗi ngữ pháp & từ vựng tức thì', 'Gợi ý cấu trúc bài viết nâng cao'] 
    },
];

export type BillingCycle = 'monthly' | 'yearly';

export interface HomePlan {
    id: string;
    name: string;
    price: { monthly: number; yearly: number };
    description: string;
    features: string[];
    popular?: boolean;
    highlight?: string;
    cta: string;
    color: string;
    gradientFrom: string;
}

export const HOME_PLANS: HomePlan[] = [
    {
        id: 'basic',
        name: 'Free Forever',
        price: { monthly: 0, yearly: 0 },
        description: 'Khám phá kho tàng kiến thức được biên soạn sẵn.',
        features: [
            'Học toàn bộ các khóa học từ Admin (Listening, Speaking, Reading, Writing)',
            'Làm các đề thi thử (Mock Exams) có sẵn trên hệ thống',
            'Học từ vựng qua các bộ Flashcards',
            'Lưu trữ lịch sử và theo dõi tiến độ học tập',
            'Điểm danh nhận quà với Daily Streaks',
        ],
        cta: 'Bắt đầu miễn phí',
        color: '#5a6a7e',
        gradientFrom: 'rgba(90,106,126,0.06)',
    },
    {
        id: 'pro',
        name: 'Pro Learner',
        price: { monthly: 12, yearly: 9 },
        description: 'Cá nhân hóa lộ trình học với sức mạnh AI không giới hạn.',
        features: [
            'Tất cả tính năng của gói Free',
            'AI Exam Generator: Tự tạo đề thi từ tài liệu (PDF/Docx)',
            'Cá nhân hóa Flashcards không giới hạn',
            'AI Speaking & Writing Coach (Chấm điểm & Sửa lỗi)',
            'Phân tích Spaced Repetition cho Flashcards',
            'Hỗ trợ ưu tiên & Không quảng cáo',
        ],
        popular: true,
        highlight: 'Nổi bật nhất',
        cta: 'Đăng ký Pro ngay',
        color: '#137dc5',
        gradientFrom: 'rgba(19,125,197,0.08)',
    },
];

export interface NavLinkItem {
    label: string;
    href: string;
}

export const LANDING_NAV_LINKS: NavLinkItem[] = [
    { label: 'Trang chủ', href: '/' },
    { label: 'Giới thiệu', href: '/about' },
    { label: 'Liên hệ', href: '/contact' },
    { label: 'Chính sách bảo mật', href: '/privacy-policy' },
];

export interface FooterLinkItem {
    label: string;
    href: string;
}

export const LANDING_FOOTER_SECTIONS: Record<string, FooterLinkItem[]> = {
    'Sản phẩm': [
        { label: 'Thi thử IELTS', href: '/app/practice' },
        { label: 'Luyện Nói AI', href: '/app/practice' },
        { label: 'Luyện Viết AI', href: '/app/practice' },
        { label: 'Trang cá nhân', href: '/app/profile' },
    ],
    'Tài nguyên': [
        { label: 'Giới thiệu', href: '/about' },
        { label: 'Liên hệ', href: '/contact' },
        { label: 'Chính sách Bảo mật', href: '/privacy-policy' },
        { label: 'Điều khoản Dịch vụ', href: '/terms-of-service' },
    ],
    'Hệ thống': [
        { label: 'Đăng nhập', href: '/login' },
        { label: 'Đăng ký', href: '/register' },
        { label: 'Quản trị viên (CMS)', href: '/admin/login' },
    ],
};

export interface ContactFaqItem {
    question: string;
    answer: string;
}

export const CONTACT_FAQ_LIST: ContactFaqItem[] = [
    {
        question: 'Hệ thống AI chấm điểm Speaking và Writing hoạt động như thế nào?',
        answer: 'English4U tích hợp hệ thống AI tiên tiến. Đối với Speaking, hệ thống tự động phân tích và chấm điểm giọng nói của bạn theo 4 tiêu chí IELTS (Phát âm, Độ trôi chảy, Từ vựng, Ngữ pháp) dựa trên bản ghi âm câu trả lời. Đối với Writing, hệ thống tích hợp AI Review Copilot cung cấp báo cáo chi tiết và gợi ý sửa lỗi ngữ pháp ngay lập tức.',
    },
    {
        question: 'Kết quả thi thử IELTS trên trình giả lập Exam Simulator có được chấm điểm ngay không?',
        answer: 'Các phần thi trắc nghiệm (Reading và Listening) sẽ được chấm điểm tự động và trả kết quả ngay lập tức khi bạn nhấn "Submit Test". Phần thi Speaking và Writing sẽ được hệ thống AI phân tích và trả kết quả band score chi tiết chỉ sau vài giây.',
    },
    {
        question: 'Tính năng "Sinh đề thi AI" (AI Exam Generator) hoạt động ra sao?',
        answer: 'Bạn có thể tải lên tài liệu học tập cá nhân (PDF, Word) hoặc nhập một chủ đề bất kỳ. Hệ thống sẽ tự động chạy qua AI QA Pipeline để thiết lập đề thi IELTS chuẩn format. Đề thi sau đó được kiểm định qua Validator Agent độc lập để cam kết độ chính xác 100% của đáp án.',
    },
    {
        question: 'Tôi có thể sử dụng English4U miễn phí không?',
        answer: 'Có, tất cả các tính năng trên English4U (luyện thi thử IELTS Academic, giả lập phòng thi, chấm điểm Speaking & Writing) đều được cung cấp hoàn toàn miễn phí mà không giới hạn lượt sử dụng hay yêu cầu trả phí.',
    },
    {
        question: 'Tôi cần làm gì nếu gặp sự cố âm thanh hoặc micro khi thi thử?',
        answer: 'Hãy đảm bảo bạn đã cấp quyền truy cập Microphone cho trình duyệt khi bắt đầu phần thi Speaking và kiểm tra thiết bị phát âm thanh trong phần thi Listening. Chúng tôi khuyến nghị sử dụng Google Chrome để đạt độ ổn định tốt nhất. Nếu cần hỗ trợ thêm, hãy gửi lời nhắn ở biểu mẫu bên dưới.',
    },
];

// Aliases for backwards compatibility
export const SKILLS = HOME_SKILLS;
export const PLANS = HOME_PLANS;
export const NAV_LINKS = LANDING_NAV_LINKS;
export const FOOTER_SECTIONS = LANDING_FOOTER_SECTIONS;
export const FAQ_LIST = CONTACT_FAQ_LIST;

