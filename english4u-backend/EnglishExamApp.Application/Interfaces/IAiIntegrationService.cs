namespace EnglishExamApp.Application.Interfaces;

public interface IAiIntegrationService
{
    Task ScoreWritingAsync(Guid sessionId, CancellationToken cancellationToken = default);
    Task ScoreSpeakingAsync(Guid sessionId, CancellationToken cancellationToken = default);
}
