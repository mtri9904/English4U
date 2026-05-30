export interface PracticeSessionAnswerInputDto {
    questionId?: string | null;
    writingTaskId?: string | null;
    speakingQuestionId?: string | null;
    answerText: string | null;
    audioUrl?: string | null;
    durationSeconds?: number | null;
    fileSizeKB?: number | null;
}

export interface UpdatePracticeSessionAnswersDto {
    timeRemaining: number | null;
    answers: PracticeSessionAnswerInputDto[];
}

export type PracticeSessionHighlightColor = 'yellow' | 'green' | 'blue' | 'pink' | 'purple';

export interface PracticeSessionHighlightDto {
    id: string;
    sourceKey: string;
    startOffset: number;
    endOffset: number;
    selectedText: string;
    color: PracticeSessionHighlightColor;
    createdAt: string;
    updatedAt: string;
}

export interface UpdatePracticeSessionHighlightsDto {
    highlights: PracticeSessionHighlightDto[];
}

export interface PracticeSessionStartDto {
    sessionId: string;
    examId: string;
    skillType: string;
    status: string;
    timeRemaining: number | null;
    isResumed: boolean;
}

export interface PracticeSessionRewardDto {
    experienceAwarded: number;
    isFirstExamCompletion: boolean;
    levelUpOccurred: boolean;
    experiencePoints: number;
    currentLevel: number;
    currentLevelStartExperience: number;
    nextLevelExperience: number;
    experienceToNextLevel: number;
    levelProgressPercent: number;
    dailyStreakCount: number;
    longestStreakCount: number;
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
    speakingScore: number | null;
    totalBandScore: number | null;
    reward: PracticeSessionRewardDto | null;
}

export interface PracticeSessionFeedbackDto {
    criteria: string;
    bandScore: number;
    comment: string | null;
    improvements: string | null;
    confidenceScore?: number | null;
    evidence?: string[] | null;
}

export interface PracticeSessionSpeakingWordTimestampDto {
    word: string;
    start: number | null;
    end: number | null;
    probability: number | null;
}

export interface PracticeSessionSpeakingAnalyticsDto {
    wordCount: number;
    wordsPerMinute: number | null;
    coverageRatio: number | null;
    targetDurationSeconds: number | null;
    estimatedFluencyBand: number | null;
    paceLabel: 'insufficient_data' | 'slow' | 'balanced' | 'fast' | 'very_fast';
    coverageLabel: 'insufficient_data' | 'too_short' | 'on_target' | 'exceeds_target';
    meanWordConfidence?: number | null;
    speechRatio?: number | null;
    pauseCount?: number | null;
    longPauseCount?: number | null;
    totalPauseSeconds?: number | null;
    audioQualityLabel?: string | null;
    audioQualityWarnings?: string[] | null;
    wordTimestamps?: PracticeSessionSpeakingWordTimestampDto[] | null;
}

export interface PracticeSessionSpeakingPromptCueDto {
    code: string;
    startMs: number;
    endMs: number;
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
    speakingQuestionId?: string | null;
    speakingQuestionOrderIndex?: number | null;
    speakingPartNumber?: number | null;
    audioUrl?: string | null;
    durationSeconds?: number | null;
    transcriptText?: string | null;
    speakingAnalytics?: PracticeSessionSpeakingAnalyticsDto | null;
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

export interface PracticeSessionSpeakingQuestionDto {
    id: string;
    content: string;
    cueCardPoints: string | null;
    audioPromptUrl: string | null;
    orderIndex: number | null;
    promptEstimatedDurationMs?: number | null;
    promptVisemeTimeline?: PracticeSessionSpeakingPromptCueDto[] | null;
}

export interface PracticeSessionSpeakingPartDto {
    id: string;
    partNumber: number | null;
    description: string | null;
    questions: PracticeSessionSpeakingQuestionDto[];
}

export interface PracticeSessionSectionDto {
    id: string;
    skillType: string;
    title: string | null;
    orderIndex: number | null;
    readingPassages: PracticeSessionReadingPassageDto[];
    listeningParts: PracticeSessionListeningPartDto[];
    writingTasks: PracticeSessionWritingTaskDto[];
    speakingParts: PracticeSessionSpeakingPartDto[];
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
    speakingScore: number | null;
    totalBandScore: number | null;
}

export interface UploadPracticeSpeakingRecordingDto {
    speakingQuestionId: string;
    answerText?: string | null;
    durationSeconds?: number | null;
    audio: File;
}

export interface PracticeSessionSpeakingUploadResultDto {
    speakingQuestionId: string;
    audioUrl: string;
    fileSizeKB: number;
    durationSeconds: number | null;
    transcriptText: string | null;
    transcriptSegmentCount: number;
    answerText: string | null;
    speakingAnalytics: PracticeSessionSpeakingAnalyticsDto | null;
}
