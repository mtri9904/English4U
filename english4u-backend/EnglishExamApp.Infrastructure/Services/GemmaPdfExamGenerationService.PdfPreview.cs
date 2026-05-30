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



    private async Task<string> ExtractPdfTextAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken)
    {
        var extraction = await pdfTextExtractionService.ExtractAsync(pdfStream, fileName, cancellationToken);
        return extraction.RawText;
    }

    private Task<PdfTextExtractionResult> ExtractPdfTextResultAsync(
        Stream pdfStream,
        string fileName,
        CancellationToken cancellationToken)
    {
        return pdfTextExtractionService.ExtractAsync(pdfStream, fileName, cancellationToken);
    }
}
