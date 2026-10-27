using EnglishExamApp.Application.DTOs.Common;
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
    private const int RequiredReadingQuestions = 40;
    private const int MaxListeningParts = 4;
    private const int RequiredListeningQuestions = 40;
    private const int RequiredWritingTasks = 2;
    private const int MinSpeakingParts = 2;
    private const int MaxSpeakingParts = 3;

    public async Task<List<ExamListItemDto>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var exams = await context.Exams
            .AsNoTracking()
            .OrderByDescending(e => e.CreatedAt)
            .Include(e => e.ExamSections)
            .ToListAsync(cancellationToken);

        return exams.Select(e => new ExamListItemDto(
            e.Id, e.Title, e.Description, e.DurationMinutes,
            e.TotalPoints, e.ExamType, e.IsPublished, e.CreatedBy, e.CreatedAt,
            e.ExamSections.OrderBy(s => s.OrderIndex).Select(s => s.SkillType).ToList()))
        .ToList();
    }

    public async Task<PagedResult<ExamListItemDto>> GetPagedExamsAsync(ExamPagedRequest request, CancellationToken cancellationToken = default)
    {
        var pageNumber = request.PageNumber <= 0 ? 1 : request.PageNumber;
        var pageSize = request.PageSize <= 0 ? 10 : Math.Min(request.PageSize, 100);

        var query = context.Exams
            .AsNoTracking()
            .Include(e => e.ExamSections)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var search = request.SearchTerm.Trim().ToLower();
            query = query.Where(e => e.Title.ToLower().Contains(search) || (e.Description != null && e.Description.ToLower().Contains(search)));
        }

        if (!string.IsNullOrWhiteSpace(request.ExamType) && !request.ExamType.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            query = query.Where(e => e.ExamType == request.ExamType);
        }

        if (request.IsPublished.HasValue)
        {
            query = query.Where(e => e.IsPublished == request.IsPublished.Value);
        }

        if (!string.IsNullOrWhiteSpace(request.Skill) && !request.Skill.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var skill = request.Skill.Trim().ToUpper();
            query = query.Where(e => e.ExamSections.Any(s => s.SkillType.ToUpper() == skill));
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var exams = await query
            .OrderByDescending(e => e.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = exams.Select(e => new ExamListItemDto(
            e.Id, e.Title, e.Description, e.DurationMinutes,
            e.TotalPoints, e.ExamType, e.IsPublished, e.CreatedBy, e.CreatedAt,
            e.ExamSections.OrderBy(s => s.OrderIndex).Select(s => s.SkillType).ToList()))
        .ToList();

        return new PagedResult<ExamListItemDto>(items, totalCount, pageNumber, pageSize);
    }

    public async Task<List<PracticeExamListItemDto>> GetPublishedPracticeExamsAsync(CancellationToken cancellationToken = default)
    {
        var exams = await context.Exams
            .AsNoTracking()
            .Where(e => e.IsPublished)
            .OrderByDescending(e => e.CreatedAt)
            .Include(e => e.ExamSections)
            .ToListAsync(cancellationToken);

        if (exams.Count == 0)
        {
            return [];
        }

        var examIds = exams.Select(e => e.Id).ToList();

        var readingCounts = await context.Questions
            .AsNoTracking()
            .Where(q => q.Group.Passage != null && examIds.Contains(q.Group.Passage.Section.ExamId))
            .GroupBy(q => q.Group.Passage!.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        var listeningCounts = await context.Questions
            .AsNoTracking()
            .Where(q => q.Group.ListeningPart != null && examIds.Contains(q.Group.ListeningPart.Section.ExamId))
            .GroupBy(q => q.Group.ListeningPart!.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        var writingCounts = await context.WritingTasks
            .AsNoTracking()
            .Where(w => examIds.Contains(w.Section.ExamId))
            .GroupBy(w => w.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        var speakingPartCounts = await context.SpeakingParts
            .AsNoTracking()
            .Where(s => examIds.Contains(s.Section.ExamId))
            .GroupBy(s => s.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        return exams.Select(e => new PracticeExamListItemDto(
            e.Id,
            e.Title,
            e.Description,
            e.DurationMinutes,
            e.ExamType,
            e.CreatedAt,
            e.ExamSections
                .OrderBy(section => section.OrderIndex)
                .Select(section => section.SkillType)
                .Distinct()
                .ToList(),
            e.ExamSections.Count,
            readingCounts.GetValueOrDefault(e.Id, 0),
            listeningCounts.GetValueOrDefault(e.Id, 0),
            writingCounts.GetValueOrDefault(e.Id, 0),
            speakingPartCounts.GetValueOrDefault(e.Id, 0)
        )).ToList();
    }

    public async Task<PagedResult<PracticeExamListItemDto>> GetPagedPublishedPracticeExamsAsync(PracticeExamPagedRequest request, CancellationToken cancellationToken = default)
    {
        var pageNumber = request.PageNumber <= 0 ? 1 : request.PageNumber;
        var pageSize = request.PageSize <= 0 ? 9 : Math.Min(request.PageSize, 50);

        var query = context.Exams
            .AsNoTracking()
            .Where(e => e.IsPublished)
            .Include(e => e.ExamSections)
            .AsQueryable();

        if (!string.IsNullOrWhiteSpace(request.Search))
        {
            var search = request.Search.Trim().ToLower();
            query = query.Where(e => e.Title.ToLower().Contains(search) || (e.Description != null && e.Description.ToLower().Contains(search)));
        }

        if (!string.IsNullOrWhiteSpace(request.ExamType) && !request.ExamType.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var type = request.ExamType.Trim().ToLower();
            query = query.Where(e => e.ExamType != null && e.ExamType.ToLower() == type);
        }

        if (!string.IsNullOrWhiteSpace(request.Skill) && !request.Skill.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var skill = request.Skill.Trim().ToUpper();
            query = query.Where(e => e.ExamSections.Any(s => s.SkillType.ToUpper() == skill));
        }

        var totalCount = await query.CountAsync(cancellationToken);
        if (totalCount == 0)
        {
            return new PagedResult<PracticeExamListItemDto>([], 0, pageNumber, pageSize);
        }

        var exams = await query
            .OrderByDescending(e => e.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var examIds = exams.Select(e => e.Id).ToList();

        var readingCounts = await context.Questions
            .AsNoTracking()
            .Where(q => q.Group.Passage != null && examIds.Contains(q.Group.Passage.Section.ExamId))
            .GroupBy(q => q.Group.Passage!.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        var listeningCounts = await context.Questions
            .AsNoTracking()
            .Where(q => q.Group.ListeningPart != null && examIds.Contains(q.Group.ListeningPart.Section.ExamId))
            .GroupBy(q => q.Group.ListeningPart!.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        var writingCounts = await context.WritingTasks
            .AsNoTracking()
            .Where(w => examIds.Contains(w.Section.ExamId))
            .GroupBy(w => w.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        var speakingPartCounts = await context.SpeakingParts
            .AsNoTracking()
            .Where(s => examIds.Contains(s.Section.ExamId))
            .GroupBy(s => s.Section.ExamId)
            .Select(g => new { ExamId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.ExamId, x => x.Count, cancellationToken);

        var items = exams.Select(e => new PracticeExamListItemDto(
            e.Id,
            e.Title,
            e.Description,
            e.DurationMinutes,
            e.ExamType,
            e.CreatedAt,
            e.ExamSections
                .OrderBy(section => section.OrderIndex)
                .Select(section => section.SkillType)
                .Distinct()
                .ToList(),
            e.ExamSections.Count,
            readingCounts.GetValueOrDefault(e.Id, 0),
            listeningCounts.GetValueOrDefault(e.Id, 0),
            writingCounts.GetValueOrDefault(e.Id, 0),
            speakingPartCounts.GetValueOrDefault(e.Id, 0)
        )).ToList();

        return new PagedResult<PracticeExamListItemDto>(items, totalCount, pageNumber, pageSize);
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
                                g.OptionLabelType,
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
                                g.OptionLabelType,
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
        var exam = await context.Exams
            .AsNoTracking()
            .Where(e => e.IsPublished && e.Id == examId)
            .Include(e => e.ExamSections)
                .ThenInclude(s => s.ReadingPassages)
                    .ThenInclude(p => p.QuestionGroups)
                        .ThenInclude(g => g.Questions)
            .Include(e => e.ExamSections)
                .ThenInclude(s => s.ListeningParts)
                    .ThenInclude(l => l.QuestionGroups)
                        .ThenInclude(g => g.Questions)
            .Include(e => e.ExamSections)
                .ThenInclude(s => s.WritingTasks)
            .Include(e => e.ExamSections)
                .ThenInclude(s => s.SpeakingParts)
                    .ThenInclude(sp => sp.SpeakingQuestions)
            .AsSplitQuery()
            .FirstOrDefaultAsync(cancellationToken);

        if (exam == null)
        {
            return null;
        }

        var readingQuestionCount = exam.ExamSections
            .SelectMany(section => section.ReadingPassages)
            .SelectMany(passage => passage.QuestionGroups)
            .SelectMany(group => group.Questions)
            .Count();

        var listeningQuestionCount = exam.ExamSections
            .SelectMany(section => section.ListeningParts)
            .SelectMany(part => part.QuestionGroups)
            .SelectMany(group => group.Questions)
            .Count();

        var writingTaskCount = exam.ExamSections
            .SelectMany(section => section.WritingTasks)
            .Count();

        var speakingPartCount = exam.ExamSections
            .SelectMany(section => section.SpeakingParts)
            .Count();

        var sections = exam.ExamSections
            .OrderBy(section => section.OrderIndex)
            .Select(section => new PracticeExamSectionSummaryDto(
                section.Id,
                section.SkillType,
                section.Title,
                section.OrderIndex,
                section.ReadingPassages.Count,
                section.ListeningParts.Count,
                section.ReadingPassages.Sum(passage => passage.QuestionGroups.Count)
                    + section.ListeningParts.Sum(part => part.QuestionGroups.Count),
                section.ReadingPassages.Sum(passage => passage.QuestionGroups.Sum(group => group.Questions.Count))
                    + section.ListeningParts.Sum(part => part.QuestionGroups.Sum(group => group.Questions.Count)),
                section.WritingTasks.Count,
                section.SpeakingParts.Count,
                section.SpeakingParts.Sum(part => part.SpeakingQuestions.Count)))
            .ToList();

        return new PracticeExamDetailDto(
            exam.Id,
            exam.Title,
            exam.Description,
            exam.DurationMinutes,
            exam.TotalPoints,
            exam.ExamType,
            exam.CreatedAt,
            exam.ExamSections
                .OrderBy(section => section.OrderIndex)
                .Select(section => section.SkillType)
                .Distinct()
                .ToList(),
            exam.ExamSections.Count,
            readingQuestionCount,
            listeningQuestionCount,
            writingTaskCount,
            speakingPartCount,
            sections);
    }

    public async Task<Guid> CreateExamAsync(CreateExamDto dto, Guid createdBy, CancellationToken cancellationToken = default)
    {
        ValidateExamLimits(dto);
        var enrichedSections = await EnrichSectionsAsync(dto.Sections, cancellationToken);
        var objectiveQuestionCount = CalculateObjectiveQuestionCount(enrichedSections);

        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var exam = new Exam
            {
                Id = Guid.NewGuid(),
                Title = dto.Title,
                Description = dto.Description,
                DurationMinutes = dto.DurationMinutes,
                TotalPoints = objectiveQuestionCount,
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
        var objectiveQuestionCount = CalculateObjectiveQuestionCount(enrichedSections);

        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var exam = await context.Exams
                .AsSplitQuery()
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
                .FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);

            if (exam is null) return false;

            exam.Title = dto.Title;
            exam.Description = dto.Description;
            exam.DurationMinutes = dto.DurationMinutes;
            exam.TotalPoints = objectiveQuestionCount;
            exam.ExamType = dto.ExamType;
            exam.IsPublished = dto.IsPublished;

            var hasSessions = await context.ExamSessions
                .AsNoTracking()
                .AnyAsync(s => s.ExamId == examId, cancellationToken);

            if (!hasSessions)
            {
                context.ExamSections.RemoveRange(exam.ExamSections);
                SaveSections(enrichedSections, exam.Id);
            }
            else
            {
                UpdateExistingSectionsInPlace(exam.ExamSections.ToList(), enrichedSections);
            }

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

                if (questionCount != RequiredReadingQuestions)
                {
                    throw new InvalidOperationException($"Reading phải có đúng {RequiredReadingQuestions} câu (hiện có {questionCount}).");
                }

                if (maxQuestionNumber > RequiredReadingQuestions)
                {
                    throw new InvalidOperationException($"Reading không được đánh số quá câu {RequiredReadingQuestions}.");
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

                if (questionCount != RequiredListeningQuestions)
                {
                    throw new InvalidOperationException($"Listening phải có đúng {RequiredListeningQuestions} câu (hiện có {questionCount}).");
                }

                if (maxQuestionNumber > RequiredListeningQuestions)
                {
                    throw new InvalidOperationException($"Listening không được đánh số quá câu {RequiredListeningQuestions}.");
                }
            }

            if (skillType == "WRITING" && (section.WritingTasks?.Count ?? 0) != RequiredWritingTasks)
            {
                throw new InvalidOperationException($"Writing phải có đúng {RequiredWritingTasks} parts/tasks.");
            }

            if (skillType == "SPEAKING")
            {
                var partCount = section.SpeakingParts?.Count ?? 0;
                if (partCount < MinSpeakingParts || partCount > MaxSpeakingParts)
                {
                    throw new InvalidOperationException($"Speaking phải có từ {MinSpeakingParts} đến {MaxSpeakingParts} parts.");
                }
            }
        }
    }

    private static int CalculateObjectiveQuestionCount(IEnumerable<CreateSectionDto> sections)
    {
        return sections.Sum(section =>
        {
            var skillType = (section.SkillType ?? string.Empty).Trim().ToUpperInvariant();

            if (skillType == "READING")
            {
                return section.ReadingPassages?
                    .SelectMany(passage => passage.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count() ?? 0;
            }

            if (skillType == "LISTENING")
            {
                return section.ListeningParts?
                    .SelectMany(part => part.QuestionGroups)
                    .SelectMany(group => group.Questions)
                    .Count() ?? 0;
            }

            return 0;
        });
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
                EndQuestion = gDto.EndQuestion,
                OptionLabelType = gDto.OptionLabelType
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
                    Points = 1
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

    private static void UpdateExistingSectionsInPlace(List<ExamSection> existingSections, List<CreateSectionDto> newSections)
    {
        foreach (var newSection in newSections)
        {
            var existingSection = existingSections.FirstOrDefault(s =>
                string.Equals(s.SkillType, newSection.SkillType, StringComparison.OrdinalIgnoreCase));

            if (existingSection is null) continue;

            existingSection.Title = newSection.Title;
            existingSection.OrderIndex = newSection.OrderIndex;

            // Reading
            if (newSection.ReadingPassages is { Count: > 0 } && existingSection.ReadingPassages is { Count: > 0 })
            {
                foreach (var newPassage in newSection.ReadingPassages)
                {
                    var existingPassage = existingSection.ReadingPassages.FirstOrDefault(p => p.PassageNumber == newPassage.PassageNumber);
                    if (existingPassage is null) continue;

                    existingPassage.Title = newPassage.Title;
                    existingPassage.ParagraphsData = newPassage.ParagraphsData;
                    existingPassage.AssetsData = newPassage.AssetsData;

                    UpdateQuestionGroupsInPlace(existingPassage.QuestionGroups.ToList(), newPassage.QuestionGroups);
                }
            }

            // Listening
            if (newSection.ListeningParts is { Count: > 0 } && existingSection.ListeningParts is { Count: > 0 })
            {
                foreach (var newPart in newSection.ListeningParts)
                {
                    var existingPart = existingSection.ListeningParts.FirstOrDefault(p => p.PartNumber == newPart.PartNumber);
                    if (existingPart is null) continue;

                    existingPart.AudioUrl = newPart.AudioUrl;
                    existingPart.ContextDescription = newPart.ContextDescription;
                    existingPart.TranscriptData = newPart.TranscriptData;

                    UpdateQuestionGroupsInPlace(existingPart.QuestionGroups.ToList(), newPart.QuestionGroups);
                }
            }

            // Writing
            if (newSection.WritingTasks is { Count: > 0 } && existingSection.WritingTasks is { Count: > 0 })
            {
                foreach (var newTask in newSection.WritingTasks)
                {
                    var existingTask = existingSection.WritingTasks.FirstOrDefault(t => t.TaskNumber == newTask.TaskNumber);
                    if (existingTask is null) continue;

                    existingTask.PromptText = newTask.PromptText;
                    existingTask.AssetsData = newTask.AssetsData;
                    existingTask.MinWords = newTask.MinWords;
                }
            }

            // Speaking
            if (newSection.SpeakingParts is { Count: > 0 } && existingSection.SpeakingParts is { Count: > 0 })
            {
                foreach (var newPart in newSection.SpeakingParts)
                {
                    var existingPart = existingSection.SpeakingParts.FirstOrDefault(p => p.PartNumber == newPart.PartNumber);
                    if (existingPart is null) continue;

                    existingPart.Description = newPart.Description;

                    if (newPart.Questions is { Count: > 0 } && existingPart.SpeakingQuestions is { Count: > 0 })
                    {
                        var existingQuestionsList = existingPart.SpeakingQuestions.OrderBy(q => q.OrderIndex).ToList();
                        for (var i = 0; i < Math.Min(existingQuestionsList.Count, newPart.Questions.Count); i++)
                        {
                            var existingQ = existingQuestionsList[i];
                            var newQ = newPart.Questions[i];
                            existingQ.Content = newQ.Content;
                            existingQ.CueCardPoints = newQ.CueCardPoints;
                            existingQ.AudioPromptUrl = newQ.AudioPromptUrl;
                            existingQ.OrderIndex = newQ.OrderIndex;
                        }
                    }
                }
            }
        }
    }

    private static void UpdateQuestionGroupsInPlace(List<QuestionGroup> existingGroups, List<CreateQuestionGroupDto> newGroups)
    {
        var existingQuestionsByNumber = existingGroups
            .SelectMany(g => g.Questions)
            .Where(q => q.QuestionNumber.HasValue)
            .ToDictionary(q => q.QuestionNumber!.Value);

        foreach (var newGroup in newGroups)
        {
            foreach (var newQ in newGroup.Questions)
            {
                if (newQ.QuestionNumber.HasValue && existingQuestionsByNumber.TryGetValue(newQ.QuestionNumber.Value, out var existingQ))
                {
                    existingQ.Content = newQ.Content;
                    existingQ.CorrectAnswer = newQ.CorrectAnswer;
                    existingQ.Explanation = newQ.Explanation;
                    existingQ.Points = 1;

                    if (newQ.Options is { Count: > 0 } && existingQ.QuestionOptions is { Count: > 0 })
                    {
                        var existingOptionsList = existingQ.QuestionOptions.OrderBy(o => o.OrderIndex).ToList();
                        for (var j = 0; j < Math.Min(existingOptionsList.Count, newQ.Options.Count); j++)
                        {
                            existingOptionsList[j].OptionText = newQ.Options[j].OptionText;
                            existingOptionsList[j].ImageUrl = newQ.Options[j].ImageUrl;
                            existingOptionsList[j].IsCorrect = newQ.Options[j].IsCorrect;
                            existingOptionsList[j].OrderIndex = newQ.Options[j].OrderIndex;
                        }
                    }
                }
            }
        }
    }
}
