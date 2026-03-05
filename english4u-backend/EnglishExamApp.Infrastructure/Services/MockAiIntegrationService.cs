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
}
