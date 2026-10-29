using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Application.Services;

public class EdgeTtsService : ITtsService
{
    private readonly ILogger<EdgeTtsService> _logger;
    private readonly string _cacheDirectory;

    public EdgeTtsService(ILogger<EdgeTtsService> logger)
    {
        _logger = logger;
        _cacheDirectory = Path.Combine(AppContext.BaseDirectory, "AudioCache");

        try
        {
            if (!Directory.Exists(_cacheDirectory))
            {
                Directory.CreateDirectory(_cacheDirectory);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to initialize Edge TTS audio cache directory at {Path}", _cacheDirectory);
        }
    }

    public async Task<byte[]?> SynthesizeSpeechAsync(
        string text,
        string voice = "en-US-JennyNeural",
        string? rate = null,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return null;
        }

        // Limit text length to avoid abuse
        if (text.Length > 1000)
        {
            text = text[..1000];
        }

        voice = string.IsNullOrWhiteSpace(voice) ? "en-US-JennyNeural" : voice.Trim();
        rate = string.IsNullOrWhiteSpace(rate) ? "+0%" : rate.Trim();

        var cacheKey = ComputeCacheKey(text, voice, rate);
        var cacheFilePath = Path.Combine(_cacheDirectory, $"{cacheKey}.mp3");

        // 1. Return from disk cache if already synthesized
        if (File.Exists(cacheFilePath))
        {
            try
            {
                var cachedBytes = await File.ReadAllBytesAsync(cacheFilePath, cancellationToken);
                if (cachedBytes.Length > 0)
                {
                    return cachedBytes;
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error reading cached audio file {File}", cacheFilePath);
            }
        }

        // 2. Synthesize with edge-tts
        try
        {
            var tempFile = Path.Combine(_cacheDirectory, $"{Guid.NewGuid():N}.tmp.mp3");
            var rateParam = string.IsNullOrWhiteSpace(rate) ? string.Empty : $"--rate=\"{rate}\"";

            // Clean text for command line (escape quotes)
            var sanitizedText = text.Replace("\"", "\\\"").Replace("\r", " ").Replace("\n", " ");
            var (binaryPath, prefixArgs) = ResolveBinary();
            var combinedArgs = string.IsNullOrWhiteSpace(prefixArgs)
                ? $"--text \"{sanitizedText}\" --voice \"{voice}\" {rateParam} --write-media \"{tempFile}\""
                : $"{prefixArgs} --text \"{sanitizedText}\" --voice \"{voice}\" {rateParam} --write-media \"{tempFile}\"";

            var startInfo = new ProcessStartInfo
            {
                FileName = binaryPath,
                Arguments = combinedArgs,
                RedirectStandardError = true,
                RedirectStandardOutput = false,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = new Process { StartInfo = startInfo };
            process.Start();

            // Use server-side timeout (25s) so client aborts don't kill background cache synthesis
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(25));

            try
            {
                await process.WaitForExitAsync(cts.Token);
            }
            catch (Exception)
            {
                try
                {
                    if (!process.HasExited)
                    {
                        process.Kill(entireProcessTree: true);
                    }
                }
                catch
                {
                    // Ignore kill errors
                }
                throw;
            }

            if (process.ExitCode == 0 && File.Exists(tempFile))
            {
                var audioBytes = await File.ReadAllBytesAsync(tempFile, CancellationToken.None);

                // Move / copy to permanent cache file
                try
                {
                    if (File.Exists(cacheFilePath))
                    {
                        File.Delete(cacheFilePath);
                    }
                    File.Move(tempFile, cacheFilePath);
                }
                catch
                {
                    // If move fails due to concurrent access, just read tempFile
                    if (File.Exists(tempFile))
                    {
                        try { File.Delete(tempFile); } catch { }
                    }
                }

                return audioBytes;
            }

            var stdErr = await process.StandardError.ReadToEndAsync(cts.Token);
            _logger.LogError("edge-tts failed with exit code {Code}: {Error}", process.ExitCode, stdErr);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Exception while synthesizing speech for text '{Text}' with voice '{Voice}'", text, voice);
        }

        return null;
    }

    private static string ComputeCacheKey(string text, string voice, string rate)
    {
        var raw = $"{voice}:{rate}:{text}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static (string fileName, string argsPrefix) ResolveBinary()
    {
        var localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var possibleEdgeTts = new[]
        {
            Path.Combine(localAppData, @"Programs\Python\Python311\Scripts\edge-tts.exe"),
            Path.Combine(localAppData, @"Programs\Python\Python312\Scripts\edge-tts.exe"),
            Path.Combine(localAppData, @"Programs\Python\Python310\Scripts\edge-tts.exe"),
            "edge-tts",
        };

        foreach (var path in possibleEdgeTts)
        {
            if (File.Exists(path))
            {
                return (path, string.Empty);
            }
        }

        var possiblePython = new[]
        {
            Path.Combine(localAppData, @"Programs\Python\Python311\python.exe"),
            Path.Combine(localAppData, @"Programs\Python\Python312\python.exe"),
            Path.Combine(localAppData, @"Programs\Python\Python310\python.exe"),
            "python",
        };

        foreach (var path in possiblePython)
        {
            if (File.Exists(path))
            {
                return (path, "-m edge_tts");
            }
        }

        return ("edge-tts", string.Empty);
    }
}

