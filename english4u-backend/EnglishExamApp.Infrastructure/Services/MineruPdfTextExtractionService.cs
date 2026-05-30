using System.IO.Compression;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class MineruPdfTextExtractionService(
    HttpClient httpClient,
    IConfiguration configuration,
    ILogger<MineruPdfTextExtractionService> logger) : IPdfTextExtractionService
{
    private static readonly JsonDocumentOptions JsonDocumentOptions = new()
    {
        AllowTrailingCommas = true,
        CommentHandling = JsonCommentHandling.Skip
    };

    private static readonly Regex HtmlTagRegex = new("<[^>]+>", RegexOptions.Compiled);
    private static readonly Regex MarkdownImageRegex = new(@"!\[[^\]]*\]\([^)]+\)", RegexOptions.Compiled);
    private static readonly Regex MarkdownLinkRegex = new(@"\[([^\]]+)\]\([^)]+\)", RegexOptions.Compiled);
    private static readonly Regex MultiSpaceRegex = new(@"[ \t]{2,}", RegexOptions.Compiled);
    private static readonly Regex MultiBlankLineRegex = new(@"\n{3,}", RegexOptions.Compiled);

    private readonly string _backend = configuration["MinerU:Backend"] ?? "pipeline";
    private readonly string _parseMethod = configuration["MinerU:ParseMethod"] ?? "auto";
    private readonly IReadOnlyList<string> _languages = ResolveLanguages(configuration);
    private readonly bool _formulaEnabled = configuration.GetValue<bool?>("MinerU:EnableFormula") ?? false;
    private readonly bool _tableEnabled = configuration.GetValue<bool?>("MinerU:EnableTable") ?? true;
    private readonly bool _returnImages = configuration.GetValue<bool?>("MinerU:ReturnImages") ?? false;
    private readonly bool _saveDebugArtifacts = configuration.GetValue<bool?>("MinerU:SaveDebugArtifacts") ?? false;
    private readonly string? _debugOutputDirectory = configuration["MinerU:DebugOutputDirectory"];

    public async Task<PdfTextExtractionResult> ExtractAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        if (pdfStream is null)
        {
            throw new ArgumentNullException(nameof(pdfStream));
        }

        await using var memoryStream = new MemoryStream();
        await pdfStream.CopyToAsync(memoryStream, cancellationToken);
        var pdfBytes = memoryStream.ToArray();

        var backupExtraction = ExtractBackupTextWithPdfPig(pdfBytes, fileName);

        try
        {
            var mineruPayload = await ExtractTextWithMineruAsync(pdfBytes, fileName, cancellationToken);
            var mineruText = mineruPayload.Text;

            if (string.IsNullOrWhiteSpace(mineruText))
            {
                throw new InvalidOperationException("MinerU returned empty text.");
            }

            await SaveDebugArtifactsAsync(
                fileName,
                mineruPayload.ResponseBytes,
                mineruPayload.MediaType,
                mineruText,
                backupExtraction.RawText,
                cancellationToken);

            logger.LogInformation(
                "MinerU extracted {RawTextLength} characters from {FileName} with backend {Backend}.",
                mineruText.Length,
                fileName,
                _backend);

            return new PdfTextExtractionResult(
                RawText: mineruText,
                PageCount: backupExtraction.Pages.Count,
                Engine: $"MinerU.{_backend}",
                Pages: backupExtraction.Pages,
                PdfBytes: pdfBytes,
                PrimaryRawText: mineruText,
                BackupRawText: backupExtraction.RawText);
        }
        catch (Exception ex) when (ex is System.Net.Http.HttpRequestException ||
                                  ex is System.Net.Sockets.SocketException ||
                                  (ex is InvalidOperationException && ex.Message.Contains("MinerU", StringComparison.OrdinalIgnoreCase)))
        {
            logger.LogWarning(
                ex,
                "MinerU API is unavailable or failed for {FileName}. Falling back to local PdfPig extraction.",
                fileName);

            if (string.IsNullOrWhiteSpace(backupExtraction.RawText))
            {
                throw new InvalidOperationException("Both MinerU and backup PdfPig extraction failed to return text.", ex);
            }

            return new PdfTextExtractionResult(
                RawText: backupExtraction.RawText,
                PageCount: backupExtraction.Pages.Count,
                Engine: "PdfPig.Fallback",
                Pages: backupExtraction.Pages,
                PdfBytes: pdfBytes,
                PrimaryRawText: string.Empty,
                BackupRawText: backupExtraction.RawText);
        }
    }

    private async Task<MineruExtractionPayload> ExtractTextWithMineruAsync(
        byte[] pdfBytes,
        string fileName,
        CancellationToken cancellationToken)
    {
        using var form = new MultipartFormDataContent();
        using var fileContent = new ByteArrayContent(pdfBytes);
        fileContent.Headers.ContentType = MediaTypeHeaderValue.Parse("application/pdf");
        form.Add(fileContent, "files", SanitizeUploadFileName(fileName));

        AddFormValue(form, "backend", _backend);
        AddFormValue(form, "parse_method", _parseMethod);
        AddFormValue(form, "formula_enable", _formulaEnabled);
        AddFormValue(form, "table_enable", _tableEnabled);
        AddFormValue(form, "return_md", true);
        AddFormValue(form, "return_content_list", true);
        AddFormValue(form, "return_middle_json", false);
        AddFormValue(form, "return_model_output", false);
        AddFormValue(form, "return_images", _returnImages);
        AddFormValue(form, "response_format_zip", false);

        foreach (var language in _languages)
        {
            AddFormValue(form, "lang_list", language);
        }

        using var response = await httpClient.PostAsync("file_parse", form, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var errorBody = await response.Content.ReadAsStringAsync(cancellationToken);
            var errorMessage = TryBuildMineruApiErrorMessage(errorBody, out var parsedMessage)
                ? parsedMessage
                : TrimForLog(errorBody);

            throw new InvalidOperationException(
                $"MinerU API request failed with status {(int)response.StatusCode}: {errorMessage}");
        }

        var responseBytes = await response.Content.ReadAsByteArrayAsync(cancellationToken);
        var mediaType = response.Content.Headers.ContentType?.MediaType;
        string extractedText;
        if (string.Equals(mediaType, "application/zip", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mediaType, "application/x-zip-compressed", StringComparison.OrdinalIgnoreCase))
        {
            extractedText = ExtractTextFromZip(responseBytes);
        }
        else
        {
            var responseText = Encoding.UTF8.GetString(responseBytes);
            extractedText = TryExtractTextFromJson(responseText, out var structuredText)
                ? structuredText
                : NormalizeText(responseText);
        }

        return new MineruExtractionPayload(extractedText, responseBytes, mediaType);
    }

    private BackupTextExtraction ExtractBackupTextWithPdfPig(byte[] pdfBytes, string fileName)
    {
        try
        {
            using var document = PdfDocument.Open(new MemoryStream(pdfBytes));
            var pages = new List<PdfExtractedPage>(document.NumberOfPages);
            foreach (var page in document.GetPages())
            {
                var pageText = NormalizeText(page.Text);
                var words = new List<PdfExtractedWord>();
                foreach (var w in page.GetWords())
                {
                    words.Add(new PdfExtractedWord(
                        Text: w.Text,
                        TopFromPageTop: page.Height - w.BoundingBox.Top,
                        BottomFromPageTop: page.Height - w.BoundingBox.Bottom,
                        Left: w.BoundingBox.Left,
                        Right: w.BoundingBox.Right));
                }

                pages.Add(new PdfExtractedPage(
                    PageNumber: page.Number,
                    RawText: pageText,
                    PageHeight: page.Height,
                    Words: words,
                    Images: []));
            }

            var rawText = NormalizeText(string.Join("\n\n", pages.Select(page => page.RawText)));
            logger.LogInformation(
                "PdfPig backup extracted {RawTextLength} characters from {FileName}.",
                rawText.Length,
                fileName);

            return new BackupTextExtraction(rawText, pages);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PdfPig backup extraction failed for {FileName}. MinerU output will be used without backup evidence.", fileName);
            return new BackupTextExtraction(string.Empty, []);
        }
    }

    private async Task SaveDebugArtifactsAsync(
        string fileName,
        byte[] responseBytes,
        string? mediaType,
        string extractedText,
        string? backupText,
        CancellationToken cancellationToken)
    {
        if (!_saveDebugArtifacts)
        {
            return;
        }

        var rootDirectory = ResolveDebugOutputDirectory(_debugOutputDirectory);
        var safeBaseName = Regex.Replace(
            Path.GetFileNameWithoutExtension(fileName).Trim(),
            @"[^a-zA-Z0-9._-]+",
            "_");
        if (string.IsNullOrWhiteSpace(safeBaseName))
        {
            safeBaseName = "uploaded-pdf";
        }

        var outputDirectory = Path.Combine(
            rootDirectory,
            $"{DateTime.UtcNow:yyyyMMdd-HHmmssfff}-{safeBaseName}");
        Directory.CreateDirectory(outputDirectory);

        var responseFileName =
            string.Equals(mediaType, "application/zip", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(mediaType, "application/x-zip-compressed", StringComparison.OrdinalIgnoreCase)
                ? "mineru-response.zip"
                : "mineru-response.json";

        await File.WriteAllBytesAsync(
            Path.Combine(outputDirectory, responseFileName),
            responseBytes,
            cancellationToken);
        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "normalized-text.txt"),
            extractedText,
            Encoding.UTF8,
            cancellationToken);
        if (!string.IsNullOrWhiteSpace(backupText))
        {
            await File.WriteAllTextAsync(
                Path.Combine(outputDirectory, "backup-pdfpig-text.txt"),
                backupText,
                Encoding.UTF8,
                cancellationToken);
        }

        await File.WriteAllTextAsync(
            Path.Combine(outputDirectory, "README.txt"),
            """
            mineru-response.* is the raw MinerU API response.
            normalized-text.txt is the exact text the backend sends into the PDF generation pipeline.
            backup-pdfpig-text.txt is the backup extractor output when available.
            Compare normalized-text.txt with the source PDF before debugging Gemini output.
            """,
            Encoding.UTF8,
            cancellationToken);

        logger.LogInformation("Saved MinerU debug artifacts for {FileName} to {DebugDirectory}.", fileName, outputDirectory);
    }

    private static string ResolveDebugOutputDirectory(string? configuredDirectory)
    {
        var directory = string.IsNullOrWhiteSpace(configuredDirectory)
            ? Path.Combine(Directory.GetCurrentDirectory(), ".runtime", "mineru-debug")
            : configuredDirectory.Trim();

        return Path.GetFullPath(directory);
    }

    private sealed record BackupTextExtraction(string RawText, IReadOnlyList<PdfExtractedPage> Pages);

    private sealed record MineruExtractionPayload(string Text, byte[] ResponseBytes, string? MediaType);

    private static void AddFormValue(MultipartFormDataContent form, string name, string value) =>
        form.Add(new StringContent(value), name);

    private static void AddFormValue(MultipartFormDataContent form, string name, bool value) =>
        form.Add(new StringContent(value ? "true" : "false"), name);

    private static IReadOnlyList<string> ResolveLanguages(IConfiguration configuration)
    {
        var configured = configuration.GetSection("MinerU:Languages").Get<string[]>();
        if (configured is { Length: > 0 })
        {
            return configured
                .Select(item => item.Trim())
                .Where(item => item.Length > 0)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        var singleLanguage = configuration["MinerU:Language"];
        return string.IsNullOrWhiteSpace(singleLanguage)
            ? ["en"]
            : [singleLanguage.Trim()];
    }

    private static string SanitizeUploadFileName(string fileName)
    {
        var safeName = Path.GetFileName(fileName);
        return string.IsNullOrWhiteSpace(safeName) ? "uploaded.pdf" : safeName;
    }

    private static bool TryExtractTextFromJson(string responseText, out string text)
    {
        text = string.Empty;
        try
        {
            using var document = JsonDocument.Parse(responseText, JsonDocumentOptions);
            var root = document.RootElement;

            if (TryFindContentListText(root, out var contentListText) &&
                !string.IsNullOrWhiteSpace(contentListText))
            {
                text = contentListText;
                return true;
            }

            if (TryFindMarkdownText(root, out var markdownText) &&
                !string.IsNullOrWhiteSpace(markdownText))
            {
                text = NormalizeText(markdownText);
                return true;
            }
        }
        catch (JsonException)
        {
            return false;
        }

        return false;
    }

    private static bool TryFindContentListText(JsonElement element, out string text)
    {
        text = string.Empty;

        if (element.ValueKind == JsonValueKind.Array && LooksLikeContentList(element))
        {
            text = BuildTextFromContentList(element);
            return !string.IsNullOrWhiteSpace(text);
        }

        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var propertyName in new[] { "content_list", "contentList" })
            {
                if (!element.TryGetProperty(propertyName, out var contentList))
                {
                    continue;
                }

                if (contentList.ValueKind == JsonValueKind.String &&
                    TryParseJsonString(contentList.GetString(), out var parsedContentList) &&
                    parsedContentList.RootElement.ValueKind == JsonValueKind.Array)
                {
                    using (parsedContentList)
                    {
                        text = BuildTextFromContentList(parsedContentList.RootElement);
                        return !string.IsNullOrWhiteSpace(text);
                    }
                }

                if (contentList.ValueKind == JsonValueKind.Array)
                {
                    text = BuildTextFromContentList(contentList);
                    return !string.IsNullOrWhiteSpace(text);
                }
            }

            foreach (var property in element.EnumerateObject())
            {
                if (TryFindContentListText(property.Value, out text))
                {
                    return true;
                }
            }
        }

        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                if (TryFindContentListText(item, out text))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static bool LooksLikeContentList(JsonElement arrayElement)
    {
        foreach (var item in arrayElement.EnumerateArray().Take(8))
        {
            if (item.ValueKind == JsonValueKind.Object && item.TryGetProperty("type", out _))
            {
                return true;
            }
        }

        return false;
    }

    private static string BuildTextFromContentList(JsonElement contentList)
    {
        var parts = new List<string>();
        foreach (var item in contentList.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object)
            {
                continue;
            }

            var type = GetStringProperty(item, "type")?.Trim().ToLowerInvariant();
            if (IsDiscardedBlock(type))
            {
                continue;
            }

            var blockText = type switch
            {
                "list" => BuildListText(item),
                "table" => BuildTableText(item),
                "equation" => GetFirstStringProperty(item, "latex", "text", "content"),
                "image" or "chart" => BuildVisualText(item),
                "code" => BuildCodeText(item),
                _ => GetFirstStringProperty(item, "text", "content", "title")
            };

            blockText = NormalizeText(blockText ?? string.Empty);
            if (!string.IsNullOrWhiteSpace(blockText))
            {
                parts.Add(blockText);
            }
        }

        return string.Join("\n\n", parts);
    }

    private static bool IsDiscardedBlock(string? type) =>
        type is "header" or "footer" or "page_number" or "aside_text" or "page_footnote";

    private static string? BuildListText(JsonElement item)
    {
        if (!item.TryGetProperty("list_items", out var listItems) ||
            listItems.ValueKind != JsonValueKind.Array)
        {
            return GetFirstStringProperty(item, "text", "content");
        }

        return string.Join(
            "\n",
            listItems
                .EnumerateArray()
                .Select(value => value.ValueKind == JsonValueKind.String ? value.GetString() : null)
                .Where(value => !string.IsNullOrWhiteSpace(value)));
    }

    private static string? BuildTableText(JsonElement item)
    {
        var pieces = new[]
            {
                JoinStringArrayProperty(item, "table_caption"),
                GetFirstStringProperty(item, "table_body", "content", "text"),
                JoinStringArrayProperty(item, "table_footnote")
            }
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return string.Join("\n", pieces);
    }

    private static string? BuildVisualText(JsonElement item)
    {
        var pieces = new[]
            {
                JoinStringArrayProperty(item, "image_caption"),
                JoinStringArrayProperty(item, "chart_caption"),
                GetFirstStringProperty(item, "content", "text"),
                JoinStringArrayProperty(item, "image_footnote"),
                JoinStringArrayProperty(item, "chart_footnote")
            }
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return string.Join("\n", pieces);
    }

    private static string? BuildCodeText(JsonElement item)
    {
        var pieces = new[]
            {
                JoinStringArrayProperty(item, "code_caption"),
                GetFirstStringProperty(item, "code_body", "content", "text")
            }
            .Where(value => !string.IsNullOrWhiteSpace(value));

        return string.Join("\n", pieces);
    }

    private static bool TryFindMarkdownText(JsonElement element, out string text)
    {
        text = string.Empty;

        if (element.ValueKind == JsonValueKind.Object)
        {
            if (element.TryGetProperty("results", out var results) &&
                TryFindMarkdownText(results, out text))
            {
                return true;
            }

            foreach (var propertyName in new[] { "md_content", "markdown", "md", "text" })
            {
                var value = GetStringProperty(element, propertyName);
                if (!string.IsNullOrWhiteSpace(value))
                {
                    text = value;
                    return true;
                }
            }

            foreach (var property in element.EnumerateObject())
            {
                if (property.NameEquals("content_list") ||
                    property.NameEquals("contentList") ||
                    property.NameEquals("images"))
                {
                    continue;
                }

                if (TryFindMarkdownText(property.Value, out text))
                {
                    return true;
                }
            }
        }

        if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in element.EnumerateArray())
            {
                if (TryFindMarkdownText(item, out text))
                {
                    return true;
                }
            }
        }

        return false;
    }

    private static string ExtractTextFromZip(byte[] responseBytes)
    {
        using var archive = new ZipArchive(new MemoryStream(responseBytes));
        var contentListEntry = archive.Entries
            .OrderBy(entry => entry.FullName.Length)
            .FirstOrDefault(entry => entry.FullName.EndsWith("_content_list.json", StringComparison.OrdinalIgnoreCase));

        if (contentListEntry is not null)
        {
            var contentListJson = ReadZipEntry(contentListEntry);
            if (TryExtractTextFromJson(contentListJson, out var contentListText))
            {
                return contentListText;
            }
        }

        var markdownEntry = archive.Entries
            .OrderBy(entry => entry.FullName.Length)
            .FirstOrDefault(entry => entry.FullName.EndsWith(".md", StringComparison.OrdinalIgnoreCase));

        return markdownEntry is null
            ? string.Empty
            : NormalizeText(ReadZipEntry(markdownEntry));
    }

    private static string ReadZipEntry(ZipArchiveEntry entry)
    {
        using var stream = entry.Open();
        using var reader = new StreamReader(stream, Encoding.UTF8);
        return reader.ReadToEnd();
    }

    private static string? GetFirstStringProperty(JsonElement item, params string[] propertyNames)
    {
        foreach (var propertyName in propertyNames)
        {
            var value = GetStringProperty(item, propertyName);
            if (!string.IsNullOrWhiteSpace(value))
            {
                return value;
            }
        }

        return null;
    }

    private static string? GetStringProperty(JsonElement item, string propertyName)
    {
        if (!item.TryGetProperty(propertyName, out var value))
        {
            return null;
        }

        return value.ValueKind == JsonValueKind.String ? value.GetString() : null;
    }

    private static string? JoinStringArrayProperty(JsonElement item, string propertyName)
    {
        if (!item.TryGetProperty(propertyName, out var value) ||
            value.ValueKind != JsonValueKind.Array)
        {
            return null;
        }

        return string.Join(
            "\n",
            value
                .EnumerateArray()
                .Select(item => item.ValueKind == JsonValueKind.String ? item.GetString() : null)
                .Where(item => !string.IsNullOrWhiteSpace(item)));
    }

    private static bool TryParseJsonString(string? json, out JsonDocument document)
    {
        document = null!;
        if (string.IsNullOrWhiteSpace(json))
        {
            return false;
        }

        try
        {
            document = JsonDocument.Parse(json, JsonDocumentOptions);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static bool TryBuildMineruApiErrorMessage(string responseText, out string message)
    {
        message = string.Empty;
        try
        {
            using var document = JsonDocument.Parse(responseText, JsonDocumentOptions);
            var root = document.RootElement;

            var status = GetStringProperty(root, "status");
            var taskId = GetStringProperty(root, "task_id");
            var backend = GetStringProperty(root, "backend");
            var error = GetStringProperty(root, "error");

            if (string.IsNullOrWhiteSpace(status) &&
                string.IsNullOrWhiteSpace(taskId) &&
                string.IsNullOrWhiteSpace(error))
            {
                return false;
            }

            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(status))
            {
                parts.Add($"status={status}");
            }

            if (!string.IsNullOrWhiteSpace(taskId))
            {
                parts.Add($"task_id={taskId}");
            }

            if (!string.IsNullOrWhiteSpace(backend))
            {
                parts.Add($"backend={backend}");
            }

            if (!string.IsNullOrWhiteSpace(error))
            {
                parts.Add($"error={TrimForLog(error)}");
            }

            message = string.Join("; ", parts);
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
    }

    private static string NormalizeText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        var normalized = text
            .Replace("\r\n", "\n")
            .Replace('\r', '\n')
            .Replace('\u00A0', ' ')
            .Replace('\u2007', ' ')
            .Replace('\u202F', ' ');

        normalized = MarkdownImageRegex.Replace(normalized, string.Empty);
        normalized = MarkdownLinkRegex.Replace(normalized, "$1");
        normalized = HtmlTagRegex.Replace(normalized, " ");
        normalized = WebUtility.HtmlDecode(normalized);
        normalized = MultiSpaceRegex.Replace(normalized, " ");
        normalized = Regex.Replace(normalized, @"[ \t]+\n", "\n");
        normalized = MultiBlankLineRegex.Replace(normalized, "\n\n");
        return normalized.Trim();
    }

    private static string TrimForLog(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "[empty]";
        }

        var normalized = NormalizeText(value);
        return normalized.Length <= 800 ? normalized : normalized[..800] + "...";
    }
}
