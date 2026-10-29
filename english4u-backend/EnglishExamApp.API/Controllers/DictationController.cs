using EnglishExamApp.Application.DTOs.Dictation;
using EnglishExamApp.Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace EnglishExamApp.API.Controllers;

[ApiController]
[Route("api/practice/dictation")]
public class DictationController(
    IDictationService dictationService,
    ITtsService ttsService) : ControllerBase
{
    [HttpPost("generate")]
    [Authorize]
    public async Task<IResult> GenerateExercise(
        [FromBody] DictationGenerateRequestDto request,
        CancellationToken cancellationToken)
    {
        var result = await dictationService.GenerateExerciseAsync(request, cancellationToken);
        return TypedResults.Ok(result);
    }

    [HttpGet("audio")]
    [AllowAnonymous]
    public async Task<IActionResult> GetAudio(
        [FromQuery] string text,
        [FromQuery] string? voice = "en-US-JennyNeural",
        [FromQuery] double rate = 1.0,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return BadRequest("Text is required.");
        }

        // Map rate float (e.g. 0.75, 0.9, 1.0, 1.25) to edge-tts percent format
        var rateString = rate switch
        {
            <= 0.8 => "-25%",
            < 0.95 => "-10%",
            >= 1.2 => "+25%",
            _ => "+0%"
        };

        var selectedVoice = string.IsNullOrWhiteSpace(voice) ? "en-US-JennyNeural" : voice.Trim();

        var audioBytes = await ttsService.SynthesizeSpeechAsync(text, selectedVoice, rateString, CancellationToken.None);
        if (audioBytes == null || audioBytes.Length == 0)
        {
            return NotFound("Audio synthesis failed.");
        }

        Response.Headers.CacheControl = "public, max-age=604800, immutable";
        return File(audioBytes, "audio/mpeg", enableRangeProcessing: true);
    }
}
