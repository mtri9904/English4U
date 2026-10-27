import type { PracticeSessionSpeakingAnalyticsDto } from '../types/session.types';

export const speakingPaceLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['paceLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu pace',
    slow: 'Pace chậm',
    balanced: 'Pace cân bằng',
    fast: 'Pace nhanh',
    very_fast: 'Pace quá nhanh',
};

export const speakingCoverageLabelMap: Record<NonNullable<PracticeSessionSpeakingAnalyticsDto['coverageLabel']>, string> = {
    insufficient_data: 'Chưa đủ dữ liệu độ dài',
    too_short: 'Câu trả lời quá ngắn',
    on_target: 'Độ dài đạt mục tiêu',
    exceeds_target: 'Thời lượng vượt mục tiêu',
};

export const TRANSITION_PHRASES = [
    "Thank you. Let's move on to the next question.",
    "Alright. Now, let's proceed to the next prompt.",
    "Thank you. Let's head over to the next part of our discussion.",
    "Okay, I see. Now, let's talk about the next topic.",
    "Great. Let's advance to the next question, please.",
];

export const FINAL_PHRASES = [
    "Thank you. That is the end of the speaking test.",
    "Alright, that concludes your speaking session. Thank you.",
    "Thank you very much. We have finished the speaking exam.",
];

