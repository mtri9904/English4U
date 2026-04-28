using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace EnglishExamApp.Application.Services;

public class ExamService(
    IApplicationDbContext context,
    IWritingVisualExtractionService writingVisualExtractionService,
    ILogger<ExamService> logger) : IExamService
{
    private const int MaxReadingPassages = 3;
    private const int MaxReadingQuestions = 40;
    private const int MaxListeningParts = 4;
    private const int MaxListeningQuestions = 40;
    private const int MaxWritingTasks = 2;
    private const int MaxSpeakingParts = 3;

    public async Task<List<ExamListItemDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        return await context.Exams
            .AsNoTracking()
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new ExamListItemDto(
                e.Id, e.Title, e.Description, e.DurationMinutes,
                e.TotalPoints, e.ExamType, e.IsPublished, e.CreatedBy, e.CreatedAt,
                e.ExamSections.Select(s => s.SkillType).ToList()))
            .ToListAsync(cancellationToken);
    }

    public async Task<List<PracticeExamListItemDto>> GetPublishedPracticeExamsAsync(CancellationToken cancellationToken = default)
    {
        return await context.Exams
            .AsNoTracking()
            .Where(e => e.IsPublished)
            .OrderByDescending(e => e.CreatedAt)
            .Select(e => new PracticeExamListItemDto(
                e.Id,
                e.Title,
                e.Description,
                e.DurationMinutes,
                e.ExamType,
                e.CreatedAt,
                e.ExamSections
                    .Select(section => section.SkillType)
                    .Distinct()
                    .ToList(),
                e.ExamSections.Count(),
                e.ExamSections
                    .SelectMany(section => section.ReadingPassages)
                    .SelectMany(passage => passage.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count(),
                e.ExamSections
                    .SelectMany(section => section.ListeningParts)
                    .SelectMany(part => part.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count(),
                e.ExamSections
                    .SelectMany(section => section.WritingTasks)
                    .Count(),
                e.ExamSections
                    .SelectMany(section => section.SpeakingParts)
                    .Count()))
            .ToListAsync(cancellationToken);
    }

    public async Task<bool> DeleteAsync(Guid examId, CancellationToken cancellationToken = default)
    {
        var exists = await context.Exams
            .AsNoTracking()
            .AnyAsync(e => e.Id == examId, cancellationToken);

        if (!exists)
        {
            return false;
        }

        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var utcNow = DateTime.UtcNow;

            await context.DocumentUploads
                .Where(upload => upload.GeneratedExamId == examId)
                .ExecuteUpdateAsync(setters => setters
                    .SetProperty(upload => upload.GeneratedExamId, (Guid?)null)
                    .SetProperty(upload => upload.UpdatedAt, utcNow), cancellationToken);

            await context.ExamSessions
                .Where(session => session.ExamId == examId)
                .ExecuteDeleteAsync(cancellationToken);

            await context.QuestionGroups
                .Where(group => group.Passage != null && group.Passage.Section.ExamId == examId)
                .ExecuteDeleteAsync(cancellationToken);

            await context.QuestionGroups
                .Where(group => group.ListeningPart != null && group.ListeningPart.Section.ExamId == examId)
                .ExecuteDeleteAsync(cancellationToken);

            context.Exams.Remove(new Exam { Id = examId });
            await context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);

            return true;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<bool> UpdateStatusAsync(Guid examId, bool isPublished, CancellationToken cancellationToken = default)
    {
        var exam = await context.Exams.FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);
        if (exam is null) return false;
        exam.IsPublished = isPublished;
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    public async Task<ExamDetailDto?> GetExamDetailAsync(Guid examId, CancellationToken cancellationToken = default)
    {
        var exam = await context.Exams
            .AsNoTracking()
            .AsSplitQuery()
            .Where(e => e.Id == examId)
            .Select(e => new ExamDetailDto(
                e.Id, e.Title, e.Description, e.DurationMinutes, e.TotalPoints,
                e.ExamType, e.IsPublished, e.CreatedBy, e.CreatedAt,
                e.ExamSections.OrderBy(s => s.OrderIndex).Select(s => new SectionDetailDto(
                    s.Id, s.SkillType, s.Title, s.OrderIndex,
                    s.ReadingPassages.OrderBy(p => p.PassageNumber).Select(p => new ReadingPassageDto(
                        p.Id, p.PassageNumber, p.Title, p.ParagraphsData, p.AssetsData,
                        p.QuestionGroups
                            .OrderBy(g => g.StartQuestion ?? (g.Questions.Any() ? g.Questions.Min(q => q.QuestionNumber) : 0))
                            .Select(g => new QuestionGroupDto(
                                g.Id, g.GroupType, g.Instruction, g.ContentData, g.AssetsData, g.StartQuestion, g.EndQuestion,
                                g.Questions.OrderBy(q => q.QuestionNumber).Select(q => new QuestionDto(
                                    q.Id, q.QuestionNumber, q.Content, q.CorrectAnswer, q.Explanation, q.Points,
                                    q.QuestionOptions.OrderBy(o => o.OrderIndex).Select(o => new QuestionOptionDto(
                                        o.Id, o.OptionText, o.ImageUrl, o.IsCorrect, o.OrderIndex
                                    )).ToList()
                                )).ToList()
                            )).ToList()
                    )).ToList(),
                    s.ListeningParts.OrderBy(l => l.PartNumber).Select(l => new ListeningPartDto(
                        l.Id, l.PartNumber, l.AudioUrl, l.ContextDescription,
                        l.TranscriptData,
                        l.QuestionGroups
                            .OrderBy(g => g.StartQuestion ?? (g.Questions.Any() ? g.Questions.Min(q => q.QuestionNumber) : 0))
                            .Select(g => new QuestionGroupDto(
                                g.Id, g.GroupType, g.Instruction, g.ContentData, g.AssetsData, g.StartQuestion, g.EndQuestion,
                                g.Questions.OrderBy(q => q.QuestionNumber).Select(q => new QuestionDto(
                                    q.Id, q.QuestionNumber, q.Content, q.CorrectAnswer, q.Explanation, q.Points,
                                    q.QuestionOptions.OrderBy(o => o.OrderIndex).Select(o => new QuestionOptionDto(
                                        o.Id, o.OptionText, o.ImageUrl, o.IsCorrect, o.OrderIndex
                                    )).ToList()
                                )).ToList()
                            )).ToList()
                    )).ToList(),
                    s.WritingTasks.OrderBy(w => w.TaskNumber).Select(w => new WritingTaskDto(
                        w.Id, w.TaskNumber, w.PromptText, w.AssetsData, w.MinWords
                    )).ToList(),
                    s.SpeakingParts.OrderBy(sp => sp.PartNumber).Select(sp => new SpeakingPartDto(
                        sp.Id, sp.PartNumber, sp.Description,
                        sp.SpeakingQuestions.OrderBy(sq => sq.OrderIndex).Select(sq => new SpeakingQuestionDto(
                            sq.Id, sq.Content, sq.CueCardPoints, sq.AudioPromptUrl, sq.OrderIndex
                        )).ToList()
                    )).ToList()
                )).ToList()
            ))
            .FirstOrDefaultAsync(cancellationToken);

        return exam;
    }

    public async Task<PracticeExamDetailDto?> GetPublishedPracticeExamDetailAsync(Guid examId, CancellationToken cancellationToken = default)
    {
        return await context.Exams
            .AsNoTracking()
            .Where(e => e.IsPublished && e.Id == examId)
            .Select(e => new PracticeExamDetailDto(
                e.Id,
                e.Title,
                e.Description,
                e.DurationMinutes,
                e.TotalPoints,
                e.ExamType,
                e.CreatedAt,
                e.ExamSections
                    .Select(section => section.SkillType)
                    .Distinct()
                    .ToList(),
                e.ExamSections.Count(),
                e.ExamSections
                    .SelectMany(section => section.ReadingPassages)
                    .SelectMany(passage => passage.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count(),
                e.ExamSections
                    .SelectMany(section => section.ListeningParts)
                    .SelectMany(part => part.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count(),
                e.ExamSections
                    .SelectMany(section => section.WritingTasks)
                    .Count(),
                e.ExamSections
                    .SelectMany(section => section.SpeakingParts)
                    .Count(),
                e.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => new PracticeExamSectionSummaryDto(
                        section.Id,
                        section.SkillType,
                        section.Title,
                        section.OrderIndex,
                        section.ReadingPassages.Count(),
                        section.ListeningParts.Count(),
                        section.ReadingPassages.SelectMany(passage => passage.QuestionGroups).Count()
                            + section.ListeningParts.SelectMany(part => part.QuestionGroups).Count(),
                        section.ReadingPassages.SelectMany(passage => passage.QuestionGroups).SelectMany(group => group.Questions).Count()
                            + section.ListeningParts.SelectMany(part => part.QuestionGroups).SelectMany(group => group.Questions).Count(),
                        section.WritingTasks.Count(),
                        section.SpeakingParts.Count(),
                        section.SpeakingParts.SelectMany(part => part.SpeakingQuestions).Count()))
                    .ToList()))
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<Guid> CreateExamAsync(CreateExamDto dto, Guid createdBy, CancellationToken cancellationToken = default)
    {
        ValidateExamLimits(dto);
        var enrichedSections = await EnrichSectionsAsync(dto.Sections, cancellationToken);

        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var exam = new Exam
            {
                Id = Guid.NewGuid(),
                Title = dto.Title,
                Description = dto.Description,
                DurationMinutes = dto.DurationMinutes,
                TotalPoints = dto.TotalPoints,
                ExamType = dto.ExamType,
                IsPublished = dto.IsPublished,
                CreatedBy = createdBy,
                CreatedAt = DateTime.UtcNow
            };
            context.Exams.Add(exam);

            SaveSections(enrichedSections, exam.Id);

            await context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return exam.Id;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<bool> UpdateExamAsync(Guid examId, CreateExamDto dto, CancellationToken cancellationToken = default)
    {
        ValidateExamLimits(dto);
        var enrichedSections = await EnrichSectionsAsync(dto.Sections, cancellationToken);

        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var exam = await context.Exams
                .Include(e => e.ExamSections)
                    .ThenInclude(s => s.ReadingPassages)
                        .ThenInclude(p => p.QuestionGroups)
                            .ThenInclude(g => g.Questions)
                                .ThenInclude(q => q.QuestionOptions)
                .Include(e => e.ExamSections)
                    .ThenInclude(s => s.ListeningParts)
                        .ThenInclude(l => l.QuestionGroups)
                            .ThenInclude(g => g.Questions)
                                .ThenInclude(q => q.QuestionOptions)
                .Include(e => e.ExamSections)
                    .ThenInclude(s => s.WritingTasks)
                .Include(e => e.ExamSections)
                    .ThenInclude(s => s.SpeakingParts)
                        .ThenInclude(sp => sp.SpeakingQuestions)
                .Include(e => e.ExamSessions)
                    .ThenInclude(s => s.UserAnswers)
                        .ThenInclude(ua => ua.UserAudioRecords)
                .Include(e => e.ExamSessions)
                    .ThenInclude(s => s.UserAnswers)
                        .ThenInclude(ua => ua.AiFeedbacks)
                .FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);

            if (exam is null) return false;

            exam.Title = dto.Title;
            exam.Description = dto.Description;
            exam.DurationMinutes = dto.DurationMinutes;
            exam.TotalPoints = dto.TotalPoints;
            exam.ExamType = dto.ExamType;
            exam.IsPublished = dto.IsPublished;

            // Remove existing sessions and sections
            context.ExamSessions.RemoveRange(exam.ExamSessions);
            context.ExamSections.RemoveRange(exam.ExamSections);

            // Re-add sections
            SaveSections(enrichedSections, exam.Id);

            await context.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }

    private static void ValidateExamLimits(CreateExamDto dto)
    {
        foreach (var section in dto.Sections)
        {
            var skillType = (section.SkillType ?? string.Empty).Trim().ToUpperInvariant();

            if (skillType == "READING")
            {
                var passageCount = section.ReadingPassages?.Count ?? 0;
                var questionCount = section.ReadingPassages?
                    .SelectMany(passage => passage.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count() ?? 0;
                var maxQuestionNumber = section.ReadingPassages?
                    .SelectMany(passage => passage.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Select(question => question.QuestionNumber ?? 0)
                    .DefaultIfEmpty(0)
                    .Max() ?? 0;

                if (passageCount > MaxReadingPassages)
                {
                    throw new InvalidOperationException($"Reading chỉ được tối đa {MaxReadingPassages} passages.");
                }

                if (questionCount > MaxReadingQuestions || maxQuestionNumber > MaxReadingQuestions)
                {
                    throw new InvalidOperationException($"Reading chỉ được tối đa {MaxReadingQuestions} câu.");
                }
            }

            if (skillType == "LISTENING")
            {
                var partCount = section.ListeningParts?.Count ?? 0;
                var questionCount = section.ListeningParts?
                    .SelectMany(part => part.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count() ?? 0;
                var maxQuestionNumber = section.ListeningParts?
                    .SelectMany(part => part.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Select(question => question.QuestionNumber ?? 0)
                    .DefaultIfEmpty(0)
                    .Max() ?? 0;

                if (partCount > MaxListeningParts)
                {
                    throw new InvalidOperationException($"Listening chỉ được tối đa {MaxListeningParts} parts.");
                }

                if (questionCount > MaxListeningQuestions || maxQuestionNumber > MaxListeningQuestions)
                {
                    throw new InvalidOperationException($"Listening chỉ được tối đa {MaxListeningQuestions} câu.");
                }
            }

            if (skillType == "WRITING" && (section.WritingTasks?.Count ?? 0) > MaxWritingTasks)
            {
                throw new InvalidOperationException($"Writing chỉ được tối đa {MaxWritingTasks} tasks.");
            }

            if (skillType == "SPEAKING" && (section.SpeakingParts?.Count ?? 0) > MaxSpeakingParts)
            {
                throw new InvalidOperationException($"Speaking chỉ được tối đa {MaxSpeakingParts} parts.");
            }
        }
    }

    private async Task<List<CreateSectionDto>> EnrichSectionsAsync(
        List<CreateSectionDto> sections,
        CancellationToken cancellationToken)
    {
        var result = new List<CreateSectionDto>(sections.Count);

        foreach (var section in sections)
        {
            if (string.Equals(section.SkillType?.Trim(), "WRITING", StringComparison.OrdinalIgnoreCase)
                && section.WritingTasks is { Count: > 0 })
            {
                var enrichedTasks = new List<CreateWritingTaskDto>(section.WritingTasks.Count);
                foreach (var task in section.WritingTasks)
                {
                    var enrichedAssetsData = await EnsureWritingTaskAssetsDataAsync(
                        task.AssetsData,
                        task.PromptText,
                        cancellationToken);

                    enrichedTasks.Add(task with
                    {
                        AssetsData = enrichedAssetsData
                    });
                }

                result.Add(section with
                {
                    WritingTasks = enrichedTasks
                });
                continue;
            }

            result.Add(section);
        }

        return result;
    }

    private async Task<string?> EnsureWritingTaskAssetsDataAsync(
        string? assetsData,
        string? promptText,
        CancellationToken cancellationToken)
    {
        var imageUrl = ExtractWritingTaskImageUrl(assetsData);
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            return assetsData;
        }

        var existingHiddenDataText = ExtractWritingTaskHiddenDataText(assetsData);
        if (!string.IsNullOrWhiteSpace(existingHiddenDataText))
        {
            return SerializeWritingTaskAssetsData(imageUrl, existingHiddenDataText);
        }

        try
        {
            var extracted = await writingVisualExtractionService.ExtractAsync(
                new ExtractWritingVisualDataRequestDto(imageUrl, promptText),
                cancellationToken);

            if (string.IsNullOrWhiteSpace(extracted.HiddenDataText))
            {
                return SerializeWritingTaskAssetsData(imageUrl, null);
            }

            return SerializeWritingTaskAssetsData(imageUrl, extracted.HiddenDataText);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to enrich Writing Task image data in background for image {ImageUrl}. Saving exam without hidden data.", imageUrl);
            return SerializeWritingTaskAssetsData(imageUrl, existingHiddenDataText);
        }
    }

    private static string? ExtractWritingTaskImageUrl(string? assetsData)
    {
        if (string.IsNullOrWhiteSpace(assetsData))
        {
            return null;
        }

        var trimmed = assetsData.Trim();
        if (!trimmed.StartsWith('{') && !trimmed.StartsWith('['))
        {
            return trimmed;
        }

        try
        {
            using var document = JsonDocument.Parse(trimmed);
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var propertyName in new[] { "imageUrl", "url", "assetUrl", "src" })
                {
                    if (document.RootElement.TryGetProperty(propertyName, out var property)
                        && property.ValueKind == JsonValueKind.String)
                    {
                        return property.GetString()?.Trim();
                    }
                }
            }
        }
        catch
        {
            return trimmed;
        }

        return null;
    }

    private static string? ExtractWritingTaskHiddenDataText(string? assetsData)
    {
        if (string.IsNullOrWhiteSpace(assetsData))
        {
            return null;
        }

        var trimmed = assetsData.Trim();
        if (!trimmed.StartsWith('{') && !trimmed.StartsWith('['))
        {
            return null;
        }

        try
        {
            using var document = JsonDocument.Parse(trimmed);
            if (document.RootElement.ValueKind != JsonValueKind.Object)
            {
                return null;
            }

            foreach (var propertyName in new[] { "hiddenDataText", "hiddenData", "chartDataText", "chartData", "sourceDataText", "sourceData", "data" })
            {
                if (!document.RootElement.TryGetProperty(propertyName, out var property))
                {
                    continue;
                }

                return property.ValueKind == JsonValueKind.String
                    ? property.GetString()?.Trim()
                    : JsonSerializer.Serialize(property, new JsonSerializerOptions { WriteIndented = true });
            }
        }
        catch
        {
            return null;
        }

        return null;
    }

    private static string SerializeWritingTaskAssetsData(string? imageUrl, string? hiddenDataText)
    {
        var normalizedImageUrl = string.IsNullOrWhiteSpace(imageUrl) ? null : imageUrl.Trim();
        var normalizedHiddenDataText = string.IsNullOrWhiteSpace(hiddenDataText) ? null : hiddenDataText.Trim();

        if (string.IsNullOrWhiteSpace(normalizedImageUrl) && string.IsNullOrWhiteSpace(normalizedHiddenDataText))
        {
            return string.Empty;
        }

        if (!string.IsNullOrWhiteSpace(normalizedImageUrl) && string.IsNullOrWhiteSpace(normalizedHiddenDataText))
        {
            return normalizedImageUrl;
        }

        return JsonSerializer.Serialize(new
        {
            imageUrl = normalizedImageUrl,
            hiddenDataText = normalizedHiddenDataText
        });
    }

    private void SaveSections(List<CreateSectionDto> sections, Guid examId)
    {
        foreach (var sectionDto in sections)
        {
            var section = new ExamSection
            {
                Id = Guid.NewGuid(),
                ExamId = examId,
                SkillType = sectionDto.SkillType,
                Title = sectionDto.Title,
                OrderIndex = sectionDto.OrderIndex
            };
            context.ExamSections.Add(section);

            if (sectionDto.ReadingPassages is { Count: > 0 })
            {
                foreach (var pDto in sectionDto.ReadingPassages)
                {
                    var passage = new ReadingPassage
                    {
                        Id = Guid.NewGuid(),
                        SectionId = section.Id,
                        PassageNumber = pDto.PassageNumber,
                        Title = pDto.Title,
                        ParagraphsData = pDto.ParagraphsData,
                        AssetsData = pDto.AssetsData
                    };
                    context.ReadingPassages.Add(passage);
                    SaveQuestionGroups(pDto.QuestionGroups, passage.Id, null);
                }
            }

            if (sectionDto.ListeningParts is { Count: > 0 })
            {
                foreach (var lDto in sectionDto.ListeningParts)
                {
                    var part = new ListeningPart
                    {
                        Id = Guid.NewGuid(),
                        SectionId = section.Id,
                        PartNumber = lDto.PartNumber,
                        AudioUrl = lDto.AudioUrl,
                        ContextDescription = lDto.ContextDescription,
                        TranscriptData = lDto.TranscriptData
                    };
                    context.ListeningParts.Add(part);
                    SaveQuestionGroups(lDto.QuestionGroups, null, part.Id);
                }
            }

            if (sectionDto.WritingTasks is { Count: > 0 })
            {
                foreach (var wDto in sectionDto.WritingTasks)
                {
                    context.WritingTasks.Add(new WritingTask
                    {
                        Id = Guid.NewGuid(),
                        SectionId = section.Id,
                        TaskNumber = wDto.TaskNumber,
                        PromptText = wDto.PromptText,
                        AssetsData = wDto.AssetsData,
                        MinWords = wDto.MinWords
                    });
                }
            }

            if (sectionDto.SpeakingParts is { Count: > 0 })
            {
                foreach (var spDto in sectionDto.SpeakingParts)
                {
                    var part = new SpeakingPart
                    {
                        Id = Guid.NewGuid(),
                        SectionId = section.Id,
                        PartNumber = spDto.PartNumber,
                        Description = spDto.Description
                    };
                    context.SpeakingParts.Add(part);

                    foreach (var sqDto in spDto.Questions)
                    {
                        context.SpeakingQuestions.Add(new SpeakingQuestion
                        {
                            Id = Guid.NewGuid(),
                            PartId = part.Id,
                            Content = sqDto.Content,
                            CueCardPoints = sqDto.CueCardPoints,
                            AudioPromptUrl = sqDto.AudioPromptUrl,
                            OrderIndex = sqDto.OrderIndex
                        });
                    }
                }
            }
        }
    }

    private void SaveQuestionGroups(List<CreateQuestionGroupDto> groups, Guid? passageId, Guid? listeningPartId)
    {
        foreach (var gDto in groups)
        {
            var group = new QuestionGroup
            {
                Id = Guid.NewGuid(),
                PassageId = passageId,
                ListeningPartId = listeningPartId,
                GroupType = gDto.GroupType,
                Instruction = gDto.Instruction,
                ContentData = gDto.ContentData,
                AssetsData = gDto.AssetsData,
                StartQuestion = gDto.StartQuestion,
                EndQuestion = gDto.EndQuestion
            };
            context.QuestionGroups.Add(group);

            foreach (var qDto in gDto.Questions)
            {
                var question = new Question
                {
                    Id = Guid.NewGuid(),
                    GroupId = group.Id,
                    QuestionNumber = qDto.QuestionNumber,
                    Content = qDto.Content,
                    CorrectAnswer = qDto.CorrectAnswer,
                    Explanation = qDto.Explanation,
                    Points = qDto.Points
                };
                context.Questions.Add(question);

                foreach (var oDto in qDto.Options)
                {
                    context.QuestionOptions.Add(new QuestionOption
                    {
                        Id = Guid.NewGuid(),
                        QuestionId = question.Id,
                        OptionText = oDto.OptionText,
                        ImageUrl = oDto.ImageUrl,
                        IsCorrect = oDto.IsCorrect,
                        OrderIndex = oDto.OrderIndex
                    });
                }
            }
        }
    }
}
