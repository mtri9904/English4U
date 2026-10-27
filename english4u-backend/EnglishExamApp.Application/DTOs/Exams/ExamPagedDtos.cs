using EnglishExamApp.Application.DTOs.Common;

namespace EnglishExamApp.Application.DTOs.Exams;

public sealed record ExamPagedRequest(
    int PageNumber = 1,
    int PageSize = 10,
    string? SearchTerm = null,
    string? ExamType = null,
    string? Skill = null,
    bool? IsPublished = null,
    string? SortBy = "CreatedAt",
    bool SortDescending = true
);

public sealed record PracticeExamPagedRequest(
    int PageNumber = 1,
    int PageSize = 9,
    string? Search = null,
    string? Skill = null,
    string? ExamType = null
);

