using System;
using System.Threading;
using System.Threading.Tasks;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

/// <summary>
/// Background Service chạy ngầm tự động để:
/// 1. Khởi động cùng Backend (warm-up): nạp sẵn 200 bài báo cho tất cả 7 chuyên mục.
/// 2. Định kỳ mỗi 25 phút tự động cập nhật bài báo mới nhất vào RAM Cache.
/// 3. Sử dụng triệt để hạn mức 500 requests/ngày mà người dùng không cần bấm bất kỳ nút nào.
/// </summary>
public class NewsBackgroundSyncService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<NewsBackgroundSyncService> _logger;

    private static readonly string[] SyncCategories = new[]
    {
        "all",
        "business",
        "technology",
        "science",
        "travel",
        "culture",
        "lifestyle"
    };

    // Chu kỳ tự động đồng bộ ngầm: mỗi 25 phút
    private static readonly TimeSpan SyncInterval = TimeSpan.FromMinutes(25);

    public NewsBackgroundSyncService(
        IServiceScopeFactory scopeFactory,
        ILogger<NewsBackgroundSyncService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("The Guardian News Background Sync Service started.");

        // Đợi 3 giây sau khi server khởi động ổn định
        try
        {
            await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await SyncAllCategoriesAsync(stoppingToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                _logger.LogError(ex, "Error occurred during background news synchronization.");
            }

            try
            {
                _logger.LogInformation("News background sync cycle finished. Next sync scheduled in {Minutes} minutes.", SyncInterval.TotalMinutes);
                await Task.Delay(SyncInterval, stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }

        _logger.LogInformation("The Guardian News Background Sync Service stopped.");
    }

    private async Task SyncAllCategoriesAsync(CancellationToken stoppingToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var newsService = scope.ServiceProvider.GetRequiredService<INewsService>();

        var quota = newsService.GetQuotaStatus();
        if (quota.UsedToday >= quota.SafeDailyLimit)
        {
            _logger.LogWarning("Daily quota threshold reached ({Used}/{Limit}). Skipping background sync until reset.",
                quota.UsedToday, quota.SafeDailyLimit);
            return;
        }

        _logger.LogInformation("Starting background synchronization for The Guardian news ({Count} categories)...", SyncCategories.Length);

        foreach (var category in SyncCategories)
        {
            if (stoppingToken.IsCancellationRequested)
                break;

            try
            {
                _logger.LogInformation("Background syncing category '{Category}'...", category);
                var result = await newsService.GetNewsListAsync(category, page: 1, pageSize: 100, search: null, forceRefresh: true);
                _logger.LogInformation("Category '{Category}' synced: {Count} articles in memory cache. Quota used: {Used}/{Limit}.",
                    category, result.Items.Count, result.DailyQuotaUsed, quota.SafeDailyLimit);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to background sync category '{Category}'", category);
            }

            // Nghỉ 1.2 giây giữa các request để tuân thủ giới hạn 1 request/giây của The Guardian API
            try
            {
                await Task.Delay(TimeSpan.FromMilliseconds(1200), stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
        }
    }
}

