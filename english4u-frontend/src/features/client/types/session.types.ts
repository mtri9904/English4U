export interface PracticeSessionAnswerInputDto {
    questionId?: string | null;
    writingTaskId?: string | null;
    answerText: string | null;
}

export interface UpdatePracticeSessionAnswersDto {
    timeRemaining: number | null;
    answers: PracticeSessionAnswerInputDto[];
}

export interface PracticeSessionStartDto {
    sessionId: string;
    examId: string;
    skillType: string;
    status: string;
    timeRemaining: number | null;
    isResumed: boolean;
}

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
    writingScore: number | null;
    overallFeedback: string | null;
}

export interface PracticeSessionFeedbackDto {
    criteria: string;
    bandScore: number;
    comment: string | null;
    improvements: string | null;
}

export interface PracticeSessionAnswerDto {
    questionId: string;
    writingTaskId: string | null;
    questionNumber: number | null;
    writingTaskNumber: number | null;
    groupType: string | null;
    answerText: string | null;
    correctAnswer: string | null;
    scoreEarned: number;
    isCorrect: boolean | null;
    feedbacks: PracticeSessionFeedbackDto[] | null;
}

export interface PracticeSessionOptionDto {
    id: string;
    optionText: string;
    imageUrl?: string | null;
    orderIndex: number | null;
}

export interface PracticeSessionQuestionDto {
    id: string;
    questionNumber: number | null;
    content: string | null;
    points: number;
    correctAnswer: string | null;
    options: PracticeSessionOptionDto[];
}

export interface PracticeSessionQuestionGroupDto {
    id: string;
    groupType: string | null;
    instruction: string | null;
    contentData: string | null;
    assetsData: string | null;
    startQuestion: number | null;
    endQuestion: number | null;
    optionLabelType?: 'alpha' | 'roman' | null;
    questions: PracticeSessionQuestionDto[];
}

export interface PracticeSessionReadingPassageDto {
    id: string;
    passageNumber: number | null;
    title: string | null;
    paragraphsData: string | null;
    assetsData: string | null;
    questionGroups: PracticeSessionQuestionGroupDto[];
}

export interface PracticeSessionListeningPartDto {
    id: string;
    partNumber: number | null;
    audioUrl: string;
    contextDescription: string | null;
    transcriptData?: string | null;
    questionGroups: PracticeSessionQuestionGroupDto[];
}

export interface PracticeSessionWritingTaskDto {
    id: string;
    taskNumber: number | null;
    promptText: string;
    assetsData: string | null;
    minWords: number;
}

export interface PracticeSessionSectionDto {
    id: string;
    skillType: string;
    title: string | null;
    orderIndex: number | null;
    readingPassages: PracticeSessionReadingPassageDto[];
    listeningParts: PracticeSessionListeningPartDto[];
    writingTasks: PracticeSessionWritingTaskDto[];
}

export interface PracticeSessionExamDto {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number | null;
    examType: string | null;
    sections: PracticeSessionSectionDto[];
}

export interface PracticeSessionDto {
    sessionId: string;
    examId: string;
    examTitle: string;
    examDescription: string | null;
    examType: string | null;
    skillType: string;
    status: string;
    startedAt: string;
    endedAt: string | null;
    durationMinutes: number | null;
    timeRemaining: number | null;
    totalQuestions: number;
    answeredQuestions: number;
    resumeQuestionNumber: number | null;
    exam: PracticeSessionExamDto;
    answers: PracticeSessionAnswerDto[];
    result: PracticeSessionResultDto | null;
}

export interface PracticeSessionListItemDto {
    sessionId: string;
    examId: string;
    examTitle: string;
    examType: string | null;
    skillType: string;
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
    writingScore: number | null;
}
