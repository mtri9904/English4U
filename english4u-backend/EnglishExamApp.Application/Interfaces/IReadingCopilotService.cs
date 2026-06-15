using EnglishExamApp.Application.DTOs.Copilot;

namespace EnglishExamApp.Application.Interfaces;

public interface IReadingCopilotService
{
    Task StreamChatAsync(
        CopilotChatRequestDto request,
        Func<string, CancellationToken, Task> onTextDelta,
        CancellationToken cancellationToken = default);
}
