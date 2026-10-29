using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using EnglishExamApp.Application.DTOs.Dictation;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Application.Services;

public sealed class DictationService(
    IConfiguration configuration,
    HttpClient httpClient,
    ILogger<DictationService> logger) : IDictationService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    private static readonly string[] FunctionWordList =
    [
        "a", "an", "the", "in", "on", "at", "to", "for", "of", "with", "by", "from",
        "and", "or", "but", "is", "am", "are", "was", "were", "it", "its", "as", "that"
    ];

    public async Task<DictationExerciseDto> GenerateExerciseAsync(
        DictationGenerateRequestDto request,
        CancellationToken cancellationToken = default)
    {
        var format = (request.Format ?? "sentences").Trim().ToLowerInvariant();
        var topic = string.IsNullOrWhiteSpace(request.Topic) ? "daily" : request.Topic.Trim();
        var level = (request.Level ?? "medium").Trim().ToLowerInvariant();
        var count = request.Count <= 0 ? 5 : Math.Clamp(request.Count, 3, 10);

        var apiKey = ResolveGeminiApiKey();
        if (!string.IsNullOrWhiteSpace(apiKey))
        {
            var aiResult = await TryGenerateWithGeminiAsync(format, topic, level, count, apiKey, cancellationToken);
            if (aiResult != null)
            {
                return aiResult;
            }
        }

        // Fallback to high-quality curated preset content if AI is unreachable
        logger.LogInformation("[Dictation] Using curated preset fallback for topic: {Topic}, format: {Format}, level: {Level}", topic, format, level);
        return GetFallbackExercise(format, topic, level, count);
    }

    private async Task<DictationExerciseDto?> TryGenerateWithGeminiAsync(
        string format,
        string topic,
        string level,
        int count,
        string apiKey,
        CancellationToken cancellationToken)
    {
        string[] candidateModels =
        [
            "gemini-2.5-flash",
            "gemini-2.5-flash-lite",
            "gemini-1.5-flash",
            "gemini-3.1-flash-lite",
            "gemini-1.5-pro",
            "gemini-2.0-flash"
        ];

        var randomSession = Random.Shared.Next(100000, 999999);
        var subThemes = new[]
        {
            "daily routines, surprising coincidences, and casual conversations",
            "urban commuting, subway experiences, and coffee shop culture",
            "weekend outdoor getaways, unexpected weather, and hiking trails",
            "modern workplace dynamics, collaborative teamwork, and remote flexibility",
            "culinary adventures, traditional recipes, and farmers markets",
            "technology innovations, smart home devices, and artificial intelligence",
            "health habits, mindfulness, gym workouts, and nutritional choices",
            "travel itineraries, scenic landmarks, airport layovers, and cultural encounters",
            "student life, academic research discoveries, library discussions, and graduation dreams"
        };
        var inspirationAngle = subThemes[Random.Shared.Next(subThemes.Length)];

        var prompt = $@"You are an elite English Listening & Dictation Coach.
Generate a completely NEW, UNIQUE, and DYNAMIC English dictation exercise for Session #{randomSession}:
- Format: ""{format}"" (""sentences"", ""paragraph"", or ""cloze"")
- Topic: ""{topic}"" (Creative inspiration angle: {inspirationAngle})
- Target Level: ""{level}"" (easy: A2-B1, medium: B1-B2, hard: B2-C1)
- Quantity: {count} items

CRITICAL REQUIREMENTS FOR VARIETY:
1. Every generation MUST be 100% fresh, varied, and distinctive. Do NOT repeat cliché sentences (avoid 'She usually wakes up around seven' or 'The global shift toward renewable energy'). Craft vivid, natural modern conversational or journalistic English.
2. For each sentence, identify ""blindSpots"": array of short function words (articles: a, an, the; prepositions: in, on, at, to, of, for, with; conjunctions: and, but, as; pronouns: it, its, that; auxiliary: is, was, have, can) present in the sentence that learners typically miss in connected speech / weak forms.
3. If format is ""paragraph"", compose 3 to 6 cohesive, narrative or descriptive sentences that flow smoothly like a modern podcast or story. The ""fullParagraph"" must be the concatenation of all sentences in chronological order.
4. If format is ""cloze"", mark 2-3 target words (especially blind spots and vocabulary) with isMasked=true in ""clozeTokens"".

Return ONLY valid JSON with this exact schema:
{{
  ""title"": ""A short catchy title in English"",
  ""fullParagraph"": {(format == "paragraph" ? "\"The complete full paragraph text in English\"" : "null")},
  ""fullTranslation"": {(format == "paragraph" ? "\"Bản dịch tiếng Việt hoàn chỉnh của cả đoạn văn\"" : "null")},
  ""items"": [
    {{
      ""id"": 1,
      ""sentence"": ""Full English sentence."",
      ""translation"": ""Bản dịch tiếng Việt tự nhiên và chuẩn xác."",
      ""blindSpots"": [""the"", ""to"", ""in""],
      ""focusWord"": ""optional key vocabulary word in the sentence"",
      ""focusWordDefinition"": ""concise Vietnamese definition of focusWord""
    }}
  ]
}}";

        foreach (var model in candidateModels)
        {
            try
            {
                var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
                using var cts = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                cts.CancelAfter(TimeSpan.FromSeconds(15));

                var requestBody = new
                {
                    contents = new[] { new { parts = new[] { new { text = prompt } } } },
                    generationConfig = new { response_mime_type = "application/json", temperature = 0.85 }
                };

                using var httpRequest = new HttpRequestMessage(HttpMethod.Post, url)
                {
                    Content = JsonContent.Create(requestBody, options: JsonOptions)
                };
                httpRequest.Headers.TryAddWithoutValidation("x-goog-api-key", apiKey);

                var response = await httpClient.SendAsync(httpRequest, cts.Token);
                if (!response.IsSuccessStatusCode)
                {
                    logger.LogWarning("[Dictation] Model '{Model}' returned status {Status}. Trying next model...", model, response.StatusCode);
                    continue;
                }

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
                            var parsed = JsonSerializer.Deserialize<GeminiDictationResponse>(jsonText, JsonOptions);
                            if (parsed?.Items != null && parsed.Items.Count > 0)
                            {
                                logger.LogInformation("[Dictation] Successfully generated dynamic dictation with model '{Model}' (Session: #{Session})", model, randomSession);
                                return MapToExerciseDto(parsed, format, topic, level);
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[Dictation] Gemini model '{Model}' failed for topic '{Topic}'", model, topic);
            }
        }

        return null;
    }

    private static DictationExerciseDto MapToExerciseDto(
        GeminiDictationResponse raw,
        string format,
        string topic,
        string level)
    {
        if (raw.Items == null || raw.Items.Count == 0)
        {
            return GetFallbackExercise(format, topic, level, 5);
        }

        var items = new List<DictationItemDto>();
        var idCounter = 1;

        foreach (var item in raw.Items)
        {
            var sentence = (item.Sentence ?? string.Empty).Trim();
            if (string.IsNullOrEmpty(sentence)) continue;

            var blindSpots = item.BlindSpots?.Count > 0
                ? item.BlindSpots.Select(s => s.Trim().ToLowerInvariant()).Distinct().ToList()
                : DetectBlindSpots(sentence);

            var clozeTokens = format == "cloze"
                ? BuildClozeTokens(sentence, blindSpots)
                : null;

            items.Add(new DictationItemDto(
                idCounter++,
                sentence,
                item.Translation ?? "Bản dịch đang được cập nhật.",
                blindSpots,
                clozeTokens,
                item.FocusWord,
                item.FocusWordDefinition
            ));
        }

        var title = string.IsNullOrWhiteSpace(raw.Title)
            ? $"Dictation Practice: {FormatTopicTitle(topic)}"
            : raw.Title.Trim();

        var fullParagraph = raw.FullParagraph;
        if (string.IsNullOrWhiteSpace(fullParagraph) && format == "paragraph")
        {
            fullParagraph = string.Join(" ", items.Select(i => i.Sentence));
        }

        var fullTranslation = raw.FullTranslation;
        if (string.IsNullOrWhiteSpace(fullTranslation) && format == "paragraph")
        {
            fullTranslation = string.Join(" ", items.Select(i => i.Translation));
        }

        return new DictationExerciseDto(
            format,
            topic,
            level,
            title,
            fullParagraph,
            fullTranslation,
            items
        );
    }

    private static IReadOnlyList<string> DetectBlindSpots(string sentence)
    {
        var words = Regex.Split(sentence.ToLowerInvariant(), @"\W+")
            .Where(w => !string.IsNullOrWhiteSpace(w))
            .Distinct();

        return words.Where(w => FunctionWordList.Contains(w)).ToList();
    }

    private static IReadOnlyList<DictationClozeTokenDto> BuildClozeTokens(string sentence, IReadOnlyList<string> blindSpots)
    {
        var words = sentence.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        var tokens = new List<DictationClozeTokenDto>();
        var blindSet = new HashSet<string>(blindSpots.Select(b => b.ToLowerInvariant()));

        var maskedCount = 0;
        foreach (var word in words)
        {
            var clean = Regex.Replace(word, @"[^\w]", "").ToLowerInvariant();
            var isBlind = blindSet.Contains(clean);

            // Mask roughly 30% of words (favoring blindspots and words with length > 4)
            bool shouldMask = false;
            if (isBlind && maskedCount < 3)
            {
                shouldMask = true;
                maskedCount++;
            }
            else if (clean.Length > 5 && maskedCount < 2)
            {
                shouldMask = true;
                maskedCount++;
            }

            tokens.Add(new DictationClozeTokenDto(word, shouldMask, shouldMask && clean.Length > 2 ? $"{clean[0]}..." : null));
        }

        return tokens;
    }

    private static string ExtractResponseText(JsonElement contentElement)
    {
        if (contentElement.TryGetProperty("parts", out var parts) && parts.GetArrayLength() > 0)
        {
            var textParts = new List<string>();
            foreach (var part in parts.EnumerateArray())
            {
                if (part.TryGetProperty("text", out var textProp))
                {
                    textParts.Add(textProp.GetString() ?? "");
                }
            }
            return string.Join("\n", textParts);
        }
        return string.Empty;
    }

    private static string ExtractJson(string text)
    {
        var match = Regex.Match(text, @"```(?:json)?\s*([\s\S]*?)\s*```");
        if (match.Success)
        {
            return match.Groups[1].Value.Trim();
        }
        var start = text.IndexOf('{');
        var end = text.LastIndexOf('}');
        if (start >= 0 && end > start)
        {
            return text[start..(end + 1)].Trim();
        }
        return text.Trim();
    }

    private string? ResolveGeminiApiKey()
    {
        var configured = FirstNonEmpty(
            configuration["Gemini:ApiKey"],
            configuration["GeminiScoring:ApiKey"],
            configuration["GeminiCopilot:ApiKey"],
            configuration["GemmaExamGeneration:ApiKey"],
            Environment.GetEnvironmentVariable("Gemini__ApiKey"),
            Environment.GetEnvironmentVariable("GeminiScoring__ApiKey"),
            Environment.GetEnvironmentVariable("GeminiCopilot__ApiKey"),
            Environment.GetEnvironmentVariable("GEMINI_API_KEY")
        );

        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        try
        {
            var currentDir = new DirectoryInfo(Directory.GetCurrentDirectory());
            for (var dir = currentDir; dir != null; dir = dir.Parent)
            {
                var found = ReadApiKeyFromEnvFile(Path.Combine(dir.FullName, "AiScoringService", ".env"))
                         ?? ReadApiKeyFromEnvFile(Path.Combine(dir.FullName, ".env"));
                if (!string.IsNullOrWhiteSpace(found))
                {
                    return found;
                }
            }
        }
        catch
        {
            // Ignore
        }

        return null;
    }

    private static string? ReadApiKeyFromEnvFile(string filePath)
    {
        if (!File.Exists(filePath)) return null;
        try
        {
            foreach (var line in File.ReadAllLines(filePath))
            {
                var trimmed = line.Trim();
                if (trimmed.StartsWith('#') || !trimmed.Contains('=')) continue;
                var parts = trimmed.Split('=', 2);
                var key = parts[0].Trim();
                var val = parts[1].Trim().Trim('"', '\'');
                if (key.Equals("GEMINI_API_KEY", StringComparison.OrdinalIgnoreCase) ||
                    key.Equals("GEMINI_SCORING_API_KEY", StringComparison.OrdinalIgnoreCase) ||
                    key.Equals("GOOGLE_API_KEY", StringComparison.OrdinalIgnoreCase))
                {
                    if (!string.IsNullOrWhiteSpace(val)) return val;
                }
            }
        }
        catch
        {
            // Ignore
        }
        return null;
    }

    private static string? FirstNonEmpty(params string?[] candidates) =>
        candidates.FirstOrDefault(c => !string.IsNullOrWhiteSpace(c))?.Trim();

    private static DictationExerciseDto GetFallbackExercise(string format, string topic, string level, int count)
    {
        var isParagraph = format == "paragraph";

        if (isParagraph)
        {
            var paragraphTemplates = new[]
            {
                (
                    "Morning Coffee & City Life",
                    "A warm cup of coffee is the quintessential start to a busy day in the city. Commuters gather at their neighborhood cafes to chat briefly before catching the train. The gentle morning sunlight breaks through the glass skyscrapers, illuminating bustling avenues. A peaceful morning ritual brings clarity and energy to tackle any upcoming challenge.",
                    "Một tách cà phê ấm nóng là khởi đầu tinh tế cho một ngày bận rộn nơi thành phố. Những người đi làm tụ họp tại quán cà phê quen thuộc để trò chuyện ngắn trước khi bắt chuyến tàu. Ánh nắng ban mai nhẹ nhàng xuyên qua các tòa nhà kính chọc trời, thắp sáng những đại lộ nhộn nhịp. Một nghi thức buổi sáng yên bình mang lại sự minh mẫn và năng lượng để đối mặt với mọi thử thách sắp tới.",
                    new List<DictationItemDto>
                    {
                        new(1, "A warm cup of coffee is the quintessential start to a busy day in the city.", "Một tách cà phê ấm nóng là khởi đầu tinh tế cho một ngày bận rộn nơi thành phố.", ["a", "of", "is", "the", "to", "in"], null, "quintessential", "tinh túy, mẫu mực"),
                        new(2, "Commuters gather at their neighborhood cafes to chat briefly before catching the train.", "Những người đi làm tụ họp tại quán cà phê quen thuộc để trò chuyện ngắn trước khi bắt chuyến tàu.", ["at", "their", "to", "before", "the"], null, "commuters", "người đi làm hàng ngày"),
                        new(3, "The gentle morning sunlight breaks through the glass skyscrapers, illuminating bustling avenues.", "Ánh nắng ban mai nhẹ nhàng xuyên qua các tòa nhà kính chọc trời, thắp sáng những đại lộ nhộn nhịp.", ["the", "through", "the"], null, "illuminating", "chiếu rọi, thắp sáng"),
                        new(4, "A peaceful morning ritual brings clarity and energy to tackle any upcoming challenge.", "Một nghi thức buổi sáng yên bình mang lại sự minh mẫn và năng lượng để đối mặt với mọi thử thách sắp tới.", ["a", "and", "to", "any"], null, "ritual", "nghi thức, thói quen")
                    }
                ),
                (
                    "Renewable Energy & Sustainable Growth",
                    "The global shift toward renewable energy has accelerated dramatically in recent years. Governments and private corporations are investing billions of dollars into wind and solar infrastructure. However, developing effective energy storage systems remains a crucial challenge for sustainable growth. Experts believe that continuous technological innovation will make clean energy accessible to all nations.",
                    "Sự chuyển dịch toàn cầu sang năng lượng tái tạo đã tăng tốc mạnh mẽ trong những năm gần đây. Các chính phủ và tập đoàn tư nhân đang đầu tư hàng tỷ đô la vào cơ sở hạ tầng gió và mặt trời. Tuy nhiên, việc phát triển các hệ thống lưu trữ năng lượng hiệu quả vẫn là một thách thức then chốt cho sự phát triển bền vững. Các chuyên gia tin rằng đổi mới công nghệ liên tục sẽ giúp năng lượng sạch tiếp cận được với mọi quốc gia.",
                    new List<DictationItemDto>
                    {
                        new(1, "The global shift toward renewable energy has accelerated dramatically in recent years.", "Sự chuyển dịch toàn cầu sang năng lượng tái tạo đã tăng tốc mạnh mẽ trong những năm gần đây.", ["the", "in", "has"], null, "accelerated", "tăng tốc, thúc đẩy"),
                        new(2, "Governments and private corporations are investing billions of dollars into wind and solar infrastructure.", "Các chính phủ và tập đoàn tư nhân đang đầu tư hàng tỷ đô la vào cơ sở hạ tầng gió và mặt trời.", ["and", "into", "of"], null, "infrastructure", "cơ sở hạ tầng"),
                        new(3, "However, developing effective energy storage systems remains a crucial challenge for sustainable growth.", "Tuy nhiên, việc phát triển các hệ thống lưu trữ năng lượng hiệu quả vẫn là một thách thức then chốt cho sự phát triển bền vững.", ["a", "for"], null, "sustainable", "bền vững"),
                        new(4, "Experts believe that continuous technological innovation will make clean energy accessible to all nations.", "Các chuyên gia tin rằng đổi mới công nghệ liên tục sẽ giúp năng lượng sạch tiếp cận được với mọi quốc gia.", ["that", "to"], null, "continuous", "liên tục")
                    }
                ),
                (
                    "Remote Collaboration & Modern Workspaces",
                    "Digital tools have completely transformed how international teams collaborate across different time zones. Flexible working arrangements allow professionals to balance productive careers with meaningful family time. Clear asynchronous communication reduces unnecessary meetings and sharpens strategic decision making. Embracing diversity in remote environments fosters unprecedented creativity and innovation.",
                    "Các công cụ kỹ thuật số đã thay đổi hoàn toàn cách các đội ngũ quốc tế hợp tác qua nhiều múi giờ khác nhau. Sắp xếp làm việc linh hoạt cho phép người đi làm cân bằng sự nghiệp hiệu quả với thời gian ý nghĩa bên gia đình. Giao tiếp bất đồng bộ rõ ràng giúp giảm bớt các cuộc họp không cần thiết và tăng độ sắc bén trong ra quyết định chiến lược. Tận dụng sự đa dạng trong môi trường làm việc từ xa thúc đẩy sự sáng tạo và đổi mới chưa từng có.",
                    new List<DictationItemDto>
                    {
                        new(1, "Digital tools have completely transformed how international teams collaborate across different time zones.", "Các công cụ kỹ thuật số đã thay đổi hoàn toàn cách các đội ngũ quốc tế hợp tác qua nhiều múi giờ khác nhau.", ["have", "how", "across"], null, "collaborate", "hợp tác làm việc"),
                        new(2, "Flexible working arrangements allow professionals to balance productive careers with meaningful family time.", "Sắp xếp làm việc linh hoạt cho phép người đi làm cân bằng sự nghiệp hiệu quả với thời gian ý nghĩa bên gia đình.", ["to", "with"], null, "arrangements", "sự sắp xếp"),
                        new(3, "Clear asynchronous communication reduces unnecessary meetings and sharpens strategic decision making.", "Giao tiếp bất đồng bộ rõ ràng giúp giảm bớt các cuộc họp không cần thiết và tăng độ sắc bén trong ra quyết định chiến lược.", ["and", "in"], null, "asynchronous", "bất đồng bộ"),
                        new(4, "Embracing diversity in remote environments fosters unprecedented creativity and innovation.", "Tận dụng sự đa dạng trong môi trường làm việc từ xa thúc đẩy sự sáng tạo và đổi mới chưa từng có.", ["in", "and"], null, "unprecedented", "chưa từng có")
                    }
                )
            };

            var picked = paragraphTemplates[Random.Shared.Next(paragraphTemplates.Length)];
            return new DictationExerciseDto(
                format,
                topic,
                level,
                picked.Item1,
                picked.Item2,
                picked.Item3,
                picked.Item4
            );
        }

        var fullSentenceBank = new List<DictationItemDto>
        {
            new(1, "Could you please send me the updated project timeline by the end of today?", "Bạn có thể vui lòng gửi cho tôi tiến độ dự án đã cập nhật vào cuối ngày hôm nay không?", ["you", "the", "by", "of"], null, "timeline", "tiến độ, thời gian biểu"),
            new(2, "Many students struggle with listening comprehension because native speakers connect their words naturally.", "Nhiều học sinh gặp khó khăn với việc nghe hiểu vì người bản xứ nối âm một cách tự nhiên.", ["with", "because", "their"], null, "comprehension", "sự thấu hiểu, khả năng hiểu"),
            new(3, "The university offers a wide range of scholarships to support international research programs.", "Trường đại học cung cấp rất nhiều học bổng để hỗ trợ các chương trình nghiên cứu quốc tế.", ["the", "a", "of", "to"], null, "scholarships", "học bổng"),
            new(4, "Regular physical exercise not only improves cardiovascular health but also reduces stress levels.", "Tập thể dục thường xuyên không chỉ cải thiện sức khỏe tim mạch mà còn giảm bớt mức độ căng thẳng.", ["not", "but", "also"], null, "cardiovascular", "thuộc về tim mạch"),
            new(5, "I decided to take a short break after working continuously for five hours.", "Tôi quyết định nghỉ ngơi một chút sau khi làm việc liên tục suốt năm giờ đồng hồ.", ["to", "a", "after", "for"], null, "continuously", "liên tục, không ngừng"),
            new(6, "Environmental pollution has become one of the most pressing concerns in modern cities.", "Ô nhiễm môi trường đã trở thành một trong những mối quan tâm cấp bách nhất ở các đô thị hiện đại.", ["one", "of", "the", "in"], null, "pressing", "cấp bách, khẩn thiết"),
            new(7, "She booked a round-trip ticket to Tokyo for her upcoming summer vacation.", "Cô ấy đã đặt vé khứ hồi đi Tokyo cho kỳ nghỉ hè sắp tới của mình.", ["a", "to", "for", "her"], null, "round-trip", "khứ hồi"),
            new(8, "Learning how to navigate public transit in a foreign country requires patience and adaptability.", "Học cách đi phương tiện công cộng ở một quốc gia xa lạ đòi hỏi sự kiên nhẫn và khả năng thích nghi.", ["how", "to", "in", "a", "and"], null, "adaptability", "khả năng thích nghi"),
            new(9, "Artificial intelligence is reshaping numerous industries by automating tedious manual tasks.", "Trí tuệ nhân tạo đang định hình lại vô số ngành công nghiệp bằng cách tự động hóa các tác vụ thủ công nhàm chán.", ["is", "by"], null, "reshaping", "định hình lại"),
            new(10, "A balanced diet combined with adequate sleep significantly enhances mental focus during examinations.", "Một chế độ ăn cân bằng kết hợp với giấc ngủ đầy đủ giúp tăng cường đáng kể sự tập trung trong kỳ thi.", ["a", "with", "during"], null, "adequate", "đầy đủ, thích đáng")
        };

        var shuffled = fullSentenceBank.OrderBy(_ => Random.Shared.Next()).Take(count).ToList();
        for (var i = 0; i < shuffled.Count; i++)
        {
            var it = shuffled[i];
            shuffled[i] = new DictationItemDto(
                i + 1,
                it.Sentence,
                it.Translation,
                it.BlindSpots,
                format == "cloze" ? BuildClozeTokens(it.Sentence, it.BlindSpots) : null,
                it.FocusWord,
                it.FocusWordDefinition
            );
        }

        return new DictationExerciseDto(
            format,
            topic,
            level,
            $"English Dictation: {FormatTopicTitle(topic)}",
            null,
            null,
            shuffled
        );
    }

    private static string FormatTopicTitle(string topic) =>
        string.IsNullOrWhiteSpace(topic) ? "Daily" : char.ToUpperInvariant(topic[0]) + (topic.Length > 1 ? topic[1..] : "");

    private sealed class GeminiDictationResponse
    {
        public string? Title { get; set; }
        public string? FullParagraph { get; set; }
        public string? FullTranslation { get; set; }
        public List<GeminiDictationItem>? Items { get; set; }
    }

    private sealed class GeminiDictationItem
    {
        public string? Sentence { get; set; }
        public string? Translation { get; set; }
        public List<string>? BlindSpots { get; set; }
        public string? FocusWord { get; set; }
        public string? FocusWordDefinition { get; set; }
    }
}
