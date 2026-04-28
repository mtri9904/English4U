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
    transcriptData?: string | null;
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
    optionLabelType?: 'alpha' | 'roman' | null;
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
    imageUrl?: string | null;
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
    transcriptData?: string;
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
    optionLabelType?: 'alpha' | 'roman';
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
    imageUrl?: string;
    isCorrect: boolean;
    orderIndex?: number;
}

export interface GenerateExamFromPdfResult {
    examId: string;
    uploadId: string;
    passageCount: number;
    questionCount: number;
}

export interface UploadSpeakingPromptAudioResult {
    audioUrl: string;
    fileSizeKB: number;
}

export interface ListeningTranscriptSegmentDto {
    startTime: number;
    endTime: number | null;
    text: string;
    isTargetForQuestion?: number | number[] | null;
}

export interface ListeningTranscriptAlignmentQuestionDto {
    questionNumber: number;
    questionText?: string | null;
    correctAnswer?: string | null;
    correctOptionTexts?: string[];
    contextText?: string | null;
    groupType?: string | null;
}

export interface AlignListeningTranscriptRequestDto {
    transcriptSegments: ListeningTranscriptSegmentDto[];
    questions: ListeningTranscriptAlignmentQuestionDto[];
}

export interface ListeningTranscriptQuestionAlignmentDto {
    questionNumber: number;
    segmentIndexes: number[];
    confidence?: 'high' | 'medium' | 'low' | null;
    groupType?: string | null;
    answerStartTime?: number | null;
    answerEndTime?: number | null;
    evidenceText?: string | null;
}

export interface AlignListeningTranscriptResultDto {
    alignments: ListeningTranscriptQuestionAlignmentDto[];
}

export interface ListeningTranscriptDataEnvelopeDto {
    schemaVersion: number;
    transcriptText?: string | null;
    segmentCount?: number | null;
    segments: ListeningTranscriptSegmentDto[];
    alignments?: ListeningTranscriptQuestionAlignmentDto[];
}

export interface GenerateListeningTranscriptResultDto {
    segments: ListeningTranscriptSegmentDto[];
    transcriptText: string;
    segmentCount: number;
}

export interface WritingVisualExtractionResultDto {
    hiddenDataText: string;
    model: string;
}

export interface PdfGenerationProgressStatus {
    uploadId: string;
    uploadedBy: string;
    status: string;
    progressPercent: number;
    stage: string;
    message: string;
    passageNumber: number | null;
    totalPassages: number | null;
    examId: string | null;
    clientRequestId: string | null;
    updatedAtUtc: string;
}

export interface PdfRawExtractionPreviewDto {
    fileName: string;
    rawTextLength: number;
    rawText: string;
    answerZoneLength: number;
    answerZone: string;
    answerKeyEntryCount: number;
    answerKeyEntries: Record<string, string>;
    questionGroupInstructions: PdfRawQuestionInstructionPreviewDto[];
    passages: PdfRawPassagePreviewDto[];
}

export interface PdfQuestionGroupPreviewDto {
    fileName: string;
    passageCount: number;
    questionGroups: PdfRawQuestionInstructionPreviewDto[];
}

export interface PdfRawReviewDto {
    fileName: string;
    extractionEngine: string;
    pageCount: number;
    rawTextLength: number;
    rawText: string;
    structure: PdfRawReviewStructureDto;
    passages: PdfRawReviewPassageDto[];
    solutionSection: PdfRawReviewAnswerSectionDto | null;
    reviewSection: PdfRawReviewExplanationSectionDto | null;
    requestTrace: PdfRawReviewRequestTraceDto[];
}

export interface PdfRawReviewStructureDto {
    passages: PdfRawReviewPassageSeedDto[];
    solutionSectionRaw: string;
    reviewSectionRaw: string;
}

export interface PdfRawReviewPassageSeedDto {
    passageNumber: number;
    title: string;
    questionRange: string;
    rawText: string;
}

export interface PdfRawReviewPassageDto {
    passageNumber: number;
    title: string;
    questionRange: string;
    rawText: string;
    questionGroups: PdfRawQuestionInstructionPreviewDto[];
}

export interface PdfRawReviewAnswerSectionDto {
    rawText: string;
    answers: PdfRawReviewAnswerItemDto[];
}

export interface PdfRawReviewAnswerItemDto {
    questionNumber: number;
    answer: string;
}

export interface PdfRawReviewExplanationSectionDto {
    rawText: string;
    explanations: PdfRawReviewExplanationItemDto[];
}

export interface PdfRawReviewExplanationItemDto {
    questionNumber: number;
    answer: string;
    explanation: string;
}

export interface PdfRawReviewRequestTraceDto {
    stepName: string;
    inputLength: number;
    outputLength: number;
    status: string;
    notes: string;
}

export interface PdfRawQuestionInstructionPreviewDto {
    passageNumber: number;
    startQuestion: number;
    endQuestion: number;
    tags: string;
    groupType: string | null;
    instruction: string;
    questionPreview?: string | null;
    typeEvidence?: string | null;
    visualPreviewItems?: PdfRawVisualPreviewItemDto[] | null;
    visualPreviewNote?: string | null;
    diagramPreviewImageDataUrl?: string | null;
    diagramPreviewPageNumber?: number | null;
    diagramPreviewNote?: string | null;
}

export interface PdfRawVisualPreviewItemDto {
    imageDataUrl: string;
    pageNumber: number;
    note?: string | null;
}

export interface PdfRawPassagePreviewDto {
    passageNumber: number;
    originalLength: number;
    preparedLength: number;
    originalText: string;
    preparedText: string;
    questionSegments: PdfRawQuestionSegmentPreviewDto[];
}

export interface PdfRawQuestionSegmentPreviewDto {
    segmentIndex: number;
    startQuestion: number | null;
    endQuestion: number | null;
    segmentTextLength: number;
    segmentText: string;
}
