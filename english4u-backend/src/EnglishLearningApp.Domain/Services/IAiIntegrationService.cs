using Microsoft.AspNetCore.Http;
using System.Threading.Tasks;

namespace EnglishLearningApp.Domain.Services;

public interface IAiIntegrationService
{
    Task<string> GenerateExamFromJsonAsync(IFormFile file, int numQuestions, string difficulty);
}
