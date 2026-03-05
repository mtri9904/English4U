using EnglishExamApp.Application.DTOs.ExamExecution;

namespace EnglishExamApp.Application.Services;

public interface IExamExecutionService
{
    Task<Guid> StartSessionAsync(Guid userId, Guid examId, CancellationToken cancellationToken = default);
    Task AutoSaveAnswerAsync(AutoSaveAnswerDto dto, CancellationToken cancellationToken = default);
    Task<SubmitExamResultDto> SubmitExamAsync(Guid sessionId, CancellationToken cancellationToken = default);
}
