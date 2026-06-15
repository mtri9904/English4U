using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Application.Interfaces;

public interface IAiIntegrationService
{
    Task ScoreWritingAsync(Guid sessionId, CancellationToken cancellationToken = default);
    Task ScoreSpeakingAsync(Guid sessionId, CancellationToken cancellationToken = default);
    Task<GeneratedSpeakingPromptAudioDto?> GenerateSpeakingPromptAudioAsync(
        string promptText,
        CancellationToken cancellationToken = default);
    Task<GenerateListeningTranscriptResultDto> GenerateListeningTranscriptAsync(
        GenerateListeningTranscriptRequestDto request,
        CancellationToken cancellationToken = default);
    Task<AlignListeningTranscriptResultDto> AlignListeningTranscriptAsync(
        AlignListeningTranscriptRequestDto request,
        CancellationToken cancellationToken = default);
    Task<ReadabilityAnalysisResponseDto?> AnalyzeReadabilityAsync(
        string text,
        CancellationToken cancellationToken = default);
}
