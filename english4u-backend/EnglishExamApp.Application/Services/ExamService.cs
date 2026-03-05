using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.Application.Services;

public class ExamService(IApplicationDbContext context) : IExamService
{
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

    public async Task<bool> DeleteAsync(Guid examId, CancellationToken cancellationToken = default)
    {
        var exam = await context.Exams.FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);
        if (exam is null) return false;
        context.Exams.Remove(exam);
        await context.SaveChangesAsync(cancellationToken);
        return true;
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
                                        o.Id, o.OptionText, o.IsCorrect, o.OrderIndex
                                    )).ToList()
                                )).ToList()
                            )).ToList()
                    )).ToList(),
                    s.ListeningParts.OrderBy(l => l.PartNumber).Select(l => new ListeningPartDto(
                        l.Id, l.PartNumber, l.AudioUrl, l.ContextDescription,
                        l.QuestionGroups
                            .OrderBy(g => g.StartQuestion ?? (g.Questions.Any() ? g.Questions.Min(q => q.QuestionNumber) : 0))
                            .Select(g => new QuestionGroupDto(
                                g.Id, g.GroupType, g.Instruction, g.ContentData, g.AssetsData, g.StartQuestion, g.EndQuestion,
                                g.Questions.OrderBy(q => q.QuestionNumber).Select(q => new QuestionDto(
                                    q.Id, q.QuestionNumber, q.Content, q.CorrectAnswer, q.Explanation, q.Points,
                                    q.QuestionOptions.OrderBy(o => o.OrderIndex).Select(o => new QuestionOptionDto(
                                        o.Id, o.OptionText, o.IsCorrect, o.OrderIndex
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

    public async Task<Guid> CreateExamAsync(CreateExamDto dto, Guid createdBy, CancellationToken cancellationToken = default)
    {
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

            SaveSections(dto.Sections, exam.Id);

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
        await using var transaction = await context.Database.BeginTransactionAsync(cancellationToken);

        try
        {
            var exam = await context.Exams
                .Include(e => e.ExamSections)
                .FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);

            if (exam is null) return false;

            exam.Title = dto.Title;
            exam.Description = dto.Description;
            exam.DurationMinutes = dto.DurationMinutes;
            exam.TotalPoints = dto.TotalPoints;
            exam.ExamType = dto.ExamType;
            exam.IsPublished = dto.IsPublished;

            // Remove existing sections
            context.ExamSections.RemoveRange(exam.ExamSections);

            // Re-add sections
            SaveSections(dto.Sections, exam.Id);

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
                        ContextDescription = lDto.ContextDescription
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
                        IsCorrect = oDto.IsCorrect,
                        OrderIndex = oDto.OrderIndex
                    });
                }
            }
        }
    }
}
