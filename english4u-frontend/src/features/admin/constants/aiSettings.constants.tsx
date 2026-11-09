import React from 'react';
import {
    ThunderboltOutlined,
    TranslationOutlined,
    ReadOutlined,
    EditOutlined,
    PictureOutlined,
    FilePdfOutlined,
    AppstoreOutlined,
    GlobalOutlined,
    CustomerServiceOutlined,
    BookOutlined,
    SoundOutlined,
    RobotOutlined,
} from '@ant-design/icons';

export interface FeatureGroupMeta {
    id: string;
    title: string;
    icon: React.ReactNode;
    color: string;
    tagColor: string;
    badgeText: string;
    description: string;
}

export interface FeatureMeta {
    groupId: string;
    groupTitle: string;
    tag: string;
    tagColor: string;
    accentColor: string;
    gradient: string;
    recommended: string;
}

export const FEATURE_GROUPS: FeatureGroupMeta[] = [
    {
        id: 'assessment',
        title: 'Chấm thi & Đánh giá',
        icon: <ThunderboltOutlined />,
        color: '#fa8c16',
        tagColor: 'orange',
        badgeText: 'Chấm thi',
        description: 'Chấm điểm tự động và dịch phản hồi nhận xét bài thi của học sinh',
    },
    {
        id: 'copilot',
        title: 'Trợ lý học tập (Copilot)',
        icon: <ReadOutlined />,
        color: '#52c41a',
        tagColor: 'green',
        badgeText: 'Trợ lý AI',
        description: 'Đồng hành giải thích bài đọc, sửa lỗi ngữ pháp và hướng dẫn viết câu',
    },
    {
        id: 'extraction',
        title: 'Đa phương tiện & OCR PDF',
        icon: <FilePdfOutlined />,
        color: '#f5222d',
        tagColor: 'red',
        badgeText: 'OCR & PDF',
        description: 'Bóc tách tài liệu đề thi PDF và trích xuất dữ liệu hình ảnh, biểu đồ',
    },
    {
        id: 'audio',
        title: 'Luyện Nghe & Nói (Audio / TTS)',
        icon: <CustomerServiceOutlined />,
        color: '#722ed1',
        tagColor: 'purple',
        badgeText: 'Nghe & Nói',
        description: 'Tạo bài tập chép chính tả và phát âm giọng đọc mẫu chuẩn bản ngữ',
    },
    {
        id: 'content',
        title: 'Tạo đề & Học liệu AI',
        icon: <AppstoreOutlined />,
        color: '#1890ff',
        tagColor: 'blue',
        badgeText: 'Học liệu',
        description: 'Sinh câu hỏi thi, bổ sung từ vựng Flashcard và dịch báo chí quốc tế',
    },
];

