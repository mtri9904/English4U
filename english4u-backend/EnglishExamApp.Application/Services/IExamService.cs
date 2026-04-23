using EnglishExamApp.Application.DTOs.Exams;

namespace EnglishExamApp.Application.Services;

public interface IExamService
{
    Task<List<ExamListItemDto>> GetAllAsync(CancellationToken cancellationToken = default);
    Task<ExamDetailDto?> GetExamDetailAsync(Guid examId, CancellationToken cancellationToken = default);
    Task<List<PracticeExamListItemDto>> GetPublishedPracticeExamsAsync(CancellationToken cancellationToken = default);
    Task<PracticeExamDetailDto?> GetPublishedPracticeExamDetailAsync(Guid examId, CancellationToken cancellationToken = default);
    Task<Guid> CreateExamAsync(CreateExamDto dto, Guid createdBy, CancellationToken cancellationToken = default);
    Task<bool> DeleteAsync(Guid examId, CancellationToken cancellationToken = default);
    Task<bool> UpdateStatusAsync(Guid examId, bool isPublished, CancellationToken cancellationToken = default);
    Task<bool> UpdateExamAsync(Guid examId, CreateExamDto dto, CancellationToken cancellationToken = default);
}
