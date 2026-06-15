using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Realtime;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class GeminiExamAiGenerationService(
    IGemmaCompletionClient gemmaCompletionClient,
    IAiIntegrationService aiIntegrationService,
    IApplicationDbContext context,
    IExamService examService,
    IPdfGenerationProgressTracker pdfGenerationProgressTracker,
    IRealtimeEventPublisher realtimeEventPublisher,
    IPdfTextExtractionService pdfTextExtractionService,
    IConfiguration configuration,
    ILogger<GeminiExamAiGenerationService> logger) : IExamAiGenerationService
{
    private const string PdfGenerationProgressEventType = "exam.pdf-generation.progress";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private sealed record QuestionGroupBlueprint(string GroupType, int QuestionCount);
    private sealed record PassageBlueprint(int PassageNumber, List<QuestionGroupBlueprint> Groups);
    private sealed record ExamBlueprint(string Name, PassageBlueprint P1, PassageBlueprint P2, PassageBlueprint P3);

    private static readonly List<ExamBlueprint> Blueprints =
    [
        new ExamBlueprint("Classic Academic Layout",
            new PassageBlueprint(1, [
                new QuestionGroupBlueprint("TFNG", 7),
                new QuestionGroupBlueprint("SENTENCE_COMPLETION", 6)
            ]),
            new PassageBlueprint(2, [
                new QuestionGroupBlueprint("MATCHING_HEADINGS", 7),
                new QuestionGroupBlueprint("SUMMARY_COMPLETION", 6)
            ]),
            new PassageBlueprint(3, [
                new QuestionGroupBlueprint("MCQ_SINGLE", 7),
                new QuestionGroupBlueprint("MATCHING_INFO", 7)
            ])
        ),
        new ExamBlueprint("Visual & Classification Layout",
            new PassageBlueprint(1, [
                new QuestionGroupBlueprint("TABLE_COMPLETION", 6),
                new QuestionGroupBlueprint("YNNG", 7)
            ]),
            new PassageBlueprint(2, [
                new QuestionGroupBlueprint("MATCHING_FEATURES", 6),
                new QuestionGroupBlueprint("SENTENCE_COMPLETION", 7)
            ]),
            new PassageBlueprint(3, [
                new QuestionGroupBlueprint("MCQ_SINGLE", 7),
                new QuestionGroupBlueprint("SUMMARY_COMPLETION", 7)
            ])
        ),
        new ExamBlueprint("Mixed Variety Layout",
            new PassageBlueprint(1, [
                new QuestionGroupBlueprint("FLOWCHART_COMPLETION", 6),
                new QuestionGroupBlueprint("TFNG", 7)
            ]),
            new PassageBlueprint(2, [
                new QuestionGroupBlueprint("MATCHING_INFO", 6),
                new QuestionGroupBlueprint("SENTENCE_COMPLETION", 7)
            ]),
            new PassageBlueprint(3, [
                new QuestionGroupBlueprint("MCQ_SINGLE", 7),
                new QuestionGroupBlueprint("MATCHING_FEATURES", 7)
            ])
        )
    ];

    private static readonly string[] RandomAcademicTopics =
    [
        "The History of Archaeology and Excavation Techniques",
        "Deep-sea Exploration and Marine Bioluminescence",
        "The Evolution of Human Language and Phonetics",
        "Psychological Behaviorism and Cognitive Development",
        "The Impact of Artificial Intelligence on Modern Education",
        "Sustainable Agriculture and Crop Rotation in Semi-arid Zones",
        "The Architectural Marvels of Ancient Civilizations",
        "Genetics and the Domestication of Flora and Fauna",
        "The Physics of Renewable Energy Systems",
        "Glaciology and the Reconstruction of Prehistoric Climates"
    ];

    public async Task<GenerateExamFromPdfResultDto> GenerateExamAiAsync(
        Stream? fileStream,
        string? fileName,
        ExamAiGenerationRequestDto request,
        Guid createdBy,
        string? clientRequestId = null,
        Guid? uploadId = null,
        CancellationToken cancellationToken = default)
    {
        var generationUploadId = uploadId ?? Guid.NewGuid();
        var virtualFileName = fileName ?? (request.InputMode == "topic"
            ? $"AI-Exam-{request.TopicDescription?.Replace(" ", "-")}.pdf"
            : "AI-Exam-Random-Topic.pdf");

        var documentUpload = new DocumentUpload
        {
            Id = generationUploadId,
            UploadedBy = createdBy,
            FileName = virtualFileName,
            FileUrl = BuildVirtualPdfUrl(virtualFileName),
            ProcessStatus = "Processing",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        context.DocumentUploads.Add(documentUpload);
        await context.SaveChangesAsync(cancellationToken);

        int currentProgress = 2;
        await PublishProgressAsync(
            documentUpload.Id,
            createdBy,
            status: "processing",
            progressPercent: currentProgress,
            stage: "queued",
            message: "Khởi chạy tiến trình sinh đề thi IELTS IELTS Generator.",
            clientRequestId: clientRequestId,
            cancellationToken: cancellationToken);

        try
        {
            string sourceText = string.Empty;
            if (request.InputMode == "document")
            {
                if (fileStream is null)
                {
                    throw new ArgumentException("File stream is required for document mode.");
                }

                currentProgress = 10;
                await PublishProgressAsync(
                    documentUpload.Id,
                    createdBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "extract_text",
                    message: "Đang trích xuất nội dung văn bản từ tài liệu tải lên.",
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                if (virtualFileName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
                {
                    var extractionResult = await pdfTextExtractionService.ExtractAsync(fileStream, virtualFileName, cancellationToken);
                    sourceText = extractionResult.RawText;
                }
                else
                {
                    using var reader = new StreamReader(fileStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, leaveOpen: true);
                    sourceText = await reader.ReadToEndAsync(cancellationToken);
                }

                if (string.IsNullOrWhiteSpace(sourceText))
                {
                    throw new InvalidOperationException("Could not extract any text from the uploaded document.");
                }
            }

            var random = new Random();
            var blueprint = Blueprints[random.Next(Blueprints.Count)];
            logger.LogInformation("Selected blueprint: {BlueprintName} for AI generation", blueprint.Name);

            var passages = new List<GeneratedPassage>();
            var qualityLogs = new StringBuilder();

            for (int passageNum = 1; passageNum <= 3; passageNum++)
            {
                currentProgress = 10 + (passageNum - 1) * 20;
                await PublishProgressAsync(
                    documentUpload.Id,
                    createdBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "generating_passages",
                    message: $"Đang sinh nội dung học thuật cho Passage {passageNum}.",
                    passageNumber: passageNum,
                    totalPassages: 3,
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                string passageTopic = request.InputMode switch
                {
                    "topic" => request.TopicDescription ?? "General Academic Topic",
                    "random" => RandomAcademicTopics[random.Next(RandomAcademicTopics.Length)],
                    _ => "Extracted Document Core Theme"
                };

                var passageBlueprint = passageNum switch
                {
                    1 => blueprint.P1,
                    2 => blueprint.P2,
                    _ => blueprint.P3
                };

                GeneratedPassage passage = await GeneratePassageWithQualityCheckAsync(
                    request.InputMode,
                    sourceText,
                    passageTopic,
                    passageNum,
                    passageBlueprint,
                    qualityLogs,
                    cancellationToken);

                passages.Add(passage);
            }

            var allGeneratedQuestions = new List<GeneratedQuestion>();
            var questionNumberCounter = new QuestionCounter { Value = 1 };

            for (int passageNum = 1; passageNum <= 3; passageNum++)
            {
                currentProgress = 65 + (passageNum - 1) * 5;
                await PublishProgressAsync(
                    documentUpload.Id,
                    createdBy,
                    status: "processing",
                    progressPercent: currentProgress,
                    stage: "generating_questions",
                    message: $"Đang sinh câu hỏi cho Passage {passageNum} theo Blueprint.",
                    passageNumber: passageNum,
                    totalPassages: 3,
                    clientRequestId: clientRequestId,
                    cancellationToken: cancellationToken);

                var passageBlueprint = passageNum switch
                {
                    1 => blueprint.P1,
                    2 => blueprint.P2,
                    _ => blueprint.P3
                };

                var passageQuestions = await GenerateQuestionsForPassageAsync(
                    passages[passageNum - 1],
                    passageBlueprint,
                    questionNumberCounter,
                    cancellationToken);

                allGeneratedQuestions.AddRange(passageQuestions);
            }

            currentProgress = 80;
            await PublishProgressAsync(
                documentUpload.Id,
                createdBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "qa_validating",
                message: "Validator Agent đang giải thử đề thi và đối chiếu logic đáp án.",
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            int retryCount = 0;
            bool isLogicApproved = false;
            double matchRate = 0d;

            while (retryCount < 2 && !isLogicApproved)
            {
                var validationResult = await ValidateExamLogicAsync(passages, allGeneratedQuestions, cancellationToken);
                matchRate = validationResult.MatchRate;

                if (matchRate >= 90d)
                {
                    isLogicApproved = true;
                    logger.LogInformation("Validator Agent approved the exam with accuracy: {MatchRate}%", matchRate);
                }
                else
                {
                    retryCount++;
                    logger.LogWarning("Validator Agent matched only {MatchRate}%. Logic failed. Retrying question generation (Attempt {RetryCount}/2)", matchRate, retryCount);

                    currentProgress = 80 + retryCount * 5;
                    await PublishProgressAsync(
                        documentUpload.Id,
                        createdBy,
                        status: "processing",
                        progressPercent: currentProgress,
                        stage: "generating_questions",
                        message: $"Độ khớp logic thấp ({matchRate:F1}%), đang tái tạo câu hỏi (Lần thử {retryCount}).",
                        clientRequestId: clientRequestId,
                        cancellationToken: cancellationToken);

                    allGeneratedQuestions.Clear();
                    questionNumberCounter.Value = 1;

                    for (int passageNum = 1; passageNum <= 3; passageNum++)
                    {
                        var passageBlueprint = passageNum switch
                        {
                            1 => blueprint.P1,
                            2 => blueprint.P2,
                            _ => blueprint.P3
                        };

                        var passageQuestions = await GenerateQuestionsForPassageAsync(
                            passages[passageNum - 1],
                            passageBlueprint,
                            questionNumberCounter,
                            cancellationToken);

                        allGeneratedQuestions.AddRange(passageQuestions);
                    }
                }
            }

            var createExamDto = AssemblyCreateExamDto(
                virtualFileName,
                blueprint.Name,
                passages,
                allGeneratedQuestions,
                qualityLogs.ToString(),
                matchRate);

            currentProgress = 95;
            await PublishProgressAsync(
                documentUpload.Id,
                createdBy,
                status: "processing",
                progressPercent: currentProgress,
                stage: "save_exam",
                message: "Đang ghi đề thi và cập nhật dữ liệu.",
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            createExamDto = createExamDto with { IsPublished = isLogicApproved };

            var examId = await examService.CreateExamAsync(createExamDto, createdBy, cancellationToken);

            var exam = await context.Exams.FirstOrDefaultAsync(e => e.Id == examId, cancellationToken);
            if (exam is not null)
            {
                exam.SourcePdfUrl = documentUpload.FileUrl;
            }

            documentUpload.GeneratedExamId = examId;
            documentUpload.ProcessStatus = "Completed";
            documentUpload.ErrorMessage = isLogicApproved ? null : $"Đề thi được lưu dạng Nháp do độ chính xác giải thử đạt {matchRate:F1}% (< 90%).";
            documentUpload.UpdatedAt = DateTime.UtcNow;

            await context.SaveChangesAsync(cancellationToken);

            currentProgress = 100;
            await PublishProgressAsync(
                documentUpload.Id,
                createdBy,
                status: "completed",
                progressPercent: currentProgress,
                stage: "completed",
                message: isLogicApproved
                    ? $"Sinh đề thành công! Độ chính xác logic đạt {matchRate:F1}%."
                    : $"Sinh đề thành công (Dạng Nháp)! Độ chính xác logic giải thử: {matchRate:F1}%.",
                examId: examId,
                clientRequestId: clientRequestId,
                cancellationToken: cancellationToken);

            return new GenerateExamFromPdfResultDto(
                ExamId: examId,
                UploadId: documentUpload.Id,
                PassageCount: 3,
                QuestionCount: 40);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "AI Exam Generator failed unexpectedly: {Message}", ex.Message);

            documentUpload.ProcessStatus = "Failed";
            documentUpload.ErrorMessage = ex.Message;
            documentUpload.UpdatedAt = DateTime.UtcNow;
            await context.SaveChangesAsync(CancellationToken.None);

            await PublishProgressAsync(
                documentUpload.Id,
                createdBy,
                status: "failed",
                progressPercent: 100,
                stage: "failed",
                message: ex.Message,
                clientRequestId: clientRequestId,
                cancellationToken: CancellationToken.None);

            throw;
        }
    }

    private async Task<GeneratedPassage> GeneratePassageWithQualityCheckAsync(
        string inputMode,
        string sourceText,
        string topic,
        int passageNum,
        PassageBlueprint blueprint,
        StringBuilder qualityLogs,
        CancellationToken cancellationToken)
    {
        GeneratedPassage? finalPassage = null;
        int maxAttempts = 2;
        int attempt = 0;

        while (attempt < maxAttempts && finalPassage is null)
        {
            attempt++;
            var prompt = BuildPassageGenerationPrompt(inputMode, sourceText, topic, passageNum, blueprint, attempt > 1);
            var jsonResponse = await gemmaCompletionClient.CompleteAsync(prompt, cancellationToken);
            var rawPassage = DeserializePassage(jsonResponse);

            if (rawPassage is null || string.IsNullOrWhiteSpace(rawPassage.Content))
            {
                continue;
            }

            var readability = await aiIntegrationService.AnalyzeReadabilityAsync(rawPassage.Content, cancellationToken);
            if (readability is null)
            {
                finalPassage = rawPassage;
                break;
            }

            bool isQualityAcceptable = readability.FleschKincaidGrade >= 10.0 && readability.FleschKincaidGrade <= 13.5 &&
                                       readability.GunningFog >= 11.5 && readability.GunningFog <= 15.5 &&
                                       readability.AwlRatio >= 7.5;

            if (isQualityAcceptable || attempt == maxAttempts)
            {
                finalPassage = rawPassage;
                qualityLogs.AppendLine($"Passage {passageNum} Quality Log (Attempt {attempt}):");
                qualityLogs.AppendLine($"- Flesch-Kincaid Grade: {readability.FleschKincaidGrade:F2}");
                qualityLogs.AppendLine($"- Gunning Fog: {readability.GunningFog:F2}");
                qualityLogs.AppendLine($"- Word Count: {readability.WordCount}");
                qualityLogs.AppendLine($"- AWL Ratio: {readability.AwlRatio:F2}%");
                qualityLogs.AppendLine($"- Zipf Frequency: {readability.ZipfFrequency:F2}");
                qualityLogs.AppendLine();
            }
            else
            {
                logger.LogWarning("Passage {PassageNum} failed quality constraint check on attempt {Attempt}. FK: {FK}, Fog: {Fog}, AWL: {AWL}%. Regenerating...",
                    passageNum, attempt, readability.FleschKincaidGrade, readability.GunningFog, readability.AwlRatio);
            }
        }

        return finalPassage ?? throw new InvalidOperationException($"Failed to generate passage {passageNum} after {maxAttempts} attempts.");
    }

    private async Task<List<GeneratedQuestion>> GenerateQuestionsForPassageAsync(
        GeneratedPassage passage,
        PassageBlueprint blueprint,
        QuestionCounter questionNumberCounter,
        CancellationToken cancellationToken)
    {
        var prompt = BuildQuestionsGenerationPrompt(passage, blueprint, questionNumberCounter.Value);
        var jsonResponse = await gemmaCompletionClient.CompleteAsync(prompt, cancellationToken);
        var payload = DeserializeQuestionsPayload(jsonResponse);

        var questionsList = new List<GeneratedQuestion>();
        if (payload?.QuestionGroups is null)
        {
            throw new InvalidOperationException($"Failed to generate question groups for Passage {passage.PassageNumber}");
        }

        foreach (var group in payload.QuestionGroups)
        {
            if (group.Questions is null) continue;

            string? contentDataStr = null;
            if (group.ContentData.HasValue)
            {
                contentDataStr = group.ContentData.Value.ValueKind == JsonValueKind.String
                    ? group.ContentData.Value.GetString()
                    : JsonSerializer.Serialize(group.ContentData.Value, JsonOptions);
            }

            foreach (var q in group.Questions)
            {
                questionsList.Add(new GeneratedQuestion(
                    QuestionNumber: q.QuestionNumber,
                    Content: q.Content,
                    CorrectAnswer: q.CorrectAnswer,
                    Explanation: q.Explanation,
                    Evidence: q.Evidence,
                    Options: q.Options ?? [],
                    GroupType: group.GroupType,
                    Instruction: group.Instruction,
                    PassageNumber: passage.PassageNumber,
                    ContentData: contentDataStr
                ));
                questionNumberCounter.Value++;
            }
        }

        return questionsList;
    }

    private async Task<(double MatchRate, List<string> Explanations)> ValidateExamLogicAsync(
        List<GeneratedPassage> passages,
        List<GeneratedQuestion> questions,
        CancellationToken cancellationToken)
    {
        var examStructure = new
        {
            Passages = passages.Select(p => new { p.PassageNumber, p.Title, p.Content }),
            Questions = questions.Select(q => new
            {
                q.QuestionNumber,
                q.PassageNumber,
                q.GroupType,
                q.Instruction,
                q.Content,
                q.Options
            })
        };

        var prompt = $$"""
        You are an elite IELTS Academic Reading Expert. You will act as an independent exam solver (Validator Agent) to solve a generated IELTS Reading test.

        Here is the exam structured in JSON format (without the correct answers):
        {{JsonSerializer.Serialize(examStructure, JsonOptions)}}

        TASK:
        1. Read all 3 passages carefully.
        2. Solve all 40 questions independently. Base your answers strictly on the evidence in the text.
        3. For each question, output your solved answer and a brief logical explanation in Vietnamese.

        RULES FOR SOLVED ANSWERS:
        - For True/False/Not Given, output exactly "TRUE", "FALSE", or "NOT GIVEN".
        - For Yes/No/Not Given, output exactly "YES", "NO", or "NOT GIVEN".
        - For Multiple Choice (MCQ_SINGLE), output exactly the uppercase letter representing the correct option (e.g. "A", "B", "C", "D").
        - For MATCHING_HEADINGS, output exactly the lowercase roman numeral representing the correct heading from the options (e.g. "i", "ii", "iii", "iv"...).
        - For MATCHING_INFO, MATCHING_FEATURES, and MATCHING_CLASSIFICATION, output exactly the uppercase letter representing the matched paragraph or feature (e.g. "A", "B", "C"...).
        - For SUMMARY_COMPLETION, if the group has options (a Word Bank), output exactly the uppercase letter (e.g. "A", "B", "C"...) corresponding to the correct word in the options list. If the group has no options, output the exact word or phrase extracted from the passage.
        - For other Completion styles (SENTENCE_COMPLETION, TABLE_COMPLETION, FLOWCHART_COMPLETION), output exactly the word or phrase extracted from the passage (case-insensitive, max 3 words).

        You MUST respond ONLY in raw JSON matching the following schema. No code fences (like ```json), no markdown wrappers.

        Schema:
        {
          "answers": [
            {
              "questionNumber": 1,
              "solvedAnswer": "TRUE",
              "reasoning": "Giải thích ngắn gọn lý do chọn đáp án dựa trên dòng X của bài đọc."
            }
          ]
        }
        """;

        var responseJson = await gemmaCompletionClient.CompleteAsync(prompt, cancellationToken);
        var parsed = DeserializeValidationResponse(responseJson);

        if (parsed?.Answers is null || parsed.Answers.Count == 0)
        {
            logger.LogWarning("Validator Agent returned empty or invalid response.");
            return (0d, []);
        }

        int correctCount = 0;
        var explanations = new List<string>();

        var parsedAnswersDict = parsed.Answers.ToDictionary(a => a.QuestionNumber);

        foreach (var originalQ in questions)
        {
            if (!parsedAnswersDict.TryGetValue(originalQ.QuestionNumber, out var solvedQ))
            {
                continue;
            }

            explanations.Add($"Q{originalQ.QuestionNumber}: Solved='{solvedQ.SolvedAnswer}' vs Original='{originalQ.CorrectAnswer}'. Reason: {solvedQ.Reasoning}");

            if (IsAnswerMatch(originalQ.CorrectAnswer, solvedQ.SolvedAnswer, originalQ.Options, originalQ.GroupType))
            {
                correctCount++;
            }
        }

        double matchRate = (double)correctCount / questions.Count * 100d;
        return (matchRate, explanations);
    }

    private static bool IsAnswerMatch(string? original, string? solved, List<string> options, string groupType)
    {
        if (string.IsNullOrWhiteSpace(original) || string.IsNullOrWhiteSpace(solved)) return false;

        var normOriginal = original.Trim().ToLowerInvariant();
        var normSolved = solved.Trim().ToLowerInvariant();

        if (NormalizeAnswer(normOriginal) == NormalizeAnswer(normSolved)) return true;

        if (options != null && options.Count > 0)
        {
            int origIndex = -1;
            if (normOriginal.Length == 1 && normOriginal[0] >= 'a' && normOriginal[0] <= 'z')
            {
                origIndex = normOriginal[0] - 'a';
            }
            else if (groupType == "MATCHING_HEADINGS")
            {
                string[] romanLabels = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
                origIndex = Array.IndexOf(romanLabels, normOriginal);
            }

            int solvedIndex = -1;
            if (normSolved.Length == 1 && normSolved[0] >= 'a' && normSolved[0] <= 'z')
            {
                solvedIndex = normSolved[0] - 'a';
            }
            else if (groupType == "MATCHING_HEADINGS")
            {
                string[] romanLabels = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
                solvedIndex = Array.IndexOf(romanLabels, normSolved);
            }

            if (origIndex >= 0 && solvedIndex >= 0 && origIndex == solvedIndex) return true;

            if (origIndex >= 0 && origIndex < options.Count)
            {
                var optText = StripOptionLabel(options[origIndex]);
                if (NormalizeAnswer(optText) == NormalizeAnswer(normSolved)) return true;
            }

            if (solvedIndex >= 0 && solvedIndex < options.Count)
            {
                var optText = StripOptionLabel(options[solvedIndex]);
                if (NormalizeAnswer(optText) == NormalizeAnswer(normOriginal)) return true;
            }
        }

        var cleanOriginal = Regex.Replace(normOriginal, @"\b(a|an|the)\b", "").Trim();
        var cleanSolved = Regex.Replace(normSolved, @"\b(a|an|the)\b", "").Trim();

        if (cleanOriginal.EndsWith("s") && !cleanSolved.EndsWith("s"))
        {
            if (NormalizeAnswer(cleanOriginal[..^1]) == NormalizeAnswer(cleanSolved)) return true;
        }
        if (cleanSolved.EndsWith("s") && !cleanOriginal.EndsWith("s"))
        {
            if (NormalizeAnswer(cleanSolved[..^1]) == NormalizeAnswer(cleanOriginal)) return true;
        }

        return NormalizeAnswer(cleanOriginal) == NormalizeAnswer(cleanSolved);
    }

    private static string NormalizeAnswer(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return string.Empty;
        var val = value.Trim().ToLowerInvariant();
        val = Regex.Replace(val, @"[^a-z0-9]", "");
        return val;
    }

    private CreateExamDto AssemblyCreateExamDto(
        string fileName,
        string blueprintName,
        List<GeneratedPassage> passages,
        List<GeneratedQuestion> questions,
        string qualityLogs,
        double validatorAccuracy)
    {
        var sections = new List<CreateSectionDto>();
        var readingPassages = new List<CreateReadingPassageDto>();

        var questionsByPassage = questions.GroupBy(q => q.PassageNumber).ToDictionary(g => g.Key, g => g.ToList());

        for (int passageNum = 1; passageNum <= 3; passageNum++)
        {
            var passageInfo = passages[passageNum - 1];
            var passageQuestions = questionsByPassage.GetValueOrDefault(passageNum, []);

            var groups = new List<CreateQuestionGroupDto>();
            var questionGroups = passageQuestions.GroupBy(q => new { q.GroupType, q.Instruction, q.ContentData }).ToList();

            foreach (var g in questionGroups)
            {
                var optionLabelType = g.Key.GroupType == "MATCHING_HEADINGS" ? "roman" : "alpha";
                var createQuestions = g.Select(q => new CreateQuestionDto(
                    QuestionNumber: q.QuestionNumber,
                    Content: q.Content,
                    CorrectAnswer: q.CorrectAnswer,
                    Explanation: q.Explanation + $"\nEvidence: {q.Evidence}",
                    Points: 1.0d,
                    Options: q.Options.Select((opt, idx) => new CreateQuestionOptionDto(
                        OptionText: StripOptionLabel(opt),
                        ImageUrl: null,
                        IsCorrect: IsOptionCorrect(opt, q.CorrectAnswer, idx, optionLabelType),
                        OrderIndex: idx
                    )).ToList()
                )).ToList();

                var startQ = g.Min(q => q.QuestionNumber);
                var endQ = g.Max(q => q.QuestionNumber);

                groups.Add(new CreateQuestionGroupDto(
                    GroupType: g.Key.GroupType,
                    Instruction: g.Key.Instruction,
                    ContentData: g.Key.ContentData,
                    AssetsData: null,
                    StartQuestion: startQ,
                    EndQuestion: endQ,
                    Questions: createQuestions
                ));
            }

            readingPassages.Add(new CreateReadingPassageDto(
                PassageNumber: passageNum,
                Title: passageInfo.Title,
                ParagraphsData: FormatParagraphsData(passageInfo.Content),
                AssetsData: null,
                QuestionGroups: groups
            ));
        }

        sections.Add(new CreateSectionDto(
            SkillType: "Reading",
            Title: "IELTS Academic Reading Section",
            OrderIndex: 1,
            ReadingPassages: readingPassages,
            ListeningParts: null,
            WritingTasks: null,
            SpeakingParts: null
        ));

        var description = $"AI Generated IELTS Reading test based on '{blueprintName}'.\n\n[Quality Metrics & Verification]\n{qualityLogs}\n- Validator Agent Accuracy: {validatorAccuracy:F1}%\n- Model Used: gemini-3.1-flash-lite";

        return new CreateExamDto(
            Title: $"IELTS Reading: {Path.GetFileNameWithoutExtension(fileName)}",
            Description: description,
            DurationMinutes: 60,
            TotalPoints: 40.0d,
            ExamType: "Reading",
            IsPublished: true,
            Sections: sections
        );
    }

    private static string FormatParagraphsData(string content)
    {
        if (string.IsNullOrWhiteSpace(content)) return string.Empty;
        var paragraphs = content.Split(new[] { "\n\n", "\r\n\r\n" }, StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Trim())
            .Where(p => !string.IsNullOrEmpty(p))
            .Select(p =>
            {
                var match = Regex.Match(p, @"^(Paragraph\s+[A-Z])\b", RegexOptions.IgnoreCase);
                if (match.Success)
                {
                    var label = match.Groups[1].Value;
                    if (!p.StartsWith("**"))
                    {
                        return $"**{label}** " + p.Substring(label.Length).TrimStart();
                    }
                }
                return p;
            })
            .ToList();
        return string.Join("\n\n", paragraphs);
    }

    private static string StripOptionLabel(string optionText)
    {
        if (string.IsNullOrWhiteSpace(optionText)) return string.Empty;
        var cleaned = Regex.Replace(optionText.Trim(), @"^(?:[A-Z0-9]+|[ivxlcdm]+)\s*[\.\)]\s+", "", RegexOptions.IgnoreCase);
        return cleaned.Trim();
    }

    private static bool IsOptionCorrect(string rawOption, string? correctAnswer, int index, string optionLabelType)
    {
        if (string.IsNullOrWhiteSpace(correctAnswer)) return false;

        var match = Regex.Match(rawOption.Trim(), @"^(?<label>[A-Z0-9]+|[ivxlcdm]+)[\.\)\:]\s+", RegexOptions.IgnoreCase);
        if (match.Success)
        {
            var label = match.Groups["label"].Value;
            if (string.Equals(label, correctAnswer.Trim(), StringComparison.OrdinalIgnoreCase)) return true;
        }

        var calculatedLabel = GetOptionLabelByStyle(index, optionLabelType);
        if (string.Equals(calculatedLabel, correctAnswer.Trim(), StringComparison.OrdinalIgnoreCase)) return true;

        return string.Equals(rawOption.Trim(), correctAnswer.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private static string GetOptionLabelByStyle(int index, string type)
    {
        if (type == "roman")
        {
            string[] romanLabels = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii", "xiii", "xiv", "xv"];
            return index < romanLabels.Length ? romanLabels[index] : (index + 1).ToString();
        }
        return ((char)('A' + index)).ToString();
    }

    private static string BuildVirtualPdfUrl(string fileName)
    {
        var safeFileName = Regex.Replace(fileName.Trim(), @"[^a-zA-Z0-9\.\-_]", "_");
        return $"upload://pdf/ai-gen/{Guid.NewGuid():N}/{safeFileName}";
    }

    private static string BuildPassageGenerationPrompt(
        string inputMode,
        string sourceText,
        string topic,
        int passageNum,
        PassageBlueprint blueprint,
        bool makeAcademicAdjustments)
    {
        var contextInstruction = inputMode switch
        {
            "document" => $"You must extract core academic concepts and facts from the following SOURCE TEXT and rewrite them into a highly cohesive reading passage:\n\n{sourceText}",
            _ => $"You must generate a new, highly academic reading passage about the topic: '{topic}'."
        };

        var adjustInstruction = makeAcademicAdjustments
            ? "CRITICAL: The previous draft had incorrect readability difficulty. Ensure this version uses richer syntax, academic terminology (AWL list), and robust sentence structures to hit IELTS Reading Passage grade targets."
            : "";

        bool hasMatchingParagraphs = blueprint.Groups.Any(g => g.GroupType is "MATCHING_HEADINGS" or "MATCHING_INFO");

        var structureInstruction = hasMatchingParagraphs
            ? "Each paragraph MUST start with \"Paragraph A\", \"Paragraph B\", \"Paragraph C\", etc. This is required because subsequent matching questions will refer to these labels."
            : "Do NOT label paragraphs with letters (e.g., do NOT start them with \"Paragraph A\", \"Paragraph B\", etc.). Just write them as normal, cohesive academic paragraphs. Start each paragraph directly with its content.";

        var schemaExampleContent = hasMatchingParagraphs
            ? "Paragraph A\\nContent of paragraph A...\\n\\nParagraph B\\nContent of paragraph B..."
            : "Content of first paragraph...\\n\\nContent of second paragraph...";

        return $$"""
        You are an expert IELTS Academic Reading developer. Your task is to write Passage {{passageNum}} for an IELTS Reading test.

        {{contextInstruction}}

        INSTRUCTIONS:
        1. Length: The passage MUST be between 700 and 900 words.
        2. Tone: Extremely formal, academic, and scientific. Use precise lexicon and compound/complex sentence structures.
        3. Structure: Organize into logical paragraphs. {{structureInstruction}}
        4. Content: The passage must contain descriptive details, chronologies, arguments, or scientific processes suitable for forming IELTS questions.
        5. Formatting: Output ONLY in raw JSON matching the schema below. No markdown wrappers, no ```json formatting code fences.

        {{adjustInstruction}}

        Schema:
        {
          "passageNumber": {{passageNum}},
          "title": "Title of the passage",
          "content": "{{schemaExampleContent}}"
        }
        """;
    }

    private static string BuildQuestionsGenerationPrompt(GeneratedPassage passage, PassageBlueprint blueprint, int startNumber)
    {
        var groupsInstruction = new StringBuilder();
        int currentNumber = startNumber;

        foreach (var group in blueprint.Groups)
        {
            int nextNumber = currentNumber + group.QuestionCount - 1;
            groupsInstruction.AppendLine($"- Group Type: '{group.GroupType}'");
            groupsInstruction.AppendLine($"  Instruction: '{GetDefaultInstruction(group.GroupType)}'");
            groupsInstruction.AppendLine($"  Questions Range: {currentNumber} to {nextNumber} ({group.QuestionCount} questions)");

            if (group.GroupType == "SUMMARY_COMPLETION")
            {
                groupsInstruction.AppendLine($"  Specific formatting: Write a continuous summary paragraph (100-150 words) that outlines a portion of the passage using paraphrased language. Put this continuous paragraph in the group's 'contentData' field. In this summary, insert placeholders [Q{currentNumber}], [Q{currentNumber+1}]... representing the blanks. The 'questions' array must contain one object per blank. Each question object must have: 'content' set to a short label like '[Q{currentNumber}]', and a shared list of 8-12 word options (the Word Bank) in the 'options' field (each word formatted as plain text, e.g., ['larynx', 'syntax', 'phonetics']). Do not include any prefix like A, B, C or roman numerals in the options. The correctAnswer of each question must be the uppercase letter ('A', 'B', 'C'...) corresponding to the correct word in the options list.");
            }
            else if (group.GroupType is "TABLE_COMPLETION" or "MATCHING_TABLE")
            {
                groupsInstruction.AppendLine($"  Specific formatting: You must represent the table structure in the group's 'contentData' field as a JSON object containing: 'title' (a string title for the table), and 'rows' (a 2D array of strings representing table headers and rows). Placeholders [Q{currentNumber}], [Q{currentNumber+1}]... must be inserted in the appropriate cells of the table rows where blanks should be. The 'questions' array should contain one object per blank. Each question object must have: 'content' set to a short context sentence describing the row (e.g., 'To reinforce mud bricks, builders used [Q{currentNumber}] matting.'), and direct correct answers from the passage.");
            }
            else if (group.GroupType == "SENTENCE_COMPLETION")
            {
                groupsInstruction.AppendLine($"  Specific formatting: Generate a list of continuous sentences (one sentence per question, numbered 1, 2, 3...) and join them with newlines. Put this entire text in the group's 'contentData' field. In this text, insert placeholders [Q{currentNumber}], [Q{currentNumber+1}]... representing the blanks (e.g., '1. The process of [Q{currentNumber}] was initialized.\\n2. Workers used [Q{currentNumber+1}] to transport materials.'). Crucially, vary the sentence structures (avoid starting every sentence with 'The'). The 'questions' array must contain one object per blank, where 'content' is set to the short label '[Q{currentNumber}]' (e.g. '[Q{currentNumber}]', '[Q{currentNumber+1}]'...) and 'correctAnswer' is the exact word or phrase extracted from the passage (max 3 words).");
            }
            else if (group.GroupType == "FLOWCHART_COMPLETION")
            {
                groupsInstruction.AppendLine($"  Specific formatting: Generate step-by-step points representing the flowchart. Put this text in the group's 'contentData' field and insert placeholders [Q{currentNumber}], [Q{currentNumber+1}]... representing the blanks (e.g., 'Step 1: Raw materials are mixed with [Q{currentNumber}].\\nStep 2: The mixture is heated to form [Q{currentNumber+1}].'). The 'questions' array must contain one object per blank, where 'content' is set to the short label '[Q{currentNumber}]' and 'correctAnswer' is the exact word or phrase extracted from the passage.");
            }
            else if (group.GroupType is "TFNG" or "YNNG")
            {
                groupsInstruction.AppendLine($"  Specific formatting: Correct answers must only be 'TRUE', 'FALSE', or 'NOT GIVEN' (for TFNG) or 'YES', 'NO', or 'NOT GIVEN' (for YNNG).");
            }
            else if (group.GroupType == "MCQ_SINGLE")
            {
                groupsInstruction.AppendLine($"  Specific formatting: Each question must provide exactly 4 options listed in the 'options' field as plain text WITHOUT any letter prefixes (e.g., ['option text 1', 'option text 2', 'option text 3', 'option text 4']). Correct answer must be just the letter 'A', 'B', 'C', or 'D'.");
            }
            else if (group.GroupType == "MATCHING_HEADINGS")
            {
                groupsInstruction.AppendLine($"  Specific formatting: The options array must contain the list of headings as plain text WITHOUT any roman numerals prefixes (e.g., ['Heading one text', 'Heading two text']). Correct answer must be the roman numeral matching the heading (e.g., 'i', 'ii', 'iii', 'iv'...).");
            }
            else if (group.GroupType is "MATCHING_INFO" or "MATCHING_FEATURES")
            {
                groupsInstruction.AppendLine($"  Specific formatting: The options array must contain the list of features or paragraph tags (A, B, C...) to match. Correct answer must represent the matched option (e.g., 'A', 'B', 'C'...).");
            }

            currentNumber = nextNumber + 1;
        }

        return $$"""
        You are an expert IELTS Academic Reading test builder. Your task is to generate high-quality questions for the following reading passage:

        Title: {{passage.Title}}
        Passage Content:
        {{passage.Content}}

        You MUST create the following question groups:
        {{groupsInstruction}}

        QUALITY REQUIREMENTS:
        - Questions must test reading skills: scanning, skimming, detail comprehension, and identifying writer's opinions.
        - Questions must use paraphrasing and synonyms rather than repeating identical phrases.
        - The correctAnswer MUST be unambiguous and directly backed by evidence in the passage.
        - For options fields, write ONLY plain text content (e.g., "biological diversity", NOT "A. biological diversity" or "i. biological diversity").
        - For every single question, you MUST provide the precise, exact phrase or sentence from the passage that acts as "evidence" and a detailed "explanation" in Vietnamese.

        Output ONLY in raw JSON matching the schema below. No code fences, no markdown.

        Schema:
        {
          "questionGroups": [
            {
              "groupType": "SUMMARY_COMPLETION",
              "instruction": "Complete the summary below...",
              "contentData": "The continuous summary paragraph text containing [Q8] and [Q9]...",
              "questions": [
                {
                  "questionNumber": 8,
                  "content": "[Q8]",
                  "options": ["larynx", "syntax", "phonetics"],
                  "correctAnswer": "A",
                  "evidence": "Exact sentence extracted from paragraph A",
                  "explanation": "Giải thích chi tiết bằng tiếng Việt tại sao chọn đáp án."
                }
              ]
            },
            {
              "groupType": "SENTENCE_COMPLETION",
              "instruction": "Complete the sentences below...",
              "contentData": "1. The architectural paradigm of Mesopotamia was defined by a shortage of [Q3].\n2. Ziggurats were massive structures constructed from sun-dried [Q4].",
              "questions": [
                {
                  "questionNumber": 3,
                  "content": "[Q3]",
                  "options": [],
                  "correctAnswer": "stone and timber",
                  "evidence": "the architectural paradigm of the Mesopotamian civilizations... was dictated by the scarcity of stone and timber.",
                  "explanation": "Giải thích tại sao chọn đáp án dựa trên bài đọc."
                },
                {
                  "questionNumber": 4,
                  "content": "[Q4]",
                  "options": [],
                  "correctAnswer": "mud bricks",
                  "evidence": "these societies developed a unique reliance on sun-dried mud bricks",
                  "explanation": "Giải thích tại sao chọn đáp án."
                }
              ]
            },
            {
              "groupType": "TABLE_COMPLETION",
              "instruction": "Complete the table below...",
              "contentData": {
                "title": "Ancient Construction Techniques",
                "rows": [
                  ["Civilization", "Feature", "Technique/Material"],
                  ["Egyptians", "Great Pyramid", "[Q1] systems"]
                ]
              },
              "questions": [
                {
                  "questionNumber": 1,
                  "content": "The Egyptians utilized [Q1] systems to move heavy blocks.",
                  "options": [],
                  "correctAnswer": "ramp",
                  "evidence": "Egyptians constructed massive ramps to haul stones...",
                  "explanation": "Giải thích chi tiết bằng tiếng Việt tại sao chọn đáp án."
                }
              ]
            }
          ]
        }
        """;
    }

    private static string GetDefaultInstruction(string groupType) => groupType switch
    {
        "MCQ_SINGLE" => "Choose the correct letter, A, B, C or D.",
        "TFNG" => "Do the following statements agree with the information given in the Reading Passage? (TRUE/FALSE/NOT GIVEN)",
        "YNNG" => "Do the following statements agree with the claims of the writer? (YES/NO/NOT GIVEN)",
        "MATCHING_INFO" => "Classify the following statements with the correct paragraph.",
        "MATCHING_HEADINGS" => "Choose the correct heading for each paragraph from the list of headings.",
        "MATCHING_FEATURES" => "Match each statement with the correct feature/person.",
        "SENTENCE_COMPLETION" => "Complete the sentences below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
        "SUMMARY_COMPLETION" => "Complete the summary below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
        "TABLE_COMPLETION" => "Complete the table below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
        "FLOWCHART_COMPLETION" => "Complete the flowchart below. Choose NO MORE THAN TWO WORDS from the passage for each answer.",
        _ => "Answer the questions."
    };

    private async Task PublishProgressAsync(
        Guid uploadId,
        Guid uploadedBy,
        string status,
        int progressPercent,
        string stage,
        string message,
        int? passageNumber = null,
        int? totalPassages = null,
        Guid? examId = null,
        string? clientRequestId = null,
        CancellationToken cancellationToken = default)
    {
        var progressSnapshot = new PdfGenerationProgressStatusDto(
            UploadId: uploadId,
            UploadedBy: uploadedBy,
            Status: status,
            ProgressPercent: Math.Clamp(progressPercent, 0, 100),
            Stage: stage,
            Message: message,
            PassageNumber: passageNumber,
            TotalPassages: totalPassages,
            ExamId: examId,
            ClientRequestId: string.IsNullOrWhiteSpace(clientRequestId) ? null : clientRequestId.Trim(),
            UpdatedAtUtc: DateTime.UtcNow);

        pdfGenerationProgressTracker.Upsert(progressSnapshot);

        var payload = new PdfGenerationProgressPayload(
            UploadId: progressSnapshot.UploadId,
            UploadedBy: progressSnapshot.UploadedBy,
            Status: progressSnapshot.Status,
            ProgressPercent: progressSnapshot.ProgressPercent,
            Stage: progressSnapshot.Stage,
            Message: progressSnapshot.Message,
            PassageNumber: progressSnapshot.PassageNumber,
            TotalPassages: progressSnapshot.TotalPassages,
            ExamId: progressSnapshot.ExamId,
            ClientRequestId: progressSnapshot.ClientRequestId);

        try
        {
            await realtimeEventPublisher.PublishAsync(
                PdfGenerationProgressEventType,
                payload,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Failed to publish realtime PDF generation progress for upload {UploadId}", uploadId);
        }
    }

    private GeneratedPassage? DeserializePassage(string rawJson)
    {
        try
        {
            var cleaned = StripJsonFence(rawJson);
            return JsonSerializer.Deserialize<GeneratedPassage>(cleaned, JsonOptions);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Passage JSON deserialization failed: {Message}. Raw text: {RawJson}", ex.Message, rawJson);
            return null;
        }
    }

    private GeneratedQuestionsPayload? DeserializeQuestionsPayload(string rawJson)
    {
        try
        {
            var cleaned = StripJsonFence(rawJson);
            return JsonSerializer.Deserialize<GeneratedQuestionsPayload>(cleaned, JsonOptions);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Questions JSON deserialization failed: {Message}. Raw text: {RawJson}", ex.Message, rawJson);
            return null;
        }
    }

    private ValidationResponse? DeserializeValidationResponse(string rawJson)
    {
        try
        {
            var cleaned = StripJsonFence(rawJson);
            return JsonSerializer.Deserialize<ValidationResponse>(cleaned, JsonOptions);
        }
        catch (Exception ex)
        {
            logger.LogWarning("Validation JSON deserialization failed: {Message}. Raw text: {RawJson}", ex.Message, rawJson);
            return null;
        }
    }

    private static string StripJsonFence(string value)
    {
        var trimmed = value.Trim();
        if (!trimmed.StartsWith("```", StringComparison.Ordinal))
        {
            return trimmed;
        }

        var firstNewLine = trimmed.IndexOf('\n');
        if (firstNewLine >= 0)
        {
            trimmed = trimmed[(firstNewLine + 1)..].Trim();
        }

        if (trimmed.EndsWith("```", StringComparison.Ordinal))
        {
            trimmed = trimmed[..^3].Trim();
        }

        return trimmed.Trim();
    }

    private sealed record GeneratedPassage(int PassageNumber, string Title, string Content);

    private sealed record GeneratedQuestionsPayload(List<GeneratedGroupPayload> QuestionGroups);
    private sealed record GeneratedGroupPayload(string GroupType, string Instruction, JsonElement? ContentData, List<RawQuestionPayload> Questions);
    private sealed record RawQuestionPayload(
        int QuestionNumber,
        string Content,
        List<string>? Options,
        string CorrectAnswer,
        string Evidence,
        string Explanation);

    private sealed record GeneratedQuestion(
        int QuestionNumber,
        string Content,
        string? CorrectAnswer,
        string? Explanation,
        string? Evidence,
        List<string> Options,
        string GroupType,
        string Instruction,
        int PassageNumber,
        string? ContentData = null);

    private sealed record ValidationResponse(List<SolvedAnswerPayload> Answers);
    private sealed record SolvedAnswerPayload(int QuestionNumber, string SolvedAnswer, string Reasoning);

    private sealed class QuestionCounter
    {
        public int Value { get; set; }
    }
}