export const FEATURE_METADATA: Record<string, FeatureMeta> = {
    ai_scoring: {
        groupId: 'assessment',
        groupTitle: 'Chấm thi & Đánh giá',
        tag: 'Chấm điểm thi',
        tagColor: 'orange',
        accentColor: '#fa8c16',
        gradient: 'linear-gradient(135deg, #fa8c16 0%, #fa541c 100%)',
        recommended: 'Khuyên dùng model suy luận cao (Pro / Flash) để đánh giá tiêu chuẩn IELTS/TOEIC/CEFR',
    },
    scoring_feedback_translation: {
        groupId: 'assessment',
        groupTitle: 'Chấm thi & Đánh giá',
        tag: 'Dịch nhận xét',
        tagColor: 'gold',
        accentColor: '#faad14',
        gradient: 'linear-gradient(135deg, #faad14 0%, #d48806 100%)',
        recommended: 'Khuyên dùng model tốc độ cao (Gemma 4 / Flash-Lite) dịch nhận xét sang tiếng Việt',
    },
    reading_copilot: {
        groupId: 'copilot',
        groupTitle: 'Trợ lý học tập',
        tag: 'Reading Copilot',
        tagColor: 'green',
        accentColor: '#52c41a',
        gradient: 'linear-gradient(135deg, #52c41a 0%, #389e0d 100%)',
        recommended: 'Khuyên dùng model có context lớn (Pro / Flash) giải thích sâu bài đọc và ngữ cảnh từ',
    },
    writing_copilot: {
        groupId: 'copilot',
        groupTitle: 'Trợ lý học tập',
        tag: 'Writing Copilot',
        tagColor: 'cyan',
        accentColor: '#13c2c2',
        gradient: 'linear-gradient(135deg, #13c2c2 0%, #08979c 100%)',
        recommended: 'Khuyên dùng model phản hồi tức thì (Flash / Flash-Lite) gợi ý câu từ và nâng cấp từ vựng',
    },
    pdf_native_extraction: {
        groupId: 'extraction',
        groupTitle: 'Đa phương tiện & OCR',
        tag: 'OCR Đề thi PDF',
        tagColor: 'red',
        accentColor: '#f5222d',
        gradient: 'linear-gradient(135deg, #f5222d 0%, #cf1322 100%)',
        recommended: 'Bắt buộc model Multi-modal (Flash / Pro) để nhận diện cấu trúc trang, bảng và hình ảnh đề thi PDF',
    },
    writing_visual_extraction: {
        groupId: 'extraction',
        groupTitle: 'Đa phương tiện & OCR',
        tag: 'Biểu đồ Task 1',
        tagColor: 'magenta',
        accentColor: '#eb2f96',
        gradient: 'linear-gradient(135deg, #eb2f96 0%, #c41d7f 100%)',
        recommended: 'Bắt buộc model Multi-modal để phân tích hình ảnh biểu đồ cột, tròn, đường và bản đồ Writing Task 1',
    },
    dictation_generation: {
        groupId: 'audio',
        groupTitle: 'Luyện Nghe - Nói',
        tag: 'Nghe chính tả',
        tagColor: 'purple',
        accentColor: '#722ed1',
        gradient: 'linear-gradient(135deg, #722ed1 0%, #531dab 100%)',
        recommended: 'Khuyên dùng model xử lý văn bản (Gemma 4 / Flash-Lite) phân tích câu và sinh bài tập điền từ',
    },
    speaking_tts: {
        groupId: 'audio',
        groupTitle: 'Luyện Nghe - Nói',
        tag: 'Phát âm & TTS',
        tagColor: 'geekblue',
        accentColor: '#2f54eb',
        gradient: 'linear-gradient(135deg, #2f54eb 0%, #1d39c4 100%)',
        recommended: 'Khuyên dùng model hỗ trợ TTS Audio (Flash TTS / Live) tạo giọng đọc mẫu chuẩn bản ngữ',
    },
    exam_ai_generation: {
        groupId: 'content',
        groupTitle: 'Tạo nội dung & Học liệu',
        tag: 'Sinh đề & Câu hỏi',
        tagColor: 'blue',
        accentColor: '#1890ff',
        gradient: 'linear-gradient(135deg, #1890ff 0%, #096dd9 100%)',
        recommended: 'Khuyên dùng model logic mạnh (Pro / Gemma 4 / Flash) thiết kế câu hỏi trắc nghiệm và đáp án',
    },
    flashcard_ai_enrichment: {
        groupId: 'content',
        groupTitle: 'Tạo nội dung & Học liệu',
        tag: 'Học liệu Flashcard',
        tagColor: 'lime',
        accentColor: '#7cb305',
        gradient: 'linear-gradient(135deg, #7cb305 0%, #5b8c00 100%)',
        recommended: 'Khuyên dùng model Flash-Lite / Flash tạo câu ví dụ thực tế, collocation và từ đồng nghĩa',
    },
    news_translation: {
        groupId: 'content',
        groupTitle: 'Tạo nội dung & Học liệu',
        tag: 'Dịch báo Guardian',
        tagColor: 'volcano',
        accentColor: '#fa541c',
        gradient: 'linear-gradient(135deg, #fa541c 0%, #d4380d 100%)',
        recommended: 'Khuyên dùng model Flash-Lite dịch tốc độ cao và tiết kiệm hạn ngạch cho số lượng lớn bài báo',
    },
};

export const FEATURE_ICONS: Record<string, React.ReactNode> = {
    ai_scoring: <ThunderboltOutlined style={{ color: '#fa8c16' }} />,
    scoring_feedback_translation: <TranslationOutlined style={{ color: '#faad14' }} />,
    reading_copilot: <ReadOutlined style={{ color: '#52c41a' }} />,
    writing_copilot: <EditOutlined style={{ color: '#13c2c2' }} />,
    writing_visual_extraction: <PictureOutlined style={{ color: '#eb2f96' }} />,
    pdf_native_extraction: <FilePdfOutlined style={{ color: '#f5222d' }} />,
    exam_ai_generation: <AppstoreOutlined style={{ color: '#1890ff' }} />,
    news_translation: <GlobalOutlined style={{ color: '#fa541c' }} />,
    dictation_generation: <CustomerServiceOutlined style={{ color: '#722ed1' }} />,
    flashcard_ai_enrichment: <BookOutlined style={{ color: '#7cb305' }} />,
    speaking_tts: <SoundOutlined style={{ color: '#2f54eb' }} />,
};

export const getFeatureMeta = (key: string): FeatureMeta => {
    return (
        FEATURE_METADATA[key] || {
            groupId: 'other',
            groupTitle: 'Tính năng khác',
            tag: 'Tính năng AI',
            tagColor: 'default',
            accentColor: '#8c8c8c',
            gradient: 'linear-gradient(135deg, #8c8c8c 0%, #595959 100%)',
            recommended: 'Chọn model phù hợp theo nhu cầu sử dụng',
        }
    );
};

export const getFeatureIcon = (key: string): React.ReactNode => {
    return FEATURE_ICONS[key] || <RobotOutlined />;
};

export const getCategoryTagColor = (category?: string): string => {
    const cat = category || 'Text-out models';
    if (cat === 'Live API') return 'geekblue';
    if (cat === 'Agents') return 'purple';
    if (cat === 'Multi-modal generative models') return 'magenta';
    if (cat === 'Embedding models') return 'cyan';
    if (cat === 'Other models') return 'default';
    return 'blue';
};

