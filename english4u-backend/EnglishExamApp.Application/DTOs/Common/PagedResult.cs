namespace EnglishExamApp.Application.DTOs.Common;

public record PagedResult<T>(
    IReadOnlyList<T> Items,
    int TotalCount,
    int PageNumber,
    int PageSize
);

