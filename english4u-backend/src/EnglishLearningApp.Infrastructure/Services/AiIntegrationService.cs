using System.Net.Http.Headers;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using System.Text.Json;
using EnglishLearningApp.Domain.Services;

namespace EnglishLearningApp.Infrastructure.Services;

public class AiIntegrationService(HttpClient httpClient, IConfiguration configuration) : IAiIntegrationService
{
    private readonly HttpClient _httpClient = httpClient;
    private readonly string _fastApiBaseUrl = configuration["AiMicroservice:BaseUrl"] ?? "http://localhost:8000";

    public async Task<string> GenerateExamFromJsonAsync(IFormFile file, int numQuestions, string difficulty)
    {
        _httpClient.Timeout = TimeSpan.FromMinutes(5); // Cấu hình Timeout 3-5 phút theo yêu cầu

        using var content = new MultipartFormDataContent();

        using var fileStream = file.OpenReadStream();
        var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue(file.ContentType);

        content.Add(streamContent, "file", file.FileName);
        content.Add(new StringContent(numQuestions.ToString()), "num_questions");
        content.Add(new StringContent(difficulty), "difficulty");

        var response = await _httpClient.PostAsync($"{_fastApiBaseUrl}/api/v1/exams/generate", content);

        if (!response.IsSuccessStatusCode)
        {
            var errorDetail = await response.Content.ReadAsStringAsync();
            throw new Exception($"Giao tiếp với AI Service thất bại. Status Code: {response.StatusCode}. Chi tiết: {errorDetail}");
        }

        return await response.Content.ReadAsStringAsync();
    }
}
