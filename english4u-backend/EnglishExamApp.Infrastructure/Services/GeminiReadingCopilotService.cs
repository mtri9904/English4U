using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using EnglishExamApp.Application.DTOs.Copilot;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GeminiReadingCopilotService(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<GeminiReadingCopilotService> logger) : IReadingCopilotService
{
    private const string DefaultModel = "gemini-2.5-flash";
    private const string DefaultFallbackModel = "gemini-2.5-flash-lite";
    private const string DefaultWritingModel = "gemini-2.5-flash-lite";
    private const string DefaultWritingFallbackModel = "gemini-2.5-flash";
    private const int MaxContinuationPasses = 3;
    private const string MaxTokensFinishReason = "MAX_TOKENS";
    private const string StopFinishReason = "STOP";
    private const string ContinuationPrompt =
        "Tiếp tục ngay đúng phần câu trả lời đang dở. Không lặp lại ý đã nói, không mở đầu lại, chỉ viết tiếp phần còn lại bằng tiếng Việt.";
    private const string TruncatedNotice =
        "\n\nPhần trả lời đang quá dài nên tạm dừng tại đây. Bạn có thể nhắn \"tiếp tục\" để tôi nối đúng phần còn lại.";
    private const int MaxContextImagesPerRequest = 4;
    private const int MaxImageBytes = 4 * 1024 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private readonly string _apiKey = GeminiConfiguration.ResolveApiKey(
        configuration,
        "GeminiCopilot:ApiKey");

    private readonly string[] _defaultModelCandidates = BuildModelCandidates(configuration);
    private readonly string[] _writingModelCandidates = BuildWritingModelCandidates(configuration);
    private readonly double _temperature = configuration.GetValue<double?>("GeminiCopilot:Temperature") ?? 0.25d;
    private readonly int _maxOutputTokens = Math.Clamp(
        configuration.GetValue<int?>("GeminiCopilot:MaxOutputTokens") ?? 2048,
        256,
        4096);

    public async Task StreamChatAsync(
        CopilotChatRequestDto request,
        Func<string, CancellationToken, Task> onTextDelta,
        CancellationToken cancellationToken = default)
    {
        ValidateRequest(request);

        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            throw new InvalidOperationException(
                GeminiConfiguration.BuildMissingApiKeyMessage("Gemini copilot", "GeminiCopilot:ApiKey"));
        }

        var history = (request.ChatHistory ?? [])
            .Where(item => !string.IsNullOrWhiteSpace(item.Content))
            .Select(item => new CopilotChatMessageDto(NormalizeRole(item.Role), item.Content.Trim()))
            .ToList();

        var pendingUserMessage = request.UserMessage.Trim();
        for (var continuationPass = 0; continuationPass < MaxContinuationPasses; continuationPass++)
        {
            var response = await StreamSinglePassAsync(
                request.Context,
                history,
                pendingUserMessage,
                onTextDelta,
                cancellationToken);

            history.Add(new CopilotChatMessageDto("user", pendingUserMessage));
            if (!string.IsNullOrWhiteSpace(response.EmittedText))
            {
                history.Add(new CopilotChatMessageDto("model", response.EmittedText));
            }

            if (!ShouldContinueResponse(response))
            {
                return;
            }

            var canContinue = continuationPass < MaxContinuationPasses - 1
                && !string.IsNullOrWhiteSpace(response.EmittedText);

            if (!canContinue)
            {
                await onTextDelta(TruncatedNotice, cancellationToken);
                return;
            }

            pendingUserMessage = ContinuationPrompt;
        }
    }

    private static bool ShouldContinueResponse(GeminiStreamPassResult response)
    {
        if (string.IsNullOrWhiteSpace(response.EmittedText))
        {
            return false;
        }

        if (string.Equals(response.FinishReason, MaxTokensFinishReason, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (string.Equals(response.FinishReason, StopFinishReason, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return LooksTruncated(response.EmittedText);
    }

    private static bool LooksTruncated(string value)
    {
        var trimmed = value.TrimEnd();
        if (string.IsNullOrWhiteSpace(trimmed) || trimmed.Length < 160)
        {
            return false;
        }

        var lastChar = trimmed[^1];
        if (lastChar is ':' or ',' or ';' or '-' or '|' or '/' or '(' or '[' or '{')
        {
            return true;
        }

        return lastChar is not '.' and not '!' and not '?' and not '…' and not '"' and not '\'' and not ')' and not ']' and not '}';
    }

    private static void ValidateRequest(CopilotChatRequestDto request)
    {
        if (request.Context is null)
        {
            throw new InvalidOperationException("Copilot context is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Context.ReviewDocumentText))
        {
            throw new InvalidOperationException("Review document text is required.");
        }

        if (string.IsNullOrWhiteSpace(request.Context.ReviewTitle))
        {
            throw new InvalidOperationException("Review title is required.");
        }

        if (string.IsNullOrWhiteSpace(request.UserMessage))
        {
            throw new InvalidOperationException("User message is required.");
        }
    }

}
