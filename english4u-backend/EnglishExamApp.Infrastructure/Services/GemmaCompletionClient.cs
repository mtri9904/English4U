using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;

namespace EnglishExamApp.Infrastructure.Services;

public interface IGemmaCompletionClient
{
    Task<string> CompleteAsync(string prompt, CancellationToken cancellationToken);
}

public sealed class GemmaCompletionClient(
    HttpClient httpClient,
    IConfiguration configuration) : IGemmaCompletionClient
{
    private const string DefaultBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/";
    private const string DefaultModel = "gemini-3.1-flash-lite";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private readonly string _apiKey = GeminiConfiguration.ResolveApiKey(
        configuration,
        "GemmaExamGeneration:ApiKey");

    private readonly string _baseUrl = configuration["GemmaExamGeneration:BaseUrl"] ?? DefaultBaseUrl;

    private readonly string _model = configuration["GemmaExamGeneration:Model"] ?? DefaultModel;

    private readonly double _temperature =
        configuration.GetValue<double?>("GemmaExamGeneration:Temperature") ?? 0.0d;

    private readonly int _maxOutputTokens = Math.Clamp(
        configuration.GetValue<int?>("GemmaExamGeneration:MaxOutputTokens") ?? 8192,
        1024,
        32768);

    private readonly bool? _sendAuthorizationHeader = configuration.GetValue<bool?>("GemmaExamGeneration:SendAuthorizationHeader");

    public async Task<string> CompleteAsync(string prompt, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_apiKey) && ShouldSendAuthorizationHeader())
        {
            throw new InvalidOperationException("GemmaExamGeneration:ApiKey is missing.");
        }

        if (httpClient.BaseAddress is null)
        {
            httpClient.BaseAddress = new Uri(_baseUrl, UriKind.Absolute);
        }

        var requestPayload = new OpenAiChatCompletionRequest(
            Model: _model,
            Messages:
            [
                new OpenAiChatMessage("user", prompt)
            ],
            Temperature: _temperature,
            MaxTokens: _maxOutputTokens);

        using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions");
        if (ShouldSendAuthorizationHeader() && !string.IsNullOrWhiteSpace(_apiKey))
        {
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        }

        request.Content = JsonContent.Create(requestPayload, options: JsonOptions);

        HttpResponseMessage response;
        try
        {
            response = await httpClient.SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex) when (IsLocalBaseUrl(_baseUrl))
        {
            throw new InvalidOperationException(
                $"Local OpenAI-compatible LLM server is not reachable at {_baseUrl}.",
                ex);
        }

        using (response)
        {
            if (!response.IsSuccessStatusCode)
            {
                var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
                throw new InvalidOperationException(
                    $"LLM API request failed with status {(int)response.StatusCode}: {errorBody}");
            }

            var completion = await response.Content.ReadFromJsonAsync<OpenAiChatCompletionResponse>(
                JsonOptions,
                cancellationToken);
            var content = completion?.Choices?.FirstOrDefault()?.Message?.Content;

            if (string.IsNullOrWhiteSpace(content))
            {
                throw new InvalidOperationException("LLM API returned an empty completion.");
            }

            return StripReasoningText(content);
        }
    }

    private bool ShouldSendAuthorizationHeader()
    {
        if (_sendAuthorizationHeader.HasValue)
        {
            return _sendAuthorizationHeader.Value;
        }

        return !IsLocalBaseUrl(_baseUrl);
    }

    private static bool IsLocalBaseUrl(string baseUrl)
    {
        if (!Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
        {
            return false;
        }

        return uri.IsLoopback ||
               string.Equals(uri.Host, "localhost", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(uri.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase);
    }

    private static string StripReasoningText(string content)
    {
        var cleaned = Regex.Replace(
            content,
            @"(?is)<think>.*?</think>",
            string.Empty);
        return cleaned.Trim();
    }

    private sealed record OpenAiChatCompletionRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("messages")] IReadOnlyList<OpenAiChatMessage> Messages,
        [property: JsonPropertyName("temperature")] double Temperature,
        [property: JsonPropertyName("max_tokens")] int MaxTokens);

    private sealed record OpenAiChatMessage(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("content")] string Content);

    private sealed class OpenAiChatCompletionResponse
    {
        [JsonPropertyName("choices")]
        public List<OpenAiChoice>? Choices { get; set; }
    }

    private sealed class OpenAiChoice
    {
        [JsonPropertyName("message")]
        public OpenAiMessage? Message { get; set; }
    }

    private sealed class OpenAiMessage
    {
        [JsonPropertyName("content")]
        public string? Content { get; set; }
    }
}
