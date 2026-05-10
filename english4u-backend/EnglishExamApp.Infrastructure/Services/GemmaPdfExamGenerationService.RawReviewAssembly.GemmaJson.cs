using System.Net;
using System.Text;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Docnet.Core;
using Docnet.Core.Models;
using EnglishExamApp.Application.DTOs.Exams;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Services;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class GemmaPdfExamGenerationService
{

    private Task<string> RequestGemmaJsonCompletionBestEffortAsync(string prompt, CancellationToken cancellationToken) =>
        RequestGemmaJsonCompletionAsync(prompt, RawReviewMaxApiRetries, cancellationToken);

    private Task<string> RequestGemmaJsonCompletionWithRetryAsync(string prompt, CancellationToken cancellationToken) =>
        RequestGemmaJsonCompletionAsync(prompt, MaxJsonParseRetries, cancellationToken);

    private async Task<string> RequestGemmaJsonCompletionAsync(
        string prompt,
        int maxRetries,
        CancellationToken cancellationToken)
    {
        var totalAttempts = Math.Max(0, maxRetries) + 1;
        for (var attempt = 1; attempt <= totalAttempts; attempt++)
        {
            try
            {
                return await RequestGemmaCompletionAsync(prompt, cancellationToken);
            }
            catch (Exception ex) when (attempt < totalAttempts && GemmaApiRetryDelayResolver.TryResolve(ex, out var retryDelay, out _))
            {
                await Task.Delay(retryDelay, cancellationToken);
            }
        }

        return await RequestGemmaCompletionAsync(prompt, cancellationToken);
    }

    private static bool TryDeserializeAiReviewResponse<T>(
        string rawResponse,
        out T? payload,
        out string? parseError)
        where T : class
    {
        parseError = null;
        payload = null;

        try
        {
            var normalizedJson = NormalizeJson(rawResponse);
            foreach (var candidate in BuildJsonParseCandidates(normalizedJson))
            {
                if (TryDeserializeAiReviewCandidate(candidate, out payload, out parseError) && payload is not null)
                {
                    return true;
                }
            }
        }
        catch (Exception ex)
        {
            parseError = ex.Message;
        }

        return false;
    }

    private static bool TryDeserializeAiReviewCandidate<T>(
        string candidateJson,
        out T? payload,
        out string? parseError)
        where T : class
    {
        payload = null;
        parseError = null;
        var workingJson = candidateJson;

        for (var attempt = 1; attempt <= 4; attempt++)
        {
            try
            {
                payload = JsonSerializer.Deserialize<T>(workingJson, JsonOptions);
                if (payload is not null)
                {
                    return true;
                }

                parseError = "Deserialized payload is null.";
                return false;
            }
            catch (JsonException jsonException)
            {
                parseError = BuildJsonParseErrorMessage(workingJson, jsonException);
                if (!TryPatchJsonAtError(workingJson, jsonException, out var patchedJson) ||
                    string.Equals(patchedJson, workingJson, StringComparison.Ordinal))
                {
                    return false;
                }

                workingJson = RepairMalformedJson(patchedJson);
            }
            catch (Exception ex)
            {
                parseError = ex.Message;
                return false;
            }
        }

        return false;
    }
}
