using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class MockAiIntegrationService(ILogger<MockAiIntegrationService> logger) : IAiIntegrationService
{
    public Task ScoreWritingAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[Mock AI] ScoreWriting triggered for session {SessionId}", sessionId);
        return Task.CompletedTask;
    }

    public Task ScoreSpeakingAsync(Guid sessionId, CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[Mock AI] ScoreSpeaking triggered for session {SessionId}", sessionId);
        return Task.CompletedTask;
    }

    public Task<GeneratedSpeakingPromptAudioDto?> GenerateSpeakingPromptAudioAsync(
        string promptText,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[Mock AI] GenerateSpeakingPromptAudio triggered for prompt length {PromptLength}", promptText?.Length ?? 0);
        return Task.FromResult<GeneratedSpeakingPromptAudioDto?>(null);
    }

    public Task<GenerateListeningTranscriptResultDto> GenerateListeningTranscriptAsync(
        GenerateListeningTranscriptRequestDto request,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[Mock AI] GenerateListeningTranscript triggered for audio {AudioUrl}", request.AudioUrl);

        var segments = new[]
        {
            new ListeningTranscriptSegmentDto(0, 4.2, "This is a mock listening transcript segment.", null),
            new ListeningTranscriptSegmentDto(4.2, 8.8, "Replace AiScoringService with the real service to generate timestamps.", null),
        };

        return Task.FromResult(
            new GenerateListeningTranscriptResultDto(
                segments,
                string.Join(" ", segments.Select(segment => segment.Text)),
                segments.Length));
    }

    public Task<AlignListeningTranscriptResultDto> AlignListeningTranscriptAsync(
        AlignListeningTranscriptRequestDto request,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation(
            "[Mock AI] AlignListeningTranscript triggered for {QuestionCount} questions and {SegmentCount} segments.",
            request.Questions.Count,
            request.TranscriptSegments.Count);

        return Task.FromResult(
            new AlignListeningTranscriptResultDto(Array.Empty<ListeningTranscriptQuestionAlignmentDto>()));
    }

    public Task<ReadabilityAnalysisResponseDto?> AnalyzeReadabilityAsync(
        string text,
        CancellationToken cancellationToken = default)
    {
        logger.LogInformation("[Mock AI] AnalyzeReadability triggered for text length {TextLength}", text?.Length ?? 0);

        var mockResult = new ReadabilityAnalysisResponseDto(
            FleschKincaidGrade: 11.5d,
            GunningFog: 13.0d,
            WordCount: string.IsNullOrWhiteSpace(text) ? 0 : text.Split(' ', StringSplitOptions.RemoveEmptyEntries).Length,
            ZipfFrequency: 4.0d,
            AwlRatio: 9.5d
        );

        return Task.FromResult<ReadabilityAnalysisResponseDto?>(mockResult);
    }
}
