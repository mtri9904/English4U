export interface PracticeSessionResultDto {
    sessionId: string;
    readingScore: number | null;
    listeningScore: number | null;
    totalAutoScore: number;
    maxAutoScore: number;
    totalQuestions: number;
    answeredQuestions: number;
    correctQuestions: number;
    accuracyPercent: number;
    status: string;
}

export interface AdminAttemptListItemDto {
    sessionId: string;
    examId: string;
    userId: string;
    examTitle: string;
    examType: string | null;
    skillType: string;
    userDisplayName: string;
    userEmail: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    timeRemaining: number | null;
    totalQuestions: number;
    answeredQuestions: number;
    resumeQuestionNumber: number | null;
    readingScore: number | null;
    listeningScore: number | null;
    totalAutoScore: number | null;
}

export interface AdminAttemptAnswerDto {
    questionId: string;
    questionNumber: number | null;
    groupType: string | null;
    questionContent: string | null;
    submittedAnswer: string | null;
    scoreEarned: number;
    isCorrect: boolean | null;
}

export interface AdminAttemptDetailDto {
    sessionId: string;
    examId: string;
    userId: string;
    examTitle: string;
    examType: string | null;
    skillType: string;
    userDisplayName: string;
    userEmail: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    timeRemaining: number | null;
    totalQuestions: number;
    answeredQuestions: number;
    resumeQuestionNumber: number | null;
    result: PracticeSessionResultDto | null;
    answers: AdminAttemptAnswerDto[];
}
