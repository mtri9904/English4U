/**
 * Play audio pronunciation using Web Speech API
 */
export const playSpeechSynthesis = (text: string, lang = 'en-US', rate = 0.9): void => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = lang;
        utterance.rate = rate;
        window.speechSynthesis.speak(utterance);
    }
};

/**
 * Play flashcard audio: prioritize audio URL from dictionary/cloud, fallback to Web Speech API
 */
export const playFlashcardAudio = (text: string, audioUrl?: string): void => {
    if (audioUrl) {
        try {
            const audio = new Audio(audioUrl);
            audio.play().catch(() => playSpeechSynthesis(text));
            return;
        } catch {
            // fallback to speech synthesis
        }
    }
    playSpeechSynthesis(text);
};

// Aliases for backwards compatibility
export const playAudio = playFlashcardAudio;
export const playSpeech = playSpeechSynthesis;

