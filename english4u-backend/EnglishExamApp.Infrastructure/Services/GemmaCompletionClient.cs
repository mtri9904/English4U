using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
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
    private const string DefaultModel = "gemma-3-27b-it";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip
    };

    private readonly string _apiKey = GeminiConfiguration.ResolveApiKey(
        configuration,
        "GemmaExamGeneration:ApiKey");

    private readonly string _model = configuration["GemmaExamGeneration:Model"] ?? DefaultModel;

    private readonly double _temperature =
        configuration.GetValue<double?>("GemmaExamGeneration:Temperature") ?? 0.1d;

    public async Task<string> CompleteAsync(string prompt, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_apiKey))
        {
            throw new InvalidOperationException("GemmaExamGeneration:ApiKey is missing.");
        }

        if (httpClient.BaseAddress is null)
        {
            httpClient.BaseAddress = new Uri(
                configuration["GemmaExamGeneration:BaseUrl"] ?? DefaultBaseUrl,
                UriKind.Absolute);
        }

        var requestPayload = new OpenAiChatCompletionRequest(
            Model: _model,
            Messages:
            [
                new OpenAiChatMessage("user", prompt)
            ],
            Temperature: _temperature);

        using var request = new HttpRequestMessage(HttpMethod.Post, "chat/completions");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _apiKey);
        request.Content = JsonContent.Create(requestPayload, options: JsonOptions);

        using var response = await httpClient.SendAsync(request, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            throw new InvalidOperationException(
                $"Gemma API request failed with status {(int)response.StatusCode}: {errorBody}");
        }

        var completion = await response.Content.ReadFromJsonAsync<OpenAiChatCompletionResponse>(
            JsonOptions,
            cancellationToken);
        var content = completion?.Choices?.FirstOrDefault()?.Message?.Content;

        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException("Gemma API returned an empty completion.");
        }

        return content;
    }

    private sealed record OpenAiChatCompletionRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("messages")] IReadOnlyList<OpenAiChatMessage> Messages,
        [property: JsonPropertyName("temperature")] double Temperature);

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
