using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using Docnet.Core;
using Docnet.Core.Models;
using Microsoft.Extensions.Logging;
using UglyToad.PdfPig;
using UglyToad.PdfPig.Content;

namespace EnglishExamApp.Infrastructure.Services;

public sealed class LocalPdfTextExtractionService(
    ILogger<LocalPdfTextExtractionService> logger) : IPdfTextExtractionService
{
    private const int RenderDpi = 150;
    private const double MinImagePageCoverageThreshold = 0.03;
    private const int MinImagePixelArea = 2000;

    public async Task<PdfTextExtractionResult> ExtractAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken = default)
    {
        await using var memoryStream = new MemoryStream();
        await pdfStream.CopyToAsync(memoryStream, cancellationToken);
        var pdfBytes = memoryStream.ToArray();

        try
        {
            var pages = ExtractPages(pdfBytes, fileName);
            var rawText = string.Join("\n\n", pages.Select(p => p.RawText));

            logger.LogInformation(
                "LocalPdfExtraction extracted {CharCount} characters from {FileName} across {PageCount} pages.",
                rawText.Length,
                fileName,
                pages.Count);

            return new PdfTextExtractionResult(
                RawText: rawText,
                PageCount: pages.Count,
                Engine: "Local.PdfPig+PDFium",
                Pages: pages,
                PdfBytes: pdfBytes,
                PrimaryRawText: rawText,
                BackupRawText: rawText);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "LocalPdfExtraction failed for {FileName}.", fileName);
            throw new InvalidOperationException(
                $"Local PDF extraction failed for '{fileName}': {ex.Message}", ex);
        }
    }

    private List<PdfExtractedPage> ExtractPages(byte[] pdfBytes, string fileName)
    {
        var renderedImages = TryRenderPageImages(pdfBytes, fileName);
        var pages = new List<PdfExtractedPage>();

        using var document = PdfDocument.Open(new MemoryStream(pdfBytes));
        foreach (var page in document.GetPages())
        {
            var pageText = NormalizeText(page.Text ?? string.Empty);
            var words = ExtractWords(page);
            var images = renderedImages.TryGetValue(page.Number, out var pageImages)
                ? pageImages
                : [];

            pages.Add(new PdfExtractedPage(
                PageNumber: page.Number,
                RawText: pageText,
                PageHeight: page.Height,
                Words: words,
                Images: images));
        }

        return pages;
    }

    private static List<PdfExtractedWord> ExtractWords(Page page)
    {
        var words = new List<PdfExtractedWord>();
        foreach (var word in page.GetWords())
        {
            words.Add(new PdfExtractedWord(
                Text: word.Text,
                TopFromPageTop: page.Height - word.BoundingBox.Top,
                BottomFromPageTop: page.Height - word.BoundingBox.Bottom,
                Left: word.BoundingBox.Left,
                Right: word.BoundingBox.Right));
        }

        return words;
    }

    private Dictionary<int, List<PdfExtractedPageImage>> TryRenderPageImages(
        byte[] pdfBytes,
        string fileName)
    {
        var result = new Dictionary<int, List<PdfExtractedPageImage>>();

        try
        {
            using var library = DocLib.Instance;
            using var docReader = library.GetDocReader(pdfBytes, new PageDimensions(RenderDpi, RenderDpi));
            var pageCount = docReader.GetPageCount();

            for (var i = 0; i < pageCount; i++)
            {
                using var pageReader = docReader.GetPageReader(i);
                var width = pageReader.GetPageWidth();
                var height = pageReader.GetPageHeight();

                if (width <= 0 || height <= 0)
                {
                    continue;
                }

                var rawBytes = pageReader.GetImage();
                if (rawBytes is null || rawBytes.Length == 0)
                {
                    continue;
                }

                var pageNumber = i + 1;
                var images = DetectImageRegionsFromRenderedPage(
                    rawBytes,
                    width,
                    height,
                    (double)width / height);

                if (images.Count > 0)
                {
                    result[pageNumber] = images;
                }
            }
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "PDFium page rendering failed for {FileName}. Image regions will be empty.", fileName);
        }

        return result;
    }

    private static List<PdfExtractedPageImage> DetectImageRegionsFromRenderedPage(
        byte[] rawBgra,
        int widthPx,
        int heightPx,
        double aspectRatio)
    {
        var images = new List<PdfExtractedPageImage>();

        if (rawBgra.Length < widthPx * heightPx * 4)
        {
            return images;
        }

        var hasNonWhiteBlock = HasSignificantNonWhiteBlock(rawBgra, widthPx, heightPx);
        if (!hasNonWhiteBlock)
        {
            return images;
        }

        var pageCoverage = EstimateNonWhiteCoverage(rawBgra, widthPx, heightPx);
        if (pageCoverage < MinImagePageCoverageThreshold)
        {
            return images;
        }

        var pixelArea = widthPx * heightPx;
        if (pixelArea < MinImagePixelArea)
        {
            return images;
        }

        var dataUrl = BuildBitmapDataUrl(rawBgra, widthPx, heightPx);
        images.Add(new PdfExtractedPageImage(
            DataUrl: dataUrl,
            PageCoverage: pageCoverage,
            PixelArea: pixelArea,
            WidthInSamples: widthPx,
            HeightInSamples: heightPx,
            TopFromPageTop: 0,
            BottomFromPageTop: heightPx,
            Left: 0,
            Right: widthPx));

        return images;
    }

    private static bool HasSignificantNonWhiteBlock(byte[] rawBgra, int widthPx, int heightPx)
    {
        const int threshold = 220;
        const int blockSize = 16;
        var nonWhiteCount = 0;

        for (var y = 0; y < heightPx; y += blockSize)
        {
            for (var x = 0; x < widthPx; x += blockSize)
            {
                var offset = (y * widthPx + x) * 4;
                if (offset + 2 >= rawBgra.Length)
                {
                    break;
                }

                var b = rawBgra[offset];
                var g = rawBgra[offset + 1];
                var r = rawBgra[offset + 2];

                if (r < threshold || g < threshold || b < threshold)
                {
                    nonWhiteCount++;
                    if (nonWhiteCount >= 10)
                    {
                        return true;
                    }
                }
            }
        }

        return false;
    }

    private static double EstimateNonWhiteCoverage(byte[] rawBgra, int widthPx, int heightPx)
    {
        const int threshold = 230;
        const int sampleStep = 4;
        var total = 0;
        var nonWhite = 0;

        for (var y = 0; y < heightPx; y += sampleStep)
        {
            for (var x = 0; x < widthPx; x += sampleStep)
            {
                var offset = (y * widthPx + x) * 4;
                if (offset + 2 >= rawBgra.Length)
                {
                    break;
                }

                total++;
                var b = rawBgra[offset];
                var g = rawBgra[offset + 1];
                var r = rawBgra[offset + 2];

                if (r < threshold || g < threshold || b < threshold)
                {
                    nonWhite++;
                }
            }
        }

        return total == 0 ? 0 : (double)nonWhite / total;
    }

    private static string BuildBitmapDataUrl(byte[] rawBgra, int widthPx, int heightPx)
    {
        var pngBytes = ConvertBgraToPng(rawBgra, widthPx, heightPx);
        return "data:image/png;base64," + Convert.ToBase64String(pngBytes);
    }

    private static byte[] ConvertBgraToPng(byte[] rawBgra, int widthPx, int heightPx)
    {
        using var ms = new MemoryStream();
        using var bw = new BinaryWriter(ms);

        void WriteChunk(string type, byte[] data)
        {
            bw.Write(ToBigEndian(data.Length));
            var typeBytes = System.Text.Encoding.ASCII.GetBytes(type);
            bw.Write(typeBytes);
            bw.Write(data);
            var crc = ComputeCrc32(typeBytes.Concat(data).ToArray());
            bw.Write(ToBigEndian((int)crc));
        }

        bw.Write(new byte[] { 137, 80, 78, 71, 13, 10, 26, 10 });

        var ihdr = new byte[13];
        ihdr[0] = (byte)(widthPx >> 24);
        ihdr[1] = (byte)(widthPx >> 16);
        ihdr[2] = (byte)(widthPx >> 8);
        ihdr[3] = (byte)widthPx;
        ihdr[4] = (byte)(heightPx >> 24);
        ihdr[5] = (byte)(heightPx >> 16);
        ihdr[6] = (byte)(heightPx >> 8);
        ihdr[7] = (byte)heightPx;
        ihdr[8] = 8;
        ihdr[9] = 2;
        WriteChunk("IHDR", ihdr);

        var stride = widthPx * 3;
        var raw = new byte[heightPx * (stride + 1)];
        for (var y = 0; y < heightPx; y++)
        {
            raw[y * (stride + 1)] = 0;
            for (var x = 0; x < widthPx; x++)
            {
                var srcOffset = (y * widthPx + x) * 4;
                var dstOffset = y * (stride + 1) + 1 + x * 3;
                raw[dstOffset] = srcOffset + 2 < rawBgra.Length ? rawBgra[srcOffset + 2] : (byte)255;
                raw[dstOffset + 1] = srcOffset + 1 < rawBgra.Length ? rawBgra[srcOffset + 1] : (byte)255;
                raw[dstOffset + 2] = srcOffset < rawBgra.Length ? rawBgra[srcOffset] : (byte)255;
            }
        }

        using var deflated = new MemoryStream();
        using (var deflate = new System.IO.Compression.DeflateStream(
                   deflated, System.IO.Compression.CompressionLevel.Fastest, true))
        {
            deflate.Write(raw, 0, raw.Length);
        }

        var zlib = new byte[deflated.Length + 6];
        zlib[0] = 0x78;
        zlib[1] = 0x9C;
        deflated.ToArray().CopyTo(zlib, 2);
        var adler = ComputeAdler32(raw);
        zlib[zlib.Length - 4] = (byte)(adler >> 24);
        zlib[zlib.Length - 3] = (byte)(adler >> 16);
        zlib[zlib.Length - 2] = (byte)(adler >> 8);
        zlib[zlib.Length - 1] = (byte)adler;

        WriteChunk("IDAT", zlib);
        WriteChunk("IEND", []);

        return ms.ToArray();
    }

    private static byte[] ToBigEndian(int value) =>
        [(byte)(value >> 24), (byte)(value >> 16), (byte)(value >> 8), (byte)value];

    private static uint ComputeCrc32(byte[] data)
    {
        var table = BuildCrc32Table();
        uint crc = 0xFFFFFFFF;
        foreach (var b in data)
        {
            crc = (crc >> 8) ^ table[(crc ^ b) & 0xFF];
        }

        return crc ^ 0xFFFFFFFF;
    }

    private static uint[] BuildCrc32Table()
    {
        var table = new uint[256];
        for (uint i = 0; i < 256; i++)
        {
            var c = i;
            for (var k = 0; k < 8; k++)
            {
                c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
            }

            table[i] = c;
        }

        return table;
    }

    private static uint ComputeAdler32(byte[] data)
    {
        const uint mod = 65521;
        uint a = 1, b = 0;
        foreach (var v in data)
        {
            a = (a + v) % mod;
            b = (b + a) % mod;
        }

        return (b << 16) | a;
    }

    private static string NormalizeText(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return string.Empty;
        }

        return System.Text.RegularExpressions.Regex
            .Replace(text.Replace("\r\n", "\n").Replace('\r', '\n'), @"\n{3,}", "\n\n")
            .Trim();
    }
}
