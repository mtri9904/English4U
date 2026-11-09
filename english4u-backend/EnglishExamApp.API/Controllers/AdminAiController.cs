using EnglishExamApp.Application.DTOs.Ai;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/admin/ai")]
[Authorize(Roles = "Admin")]
public class AdminAiController(
    IGeminiCatalogService geminiCatalogService,
    IAiModelConfigService aiModelConfigService) : ControllerBase
{
    [HttpGet("gemini-models")]
    public async Task<IResult> GetGeminiModels(
        [FromQuery] GeminiModelCatalogRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await geminiCatalogService.GetModelCatalogAsync(request, cancellationToken);
        return TypedResults.Ok(result);
    }

    [HttpGet("features-config")]
    public IResult GetFeaturesConfiguration()
    {
        var result = aiModelConfigService.GetAllConfigurations();
        return TypedResults.Ok(result);
    }

    [HttpPut("features-config")]
    public async Task<IResult> UpdateFeaturesConfiguration(
        [FromBody] AiFeaturesConfigurationUpdateDto updateDto,
        CancellationToken cancellationToken)
    {
        var updated = await aiModelConfigService.UpdateConfigurationsAsync(updateDto, cancellationToken);
        return TypedResults.Ok(updated);
    }
}
