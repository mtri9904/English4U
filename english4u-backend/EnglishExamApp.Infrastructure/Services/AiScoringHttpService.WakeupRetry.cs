using System.Net;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public sealed partial class AiScoringHttpService
{
    private static readonly TimeSpan WakeupPollInterval = TimeSpan.FromSeconds(6);
    private const int MaxWakeupPollAttempts = 20; // 20 * 6s = 120s

    private async Task<HttpResponseMessage> SendWithWakeupRetryAsync(
        Func<Task<HttpResponseMessage>> sendFunc,
        CancellationToken cancellationToken = default)
    {
        HttpResponseMessage? response = null;
        try
        {
            response = await sendFunc();
            if (response.IsSuccessStatusCode)
            {
                return response;
            }

            if (response.StatusCode != HttpStatusCode.ServiceUnavailable
                && response.StatusCode != HttpStatusCode.BadGateway
                && response.StatusCode != HttpStatusCode.GatewayTimeout)
            {
                return response;
            }
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "AI Service HTTP request threw HttpRequestException. Space may be sleeping or cold starting.");
        }

        var baseHost = httpClient.BaseAddress?.Host ?? string.Empty;
        var isHfSpace = baseHost.EndsWith("hf.space", StringComparison.OrdinalIgnoreCase);
        if (!isHfSpace)
        {
            if (response is not null)
            {
                return response;
            }

            throw new InvalidOperationException("Failed to connect to AI Service.");
        }

        logger.LogWarning(
            "AI Service at {BaseAddress} returned {Status} or connection failed (Space is sleeping). Sending wake-up signal and polling...",
            httpClient.BaseAddress,
            response?.StatusCode);

        response?.Dispose();

        // 1. Send explicit wake-up / restart command to Hugging Face Hub API
        await TryWakeUpHfSpaceAsync(cancellationToken);

        // 2. Poll until container boots up and responds with 200 OK
        var isReady = await WaitForAiServiceReadyAsync(cancellationToken);
        if (!isReady)
        {
            logger.LogError("AI Service did not become ready within the maximum wait window (120s).");
            return await sendFunc();
        }

        logger.LogInformation("AI Service is now alive and ready! Retrying original request...");
        return await sendFunc();
    }

    private async Task TryWakeUpHfSpaceAsync(CancellationToken cancellationToken)
    {
        try
        {
            var hfToken = configuration["HuggingFace:Token"]
                ?? Environment.GetEnvironmentVariable("HF_TOKEN")
                ?? Environment.GetEnvironmentVariable("HF_API_TOKEN");

            var spaceRepoId = configuration["AiScoringService:SpaceRepoId"] ?? "minhtri1/english4u-ai-service";
            using var request = new HttpRequestMessage(
                HttpMethod.Post,
                $"https://huggingface.co/api/spaces/{spaceRepoId}/restart");

            if (!string.IsNullOrWhiteSpace(hfToken))
            {
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", hfToken);
            }

            using var directClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
            using var wakeResponse = await directClient.SendAsync(request, cancellationToken);
            logger.LogInformation(
                "Sent Hugging Face wake-up command for {RepoId}. Hub response status: {Status}",
                spaceRepoId,
                wakeResponse.StatusCode);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Could not call Hugging Face wake-up API (will rely on endpoint polling).");
        }
    }

    private async Task<bool> WaitForAiServiceReadyAsync(CancellationToken cancellationToken)
    {
        if (httpClient.BaseAddress is null)
        {
            return false;
        }

        var probeUri = new Uri(httpClient.BaseAddress, "docs");
        using var probeClient = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };

        for (var attempt = 1; attempt <= MaxWakeupPollAttempts; attempt++)
        {
            if (cancellationToken.IsCancellationRequested)
            {
                return false;
            }

            try
            {
                await Task.Delay(WakeupPollInterval, cancellationToken);
                using var probeResponse = await probeClient.GetAsync(probeUri, cancellationToken);
                if (probeResponse.IsSuccessStatusCode)
                {
                    logger.LogInformation(
                        "AI Service probe succeeded on attempt {Attempt} ({ElapsedSeconds}s).",
                        attempt,
                        attempt * (int)WakeupPollInterval.TotalSeconds);
                    return true;
                }
            }
            catch (Exception)
            {
                // Container is still building or downloading model
            }

            logger.LogInformation(
                "Waiting for AI Service container to boot up... (attempt {Attempt}/{Max})",
                attempt,
                MaxWakeupPollAttempts);
        }

        return false;
    }
}
