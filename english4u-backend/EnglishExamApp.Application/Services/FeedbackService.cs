using System.Text.Json;
using System.Text.RegularExpressions;
using EnglishExamApp.Application.DTOs.Common;
using EnglishExamApp.Application.DTOs.Feedbacks;
using EnglishExamApp.Application.Interfaces;
using EnglishExamApp.Application.Utilities;
using EnglishExamApp.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Application.Services;

public sealed class FeedbackService(
    IApplicationDbContext context,
    ICloudinaryMediaService cloudinaryMediaService,
    ILogger<FeedbackService> logger) : IFeedbackService
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    public async Task<FeedbackDetailDto> CreateFeedbackAsync(
        Guid userId,
        CreateFeedbackRequestDto dto,
        CancellationToken cancellationToken = default)
    {
        var user = await context.Users
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Id == userId, cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy thông tin tài khoản người dùng.");

        var normalizedType = string.IsNullOrWhiteSpace(dto.Type) ? "BUG" : dto.Type.Trim().ToUpperInvariant();
        var normalizedPriority = string.IsNullOrWhiteSpace(dto.Priority) ? "MEDIUM" : dto.Priority.Trim().ToUpperInvariant();

        var typePrefix = normalizedType switch
        {
            "BUG" => "BUG",
            "IMPROVEMENT" => "IMP",
            "QUESTION" => "QST",
            _ => "OTH"
        };

        var datePart = DateTime.UtcNow.ToString("yyMMdd");
        var countToday = await context.Feedbacks
            .CountAsync(f => f.CreatedAt >= DateTime.UtcNow.Date, cancellationToken);
        var sequence = (countToday + 1).ToString("D4");
        var code = $"FB-{typePrefix}-{datePart}-{sequence}";

        var attachmentsJson = dto.AttachmentUrls is { Count: > 0 }
            ? JsonSerializer.Serialize(dto.AttachmentUrls)
            : null;

        var senderName = !string.IsNullOrWhiteSpace(user.DisplayName) ? user.DisplayName : user.Email;
        var roleName = user.UserRoles.FirstOrDefault()?.Role?.Name ?? "Học viên";

        var feedback = new UserFeedback
        {
            Id = Guid.NewGuid(),
            Code = code,
            UserId = userId,
            Type = normalizedType,
            Priority = normalizedPriority,
            Title = dto.Title.Trim(),
            Description = dto.Description.Trim(),
            SuggestedSolution = string.IsNullOrWhiteSpace(dto.SuggestedSolution) ? null : dto.SuggestedSolution.Trim(),
            AttachmentsJson = attachmentsJson,
            BrowserInfo = string.IsNullOrWhiteSpace(dto.BrowserInfo) ? null : dto.BrowserInfo.Trim(),
            CurrentPageUrl = string.IsNullOrWhiteSpace(dto.CurrentPageUrl) ? null : dto.CurrentPageUrl.Trim(),
            Status = "RECEIVED",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        var initialLog = new FeedbackActivityLog
        {
            Id = Guid.NewGuid(),
            FeedbackId = feedback.Id,
            Status = "RECEIVED",
            Note = "Đã ghi nhận phản hồi",
            ActorId = userId,
            ActorName = $"{senderName} ({roleName})",
            CreatedAt = DateTime.UtcNow,
        };

        context.Feedbacks.Add(feedback);
        context.FeedbackActivityLogs.Add(initialLog);

        await context.SaveChangesAsync(cancellationToken);

        return MapToDetailDto(feedback, user, [initialLog]);
    }

    public async Task<IReadOnlyList<FeedbackListItemDto>> GetRecentFeedbacksAsync(int limit = 30, CancellationToken cancellationToken = default)
    {
        var safeLimit = Math.Clamp(limit, 5, 100);

        var list = await context.Feedbacks
            .AsNoTracking()
            .Include(f => f.User)
                .ThenInclude(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
            .OrderByDescending(f => f.CreatedAt)
            .Take(safeLimit)
            .ToListAsync(cancellationToken);

        return list.Select(MapToListItemDto).ToList();
    }

    public async Task<IReadOnlyList<FeedbackListItemDto>> GetMyFeedbacksAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var list = await context.Feedbacks
            .AsNoTracking()
            .Include(f => f.User)
                .ThenInclude(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
            .Where(f => f.UserId == userId)
            .OrderByDescending(f => f.CreatedAt)
            .ToListAsync(cancellationToken);

        return list.Select(MapToListItemDto).ToList();
    }

    public async Task<FeedbackDetailDto?> GetFeedbackDetailAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var feedback = await context.Feedbacks
            .AsNoTracking()
            .Include(f => f.User)
                .ThenInclude(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
            .Include(f => f.AssignedAdmin)
            .Include(f => f.ActivityLogs)
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

        if (feedback is null)
        {
            return null;
        }

        var orderedLogs = feedback.ActivityLogs
            .OrderByDescending(l => l.CreatedAt)
            .ToList();

        return MapToDetailDto(feedback, feedback.User, orderedLogs);
    }

    public async Task<PagedResult<FeedbackListItemDto>> GetAdminPagedFeedbacksAsync(
        FeedbackPagedRequest request,
        CancellationToken cancellationToken = default)
    {
        var pageNumber = request.PageNumber <= 0 ? 1 : request.PageNumber;
        var pageSize = request.PageSize <= 0 ? 10 : Math.Min(request.PageSize, 100);

        var query = context.Feedbacks
            .AsNoTracking()
            .Include(f => f.User)
                .ThenInclude(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
            .AsQueryable();

        var rawSearch = !string.IsNullOrWhiteSpace(request.SearchTerm) ? request.SearchTerm : request.Search;
        if (!string.IsNullOrWhiteSpace(rawSearch))
        {
            var search = rawSearch.Trim().ToLower();
            query = query.Where(f =>
                f.Code.ToLower().Contains(search) ||
                f.Title.ToLower().Contains(search) ||
                f.Description.ToLower().Contains(search) ||
                f.User.Email.ToLower().Contains(search) ||
                (f.User.DisplayName != null && f.User.DisplayName.ToLower().Contains(search)));
        }

        if (!string.IsNullOrWhiteSpace(request.Status) && !request.Status.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var status = request.Status.Trim().ToUpperInvariant();
            query = query.Where(f => f.Status == status);
        }

        if (!string.IsNullOrWhiteSpace(request.Type) && !request.Type.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var type = request.Type.Trim().ToUpperInvariant();
            query = query.Where(f => f.Type == type);
        }

        if (!string.IsNullOrWhiteSpace(request.Priority) && !request.Priority.Equals("ALL", StringComparison.OrdinalIgnoreCase))
        {
            var priority = request.Priority.Trim().ToUpperInvariant();
            query = query.Where(f => f.Priority == priority);
        }

        var totalCount = await query.CountAsync(cancellationToken);

        var items = await query
            .OrderByDescending(f => f.CreatedAt)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var dtos = items.Select(MapToListItemDto).ToList();

        return new PagedResult<FeedbackListItemDto>(dtos, totalCount, pageNumber, pageSize);
    }

    public async Task<FeedbackDetailDto> UpdateFeedbackStatusAsync(
        Guid feedbackId,
        Guid adminId,
        UpdateFeedbackStatusRequestDto dto,
        CancellationToken cancellationToken = default)
    {
        var feedback = await context.Feedbacks
            .Include(f => f.User)
                .ThenInclude(u => u.UserRoles)
                    .ThenInclude(ur => ur.Role)
            .Include(f => f.AssignedAdmin)
            .Include(f => f.ActivityLogs)
            .FirstOrDefaultAsync(f => f.Id == feedbackId, cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy báo cáo phản hồi cần cập nhật.");

        var admin = await context.Users
            .Include(u => u.UserRoles)
                .ThenInclude(ur => ur.Role)
            .FirstOrDefaultAsync(u => u.Id == adminId, cancellationToken)
            ?? throw new InvalidOperationException("Không tìm thấy thông tin quản trị viên xử lý.");

        var newStatus = dto.Status.Trim().ToUpperInvariant();
        var adminName = admin.DisplayName ?? admin.Email;
        var adminRole = admin.UserRoles.FirstOrDefault()?.Role?.Name ?? "Quản trị viên";

        var statusLabel = newStatus switch
        {
            "RECEIVED" => "Đã ghi nhận",
            "IN_PROGRESS" => "Đang xử lý",
            "RESOLVED" => "Đã xử lý / Hoàn thành",
            "REJECTED" => "Đã từ chối",
            _ => newStatus
        };

        var noteText = !string.IsNullOrWhiteSpace(dto.Note)
            ? dto.Note.Trim()
            : $"Cập nhật trạng thái thành: {statusLabel}";

        feedback.Status = newStatus;
        feedback.UpdatedAt = DateTime.UtcNow;
        feedback.AssignedAdminId = adminId;

        var activityLog = new FeedbackActivityLog
        {
            Id = Guid.NewGuid(),
            FeedbackId = feedback.Id,
            Status = newStatus,
            Note = noteText,
            ActorId = adminId,
            ActorName = $"{adminName} ({adminRole})",
            CreatedAt = DateTime.UtcNow,
        };

        context.FeedbackActivityLogs.Add(activityLog);
        await context.SaveChangesAsync(cancellationToken);

        var allLogs = await context.FeedbackActivityLogs
            .Where(l => l.FeedbackId == feedbackId)
            .OrderByDescending(l => l.CreatedAt)
            .ToListAsync(cancellationToken);

        return MapToDetailDto(feedback, feedback.User, allLogs);
    }

    public async Task<FeedbackStatsDto> GetFeedbackStatsAsync(CancellationToken cancellationToken = default)
    {
        var total = await context.Feedbacks.CountAsync(cancellationToken);
        var received = await context.Feedbacks.CountAsync(f => f.Status == "RECEIVED", cancellationToken);
        var inProgress = await context.Feedbacks.CountAsync(f => f.Status == "IN_PROGRESS", cancellationToken);
        var resolved = await context.Feedbacks.CountAsync(f => f.Status == "RESOLVED", cancellationToken);
        var rejected = await context.Feedbacks.CountAsync(f => f.Status == "REJECTED", cancellationToken);

        return new FeedbackStatsDto(total, received, inProgress, resolved, rejected);
    }

    private static FeedbackListItemDto MapToListItemDto(UserFeedback f)
    {
        var senderName = f.User?.DisplayName ?? f.User?.Email ?? "Ẩn danh";
        var senderRole = f.User?.UserRoles?.FirstOrDefault()?.Role?.Name ?? "Học viên";

        return new FeedbackListItemDto(
            f.Id,
            f.Code,
            f.Type,
            f.Priority,
            f.Title,
            f.Status,
            f.CurrentPageUrl,
            VietnamDateTimeFormatter.ToDisplay(f.CreatedAt) ?? f.CreatedAt.ToString("HH:mm dd/MM/yyyy"),
            senderName,
            senderRole
        );
    }

    private static FeedbackDetailDto MapToDetailDto(UserFeedback f, User user, IReadOnlyList<FeedbackActivityLog> logs)
    {
        var senderName = user.DisplayName ?? user.Email;
        var senderRole = user.UserRoles?.FirstOrDefault()?.Role?.Name ?? "Học viên";
        var assignedName = f.AssignedAdmin?.DisplayName ?? f.AssignedAdmin?.Email;

        List<string> attachments = [];
        if (!string.IsNullOrWhiteSpace(f.AttachmentsJson))
        {
            try
            {
                attachments = JsonSerializer.Deserialize<List<string>>(f.AttachmentsJson, JsonOptions) ?? [];
            }
            catch
            {
                attachments = [];
            }
        }

        var logDtos = logs.Select((l, index) => new FeedbackActivityLogDto(
            l.Id,
            l.Status,
            l.Note,
            l.ActorName,
            VietnamDateTimeFormatter.ToDisplay(l.CreatedAt) ?? l.CreatedAt.ToString("HH:mm dd/MM/yyyy"),
            index == 0 // Latest log is marked as current
        )).ToList();

        return new FeedbackDetailDto(
            f.Id,
            f.Code,
            f.Type,
            f.Priority,
            f.Title,
            f.Description,
            f.SuggestedSolution,
            attachments,
            f.BrowserInfo,
            f.CurrentPageUrl,
            f.Status,
            senderName,
            senderRole,
            user.Email,
            assignedName,
            VietnamDateTimeFormatter.ToDisplay(f.CreatedAt) ?? f.CreatedAt.ToString("HH:mm dd/MM/yyyy"),
            VietnamDateTimeFormatter.ToDisplay(f.UpdatedAt) ?? f.UpdatedAt.ToString("HH:mm dd/MM/yyyy"),
            logDtos
        );
    }

    public async Task<bool> DeleteFeedbackAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var feedback = await context.Feedbacks
            .Include(f => f.ActivityLogs)
            .FirstOrDefaultAsync(f => f.Id == id, cancellationToken);

        if (feedback is null)
        {
            return false;
        }

        // 1. Collect media URLs from AttachmentsJson
        var mediaUrls = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        if (!string.IsNullOrWhiteSpace(feedback.AttachmentsJson))
        {
            try
            {
                var attachments = JsonSerializer.Deserialize<List<string>>(feedback.AttachmentsJson, JsonOptions);
                if (attachments != null)
                {
                    foreach (var att in attachments)
                    {
                        if (!string.IsNullOrWhiteSpace(att)) mediaUrls.Add(att.Trim());
                    }
                }
            }
            catch
            {
                var matches = Regex.Matches(feedback.AttachmentsJson, @"(https?://res\.cloudinary\.com/[^\s""'<>]+|/uploads/[^\s""'<>]+)", RegexOptions.IgnoreCase);
                foreach (Match m in matches)
                {
                    var clean = m.Value.TrimEnd('"', '\'', ')', ',', ';', '>');
                    if (!string.IsNullOrWhiteSpace(clean)) mediaUrls.Add(clean);
                }
            }
        }

        // 2. Delete media from Cloudinary (feedback account) & local storage
        if (mediaUrls.Count > 0)
        {
            try
            {
                logger.LogInformation("Cleaning up {Count} attachment files for feedback {FeedbackId}...", mediaUrls.Count, id);
                await cloudinaryMediaService.DeleteMediaListAsync(mediaUrls, account: "feedback", cancellationToken);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Failed to cleanup attachment media for feedback {FeedbackId}", id);
            }
        }

        // 3. Remove database records
        if (feedback.ActivityLogs.Count > 0)
        {
            context.FeedbackActivityLogs.RemoveRange(feedback.ActivityLogs);
        }

        context.Feedbacks.Remove(feedback);
        await context.SaveChangesAsync(cancellationToken);

        return true;
    }
}

