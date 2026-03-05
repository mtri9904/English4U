using Microsoft.AspNetCore.Http;

namespace EnglishExamApp.Application.Services;

public interface IGenerateExamService
{
    Task<Guid> ProcessPdfFileAsync(IFormFile file, Guid userId, CancellationToken cancellationToken = default);
}
