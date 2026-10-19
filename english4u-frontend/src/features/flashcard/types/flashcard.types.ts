export interface FlashcardDeckDto {
    id: string;
    userId: string;
    title: string;
    description?: string;
    color: string;
    icon?: string;
    isPublic: boolean;
    totalCards: number;
    dueCards: number;
    createdAt: string;
    updatedAt: string;
}

export interface FlashcardItemDto {
    id: string;
    deckId: string;
    userId: string;
    word: string;
    phonetic?: string;
    partOfSpeech?: string;
    meaningVi: string;
    definitionEn?: string;
    exampleSentence?: string;
    exampleSentenceVi?: string;
    collocations?: string;
    imageUrl?: string;
    audioUrl?: string;
    contextNote?: string;
    quizDistractors?: string;
    repetitions: number;
    easeFactor: number;
    intervalDays: number;
    nextReviewDate: string;
    lastReviewedAt?: string;
    reviewCount: number;
    createdAt: string;
    updatedAt: string;
}

export interface CreateDeckRequest {
    title: string;
    description?: string;
    color?: string;
    icon?: string;
    isPublic?: boolean;
}

export interface UpdateDeckRequest {
    title: string;
    description?: string;
    color?: string;
    icon?: string;
    isPublic?: boolean;
}

export interface CreateFlashcardItemRequest {
    deckId: string;
    word: string;
    meaningVi: string;
    phonetic?: string;
    partOfSpeech?: string;
    definitionEn?: string;
    exampleSentence?: string;
    exampleSentenceVi?: string;
    collocations?: string;
    imageUrl?: string;
    audioUrl?: string;
    contextNote?: string;
    quizDistractors?: string;
}

export interface UpdateFlashcardItemRequest {
    word: string;
    meaningVi: string;
    phonetic?: string;
    partOfSpeech?: string;
    definitionEn?: string;
    exampleSentence?: string;
    exampleSentenceVi?: string;
    collocations?: string;
    imageUrl?: string;
    audioUrl?: string;
    contextNote?: string;
    quizDistractors?: string;
}

export interface AiEnrichWordResponse {
    word: string;
    phonetic: string;
    partOfSpeech: string;
    meaningVi: string;
    definitionEn: string;
    exampleSentence: string;
    exampleSentenceVi: string;
    collocations: string;
    imageUrl: string;
    imagePrompt: string;
    audioUrl?: string;
    quizDistractors?: string;
    modelUsed?: string;
}

export interface SentenceExampleItem {
    level: string; // 'Dễ' | 'Trung bình' | 'Khó'
    levelLabel: string;
    sentence: string;
    meaningVi: string;
}

export interface AiCheckSentenceResponse {
    isCorrect: boolean;
    score: number;
    feedbackVi: string;
    grammarErrors: string[];
    correctedSentence?: string;
    examplesByLevel?: SentenceExampleItem[];
    improvedSentenceBand8: string;
}
