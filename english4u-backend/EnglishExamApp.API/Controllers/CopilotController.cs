using System.Text.Json;
using EnglishExamApp.Application.DTOs.Copilot;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/copilot")]
public class CopilotController(
    IReadingCopilotService readingCopilotService,
    ILogger<CopilotController> logger) : ControllerBase
{
    [HttpPost("chat")]
    public async Task Chat(
        [FromBody] CopilotChatRequestDto request,
        [FromHeader(Name = "X-User-Id")] string? userIdStr,
        CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(userIdStr, out _))
        {
            Response.StatusCode = StatusCodes.Status401Unauthorized;
            await Response.WriteAsJsonAsync(new { message = "Unauthorized." }, cancellationToken);
            return;
        }

        if (request?.Context is null)
        {
            Response.StatusCode = StatusCodes.Status400BadRequest;
            await Response.WriteAsJsonAsync(new { message = "Copilot context is required." }, cancellationToken);
            return;
        }

        Response.StatusCode = StatusCodes.Status200OK;
        Response.ContentType = "text/event-stream";
        Response.Headers.CacheControl = "no-cache";
        Response.Headers.Append("Connection", "keep-alive");
        Response.Headers.Append("X-Accel-Buffering", "no");

        await Response.StartAsync(cancellationToken);
        await WriteSseEventAsync("ready", new { message = "Copilot context prepared." }, cancellationToken);

        try
        {
            await readingCopilotService.StreamChatAsync(
                request,
                (text, ct) => WriteSseEventAsync("chunk", new { text }, ct),
                cancellationToken);

            await WriteSseEventAsync("done", new { }, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
        catch (InvalidOperationException ex)
        {
            logger.LogWarning(ex, "Copilot request rejected.");
            await WriteSseEventAsync("error", new { message = ex.Message }, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Unexpected copilot streaming error.");
            await WriteSseEventAsync("error", new { message = "Không thể kết nối AI Copilot lúc này." }, cancellationToken);
        }
    }

    private async Task WriteSseEventAsync(string eventName, object payload, CancellationToken cancellationToken)
    {
        var json = JsonSerializer.Serialize(payload);
        await Response.WriteAsync($"event: {eventName}\n", cancellationToken);
        await Response.WriteAsync($"data: {json}\n\n", cancellationToken);
        await Response.Body.FlushAsync(cancellationToken);
    }
}
