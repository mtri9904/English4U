using System.Collections.Concurrent;
using EnglishExamApp.Application.DTOs.Leaderboard;
using EnglishExamApp.Application.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Application.Services;

public class LeaderboardService(
    IApplicationDbContext context,
    ILogger<LeaderboardService> logger) : ILeaderboardService
{
    // In-memory store for claimed quests per user per week: "userId_weekNumber_questId"
    private static readonly ConcurrentDictionary<string, DateTime> ClaimedQuests = new();

    public async Task<LeaderboardOverviewDto> GetLeaderboardOverviewAsync(
        Guid currentUserId,
        string category = "diligence",
        string period = "week",
        CancellationToken cancellationToken = default)
    {
        category = string.IsNullOrWhiteSpace(category) ? "diligence" : category.ToLowerInvariant();
        period = string.IsNullOrWhiteSpace(period) ? "week" : period.ToLowerInvariant();

        var (startDate, endDate) = GetPeriodRange(period);

        // 1. Fetch 100% real users from database
        var users = await context.Users
            .AsNoTracking()
            .Where(u => u.IsActive)
            .Select(u => new
            {
                u.Id,
                DisplayName = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : u.Email.Split('@', StringSplitOptions.None)[0],
                u.Email,
                u.AvatarUrl,
                u.ExperiencePoints,
                u.DailyStreakCount,
                u.LongestStreakCount,
                u.LastActivityAt
            })
            .ToListAsync(cancellationToken);

        // If current user is not in active users list, try finding them to ensure they can see their position
        if (currentUserId != Guid.Empty && !users.Any(u => u.Id == currentUserId))
        {
            var currentUser = await context.Users
                .AsNoTracking()
                .Where(u => u.Id == currentUserId)
                .Select(u => new
                {
                    u.Id,
                    DisplayName = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : u.Email.Split('@', StringSplitOptions.None)[0],
                    u.Email,
                    u.AvatarUrl,
                    u.ExperiencePoints,
                    u.DailyStreakCount,
                    u.LongestStreakCount,
                    u.LastActivityAt
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (currentUser != null)
            {
                users.Add(currentUser);
            }
        }

        // 2. Fetch completed sessions within the period
        var sessionsQuery = context.ExamSessions
            .AsNoTracking()
            .Where(s => s.Status == "Completed" || s.Status == "Submitted");

        if (startDate.HasValue)
        {
            sessionsQuery = sessionsQuery.Where(s => s.StartedAt >= startDate.Value);
        }

        var sessions = await sessionsQuery
            .Select(s => new
            {
                s.UserId,
                s.StartedAt,
                s.EndedAt,
                TotalBand = s.ScoringResults.Select(r => r.TotalBandScore).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var sessionsByUser = sessions.GroupBy(s => s.UserId).ToDictionary(g => g.Key, g => g.ToList());

        // 3. Aggregate metrics purely from real database data
        var userItems = new List<LeaderboardItemDto>();

        foreach (var u in users)
        {
            var userSessions = sessionsByUser.GetValueOrDefault(u.Id, []);
            var completedCount = userSessions.Count;

            var totalMinutes = userSessions.Sum(s =>
            {
                if (s.EndedAt.HasValue && s.EndedAt.Value > s.StartedAt)
                {
                    var mins = (s.EndedAt.Value - s.StartedAt).TotalMinutes;
                    return Math.Clamp(mins, 1, 180);
                }
                return 15.0; // Minimal estimate if session had no explicit endedAt
            });

            var validBands = userSessions
                .Where(s => s.TotalBand.HasValue && s.TotalBand.Value > 0)
                .Select(s => s.TotalBand!.Value)
                .ToList();

            var avgBand = validBands.Count > 0 ? Math.Round(validBands.Average(), 1) : (double?)null;
            var studyHours = Math.Round(totalMinutes / 60.0, 1);

            var topBadge = GetUserTopBadge(u.DailyStreakCount, avgBand, studyHours);

            userItems.Add(new LeaderboardItemDto
            {
                UserId = u.Id,
                DisplayName = u.DisplayName,
                Email = u.Email,
                AvatarUrl = u.AvatarUrl,
                ExperiencePoints = u.ExperiencePoints,
                DailyStreakCount = u.DailyStreakCount,
                LongestStreakCount = Math.Max(u.LongestStreakCount, u.DailyStreakCount),
                TotalStudyHours = studyHours,
                ExamsCompletedCount = completedCount,
                AverageBandScore = avgBand,
                TopBadge = topBadge,
                IsCurrentUser = u.Id == currentUserId
            });
        }

        // 4. Rank purely real users according to selected category
        switch (category)
        {
            case "streak":
                userItems = userItems
                    .OrderByDescending(u => u.DailyStreakCount)
                    .ThenByDescending(u => u.LongestStreakCount)
                    .ThenByDescending(u => u.ExperiencePoints)
                    .ToList();

                for (var i = 0; i < userItems.Count; i++)
                {
                    var item = userItems[i];
                    item.Rank = i + 1;
                    item.PrimaryMetricValue = item.DailyStreakCount;
                    item.PrimaryMetricLabel = $"{item.DailyStreakCount} ngày";
                    item.SecondaryMetricLabel = item.LongestStreakCount > item.DailyStreakCount
                        ? $"Kỷ lục: {item.LongestStreakCount} ngày"
                        : $"{item.ExperiencePoints} XP";
                }
                break;

            case "score":
                userItems = userItems
                    .OrderByDescending(u => u.AverageBandScore ?? 0.0)
                    .ThenByDescending(u => u.ExamsCompletedCount)
                    .ThenByDescending(u => u.ExperiencePoints)
                    .ToList();

                for (var i = 0; i < userItems.Count; i++)
                {
                    var item = userItems[i];
                    item.Rank = i + 1;
                    item.PrimaryMetricValue = item.AverageBandScore ?? 0.0;
                    item.PrimaryMetricLabel = item.AverageBandScore.HasValue ? $"Band {item.AverageBandScore:F1}" : "Chưa có Band";
                    item.SecondaryMetricLabel = $"{item.ExamsCompletedCount} bài đã hoàn thành";
                }
                break;

            case "diligence":
            default:
                userItems = userItems
                    .OrderByDescending(u => u.TotalStudyHours)
                    .ThenByDescending(u => u.ExamsCompletedCount)
                    .ThenByDescending(u => u.ExperiencePoints)
                    .ToList();

                for (var i = 0; i < userItems.Count; i++)
                {
                    var item = userItems[i];
                    item.Rank = i + 1;
                    item.PrimaryMetricValue = item.TotalStudyHours;
                    item.PrimaryMetricLabel = $"{item.TotalStudyHours:F1} giờ";
                    item.SecondaryMetricLabel = $"{item.ExamsCompletedCount} bài thi • {item.ExperiencePoints} XP";
                }
                break;
        }

        var currentUserRank = userItems.FirstOrDefault(x => x.IsCurrentUser);
        var badges = await GetUserBadgesAsync(currentUserId, cancellationToken);
        var weeklyQuests = await GetWeeklyQuestsAsync(currentUserId, cancellationToken);

        var totalXp = currentUserRank?.ExperiencePoints ?? 0;
        var level = Math.Max(1, (totalXp / 150) + 1);
        var nextLevelXp = level * 150;

        return new LeaderboardOverviewDto
        {
            Category = category,
            Period = period,
            Rankings = userItems.Take(50).ToList(),
            CurrentUserRank = currentUserRank,
            TotalParticipants = userItems.Count,
            Badges = badges,
            WeeklyQuests = weeklyQuests,
            UserSummary = new UserGamificationHeaderDto
            {
                CurrentRank = currentUserRank?.Rank ?? 1,
                TotalXp = totalXp,
                Level = level,
                NextLevelXp = nextLevelXp,
                DailyStreak = currentUserRank?.DailyStreakCount ?? 0,
                BadgesUnlockedCount = badges.Count(b => b.Unlocked),
                TotalBadgesCount = badges.Count,
                QuestsCompletedCount = weeklyQuests.Count(q => q.IsCompleted),
                TotalQuestsCount = weeklyQuests.Count
            }
        };
    }

    public async Task<List<BadgeItemDto>> GetUserBadgesAsync(Guid currentUserId, CancellationToken cancellationToken = default)
    {
        var user = await context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);

        var streak = user?.DailyStreakCount ?? 0;
        var longestStreak = Math.Max(user?.LongestStreakCount ?? 0, streak);

        var sessions = await context.ExamSessions
            .AsNoTracking()
            .Where(s => s.UserId == currentUserId && (s.Status == "Completed" || s.Status == "Submitted"))
            .Select(s => new
            {
                s.StartedAt,
                s.EndedAt,
                TotalBand = s.ScoringResults.Select(r => r.TotalBandScore).FirstOrDefault(),
                ReadingScore = s.ScoringResults.Select(r => r.ReadingScore).FirstOrDefault(),
                ListeningScore = s.ScoringResults.Select(r => r.ListeningScore).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var bestBand = sessions.Where(s => s.TotalBand.HasValue).Select(s => s.TotalBand!.Value).DefaultIfEmpty(0.0).Max();
        var readingCount = sessions.Count(s => s.ReadingScore.HasValue && s.ReadingScore.Value > 0);
        var totalExams = sessions.Count;

        var flashcardCount = await context.FlashcardItems
            .AsNoTracking()
            .Where(f => f.Deck.UserId == currentUserId)
            .CountAsync(cancellationToken);

        var totalAnsweredQuestions = await context.UserAnswers
            .AsNoTracking()
            .Where(a => a.Session.UserId == currentUserId)
            .CountAsync(cancellationToken);

        var badges = new List<BadgeItemDto>
        {
            new()
            {
                Id = "ielts_hunter_7",
                Title = "IELTS Hunter 7.0+",
                Description = "Đạt điểm tổng Band Score từ 7.0 trở lên trong một bài luyện thi.",
                Category = "ielts",
                Tier = "gold",
                Icon = "🎯",
                Unlocked = bestBand >= 7.0,
                UnlockedAt = bestBand >= 7.0 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(bestBand, 7.0),
                TargetProgress = 7.0,
                ProgressUnit = "Band",
                XpReward = 150
            },
            new()
            {
                Id = "ielts_master_8",
                Title = "IELTS Master 8.0+",
                Description = "Chinh phục đỉnh cao Band Score 8.0+ xuất sắc.",
                Category = "ielts",
                Tier = "diamond",
                Icon = "👑",
                Unlocked = bestBand >= 8.0,
                UnlockedAt = bestBand >= 8.0 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(bestBand, 8.0),
                TargetProgress = 8.0,
                ProgressUnit = "Band",
                XpReward = 300
            },
            new()
            {
                Id = "streak_7_days",
                Title = "7 Days Non-stop",
                Description = "Duy trì ngọn lửa học tập liên tục trong 7 ngày không ngắt quãng.",
                Category = "streak",
                Tier = "silver",
                Icon = "🔥",
                Unlocked = longestStreak >= 7,
                UnlockedAt = longestStreak >= 7 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(longestStreak, 7),
                TargetProgress = 7,
                ProgressUnit = "ngày",
                XpReward = 100
            },
            new()
            {
                Id = "streak_30_days",
                Title = "30 Days Legend",
                Description = "Huyền thoại kỷ luật: Duy trì chuỗi streak 30 ngày bền bỉ.",
                Category = "streak",
                Tier = "diamond",
                Icon = "⚡",
                Unlocked = longestStreak >= 30,
                UnlockedAt = longestStreak >= 30 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(longestStreak, 30),
                TargetProgress = 30,
                ProgressUnit = "ngày",
                XpReward = 500
            },
            new()
            {
                Id = "dictation_master_100",
                Title = "Dictation Master (100 câu)",
                Description = "Luyện chép chính tả và trả lời chuẩn xác 100 câu tiếng Anh học thuật.",
                Category = "diligence",
                Tier = "gold",
                Icon = "🎧",
                Unlocked = totalAnsweredQuestions >= 100,
                UnlockedAt = totalAnsweredQuestions >= 100 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(totalAnsweredQuestions, 100),
                TargetProgress = 100,
                ProgressUnit = "câu",
                XpReward = 120
            },
            new()
            {
                Id = "reading_scholar_5",
                Title = "Reading Scholar",
                Description = "Hoàn thành 5 bài thi Full Reading học thuật.",
                Category = "ielts",
                Tier = "silver",
                Icon = "📖",
                Unlocked = readingCount >= 5,
                UnlockedAt = readingCount >= 5 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(readingCount, 5),
                TargetProgress = 5,
                ProgressUnit = "bài",
                XpReward = 90
            },
            new()
            {
                Id = "vocab_virtuoso_50",
                Title = "Vocabulary Virtuoso",
                Description = "Sở hữu và ôn luyện từ 50 thẻ Flashcard từ vựng nâng cao.",
                Category = "diligence",
                Tier = "bronze",
                Icon = "🎴",
                Unlocked = flashcardCount >= 50,
                UnlockedAt = flashcardCount >= 50 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(flashcardCount, 50),
                TargetProgress = 50,
                ProgressUnit = "thẻ",
                XpReward = 60
            },
            new()
            {
                Id = "first_step",
                Title = "First Step",
                Description = "Hoàn thành bài thi thử nghiệm đầu tiên trên hệ thống English4U.",
                Category = "special",
                Tier = "bronze",
                Icon = "🚀",
                Unlocked = totalExams >= 1,
                UnlockedAt = totalExams >= 1 ? DateTime.UtcNow : null,
                CurrentProgress = Math.Min(totalExams, 1),
                TargetProgress = 1,
                ProgressUnit = "bài",
                XpReward = 50
            }
        };

        return badges;
    }

    public async Task<List<WeeklyQuestDto>> GetWeeklyQuestsAsync(Guid currentUserId, CancellationToken cancellationToken = default)
    {
        var weekNumber = GetCurrentIsoWeek();
        var (weekStart, weekEnd) = GetPeriodRange("week");

        var user = await context.Users
            .AsNoTracking()
            .FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);

        var streak = user?.DailyStreakCount ?? 0;

        var weeklySessions = await context.ExamSessions
            .AsNoTracking()
            .Where(s => s.UserId == currentUserId &&
                        (s.Status == "Completed" || s.Status == "Submitted") &&
                        s.StartedAt >= (weekStart ?? DateTime.UtcNow.AddDays(-7)))
            .Select(s => new
            {
                s.StartedAt,
                ReadingScore = s.ScoringResults.Select(r => r.ReadingScore).FirstOrDefault(),
                TotalBand = s.ScoringResults.Select(r => r.TotalBandScore).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var completedReading = weeklySessions.Count(s => s.ReadingScore.HasValue && s.ReadingScore.Value > 0);
        var hasHighBand = weeklySessions.Any(s => s.TotalBand.HasValue && s.TotalBand.Value >= 6.5);

        // Real weekly answered questions
        var weeklyAnswersCount = await context.UserAnswers
            .AsNoTracking()
            .Where(a => a.Session.UserId == currentUserId && a.SubmittedAt >= (weekStart ?? DateTime.UtcNow.AddDays(-7)))
            .CountAsync(cancellationToken);

        // Real flashcards created/owned by user
        var userFlashcardCount = await context.FlashcardItems
            .AsNoTracking()
            .Where(f => f.Deck.UserId == currentUserId)
            .CountAsync(cancellationToken);

        var daysRemaining = Math.Max(1, (int)(DateTime.UtcNow.Date.AddDays(7 - (int)DateTime.UtcNow.DayOfWeek) - DateTime.UtcNow.Date).TotalDays);

        var quests = new List<WeeklyQuestDto>
        {
            CreateQuest(
                id: "quest_reading_2",
                title: "Hoàn thành 2 bài Full Reading tuần này",
                description: "Luyện kỹ năng đọc hiểu chuyên sâu với 2 bài thi IELTS Reading đầy đủ 3 passages.",
                category: "reading",
                icon: "📖",
                current: Math.Min(completedReading, 2),
                target: 2,
                progressLabel: $"{Math.Min(completedReading, 2)}/2 bài",
                reward: 50,
                actionUrl: "/app/practice",
                currentUserId: currentUserId,
                weekNumber: weekNumber,
                daysRemaining: daysRemaining
            ),
            CreateQuest(
                id: "quest_streak_5",
                title: "Duy trì chuỗi học 5 ngày trong tuần",
                description: "Đăng nhập và hoàn thành ít nhất 1 bài tập mỗi ngày để xây dựng thói quen kiên trì.",
                category: "streak",
                icon: "🔥",
                current: Math.Min(streak, 5),
                target: 5,
                progressLabel: $"{Math.Min(streak, 5)}/5 ngày",
                reward: 80,
                actionUrl: "/app/practice",
                currentUserId: currentUserId,
                weekNumber: weekNumber,
                daysRemaining: daysRemaining
            ),
            CreateQuest(
                id: "quest_dictation_30",
                title: "Chép chính tả / trả lời 30 câu học thuật",
                description: "Rèn luyện tai nghe và kỹ năng bắt từ chi tiết với tính năng Dictation & bài tập luyện nghe.",
                category: "dictation",
                icon: "🎧",
                current: Math.Min(weeklyAnswersCount, 30),
                target: 30,
                progressLabel: $"{Math.Min(weeklyAnswersCount, 30)}/30 câu",
                reward: 60,
                actionUrl: "/app/dictation",
                currentUserId: currentUserId,
                weekNumber: weekNumber,
                daysRemaining: daysRemaining
            ),
            CreateQuest(
                id: "quest_flashcard_40",
                title: "Ôn tập 40 từ vựng Flashcard",
                description: "Lật thẻ ghi nhớ phương pháp Spaced Repetition để mở rộng vốn từ Band 7.0+.",
                category: "flashcard",
                icon: "⚡",
                current: Math.Min(userFlashcardCount, 40),
                target: 40,
                progressLabel: $"{Math.Min(userFlashcardCount, 40)}/40 từ",
                reward: 40,
                actionUrl: "/app/flashcards",
                currentUserId: currentUserId,
                weekNumber: weekNumber,
                daysRemaining: daysRemaining
            ),
            CreateQuest(
                id: "quest_band_65",
                title: "Đạt Band Score >= 6.5 trong 1 bài thi",
                description: "Đạt kết quả xuất sắc Band 6.5 trở lên trong bất kỳ bài luyện thi nào tuần này.",
                category: "exam",
                icon: "🏆",
                current: hasHighBand ? 1 : 0,
                target: 1,
                progressLabel: hasHighBand ? "1/1 hoàn thành" : "0/1 hoàn thành",
                reward: 100,
                actionUrl: "/app/practice",
                currentUserId: currentUserId,
                weekNumber: weekNumber,
                daysRemaining: daysRemaining
            )
        };

        return quests;
    }

    public async Task<ClaimQuestRewardResponseDto> ClaimQuestRewardAsync(
        Guid currentUserId,
        string questId,
        CancellationToken cancellationToken = default)
    {
        var weekNumber = GetCurrentIsoWeek();
        var claimKey = $"{currentUserId}_{weekNumber}_{questId}";

        if (ClaimedQuests.ContainsKey(claimKey))
        {
            return new ClaimQuestRewardResponseDto
            {
                Success = false,
                QuestId = questId,
                Message = "Bạn đã nhận phần thưởng cho nhiệm vụ này trong tuần rồi!"
            };
        }

        var quests = await GetWeeklyQuestsAsync(currentUserId, cancellationToken);
        var quest = quests.FirstOrDefault(q => q.Id.Equals(questId, StringComparison.OrdinalIgnoreCase));

        if (quest == null)
        {
            return new ClaimQuestRewardResponseDto
            {
                Success = false,
                QuestId = questId,
                Message = "Nhiệm vụ không tồn tại."
            };
        }

        if (!quest.IsCompleted)
        {
            return new ClaimQuestRewardResponseDto
            {
                Success = false,
                QuestId = questId,
                Message = "Nhiệm vụ chưa hoàn thành. Hãy tiếp tục cố gắng nhé!"
            };
        }

        // Add real XP directly to user in database
        var user = await context.Users.FirstOrDefaultAsync(u => u.Id == currentUserId, cancellationToken);
        var newTotalXp = quest.XpReward;

        if (user != null)
        {
            user.ExperiencePoints += quest.XpReward;
            user.UpdatedAt = DateTime.UtcNow;
            await context.SaveChangesAsync(cancellationToken);
            newTotalXp = user.ExperiencePoints;
        }

        ClaimedQuests.TryAdd(claimKey, DateTime.UtcNow);
        logger.LogInformation("User {UserId} claimed quest {QuestId} (+{Xp} XP)", currentUserId, questId, quest.XpReward);

        return new ClaimQuestRewardResponseDto
        {
            Success = true,
            QuestId = questId,
            XpEarned = quest.XpReward,
            TotalXp = newTotalXp,
            Message = $"Tuyệt vời! Bạn nhận được +{quest.XpReward} XP cho thử thách '{quest.Title}'."
        };
    }

    public async Task<AdminLeaderboardOverviewDto> GetAdminLeaderboardOverviewAsync(
        string category = "diligence",
        string period = "week",
        CancellationToken cancellationToken = default)
    {
        category = string.IsNullOrWhiteSpace(category) ? "diligence" : category.ToLowerInvariant();
        period = string.IsNullOrWhiteSpace(period) ? "week" : period.ToLowerInvariant();

        var (startDate, endDate) = GetPeriodRange(period);

        // 1. Fetch all real active users
        var users = await context.Users
            .AsNoTracking()
            .Where(u => u.IsActive)
            .Select(u => new
            {
                u.Id,
                DisplayName = !string.IsNullOrWhiteSpace(u.DisplayName) ? u.DisplayName : u.Email.Split('@', StringSplitOptions.None)[0],
                u.Email,
                u.AvatarUrl,
                u.ExperiencePoints,
                u.DailyStreakCount,
                u.LongestStreakCount,
                u.LastActivityAt
            })
            .ToListAsync(cancellationToken);

        // 2. Fetch completed sessions within the period
        var sessionsQuery = context.ExamSessions
            .AsNoTracking()
            .Where(s => s.Status == "Completed" || s.Status == "Submitted");

        if (startDate.HasValue)
        {
            sessionsQuery = sessionsQuery.Where(s => s.StartedAt >= startDate.Value);
        }

        var sessions = await sessionsQuery
            .Select(s => new
            {
                s.UserId,
                s.StartedAt,
                s.EndedAt,
                TotalBand = s.ScoringResults.Select(r => r.TotalBandScore).FirstOrDefault(),
                ReadingScore = s.ScoringResults.Select(r => r.ReadingScore).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var sessionsByUser = sessions.GroupBy(s => s.UserId).ToDictionary(g => g.Key, g => g.ToList());

        // All historical sessions for system metrics & badge stats
        var allSessions = await context.ExamSessions
            .AsNoTracking()
            .Where(s => s.Status == "Completed" || s.Status == "Submitted")
            .Select(s => new
            {
                s.UserId,
                TotalBand = s.ScoringResults.Select(r => r.TotalBandScore).FirstOrDefault(),
                ReadingScore = s.ScoringResults.Select(r => r.ReadingScore).FirstOrDefault(),
                ListeningScore = s.ScoringResults.Select(r => r.ListeningScore).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var allSessionsByUser = allSessions.GroupBy(s => s.UserId).ToDictionary(g => g.Key, g => g.ToList());

        // Flashcards count per user
        var flashcardsByUser = await context.FlashcardItems
            .AsNoTracking()
            .GroupBy(f => f.Deck.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        // User answers count per user
        var answersByUser = await context.UserAnswers
            .AsNoTracking()
            .GroupBy(a => a.Session.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        // 3. Aggregate user ranking items
        var userItems = new List<LeaderboardItemDto>();

        foreach (var u in users)
        {
            var userSessions = sessionsByUser.GetValueOrDefault(u.Id, []);
            var completedCount = userSessions.Count;

            var totalMinutes = userSessions.Sum(s =>
            {
                if (s.EndedAt.HasValue && s.EndedAt.Value > s.StartedAt)
                {
                    var mins = (s.EndedAt.Value - s.StartedAt).TotalMinutes;
                    return Math.Clamp(mins, 1, 180);
                }
                return 15.0;
            });

            var validBands = userSessions
                .Where(s => s.TotalBand.HasValue && s.TotalBand.Value > 0)
                .Select(s => s.TotalBand!.Value)
                .ToList();

            var avgBand = validBands.Count > 0 ? Math.Round(validBands.Average(), 1) : (double?)null;
            var studyHours = Math.Round(totalMinutes / 60.0, 1);
            var topBadge = GetUserTopBadge(u.DailyStreakCount, avgBand, studyHours);

            userItems.Add(new LeaderboardItemDto
            {
                UserId = u.Id,
                DisplayName = u.DisplayName,
                Email = u.Email,
                AvatarUrl = u.AvatarUrl,
                ExperiencePoints = u.ExperiencePoints,
                DailyStreakCount = u.DailyStreakCount,
                LongestStreakCount = Math.Max(u.LongestStreakCount, u.DailyStreakCount),
                TotalStudyHours = studyHours,
                ExamsCompletedCount = completedCount,
                AverageBandScore = avgBand,
                TopBadge = topBadge,
                IsCurrentUser = false
            });
        }

        // Rank items
        switch (category)
        {
            case "streak":
                userItems = userItems
                    .OrderByDescending(u => u.DailyStreakCount)
                    .ThenByDescending(u => u.LongestStreakCount)
                    .ThenByDescending(u => u.ExperiencePoints)
                    .ToList();

                for (var i = 0; i < userItems.Count; i++)
                {
                    var item = userItems[i];
                    item.Rank = i + 1;
                    item.PrimaryMetricValue = item.DailyStreakCount;
                    item.PrimaryMetricLabel = $"{item.DailyStreakCount} ngày";
                    item.SecondaryMetricLabel = item.LongestStreakCount > item.DailyStreakCount
                        ? $"Kỷ lục: {item.LongestStreakCount} ngày"
                        : $"{item.ExperiencePoints} XP";
                }
                break;

            case "score":
                userItems = userItems
                    .OrderByDescending(u => u.AverageBandScore ?? 0.0)
                    .ThenByDescending(u => u.ExamsCompletedCount)
                    .ThenByDescending(u => u.ExperiencePoints)
                    .ToList();

                for (var i = 0; i < userItems.Count; i++)
                {
                    var item = userItems[i];
                    item.Rank = i + 1;
                    item.PrimaryMetricValue = item.AverageBandScore ?? 0.0;
                    item.PrimaryMetricLabel = item.AverageBandScore.HasValue ? $"Band {item.AverageBandScore:F1}" : "Chưa có Band";
                    item.SecondaryMetricLabel = $"{item.ExamsCompletedCount} bài đã hoàn thành";
                }
                break;

            case "diligence":
            default:
                userItems = userItems
                    .OrderByDescending(u => u.TotalStudyHours)
                    .ThenByDescending(u => u.ExamsCompletedCount)
                    .ThenByDescending(u => u.ExperiencePoints)
                    .ToList();

                for (var i = 0; i < userItems.Count; i++)
                {
                    var item = userItems[i];
                    item.Rank = i + 1;
                    item.PrimaryMetricValue = item.TotalStudyHours;
                    item.PrimaryMetricLabel = $"{item.TotalStudyHours:F1} giờ";
                    item.SecondaryMetricLabel = $"{item.ExamsCompletedCount} bài thi • {item.ExperiencePoints} XP";
                }
                break;
        }

        // 4. Compute overall KPI metrics
        var totalLearners = users.Count;
        var activeLearners = userItems.Count(u => u.ExamsCompletedCount > 0 || u.TotalStudyHours > 0);
        var totalStudyHours = Math.Round(userItems.Sum(u => u.TotalStudyHours), 1);
        var totalExamsCompleted = userItems.Sum(u => u.ExamsCompletedCount);
        var validScores = userItems.Where(u => u.AverageBandScore.HasValue && u.AverageBandScore.Value > 0).Select(u => u.AverageBandScore!.Value).ToList();
        var averageBandScore = validScores.Count > 0 ? Math.Round(validScores.Average(), 1) : 0.0;
        var highestStreak = users.Select(u => Math.Max(u.DailyStreakCount, u.LongestStreakCount)).DefaultIfEmpty(0).Max();
        var totalXpAwarded = users.Sum(u => u.ExperiencePoints);

        // 5. Compute Badge Distribution across all real users
        var badgeDefinitions = new (string Id, string Title, string Category, string Tier, string Icon, int Xp, Func<Guid, bool> CheckUnlocked)[]
        {
            ("ielts_hunter_7", "IELTS Hunter 7.0+", "ielts", "gold", "🎯", 150, uid => {
                var sList = allSessionsByUser.GetValueOrDefault(uid, []);
                return sList.Any(s => s.TotalBand >= 7.0);
            }),
            ("ielts_master_8", "IELTS Master 8.0+", "ielts", "diamond", "👑", 300, uid => {
                var sList = allSessionsByUser.GetValueOrDefault(uid, []);
                return sList.Any(s => s.TotalBand >= 8.0);
            }),
            ("streak_7_days", "7 Days Non-stop", "streak", "silver", "🔥", 100, uid => {
                var u = users.FirstOrDefault(x => x.Id == uid);
                return (u?.LongestStreakCount ?? 0) >= 7 || (u?.DailyStreakCount ?? 0) >= 7;
            }),
            ("streak_30_days", "30 Days Legend", "streak", "diamond", "⚡", 500, uid => {
                var u = users.FirstOrDefault(x => x.Id == uid);
                return (u?.LongestStreakCount ?? 0) >= 30 || (u?.DailyStreakCount ?? 0) >= 30;
            }),
            ("dictation_master_100", "Dictation Master (100 câu)", "diligence", "gold", "🎧", 120, uid => {
                return answersByUser.GetValueOrDefault(uid, 0) >= 100;
            }),
            ("reading_scholar_5", "Reading Scholar", "ielts", "silver", "📖", 90, uid => {
                var sList = allSessionsByUser.GetValueOrDefault(uid, []);
                return sList.Count(s => s.ReadingScore.HasValue && s.ReadingScore > 0) >= 5;
            }),
            ("vocab_virtuoso_50", "Vocabulary Virtuoso", "diligence", "bronze", "🎴", 60, uid => {
                return flashcardsByUser.GetValueOrDefault(uid, 0) >= 50;
            }),
            ("first_step", "First Step", "special", "bronze", "🚀", 50, uid => {
                return allSessionsByUser.GetValueOrDefault(uid, []).Count >= 1;
            })
        };

        var badgeDistribution = badgeDefinitions.Select(b =>
        {
            var unlockedCount = users.Count(u => b.CheckUnlocked(u.Id));
            var percentage = totalLearners > 0 ? Math.Round((double)unlockedCount / totalLearners * 100, 1) : 0.0;
            return new AdminBadgeStatDto
            {
                Id = b.Id,
                Title = b.Title,
                Category = b.Category,
                Tier = b.Tier,
                Icon = b.Icon,
                UnlockedCount = unlockedCount,
                UnlockedPercentage = percentage,
                XpReward = b.Xp
            };
        }).ToList();

        // 6. Compute Quest Overview across all real users for this week
        var (weekStart, _) = GetPeriodRange("week");
        var weeklySessionsAll = await context.ExamSessions
            .AsNoTracking()
            .Where(s => (s.Status == "Completed" || s.Status == "Submitted") &&
                        s.StartedAt >= (weekStart ?? DateTime.UtcNow.AddDays(-7)))
            .Select(s => new
            {
                s.UserId,
                ReadingScore = s.ScoringResults.Select(r => r.ReadingScore).FirstOrDefault(),
                TotalBand = s.ScoringResults.Select(r => r.TotalBandScore).FirstOrDefault()
            })
            .ToListAsync(cancellationToken);

        var weeklySessionsByUser = weeklySessionsAll.GroupBy(s => s.UserId).ToDictionary(g => g.Key, g => g.ToList());

        var weeklyAnswersByUser = await context.UserAnswers
            .AsNoTracking()
            .Where(a => a.SubmittedAt >= (weekStart ?? DateTime.UtcNow.AddDays(-7)))
            .GroupBy(a => a.Session.UserId)
            .Select(g => new { UserId = g.Key, Count = g.Count() })
            .ToDictionaryAsync(x => x.UserId, x => x.Count, cancellationToken);

        var questDefinitions = new (string Id, string Title, string Category, string Icon, int Target, int Xp, Func<Guid, bool> CheckCompleted)[]
        {
            ("quest_reading_2", "Hoàn thành 2 bài Full Reading tuần này", "reading", "📖", 2, 50, uid => {
                var wSessions = weeklySessionsByUser.GetValueOrDefault(uid, []);
                return wSessions.Count(s => s.ReadingScore.HasValue && s.ReadingScore > 0) >= 2;
            }),
            ("quest_streak_5", "Duy trì chuỗi học 5 ngày trong tuần", "streak", "🔥", 5, 80, uid => {
                var u = users.FirstOrDefault(x => x.Id == uid);
                return (u?.DailyStreakCount ?? 0) >= 5;
            }),
            ("quest_dictation_30", "Chép chính tả / trả lời 30 câu học thuật", "dictation", "🎧", 30, 60, uid => {
                return weeklyAnswersByUser.GetValueOrDefault(uid, 0) >= 30;
            }),
            ("quest_flashcard_40", "Ôn tập 40 từ vựng Flashcard", "flashcard", "⚡", 40, 40, uid => {
                return flashcardsByUser.GetValueOrDefault(uid, 0) >= 40;
            }),
            ("quest_band_65", "Đạt Band Score >= 6.5 trong 1 bài thi", "exam", "🏆", 1, 100, uid => {
                var wSessions = weeklySessionsByUser.GetValueOrDefault(uid, []);
                return wSessions.Any(s => s.TotalBand >= 6.5);
            })
        };

        var questOverview = questDefinitions.Select(q =>
        {
            var completedCount = users.Count(u => q.CheckCompleted(u.Id));
            var rate = totalLearners > 0 ? Math.Round((double)completedCount / totalLearners * 100, 1) : 0.0;
            return new AdminQuestStatDto
            {
                Id = q.Id,
                Title = q.Title,
                Category = q.Category,
                Icon = q.Icon,
                Target = q.Target,
                CompletedLearnersCount = completedCount,
                CompletionRate = rate,
                XpReward = q.Xp
            };
        }).ToList();

        return new AdminLeaderboardOverviewDto
        {
            Category = category,
            Period = period,
            TotalLearners = totalLearners,
            ActiveLearners = activeLearners,
            TotalStudyHours = totalStudyHours,
            TotalExamsCompleted = totalExamsCompleted,
            AverageBandScore = averageBandScore,
            HighestStreak = highestStreak,
            TotalXpAwarded = totalXpAwarded,
            Rankings = userItems,
            BadgeDistribution = badgeDistribution,
            QuestOverview = questOverview
        };
    }

    private WeeklyQuestDto CreateQuest(
        string id,
        string title,
        string description,
        string category,
        string icon,
        int current,
        int target,
        string progressLabel,
        int reward,
        string actionUrl,
        Guid currentUserId,
        int weekNumber,
        int daysRemaining)
    {
        var isCompleted = current >= target;
        var claimKey = $"{currentUserId}_{weekNumber}_{id}";
        var isClaimed = ClaimedQuests.ContainsKey(claimKey);

        return new WeeklyQuestDto
        {
            Id = id,
            Title = title,
            Description = description,
            Category = category,
            Icon = icon,
            CurrentProgress = current,
            TargetProgress = target,
            ProgressLabel = progressLabel,
            XpReward = reward,
            IsCompleted = isCompleted,
            IsClaimed = isClaimed,
            ActionUrl = actionUrl,
            RemainingDays = daysRemaining
        };
    }

    private static (DateTime? Start, DateTime? End) GetPeriodRange(string period)
    {
        var now = DateTime.UtcNow;
        return period switch
        {
            "week" => (now.Date.AddDays(-(int)now.DayOfWeek + 1), now),
            "month" => (new DateTime(now.Year, now.Month, 1), now),
            _ => (null, null)
        };
    }

    private static int GetCurrentIsoWeek()
    {
        var d = DateTime.UtcNow;
        return System.Globalization.ISOWeek.GetWeekOfYear(d);
    }

    private static string GetUserTopBadge(int streak, double? avgBand, double studyHours)
    {
        if (avgBand >= 8.0) return "IELTS Master 8.0+";
        if (avgBand >= 7.0) return "IELTS Hunter 7.0+";
        if (streak >= 30) return "30 Days Legend";
        if (streak >= 7) return "7 Days Non-stop";
        if (studyHours >= 20) return "Top Chăm Chỉ";
        return "IELTS Achiever";
    }
}
