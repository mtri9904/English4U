using EnglishExamApp.Application.DTOs.Common;
using EnglishExamApp.Application.DTOs.ExamExecution;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace EnglishExamApp.Application.Services;

public sealed partial class ExamExecutionService(
    IApplicationDbContext context,
    IAiIntegrationService aiIntegrationService,
    ISpeakingMediaStorageService speakingMediaStorageService,
    ILogger<ExamExecutionService> logger) : IExamExecutionService
{
    // Implementation split into:
    // - ExamExecutionService.Session.cs (Session start, answers, highlights, audio upload, blueprints)
    // - ExamExecutionService.Scoring.cs (Grading, submissions, scoring calculations, streak & rewards)
    // - ExamExecutionService.Admin.cs (Admin attempt query & details)
    // - ExamExecutionService.Helpers.cs (Option parsing, viseme chunks, data structures)
}
