export interface ExamDto {
    id: string;
    title: string;
    description: string | null;
    durationMinutes: number | null;
    totalPoints: number | null;
    examType: string | null;
    isPublished: boolean;
    createdBy: string | null;
    createdAt: string;
    skillTypes?: string[];
    sections: SectionDetailDto[];
}

export interface SectionDetailDto {
    id: string;
    skillType: string;
    title: string | null;
    orderIndex: number | null;
    readingPassages: ReadingPassageDto[] | null;
    listeningParts: ListeningPartDto[] | null;
    writingTasks: WritingTaskDto[] | null;
    speakingParts: SpeakingPartDto[] | null;
}

export interface ReadingPassageDto {
    id: string;
    passageNumber: number | null;
    title: string | null;
    paragraphsData: string | null;
    assetsData: string | null;
    questionGroups: QuestionGroupDto[];
}

export interface ListeningPartDto {
    id: string;
    partNumber: number | null;
    audioUrl: string;
    contextDescription: string | null;
    questionGroups: QuestionGroupDto[];
}

export interface WritingTaskDto {
    id: string;
    taskNumber: number | null;
    promptText: string;
    assetsData: string | null;
    minWords: number;
}

export interface SpeakingPartDto {
    id: string;
    partNumber: number | null;
    description: string | null;
    questions: SpeakingQuestionDto[];
}

export interface SpeakingQuestionDto {
    id: string;
    content: string;
    cueCardPoints: string | null;
    audioPromptUrl: string | null;
    orderIndex: number | null;
}

export interface QuestionGroupDto {
    id: string;
    groupType: string | null;
    instruction: string | null;
    contentData: string | null;
    assetsData: string | null;
    startQuestion: number | null;
    endQuestion: number | null;
    questions: QuestionDto[];
}

export interface QuestionDto {
    id: string;
    questionNumber: number | null;
    content: string | null;
    correctAnswer: string | null;
    explanation: string | null;
    points: number;
    options: QuestionOptionDto[];
}

export interface QuestionOptionDto {
    id: string;
    optionText: string;
    isCorrect: boolean;
    orderIndex: number | null;
}

export interface CreateExamDto {
    title: string;
    description?: string;
    durationMinutes?: number;
    totalPoints?: number;
    examType?: string;
    isPublished: boolean;
    sections: CreateSectionDto[];
}

export interface CreateSectionDto {
    skillType: string;
    title?: string;
    orderIndex?: number;
    readingPassages?: CreateReadingPassageDto[];
    listeningParts?: CreateListeningPartDto[];
    writingTasks?: CreateWritingTaskDto[];
    speakingParts?: CreateSpeakingPartDto[];
}

export interface CreateReadingPassageDto {
    passageNumber?: number;
    title?: string;
    paragraphsData?: string;
    assetsData?: string;
    questionGroups: CreateQuestionGroupDto[];
}

export interface CreateListeningPartDto {
    partNumber?: number;
    audioUrl: string;
    contextDescription?: string;
    questionGroups: CreateQuestionGroupDto[];
}

export interface CreateWritingTaskDto {
    taskNumber?: number;
    promptText: string;
    assetsData?: string;
    minWords: number;
}

export interface CreateSpeakingPartDto {
    partNumber?: number;
    description?: string;
    questions: CreateSpeakingQuestionDto[];
}

export interface CreateSpeakingQuestionDto {
    content: string;
    cueCardPoints?: string;
    audioPromptUrl?: string;
    orderIndex?: number;
}

export interface CreateQuestionGroupDto {
    groupType?: string;
    instruction?: string;
    contentData?: string;
    assetsData?: string;
    startQuestion?: number;
    endQuestion?: number;
    questions: CreateQuestionDto[];
}

export interface CreateQuestionDto {
    questionNumber?: number;
    content?: string;
    correctAnswer?: string;
    explanation?: string;
    points: number;
    options: CreateQuestionOptionDto[];
}

export interface CreateQuestionOptionDto {
    optionText: string;
    isCorrect: boolean;
    orderIndex?: number;
}
