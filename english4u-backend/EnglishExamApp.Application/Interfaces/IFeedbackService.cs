using EnglishExamApp.Application.DTOs.Common;
using EnglishExamApp.Application.DTOs.Feedbacks;

namespace EnglishExamApp.Application.Interfaces;

public interface IFeedbackService
{
    Task<FeedbackDetailDto> CreateFeedbackAsync(Guid userId, CreateFeedbackRequestDto dto, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FeedbackListItemDto>> GetRecentFeedbacksAsync(int limit = 30, CancellationToken cancellationToken = default);
    Task<IReadOnlyList<FeedbackListItemDto>> GetMyFeedbacksAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<FeedbackDetailDto?> GetFeedbackDetailAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PagedResult<FeedbackListItemDto>> GetAdminPagedFeedbacksAsync(FeedbackPagedRequest request, CancellationToken cancellationToken = default);
    Task<FeedbackDetailDto> UpdateFeedbackStatusAsync(Guid feedbackId, Guid adminId, UpdateFeedbackStatusRequestDto dto, CancellationToken cancellationToken = default);
    Task<FeedbackStatsDto> GetFeedbackStatsAsync(CancellationToken cancellationToken = default);
    Task<bool> DeleteFeedbackAsync(Guid id, CancellationToken cancellationToken = default);
}

