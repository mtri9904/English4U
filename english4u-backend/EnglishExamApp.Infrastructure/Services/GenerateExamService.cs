using System.Text.Json;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class GenerateExamService(
    HttpClient httpClient,
    IApplicationDbContext context,
    ILogger<GenerateExamService> logger) : IGenerateExamService
{
    public async Task<Guid> ProcessPdfFileAsync(IFormFile file, Guid userId, CancellationToken cancellationToken = default)
    {
        var upload = new DocumentUpload
        {
            Id = Guid.NewGuid(),
            UploadedBy = userId,
            FileName = file.FileName,
            FileUrl = $"uploads/{file.FileName}",
            ProcessStatus = "Processing",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        context.DocumentUploads.Add(upload);
        await context.SaveChangesAsync(cancellationToken);

        try
        {
            using var formContent = new MultipartFormDataContent();
            var streamContent = new StreamContent(file.OpenReadStream());
            streamContent.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/pdf");
            formContent.Add(streamContent, "file", "document.pdf");

            logger.LogInformation("Sending PDF {FileName} to AI service (streaming)...", file.FileName);

            using var response = await httpClient.SendAsync(
                new HttpRequestMessage(HttpMethod.Post, "/api/ai/generate-exam-from-pdf") { Content = formContent },
                HttpCompletionOption.ResponseHeadersRead,
                cancellationToken);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync(cancellationToken);
                throw new InvalidOperationException($"AI Service error ({response.StatusCode}): {errorContent}");
            }

            var examId = await ProcessStreamAsync(response, userId, cancellationToken);

            upload.ProcessStatus = "Completed";
            upload.GeneratedExamId = examId;
            upload.UpdatedAt = DateTime.UtcNow;
            await context.SaveChangesAsync(cancellationToken);

            logger.LogInformation("Successfully generated exam {ExamId} from PDF {FileName}", examId, file.FileName);
            return examId;
        }
        catch (Exception ex)
        {
            upload.ProcessStatus = "Failed";
            upload.ErrorMessage = ex.Message;
            upload.UpdatedAt = DateTime.UtcNow;
            await context.SaveChangesAsync(cancellationToken);

            logger.LogError(ex, "Failed to generate exam from PDF {FileName}", file.FileName);
            throw;
        }
    }

    private async Task<Guid> ProcessStreamAsync(HttpResponseMessage response, Guid userId, CancellationToken ct)
    {
        await using var stream = await response.Content.ReadAsStreamAsync(ct);
        using var reader = new StreamReader(stream);

        Exam? exam = null;
        ExamSection? section = null;
        double totalPoints = 0;
        var passageIndex = 0;

        while (await reader.ReadLineAsync(ct) is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;

            using var doc = JsonDocument.Parse(line);
            var type = doc.RootElement.GetProperty("type").GetString();

            if (type == "metadata")
            {
                var data = doc.RootElement.GetProperty("data");
                exam = new Exam
                {
                    Id = Guid.NewGuid(),
                    Title = data.GetProperty("title").GetString() ?? "Generated Exam",
                    Description = data.TryGetProperty("description", out var desc) ? desc.GetString() : null,
                    DurationMinutes = data.TryGetProperty("durationMinutes", out var dur) ? dur.GetInt32() : 60,
                    ExamType = data.TryGetProperty("examType", out var et) ? et.GetString() : "IELTS",
                    IsPublished = false,
                    CreatedBy = userId,
                    CreatedAt = DateTime.UtcNow
                };

                section = new ExamSection
                {
                    Id = Guid.NewGuid(),
                    ExamId = exam.Id,
                    SkillType = "Reading",
                    Title = "Reading Section",
                    OrderIndex = 0
                };

                context.Exams.Add(exam);
                context.ExamSections.Add(section);
                await context.SaveChangesAsync(ct);

                logger.LogInformation("Exam created: {ExamTitle} ({ExamId})", exam.Title, exam.Id);
            }
            else if (type == "passage" && section is not null)
            {
                var data = doc.RootElement.GetProperty("data");
                passageIndex++;

                var passage = new ReadingPassage
                {
                    Id = Guid.NewGuid(),
                    SectionId = section.Id,
                    PassageNumber = passageIndex,
                    Title = data.TryGetProperty("title", out var t) ? t.GetString() : null,
                    ParagraphsData = data.TryGetProperty("content", out var c) ? c.GetString() : null,
                };
                context.ReadingPassages.Add(passage);

                if (data.TryGetProperty("questions", out var questions))
                {
                    var groupType = "MCQ";
                    var questionNumber = 0;

                    var group = new QuestionGroup
                    {
                        Id = Guid.NewGuid(),
                        PassageId = passage.Id,
                        GroupType = groupType,
                    };
                    context.QuestionGroups.Add(group);

                    foreach (var qEl in questions.EnumerateArray())
                    {
                        questionNumber++;
                        var points = qEl.TryGetProperty("points", out var pts) ? pts.GetDouble() : 1.0;
                        totalPoints += points;

                        var qType = qEl.TryGetProperty("questionType", out var qt) ? qt.GetString() ?? "MCQ" : "MCQ";
                        if (questionNumber == 1) group.GroupType = qType;

                        var question = new Question
                        {
                            Id = Guid.NewGuid(),
                            GroupId = group.Id,
                            QuestionNumber = questionNumber,
                            Content = qEl.TryGetProperty("content", out var qc) ? qc.GetString() ?? "" : "",
                            CorrectAnswer = qEl.TryGetProperty("correctAnswer", out var ca) ? ca.GetString() : null,
                            Explanation = qEl.TryGetProperty("explanation", out var expl) ? expl.GetString() : null,
                            Points = points,
                        };
                        context.Questions.Add(question);

                        if (qEl.TryGetProperty("options", out var options))
                        {
                            var optIdx = 0;
                            foreach (var opt in options.EnumerateArray())
                            {
                                var optText = opt.TryGetProperty("optionText", out var ot) ? ot.GetString()
                                    : opt.TryGetProperty("option_text", out var ot2) ? ot2.GetString()
                                    : opt.TryGetProperty("text", out var ot3) ? ot3.GetString()
                                    : "";

                                context.QuestionOptions.Add(new QuestionOption
                                {
                                    Id = Guid.NewGuid(),
                                    QuestionId = question.Id,
                                    OptionText = optText ?? "",
                                    IsCorrect = opt.TryGetProperty("isCorrect", out var ic) && ic.GetBoolean(),
                                    OrderIndex = optIdx++
                                });
                            }
                        }
                    }

                    group.StartQuestion = 1;
                    group.EndQuestion = questionNumber;
                }

                await context.SaveChangesAsync(ct);
                logger.LogInformation("Passage {Index} saved ({PassageId})", passageIndex, passage.Id);
            }
            else if (type == "error")
            {
                var msg = doc.RootElement.TryGetProperty("message", out var m) ? m.GetString() : "Unknown AI error";
                throw new InvalidOperationException($"AI stream error: {msg}");
            }
            else if (type == "done" && exam is not null)
            {
                exam.TotalPoints = totalPoints;
                await context.SaveChangesAsync(ct);
                logger.LogInformation("Stream completed. Total points: {TotalPoints}", totalPoints);
            }
        }

        if (exam is null)
            throw new InvalidOperationException("AI returned no metadata event.");

        return exam.Id;
    }
}
