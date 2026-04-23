using EnglishExamApp.Application.DTOs.ExamExecution;

namespace EnglishExamApp.Application.Services;

public interface IExamExecutionService
{
    Task<Guid> StartSessionAsync(Guid userId, Guid examId, CancellationToken cancellationToken = default);
    Task AutoSaveAnswerAsync(AutoSaveAnswerDto dto, CancellationToken cancellationToken = default);
    Task<SubmitExamResultDto> SubmitExamAsync(Guid sessionId, CancellationToken cancellationToken = default);
    Task<PracticeSessionStartDto> StartPracticeSessionAsync(Guid userId, Guid examId, bool forceNewAttempt = false, CancellationToken cancellationToken = default);
    Task<PracticeSessionDto?> GetPracticeSessionAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<PracticeSessionListItemDto>> GetPracticeSessionsAsync(Guid userId, CancellationToken cancellationToken = default);
    Task UpdatePracticeSessionAnswersAsync(Guid userId, Guid sessionId, UpdatePracticeSessionAnswersDto dto, CancellationToken cancellationToken = default);
    Task<PracticeSessionResultDto> SubmitReadingListeningAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default);
    Task<PracticeSessionResultDto> SubmitWritingAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<AdminAttemptListItemDto>> GetAdminAttemptsAsync(AdminAttemptQueryDto query, CancellationToken cancellationToken = default);
    Task<AdminAttemptDetailDto?> GetAdminAttemptDetailAsync(Guid sessionId, CancellationToken cancellationToken = default);
}
