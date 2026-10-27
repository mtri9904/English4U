export type DemoState = 'idle' | 'checking' | 'scored' | 'corrected';

export interface ChatMessage {
    sender: 'user' | 'tutor';
    text: string;
}

export const INITIAL_ESSAY = `Learning English is very important because it helps you to get a good job. However, some people think it is too hard. Actually, I am gonna start studying every day, but sometimes my brother he do not agree with me because he thinks it takes too much time.`;

export const CORRECTED_ESSAY = `Learning English is highly essential because it enables you to secure a promising career. However, some individuals believe it is excessively challenging. Actually, I am going to start studying daily, but sometimes my brother does not agree with me because he thinks it requires too much time.`;

export const ANALYSIS_LOGS = [
    '🔍 Đang phân tích cấu trúc cú pháp & ngữ nghĩa...',
    '📊 Đối chiếu với 4 tiêu chí chấm điểm IELTS Academic (TA, CC, LR, GRA)...',
    '🤖 Đang tạo phản hồi & chuẩn hóa bài viết chuẩn Band 8.0+...',
    '✨ Hoàn thành phân tích chất lượng bài viết!',
];

export const INITIAL_TUTOR_MESSAGE: ChatMessage = {
    sender: 'tutor',
    text: 'Xin chào! Tôi là AI Writing Copilot. Tôi đã phân tích xong bài luận của bạn. Tiêu chí GRA (Ngữ pháp) của bạn đạt 5.5. Bạn có muốn tìm hiểu lý do và sửa đổi không?',
};

export const writingDemoStyles = `
    .writing-error-hover:hover .writing-tooltip {
        display: block !important;
    }
    @keyframes slideIn {
        from { transform: translateX(100%); }
        to { transform: translateX(0); }
    }
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
    .dot-bounce {
        animation: dotBounce 1.2s infinite ease-in-out;
    }
    @keyframes dotBounce {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
    }
`;

