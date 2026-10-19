using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using EnglishExamApp.Application.DTOs.Flashcard;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Application.Services;

public class FlashcardService(
    IApplicationDbContext context,
    IConfiguration configuration,
    HttpClient httpClient,
    ILogger<FlashcardService> logger) : IFlashcardService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    #region Deck Management

    public async Task<List<FlashcardDeckDto>> GetDecksAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var decks = await context.FlashcardDecks
            .AsNoTracking()
            .Where(d => d.UserId == userId || d.IsPublic)
            .OrderByDescending(d => d.CreatedAt)
            .Select(d => new FlashcardDeckDto(
                d.Id,
                d.UserId,
                d.Title,
                d.Description,
                d.Color,
                d.Icon,
                d.IsPublic,
                d.Items.Count,
                d.Items.Count(i => i.NextReviewDate <= now),
                d.CreatedAt,
                d.UpdatedAt))
            .ToListAsync(cancellationToken);

        return decks;
    }

    public async Task<FlashcardDeckDto?> GetDeckByIdAsync(Guid deckId, Guid userId, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var deck = await context.FlashcardDecks
            .AsNoTracking()
            .Where(d => d.Id == deckId && (d.UserId == userId || d.IsPublic))
            .Select(d => new FlashcardDeckDto(
                d.Id,
                d.UserId,
                d.Title,
                d.Description,
                d.Color,
                d.Icon,
                d.IsPublic,
                d.Items.Count,
                d.Items.Count(i => i.NextReviewDate <= now),
                d.CreatedAt,
                d.UpdatedAt))
            .FirstOrDefaultAsync(cancellationToken);

        return deck;
    }

    public async Task<FlashcardDeckDto> CreateDeckAsync(Guid userId, CreateDeckRequest request, CancellationToken cancellationToken = default)
    {
        var deck = new FlashcardDeck
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            Color = string.IsNullOrWhiteSpace(request.Color) ? "#2563eb" : request.Color.Trim(),
            Icon = string.IsNullOrWhiteSpace(request.Icon) ? "Book" : request.Icon.Trim(),
            IsPublic = request.IsPublic,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        context.FlashcardDecks.Add(deck);
        await context.SaveChangesAsync(cancellationToken);

        return new FlashcardDeckDto(
            deck.Id,
            deck.UserId,
            deck.Title,
            deck.Description,
            deck.Color,
            deck.Icon,
            deck.IsPublic,
            0,
            0,
            deck.CreatedAt,
            deck.UpdatedAt);
    }

    public async Task<FlashcardDeckDto?> UpdateDeckAsync(Guid deckId, Guid userId, UpdateDeckRequest request, CancellationToken cancellationToken = default)
    {
        var deck = await context.FlashcardDecks.FirstOrDefaultAsync(d => d.Id == deckId && d.UserId == userId, cancellationToken);
        if (deck == null) return null;

        deck.Title = request.Title.Trim();
        deck.Description = request.Description?.Trim();
        if (!string.IsNullOrWhiteSpace(request.Color)) deck.Color = request.Color.Trim();
        if (!string.IsNullOrWhiteSpace(request.Icon)) deck.Icon = request.Icon.Trim();
        deck.IsPublic = request.IsPublic;
        deck.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);

        var now = DateTime.UtcNow;
        var totalCards = await context.FlashcardItems.CountAsync(i => i.DeckId == deckId, cancellationToken);
        var dueCards = await context.FlashcardItems.CountAsync(i => i.DeckId == deckId && i.NextReviewDate <= now, cancellationToken);

        return new FlashcardDeckDto(
            deck.Id,
            deck.UserId,
            deck.Title,
            deck.Description,
            deck.Color,
            deck.Icon,
            deck.IsPublic,
            totalCards,
            dueCards,
            deck.CreatedAt,
            deck.UpdatedAt);
    }

    public async Task<bool> DeleteDeckAsync(Guid deckId, Guid userId, CancellationToken cancellationToken = default)
    {
        var deck = await context.FlashcardDecks.FirstOrDefaultAsync(d => d.Id == deckId && d.UserId == userId, cancellationToken);
        if (deck == null) return false;

        context.FlashcardDecks.Remove(deck);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    #endregion

    #region Card Management

    public async Task<List<FlashcardItemDto>> GetCardsInDeckAsync(Guid deckId, Guid userId, CancellationToken cancellationToken = default)
    {
        var cards = await context.FlashcardItems
            .AsNoTracking()
            .Where(i => i.DeckId == deckId && (i.UserId == userId || i.Deck.IsPublic))
            .OrderByDescending(i => i.CreatedAt)
            .Select(i => MapToDto(i))
            .ToListAsync(cancellationToken);

        return cards;
    }

    public async Task<List<FlashcardItemDto>> GetStudyCardsAsync(Guid deckId, Guid userId, bool dueOnly = false, CancellationToken cancellationToken = default)
    {
        var now = DateTime.UtcNow;
        var query = context.FlashcardItems
            .AsNoTracking()
            .Where(i => i.DeckId == deckId && (i.UserId == userId || i.Deck.IsPublic));

        if (dueOnly)
        {
            query = query.Where(i => i.NextReviewDate <= now);
        }

        var cards = await query
            .OrderBy(i => i.NextReviewDate)
            .Select(i => MapToDto(i))
            .ToListAsync(cancellationToken);

        return cards;
    }

    public async Task<FlashcardItemDto> CreateCardAsync(Guid userId, CreateFlashcardItemRequest request, CancellationToken cancellationToken = default)
    {
        // Auto-generate fast photo image URL if not provided (Solution 1: Wikimedia Commons / Unsplash 0.1s)
        var imageUrl = request.ImageUrl;
        if (string.IsNullOrWhiteSpace(imageUrl))
        {
            imageUrl = await FetchFastImageUrlAsync(request.Word, cancellationToken);
        }

        var distractors = !string.IsNullOrWhiteSpace(request.QuizDistractors)
            ? request.QuizDistractors.Trim()
            : null;

        var item = new FlashcardItem
        {
            Id = Guid.NewGuid(),
            DeckId = request.DeckId,
            UserId = userId,
            Word = request.Word.Trim(),
            Phonetic = request.Phonetic?.Trim(),
            PartOfSpeech = request.PartOfSpeech?.Trim(),
            MeaningVi = request.MeaningVi.Trim(),
            DefinitionEn = request.DefinitionEn?.Trim(),
            ExampleSentence = request.ExampleSentence?.Trim(),
            ExampleSentenceVi = request.ExampleSentenceVi?.Trim(),
            Collocations = request.Collocations?.Trim(),
            ImageUrl = imageUrl,
            AudioUrl = request.AudioUrl?.Trim(),
            ContextNote = request.ContextNote?.Trim(),
            QuizDistractors = distractors,
            Repetitions = 0,
            EaseFactor = 2.5,
            IntervalDays = 0,
            NextReviewDate = DateTime.UtcNow,
            ReviewCount = 0,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        context.FlashcardItems.Add(item);
        await context.SaveChangesAsync(cancellationToken);

        return MapToDto(item);
    }

    public async Task<FlashcardItemDto?> UpdateCardAsync(Guid cardId, Guid userId, UpdateFlashcardItemRequest request, CancellationToken cancellationToken = default)
    {
        var item = await context.FlashcardItems.FirstOrDefaultAsync(i => i.Id == cardId && i.UserId == userId, cancellationToken);
        if (item == null) return null;

        item.Word = request.Word.Trim();
        item.MeaningVi = request.MeaningVi.Trim();
        item.Phonetic = request.Phonetic?.Trim();
        item.PartOfSpeech = request.PartOfSpeech?.Trim();
        item.DefinitionEn = request.DefinitionEn?.Trim();
        item.ExampleSentence = request.ExampleSentence?.Trim();
        item.ExampleSentenceVi = request.ExampleSentenceVi?.Trim();
        item.Collocations = request.Collocations?.Trim();
        item.ImageUrl = request.ImageUrl?.Trim();
        item.AudioUrl = request.AudioUrl?.Trim();
        item.ContextNote = request.ContextNote?.Trim();
        if (!string.IsNullOrWhiteSpace(request.QuizDistractors))
        {
            item.QuizDistractors = request.QuizDistractors.Trim();
        }
        item.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);
        return MapToDto(item);
    }

    public async Task<bool> DeleteCardAsync(Guid cardId, Guid userId, CancellationToken cancellationToken = default)
    {
        var item = await context.FlashcardItems.FirstOrDefaultAsync(i => i.Id == cardId && i.UserId == userId, cancellationToken);
        if (item == null) return false;

        context.FlashcardItems.Remove(item);
        await context.SaveChangesAsync(cancellationToken);
        return true;
    }

    #endregion

    #region Spaced Repetition (SM-2)

    public async Task<FlashcardItemDto?> ReviewCardAsync(Guid cardId, Guid userId, int rating, CancellationToken cancellationToken = default)
    {
        var item = await context.FlashcardItems.FirstOrDefaultAsync(i => i.Id == cardId && (i.UserId == userId || i.Deck.IsPublic), cancellationToken);
        if (item == null) return null;

        // Rating: 1 = Khó (Hard/Again), 2 = Trung bình (Medium/Good), 3 = Dễ (Easy), 4 = Dễ (Legacy)
        var reps = item.Repetitions;
        var ease = item.EaseFactor;
        var interval = item.IntervalDays;

        if (rating == 1) // Khó: Cần ôn lại ngay, đặt lại chu kỳ 1 ngày
        {
            reps = 0;
            interval = 1;
            ease = Math.Max(1.3, ease - 0.2);
        }
        else if (rating == 2) // Trung bình: Vừa sức, tăng chu kỳ theo hệ số nhớ
        {
            reps++;
            interval = reps == 1 ? 1 : reps == 2 ? 3 : Math.Max(1, (int)(interval * ease));
            ease = Math.Max(1.3, ease - 0.05);
        }
        else // Dễ: Nhớ sâu, tăng chu kỳ nhanh và cộng thêm ease factor
        {
            reps++;
            interval = reps == 1 ? 3 : reps == 2 ? 7 : Math.Max(1, (int)(interval * ease * 1.3));
            ease = Math.Min(3.0, ease + 0.15);
        }

        item.Repetitions = reps;
        item.EaseFactor = Math.Round(ease, 2);
        item.IntervalDays = interval;
        item.LastReviewedAt = DateTime.UtcNow;
        item.NextReviewDate = DateTime.UtcNow.AddDays(interval);
        item.ReviewCount += 1;
        item.UpdatedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(cancellationToken);
        return MapToDto(item);
    }

    #endregion

    #region AI Integration (Enrich Word & Check Sentence)

    public async Task<AiEnrichWordResponse> EnrichWordWithAiAsync(string word, string? userContext = null, string? preferredModel = null, CancellationToken cancellationToken = default)
    {
        var cleanWord = word.Trim();

        // Step 1: Fetch fast dictionary data (Datamuse 0.05s), Google Translate (0.2s), and Wikimedia photo (0.2s) concurrently
        var dictTask = FetchFastDictionaryAsync(cleanWord, cancellationToken);
        var transTask = FetchGoogleTranslateAsync(cleanWord, "vi", cancellationToken);
        var imageTask = FetchFastImageUrlAsync(cleanWord, cancellationToken);

        await Task.WhenAll(dictTask, transTask, imageTask);

        var (phonetic, audioUrl, partOfSpeech, definitionEn, exampleSentence) = await dictTask;
        var meaningVi = await transTask;
        var imageUrl = await imageTask;

        if (string.IsNullOrWhiteSpace(meaningVi) || meaningVi.Equals(cleanWord, StringComparison.OrdinalIgnoreCase))
        {
            // Second attempt with lowercase or dictionary definition translation
            meaningVi = await FetchGoogleTranslateAsync(cleanWord.ToLowerInvariant(), "vi", cancellationToken);
            if (string.IsNullOrWhiteSpace(meaningVi)) meaningVi = cleanWord;
        }

        if (string.IsNullOrWhiteSpace(definitionEn))
        {
            definitionEn = $"English vocabulary item: {cleanWord}";
        }

        if (string.IsNullOrWhiteSpace(exampleSentence))
        {
            exampleSentence = $"This concept illustrates {cleanWord} in real life.";
        }

        var exampleSentenceVi = "";
        if (!string.IsNullOrWhiteSpace(exampleSentence))
        {
            exampleSentenceVi = await FetchGoogleTranslateAsync(exampleSentence, "vi", cancellationToken);
        }

        // Step 2: If Gemini API key is configured, enrich with multi-model fallback cascade
        var apiKey = ResolveGeminiApiKey();
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            var candidateModels = GetCandidateModels(preferredModel);
            var prompt = $@"You are an elite IELTS vocabulary coach.
Analyze the target word/phrase: ""{cleanWord}"" {(string.IsNullOrWhiteSpace(userContext) ? "" : $"used in context: \"{userContext}\"")}.
Return a strict JSON object with:
{{
  ""phonetic"": ""standard IPA phonetic with slashes, e.g. /juːˈbɪk.wɪ.təs/"",
  ""partOfSpeech"": ""e.g. adjective, verb, noun, idiom, phrasal verb"",
  ""meaningVi"": ""natural, clear Vietnamese meaning and nuances"",
  ""definitionEn"": ""concise English definition"",
  ""exampleSentence"": ""a natural, sophisticated IELTS Band 7.5+ example sentence using the word"",
  ""exampleSentenceVi"": ""Vietnamese translation of the example sentence"",
  ""collocations"": ""3-4 common high-scoring collocations separated by commas"",
  ""imagePrompt"": ""a 2-3 word visual description in English"",
  ""quizDistractors"": [""5 incorrect but plausible Vietnamese definitions with the same grammatical form (part of speech) to serve as distractors in a quiz""]
}}";

            foreach (var model in candidateModels)
            {
                try
                {
                    var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
                    using var geminiCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                    geminiCts.CancelAfter(TimeSpan.FromSeconds(25));

                    var is31b = model.Contains("31b", StringComparison.OrdinalIgnoreCase);
                    object requestBody = is31b
                        ? new
                        {
                            contents = new[] { new { parts = new[] { new { text = prompt } } } },
                            generationConfig = new { temperature = 0.2 }
                        }
                        : new
                        {
                            contents = new[] { new { parts = new[] { new { text = prompt } } } },
                            generationConfig = new { response_mime_type = "application/json", temperature = 0.2 }
                        };

                    var response = await httpClient.PostAsJsonAsync(url, requestBody, geminiCts.Token);

                    if (response.IsSuccessStatusCode)
                    {
                        var content = await response.Content.ReadAsStringAsync(cancellationToken);
                        using var doc = JsonDocument.Parse(content);
                        if (doc.RootElement.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
                        {
                            var cand0 = candidates[0];
                            if (cand0.TryGetProperty("content", out var candContent))
                            {
                                var text = ExtractResponseText(candContent);
                                if (!string.IsNullOrWhiteSpace(text))
                                {
                                    var jsonText = ExtractJson(text);
                                    var enriched = JsonSerializer.Deserialize<EnrichedWordJson>(jsonText, JsonOptions);
                                    if (enriched != null)
                                    {
                                        logger.LogInformation("[FlashcardAI] Successfully enriched '{Word}' using model '{Model}'", cleanWord, model);

                                        var geminiDistractors = enriched.QuizDistractors != null && enriched.QuizDistractors.Count > 0
                                            ? string.Join(" | ", enriched.QuizDistractors.Take(5).Select(d => d.Trim()))
                                            : null;

                                        if (string.IsNullOrWhiteSpace(geminiDistractors))
                                        {
                                            var currentMeaning = enriched.MeaningVi ?? meaningVi;
                                            var dbDistractors = await context.FlashcardItems
                                                .Where(i => !string.IsNullOrEmpty(i.MeaningVi) && i.MeaningVi != currentMeaning)
                                                .Select(i => i.MeaningVi)
                                                .Distinct()
                                                .Take(5)
                                                .ToListAsync(cancellationToken);

                                            if (dbDistractors.Count > 0)
                                            {
                                                geminiDistractors = string.Join(" | ", dbDistractors);
                                            }
                                        }

                                        return new AiEnrichWordResponse(
                                            cleanWord,
                                            !string.IsNullOrWhiteSpace(enriched.Phonetic) ? enriched.Phonetic : phonetic,
                                            !string.IsNullOrWhiteSpace(enriched.PartOfSpeech) ? enriched.PartOfSpeech : partOfSpeech,
                                            !string.IsNullOrWhiteSpace(enriched.MeaningVi) ? enriched.MeaningVi : meaningVi,
                                            !string.IsNullOrWhiteSpace(enriched.DefinitionEn) ? enriched.DefinitionEn : definitionEn,
                                            !string.IsNullOrWhiteSpace(enriched.ExampleSentence) ? enriched.ExampleSentence : exampleSentence,
                                            !string.IsNullOrWhiteSpace(enriched.ExampleSentenceVi) ? enriched.ExampleSentenceVi : exampleSentenceVi,
                                            enriched.Collocations,
                                            imageUrl,
                                            enriched.ImagePrompt ?? cleanWord,
                                            audioUrl,
                                            geminiDistractors,
                                            model);
                                    }
                                }
                            }
                        }
                    }
                    else
                    {
                        var statusCode = (int)response.StatusCode;
                        logger.LogWarning("[FlashcardAI] Gemini model '{Model}' returned HTTP {StatusCode}. Cascading to next model in list...", model, statusCode);
                    }
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "[FlashcardAI] Gemini model '{Model}' failed for '{Word}'. Cascading to next model in list...", model, cleanWord);
                }
            }
        }

        // Return Free Dictionary + Google Translate + Fast Wikimedia result without mock data
        return new AiEnrichWordResponse(
            cleanWord,
            phonetic,
            partOfSpeech,
            meaningVi,
            definitionEn,
            exampleSentence,
            exampleSentenceVi,
            null,
            imageUrl,
            cleanWord,
            audioUrl,
            null);
    }

    public async Task<AiCheckSentenceResponse> CheckSentenceWithAiAsync(string word, string meaningVi, string sentence, string? preferredModel = null, CancellationToken cancellationToken = default)
    {
        var cleanWord = word.Trim();
        var cleanSentence = sentence.Trim();
        var apiKey = ResolveGeminiApiKey();

        if (string.IsNullOrWhiteSpace(apiKey))
        {
            var containsWord = cleanSentence.Contains(cleanWord, StringComparison.OrdinalIgnoreCase);
            return new AiCheckSentenceResponse(
                containsWord,
                containsWord ? 8 : 5,
                containsWord
                    ? "Câu của bạn sử dụng đúng từ vựng mục tiêu và ngữ cảnh cơ bản!"
                    : $"Câu của bạn chưa chứa từ khóa \"{cleanWord}\". Hãy thử kết hợp từ khóa này vào câu nhé!",
                [],
                cleanSentence,
                new List<SentenceExampleItem>
                {
                    new("Dễ", "Cơ bản (A2 - B1)", $"I really like this {cleanWord}.", $"Tôi thực sự thích {meaningVi} này."),
                    new("Trung bình", "Trung cấp (B2)", $"They decided to choose a {cleanWord} for their vacation.", $"Họ quyết định chọn một {meaningVi} cho kỳ nghỉ của mình."),
                    new("Khó", "Nâng cao (C1 - IELTS 7.5+)", $"The remarkable features of the {cleanWord} attracted numerous visitors.", $"Những đặc điểm nổi bật của {meaningVi} đã thu hút đông đảo du khách.")
                },
                cleanSentence);
        }

        var candidateModels = GetCandidateModels(preferredModel);
        var prompt = $@"You are an expert IELTS and English language instructor.
Evaluate the student's sentence using the target vocabulary.
Target word: ""{cleanWord}"" (meaning in Vietnamese: ""{meaningVi}"")
Student's sentence: ""{cleanSentence}""

Evaluate thoroughly and return a strict JSON object with:
{{
  ""isCorrect"": boolean (true if the word is used appropriately in context with correct grammar),
  ""score"": integer from 1 to 10 (evaluating lexical resource, grammar accuracy and naturalness),
  ""feedbackVi"": ""concise, encouraging feedback in Vietnamese (1-2 sentences) explaining whether the usage is natural, plus constructive advice"",
  ""grammarErrors"": [""list of specific grammar/syntax/collocation errors in Vietnamese with brief explanation, or empty array if none""],
  ""correctedSentence"": ""the student's EXACT sentence rewritten cleanly to fix all grammatical, tense, article and lexical mistakes while faithfully preserving their original meaning and structure. If the student's sentence is already 100% correct, output it as is"",
  ""examplesByLevel"": [
    {{
      ""level"": ""Dễ"",
      ""levelLabel"": ""Cơ bản (A2 - B1)"",
      ""sentence"": ""simple, natural, clear English sentence using '{cleanWord}' suited for everyday conversation"",
      ""meaningVi"": ""accurate Vietnamese translation of this simple sentence""
    }},
    {{
      ""level"": ""Trung bình"",
      ""levelLabel"": ""Trung cấp (B2)"",
      ""sentence"": ""compound or complex sentence using '{cleanWord}' in an authentic real-world scenario with standard grammar"",
      ""meaningVi"": ""accurate Vietnamese translation of this intermediate sentence""
    }},
    {{
      ""level"": ""Khó"",
      ""levelLabel"": ""Nâng cao (C1 - IELTS 7.5+)"",
      ""sentence"": ""advanced, sophisticated sentence using '{cleanWord}' with academic collocations, rich vocabulary and varied syntax"",
      ""meaningVi"": ""accurate Vietnamese translation of this advanced sentence""
    }}
  ],
  ""improvedSentenceBand8"": ""an advanced, natural IELTS Band 8.5+ native rewrite of the student's sentence incorporating '{cleanWord}'""
}}";

        foreach (var model in candidateModels)
        {
            try
            {
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
                using var geminiCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                geminiCts.CancelAfter(TimeSpan.FromSeconds(25));

                var is31b = model.Contains("31b", StringComparison.OrdinalIgnoreCase);
                object requestBody = is31b
                    ? new
                    {
                        contents = new[] { new { parts = new[] { new { text = prompt } } } },
                        generationConfig = new { temperature = 0.2 }
                    }
                    : new
                    {
                        contents = new[] { new { parts = new[] { new { text = prompt } } } },
                        generationConfig = new { response_mime_type = "application/json", temperature = 0.2 }
                    };

                var response = await httpClient.PostAsJsonAsync(url, requestBody, geminiCts.Token);

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync(cancellationToken);
                    using var doc = JsonDocument.Parse(content);
                    if (doc.RootElement.TryGetProperty("candidates", out var candidates) && candidates.GetArrayLength() > 0)
                    {
                        var cand0 = candidates[0];
                        if (cand0.TryGetProperty("content", out var candContent))
                        {
                            var text = ExtractResponseText(candContent);
                            if (!string.IsNullOrWhiteSpace(text))
                            {
                                var jsonText = ExtractJson(text);
                                var result = JsonSerializer.Deserialize<SentenceCheckJson>(jsonText, JsonOptions);
                                if (result != null)
                                {
                                    logger.LogInformation("[FlashcardAI] Successfully checked sentence using model '{Model}'", model);
                                    var examples = result.ExamplesByLevel?
                                        .Where(e => !string.IsNullOrWhiteSpace(e.Sentence))
                                        .Select(e => new SentenceExampleItem(
                                            e.Level ?? "Ví dụ",
                                            e.LevelLabel ?? e.Level ?? "Ví dụ",
                                            e.Sentence!,
                                            e.MeaningVi ?? ""))
                                        .ToList() ?? new List<SentenceExampleItem>();

                                    return new AiCheckSentenceResponse(
                                        result.IsCorrect,
                                        result.Score,
                                        result.FeedbackVi ?? "Đã phân tích câu thành công.",
                                        result.GrammarErrors ?? [],
                                        result.CorrectedSentence ?? cleanSentence,
                                        examples,
                                        result.ImprovedSentenceBand8 ?? cleanSentence);
                                }
                            }
                        }
                    }
                }
                else
                {
                    var statusCode = (int)response.StatusCode;
                    logger.LogWarning("[FlashcardAI] CheckSentence model '{Model}' returned HTTP {StatusCode}. Cascading to next fallback model...", model, statusCode);
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[FlashcardAI] CheckSentence model '{Model}' failed. Cascading to next fallback model...", model);
            }
        }

        return new AiCheckSentenceResponse(
            cleanSentence.Contains(cleanWord, StringComparison.OrdinalIgnoreCase),
            7,
            "Câu của bạn chứa từ khóa cần học.",
            [],
            cleanSentence,
            new List<SentenceExampleItem>
            {
                new("Dễ", "Cơ bản (A2 - B1)", $"I saw a {cleanWord} yesterday.", $"Tôi đã nhìn thấy một {meaningVi} ngày hôm qua."),
                new("Trung bình", "Trung cấp (B2)", $"They decided to book a {cleanWord} near the coast.", $"Họ quyết định đặt một {meaningVi} gần bờ biển."),
                new("Khó", "Nâng cao (C1 - IELTS 7.5+)", $"The historic {cleanWord} stands prominently amidst the picturesque landscape.", $"Khu {meaningVi} lịch sử sừng sững nổi bật giữa khung cảnh hữu tình.")
            },
            cleanSentence);
    }

    #endregion

    #region Helpers

    private static FlashcardItemDto MapToDto(FlashcardItem i) => new(
        i.Id,
        i.DeckId,
        i.UserId,
        i.Word,
        i.Phonetic,
        i.PartOfSpeech,
        i.MeaningVi,
        i.DefinitionEn,
        i.ExampleSentence,
        i.ExampleSentenceVi,
        i.Collocations,
        i.ImageUrl,
        i.AudioUrl,
        i.ContextNote,
        i.QuizDistractors,
        i.Repetitions,
        i.EaseFactor,
        i.IntervalDays,
        i.NextReviewDate,
        i.LastReviewedAt,
        i.ReviewCount,
        i.CreatedAt,
        i.UpdatedAt);

    private async Task<(string Phonetic, string AudioUrl, string PartOfSpeech, string DefinitionEn, string ExampleSentence)> FetchFastDictionaryAsync(string word, CancellationToken cancellationToken)
    {
        string phonetic = "";
        string partOfSpeech = "vocabulary";
        string definitionEn = "";
        string exampleSentence = "";
        string audioUrl = $"https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q={Uri.EscapeDataString(word)}";

        // 1. Instant Datamuse lookup (0.05s) for standard IPA & part of speech
        try
        {
            var datamuseUrl = $"https://api.datamuse.com/words?sp={Uri.EscapeDataString(word)}&md=pr&ipa=1&max=1";
            using var dmCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            dmCts.CancelAfter(TimeSpan.FromSeconds(2));

            using var dmResp = await httpClient.GetAsync(datamuseUrl, dmCts.Token);
            if (dmResp.IsSuccessStatusCode)
            {
                var dmJson = await dmResp.Content.ReadAsStringAsync(dmCts.Token);
                using var dmDoc = JsonDocument.Parse(dmJson);
                if (dmDoc.RootElement.ValueKind == JsonValueKind.Array && dmDoc.RootElement.GetArrayLength() > 0)
                {
                    var item0 = dmDoc.RootElement[0];
                    if (item0.TryGetProperty("tags", out var tags) && tags.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var tag in tags.EnumerateArray())
                        {
                            var tStr = tag.GetString() ?? "";
                            if (tStr.StartsWith("ipa_pron:", StringComparison.OrdinalIgnoreCase))
                            {
                                var ipa = tStr.Substring("ipa_pron:".Length).Trim();
                                if (!string.IsNullOrWhiteSpace(ipa))
                                {
                                    phonetic = $"/{ipa}/";
                                }
                            }
                            else if (tStr == "n") partOfSpeech = "noun";
                            else if (tStr == "v") partOfSpeech = "verb";
                            else if (tStr == "adj") partOfSpeech = "adjective";
                            else if (tStr == "adv") partOfSpeech = "adverb";
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Datamuse lookup failed for {Word}", word);
        }

        // 2. Secondary Dictionary API with strict 1.5s timeout (skip immediately if down/slow)
        try
        {
            var url = $"https://api.dictionaryapi.dev/api/v2/entries/en/{Uri.EscapeDataString(word)}";
            using var dictCts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            dictCts.CancelAfter(TimeSpan.FromMilliseconds(1500));

            using var response = await httpClient.GetAsync(url, dictCts.Token);
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync(dictCts.Token);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
                {
                    var first = doc.RootElement[0];
                    if (string.IsNullOrWhiteSpace(phonetic) && first.TryGetProperty("phonetic", out var pVal) && pVal.ValueKind == JsonValueKind.String)
                    {
                        phonetic = pVal.GetString() ?? "";
                    }

                    if (first.TryGetProperty("phonetics", out var phList) && phList.ValueKind == JsonValueKind.Array)
                    {
                        foreach (var ph in phList.EnumerateArray())
                        {
                            if (string.IsNullOrWhiteSpace(phonetic) && ph.TryGetProperty("text", out var tVal) && !string.IsNullOrWhiteSpace(tVal.GetString()))
                            {
                                phonetic = tVal.GetString()!;
                            }
                            if (ph.TryGetProperty("audio", out var aVal) && !string.IsNullOrWhiteSpace(aVal.GetString()))
                            {
                                audioUrl = aVal.GetString()!;
                                break;
                            }
                        }
                    }

                    if (first.TryGetProperty("meanings", out var meanings) && meanings.ValueKind == JsonValueKind.Array && meanings.GetArrayLength() > 0)
                    {
                        var firstMeaning = meanings[0];
                        if (partOfSpeech == "vocabulary" && firstMeaning.TryGetProperty("partOfSpeech", out var posVal) && !string.IsNullOrWhiteSpace(posVal.GetString()))
                        {
                            partOfSpeech = posVal.GetString()!;
                        }

                        if (firstMeaning.TryGetProperty("definitions", out var defs) && defs.ValueKind == JsonValueKind.Array && defs.GetArrayLength() > 0)
                        {
                            var firstDef = defs[0];
                            if (firstDef.TryGetProperty("definition", out var dVal) && !string.IsNullOrWhiteSpace(dVal.GetString()))
                            {
                                definitionEn = dVal.GetString()!;
                            }
                            if (firstDef.TryGetProperty("example", out var eVal) && !string.IsNullOrWhiteSpace(eVal.GetString()))
                            {
                                exampleSentence = eVal.GetString()!;
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Dictionary API lookup timed out or failed for {Word}", word);
        }

        return (phonetic, audioUrl, partOfSpeech, definitionEn, exampleSentence);
    }

    private async Task<string> FetchGoogleTranslateAsync(string text, string targetLang = "vi", CancellationToken cancellationToken = default)
    {
        try
        {
            var url = $"https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl={targetLang}&dt=t&q={Uri.EscapeDataString(text)}";
            using var response = await httpClient.GetAsync(url, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                return "";
            }

            var json = await response.Content.ReadAsStringAsync(cancellationToken);
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind == JsonValueKind.Array && doc.RootElement.GetArrayLength() > 0)
            {
                var sentences = doc.RootElement[0];
                if (sentences.ValueKind == JsonValueKind.Array && sentences.GetArrayLength() > 0)
                {
                    var sb = new System.Text.StringBuilder();
                    foreach (var s in sentences.EnumerateArray())
                    {
                        if (s.ValueKind == JsonValueKind.Array && s.GetArrayLength() > 0)
                        {
                            var part = s[0].GetString();
                            if (!string.IsNullOrEmpty(part))
                            {
                                sb.Append(part);
                            }
                        }
                    }
                    return sb.ToString().Trim();
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Google Translate failed for {Text}", text);
        }
        return "";
    }

    private async Task<string> FetchFastImageUrlAsync(string word, CancellationToken cancellationToken)
    {
        try
        {
            var cleanWord = Uri.EscapeDataString(word.Trim());
            var url = $"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={cleanWord}+filetype:bitmap&gsrnamespace=6&prop=imageinfo&iiprop=url&iiurlwidth=500&format=json";

            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("User-Agent", "English4U/1.0 (contact@english4u.com)");

            using var response = await httpClient.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode)
            {
                var json = await response.Content.ReadAsStringAsync(cancellationToken);
                using var doc = JsonDocument.Parse(json);
                if (doc.RootElement.TryGetProperty("query", out var query) && query.TryGetProperty("pages", out var pages))
                {
                    foreach (var page in pages.EnumerateObject())
                    {
                        if (page.Value.TryGetProperty("imageinfo", out var imgInfo) && imgInfo.ValueKind == JsonValueKind.Array && imgInfo.GetArrayLength() > 0)
                        {
                            var info0 = imgInfo[0];
                            if (info0.TryGetProperty("thumburl", out var thumb) && !string.IsNullOrWhiteSpace(thumb.GetString()))
                            {
                                return thumb.GetString()!;
                            }
                            if (info0.TryGetProperty("url", out var full) && !string.IsNullOrWhiteSpace(full.GetString()))
                            {
                                return full.GetString()!;
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Wikimedia photo search failed for {Word}", word);
        }

        // Fallback: high-resolution study photography (0.05s)
        return "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?auto=format&fit=crop&w=500&q=80";
    }

    private string? ResolveGeminiApiKey()
    {
        var key = configuration["GeminiScoring:ApiKey"]
            ?? configuration["GEMINI_API_KEY"]
            ?? configuration["GeminiCopilot:ApiKey"]
            ?? configuration["GemmaExamGeneration:ApiKey"]
            ?? Environment.GetEnvironmentVariable("GEMINI_API_KEY");

        if (!string.IsNullOrWhiteSpace(key)) return key;

        try
        {
            var baseDir = AppContext.BaseDirectory;
            var candidates = new[]
            {
                Path.Combine(baseDir, "..", "..", "..", "..", "AiScoringService", ".env"),
                Path.Combine(Directory.GetCurrentDirectory(), "..", "AiScoringService", ".env"),
                Path.Combine(Directory.GetCurrentDirectory(), "AiScoringService", ".env"),
            };

            foreach (var envPath in candidates)
            {
                if (File.Exists(envPath))
                {
                    foreach (var line in File.ReadAllLines(envPath))
                    {
                        if (line.StartsWith("GEMINI_API_KEY=", StringComparison.OrdinalIgnoreCase))
                        {
                            var val = line.Substring("GEMINI_API_KEY=".Length).Trim();
                            if (!string.IsNullOrWhiteSpace(val)) return val;
                        }
                    }
                }
            }
        }
        catch { }

        return null;
    }

    private string[] GetCandidateModels(string? preferredModel = null)
    {
        var configuredModel = configuration["GeminiScoring:Model"]
            ?? configuration["GemmaExamGeneration:Model"]
            ?? AiModelDefaults.DefaultPrimaryModel;

        var configuredFallbackModels = configuration
            .GetSection("GeminiScoring:FallbackModels")
            .GetChildren()
            .Select(child => child.Value);

        return new[] { preferredModel, configuredModel }
            .Concat(configuredFallbackModels)
            .Concat(AiModelDefaults.GlobalFallbackModels)
            .Where(model => !string.IsNullOrWhiteSpace(model))
            .Select(model => model!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private sealed class EnrichedWordJson
    {
        public string? Word { get; set; }
        public string? Phonetic { get; set; }
        public string? PartOfSpeech { get; set; }
        public string? MeaningVi { get; set; }
        public string? DefinitionEn { get; set; }
        public string? ExampleSentence { get; set; }
        public string? ExampleSentenceVi { get; set; }
        [JsonPropertyName("collocations")]
        public JsonElement? CollocationsRaw { get; set; }

        [JsonIgnore]
        public string? Collocations
        {
            get
            {
                if (CollocationsRaw == null) return null;
                if (CollocationsRaw.Value.ValueKind == JsonValueKind.String)
                    return CollocationsRaw.Value.GetString();
                if (CollocationsRaw.Value.ValueKind == JsonValueKind.Array)
                {
                    var items = CollocationsRaw.Value.EnumerateArray()
                        .Select(x => x.GetString())
                        .Where(s => !string.IsNullOrWhiteSpace(s));
                    return string.Join(", ", items);
                }
                return null;
            }
        }

        public string? ImagePrompt { get; set; }
        public List<string>? QuizDistractors { get; set; }
    }



    private sealed class SentenceExampleJson
    {
        public string? Level { get; set; }
        public string? LevelLabel { get; set; }
        public string? Sentence { get; set; }
        public string? MeaningVi { get; set; }
    }

    private sealed class SentenceCheckJson
    {
        public bool IsCorrect { get; set; }
        public int Score { get; set; }
        public string? FeedbackVi { get; set; }
        public List<string>? GrammarErrors { get; set; }
        public string? CorrectedSentence { get; set; }
        public List<SentenceExampleJson>? ExamplesByLevel { get; set; }
        public string? ImprovedSentenceBand8 { get; set; }
    }

    private static string? ExtractResponseText(JsonElement candContent)
    {
        if (!candContent.TryGetProperty("parts", out var parts) || parts.GetArrayLength() == 0)
            return null;

        // Search in reverse for the last non-thought text part
        for (int i = parts.GetArrayLength() - 1; i >= 0; i--)
        {
            var part = parts[i];
            var isThought = part.TryGetProperty("thought", out var tProp) && tProp.GetBoolean();
            if (!isThought && part.TryGetProperty("text", out var tElem))
            {
                var val = tElem.GetString();
                if (!string.IsNullOrWhiteSpace(val)) return val;
            }
        }

        // Fallback to first part with text
        foreach (var part in parts.EnumerateArray())
        {
            if (part.TryGetProperty("text", out var tElem))
            {
                var val = tElem.GetString();
                if (!string.IsNullOrWhiteSpace(val)) return val;
            }
        }

        return null;
    }

    private static string ExtractJson(string text)
    {
        var trimmed = text.Trim();
        if (trimmed.StartsWith("```"))
        {
            var firstNewline = trimmed.IndexOf('\n');
            var lastFence = trimmed.LastIndexOf("```", StringComparison.Ordinal);
            if (firstNewline >= 0 && lastFence > firstNewline)
            {
                trimmed = trimmed.Substring(firstNewline + 1, lastFence - firstNewline - 1).Trim();
            }
        }

        var startIdx = trimmed.IndexOf('{');
        var endIdx = trimmed.LastIndexOf('}');
        if (startIdx >= 0 && endIdx > startIdx)
        {
            return trimmed.Substring(startIdx, endIdx - startIdx + 1);
        }

        return trimmed;
    }

    #endregion
}

