export interface PracticeExamListItemDto {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number | null;
    examType: string | null;
    createdAt: string;
    skillTypes: string[];
    sectionCount: number;
    readingQuestionCount: number;
    listeningQuestionCount: number;
    writingTaskCount: number;
    speakingPartCount: number;
}

export interface PracticeExamSectionSummaryDto {
    id: string;
    skillType: string;
    title: string | null;
    orderIndex: number | null;
    readingPassageCount: number;
    listeningPartCount: number;
    questionGroupCount: number;
    questionCount: number;
    writingTaskCount: number;
    speakingPartCount: number;
    speakingQuestionCount: number;
}

export interface PracticeExamDetailDto extends PracticeExamListItemDto {
    totalPoints: number | null;
    sections: PracticeExamSectionSummaryDto[];
}
