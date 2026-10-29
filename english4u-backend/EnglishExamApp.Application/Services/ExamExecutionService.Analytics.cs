using EnglishExamApp.Application.DTOs.ExamExecution;
using Microsoft.EntityFrameworkCore;

namespace EnglishExamApp.Application.Services;

public sealed partial class ExamExecutionService
{
    public async Task<ClientDashboardDto> GetClientDashboardAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var rawUser = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.DailyStreakCount, u.LongestStreakCount })
            .FirstOrDefaultAsync(cancellationToken);

        var userSessions = await context.ExamSessions
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => new
            {
                s.Id,
                s.ExamId,
                ExamTitle = s.Exam.Title,
                SkillType = s.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault() ?? "PRACTICE",
                s.Status,
                s.StartedAt,
                s.EndedAt,
                s.TimeRemaining,
                AnsweredQuestions = s.UserAnswers.Count,
                BandScore = s.ScoringResults
                    .OrderByDescending(r => r.ScoredAt)
                    .Select(r => r.TotalBandScore)
                    .FirstOrDefault()
            })
            .OrderByDescending(s => s.StartedAt)
            .ToListAsync(cancellationToken);

        var inProgressSession = userSessions
            .Where(s => NormalizeSessionStatus(s.Status) == "InProgress")
            .OrderByDescending(s => s.StartedAt)
            .FirstOrDefault();

        ClientDashboardActiveSessionDto? activeSessionDto = null;
        if (inProgressSession != null)
        {
            var examId = inProgressSession.ExamId;
            var totalQuestions = await context.Questions
                .AsNoTracking()
                .CountAsync(q => (q.Group.Passage != null && q.Group.Passage.Section.ExamId == examId)
                              || (q.Group.ListeningPart != null && q.Group.ListeningPart.Section.ExamId == examId), cancellationToken)
                + await context.WritingTasks.AsNoTracking().CountAsync(w => w.Section.ExamId == examId, cancellationToken)
                + await context.SpeakingQuestions.AsNoTracking().CountAsync(s => s.Part.Section.ExamId == examId, cancellationToken);

            activeSessionDto = new ClientDashboardActiveSessionDto(
                inProgressSession.Id,
                inProgressSession.ExamId,
                inProgressSession.ExamTitle,
                NormalizeSkillType(inProgressSession.SkillType),
                "InProgress",
                inProgressSession.AnsweredQuestions,
                totalQuestions,
                inProgressSession.TimeRemaining,
                inProgressSession.StartedAt);
        }

        var finishedSessions = userSessions
            .Where(s => IsFinalizedStatus(s.Status))
            .ToList();

        var completedCount = finishedSessions.Count;
        var uniqueExamCount = finishedSessions.Select(s => s.ExamId).Distinct().Count();

        var totalMinutes = finishedSessions.Sum(s =>
        {
            if (s.EndedAt == null) return 0;
            var duration = s.EndedAt.Value - s.StartedAt;
            return Math.Max(1, (int)Math.Ceiling(duration.TotalMinutes));
        });

        var now = DateTime.UtcNow;
        var sevenDaysAgo = now.AddDays(-7);
        var completedThisWeek = finishedSessions.Count(s =>
        {
            var ended = s.EndedAt ?? s.StartedAt;
            return ended >= sevenDaysAgo && ended <= now;
        });

        const int weeklyGoal = 3;
        var weeklyProgress = Math.Min(100, (int)Math.Round((completedThisWeek / (double)weeklyGoal) * 100));

        var scoredBands = finishedSessions
            .Where(s => s.BandScore.HasValue)
            .Select(s => s.BandScore!.Value)
            .ToList();

        double? averageBand = scoredBands.Count > 0 ? Math.Round(scoredBands.Average(), 1) : null;
        double? bestBand = scoredBands.Count > 0 ? Math.Round(scoredBands.Max(), 1) : null;
        double? estimatedOverallBand = averageBand ?? (scoredBands.Count > 0 ? Math.Round(scoredBands.Last(), 1) : null);

        var summary = new ClientDashboardSummaryDto(
            completedCount,
            completedThisWeek,
            weeklyGoal,
            weeklyProgress,
            totalMinutes,
            uniqueExamCount,
            averageBand,
            bestBand,
            estimatedOverallBand);

        string[] standardSkills = ["READING", "LISTENING", "WRITING", "SPEAKING"];
        var skillRows = new List<ClientDashboardSkillRowDto>();
        var radarData = new List<ClientDashboardRadarPointDto>();

        ClientDashboardSkillRowDto? weakest = null;

        foreach (var skill in standardSkills)
        {
            var allSkillSessions = userSessions
                .Where(s => NormalizeSkillType(s.SkillType) == skill)
                .ToList();
            var finishedSkillSessions = allSkillSessions
                .Where(s => IsFinalizedStatus(s.Status))
                .ToList();

            var skillBands = finishedSkillSessions
                .Where(s => s.BandScore.HasValue)
                .Select(s => s.BandScore!.Value)
                .ToList();

            double? skillAvg = skillBands.Count > 0 ? Math.Round(skillBands.Average(), 1) : null;
            double? skillBest = skillBands.Count > 0 ? Math.Round(skillBands.Max(), 1) : null;

            var row = new ClientDashboardSkillRowDto(
                skill,
                allSkillSessions.Count,
                finishedSkillSessions.Count,
                skillAvg,
                skillBest);
            skillRows.Add(row);

            var shortLabel = skill switch
            {
                "READING" => "READ",
                "LISTENING" => "LIST",
                "WRITING" => "WRIT",
                "SPEAKING" => "SPK",
                _ => skill
            };
            var fullLabel = skill switch
            {
                "READING" => "Đọc hiểu",
                "LISTENING" => "Nghe hiểu",
                "WRITING" => "Viết",
                "SPEAKING" => "Nói",
                _ => skill
            };
            radarData.Add(new ClientDashboardRadarPointDto(shortLabel, fullLabel, skillAvg ?? 0));

            if (skillAvg.HasValue)
            {
                if (weakest == null || skillAvg.Value < (weakest.AverageBand ?? double.MaxValue))
                {
                    weakest = row;
                }
            }
        }

        // Fluency Trend: up to 5 recent finished Speaking sessions with wordsPerMinute
        var speakingSessionIds = finishedSessions
            .Where(s => NormalizeSkillType(s.SkillType) == "SPEAKING")
            .OrderByDescending(s => s.EndedAt ?? s.StartedAt)
            .Take(5)
            .Select(s => s.Id)
            .ToList();

        var fluencyTrend = new List<ClientDashboardFluencyPointDto>();
        if (speakingSessionIds.Count > 0)
        {
            var speakingAnswers = await context.UserAnswers
                .AsNoTracking()
                .Where(a => speakingSessionIds.Contains(a.SessionId) && a.SpeakingQuestionId != null)
                .Select(a => new
                {
                    a.SessionId,
                    a.AnswerText,
                    DurationSeconds = a.UserAudioRecords.Select(r => (double?)r.DurationSeconds).FirstOrDefault()
                })
                .ToListAsync(cancellationToken);

            var answersBySession = speakingAnswers.GroupBy(a => a.SessionId).ToDictionary(g => g.Key, g => g.ToList());

            var speakingSessionsMap = finishedSessions
                .Where(s => speakingSessionIds.Contains(s.Id))
                .ToDictionary(s => s.Id);

            foreach (var sid in speakingSessionIds)
            {
                if (!speakingSessionsMap.TryGetValue(sid, out var s)) continue;
                if (!answersBySession.TryGetValue(sid, out var sAnswers) || sAnswers.Count == 0) continue;

                var wpmList = new List<double>();
                foreach (var ans in sAnswers)
                {
                    var wordCount = CountWords(ans.AnswerText);
                    if (wordCount > 0 && ans.DurationSeconds.HasValue && ans.DurationSeconds.Value > 0)
                    {
                        wpmList.Add(Math.Round((wordCount / ans.DurationSeconds.Value) * 60d, 1));
                    }
                }

                if (wpmList.Count > 0)
                {
                    var avgWpm = Math.Round(wpmList.Average(), 1);
                    var completedDate = s.EndedAt ?? s.StartedAt;
                    var shortDate = $"{completedDate.Day}/{completedDate.Month}";
                    fluencyTrend.Add(new ClientDashboardFluencyPointDto(shortDate, avgWpm, s.ExamTitle, completedDate));
                }
            }

            fluencyTrend = fluencyTrend.OrderBy(p => p.CompletedAt).ToList();
        }

        var recentActivities = userSessions
            .Take(5)
            .Select(s => new ClientDashboardRecentActivityDto(
                s.Id,
                s.ExamId,
                s.ExamTitle,
                NormalizeSkillType(s.SkillType),
                NormalizeSessionStatus(s.Status),
                s.BandScore.HasValue && s.BandScore.Value > 0 ? Math.Round(s.BandScore.Value, 1) : null,
                s.EndedAt ?? s.StartedAt))
            .ToList();

        return new ClientDashboardDto(
            activeSessionDto,
            summary,
            weakest?.Skill,
            skillRows,
            radarData,
            fluencyTrend,
            recentActivities);
    }

    public async Task<ClientProgressDto> GetClientProgressAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        var rawUser = await context.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new { u.DailyStreakCount, u.LongestStreakCount })
            .FirstOrDefaultAsync(cancellationToken);

        var userSessions = await context.ExamSessions
            .AsNoTracking()
            .Where(s => s.UserId == userId)
            .Select(s => new
            {
                s.Id,
                s.ExamId,
                ExamTitle = s.Exam.Title,
                SkillType = s.Exam.ExamSections
                    .OrderBy(section => section.OrderIndex)
                    .Select(section => section.SkillType)
                    .FirstOrDefault() ?? "PRACTICE",
                s.Status,
                s.StartedAt,
                s.EndedAt,
                BandScore = s.ScoringResults
                    .OrderByDescending(r => r.ScoredAt)
                    .Select(r => r.TotalBandScore)
                    .FirstOrDefault()
            })
            .OrderByDescending(s => s.StartedAt)
            .ToListAsync(cancellationToken);

        var finishedSessions = userSessions
            .Where(s => IsFinalizedStatus(s.Status))
            .ToList();

        var completedCount = finishedSessions.Count;

        var totalMinutes = finishedSessions.Sum(s =>
        {
            if (s.EndedAt == null) return 0;
            var duration = s.EndedAt.Value - s.StartedAt;
            return Math.Max(1, (int)Math.Ceiling(duration.TotalMinutes));
        });

        var scoredBands = finishedSessions
            .Where(s => s.BandScore.HasValue)
            .Select(s => s.BandScore!.Value)
            .ToList();

        double? averageBand = scoredBands.Count > 0 ? Math.Round(scoredBands.Average(), 1) : null;
        double? bestBand = scoredBands.Count > 0 ? Math.Round(scoredBands.Max(), 1) : null;

        var skillsDone = finishedSessions
            .Select(s => NormalizeSkillType(s.SkillType))
            .Where(s => !string.IsNullOrEmpty(s))
            .Distinct()
            .ToList();

        var stats = new ClientProgressStatsDto(
            totalMinutes,
            completedCount,
            bestBand,
            averageBand,
            skillsDone.Count,
            skillsDone.Count == 4,
            rawUser?.DailyStreakCount ?? 0,
            rawUser?.LongestStreakCount ?? 0);

        // ChartData: last 10-20 finished sessions sorted by CompletedAt ascending
        var chartData = finishedSessions
            .Select(s =>
            {
                var completedAt = s.EndedAt ?? s.StartedAt;
                var shortDate = $"{completedAt.Day}/{completedAt.Month}";
                return new ClientProgressChartPointDto(
                    s.Id,
                    shortDate,
                    s.BandScore ?? 0,
                    s.ExamTitle,
                    NormalizeSkillType(s.SkillType),
                    completedAt);
            })
            .OrderBy(p => p.CompletedAt)
            .TakeLast(20)
            .ToList();

        // Accuracy calculation for Reading & Listening:
        var objectiveSessionIds = finishedSessions
            .Where(s => NormalizeSkillType(s.SkillType) is "READING" or "LISTENING")
            .Select(s => s.Id)
            .ToList();

        Dictionary<string, (int Correct, int Total)> accuracyBySkill = new();
        if (objectiveSessionIds.Count > 0)
        {
            var objectiveAnswers = await context.UserAnswers
                .AsNoTracking()
                .Where(a => objectiveSessionIds.Contains(a.SessionId) && a.QuestionId != null)
                .Select(a => new
                {
                    a.SessionId,
                    Skill = a.Question!.Group.Passage != null ? "READING" : "LISTENING",
                    IsCorrect = a.ScoreEarned > 0
                })
                .ToListAsync(cancellationToken);

            foreach (var group in objectiveAnswers.GroupBy(a => a.Skill))
            {
                var correctCount = group.Count(a => a.IsCorrect);
                var totalCount = group.Count();
                accuracyBySkill[group.Key] = (correctCount, totalCount);
            }
        }

        string[] standardSkills = ["READING", "LISTENING", "WRITING", "SPEAKING"];
        var skillAnalytics = new List<ClientProgressSkillAnalyticsDto>();

        foreach (var skill in standardSkills)
        {
            var skillSessions = finishedSessions
                .Where(s => NormalizeSkillType(s.SkillType) == skill)
                .ToList();

            var bands = skillSessions
                .Where(s => s.BandScore.HasValue)
                .Select(s => s.BandScore!.Value)
                .ToList();

            double? avg = bands.Count > 0 ? Math.Round(bands.Average(), 1) : null;
            double? best = bands.Count > 0 ? Math.Round(bands.Max(), 1) : null;

            string? extraMetric = null;
            if ((skill == "READING" || skill == "LISTENING") && accuracyBySkill.TryGetValue(skill, out var acc) && acc.Total > 0)
            {
                var pct = (int)Math.Round((acc.Correct / (double)acc.Total) * 100);
                extraMetric = $"Độ chính xác: {pct}%";
            }

            var advice = GetAiAdvice(skill, avg);

            skillAnalytics.Add(new ClientProgressSkillAnalyticsDto(
                skill,
                skillSessions.Count,
                avg,
                best,
                extraMetric,
                advice));
        }

        // History: list of completed sessions ordered by CompletedAt descending
        var history = finishedSessions
            .Select(s =>
            {
                var completedAt = s.EndedAt ?? s.StartedAt;
                var duration = s.EndedAt.HasValue
                    ? Math.Max(1, (int)Math.Ceiling((s.EndedAt.Value - s.StartedAt).TotalMinutes))
                    : 0;

                return new ClientProgressHistoryItemDto(
                    s.Id,
                    s.ExamTitle,
                    NormalizeSkillType(s.SkillType),
                    s.BandScore,
                    duration,
                    completedAt);
            })
            .OrderByDescending(h => h.CompletedAt)
            .ToList();

        return new ClientProgressDto(
            stats,
            chartData,
            skillAnalytics,
            history);
    }

    private static string GetAiAdvice(string skill, double? avgBand)
    {
        if (!avgBand.HasValue) return "Hãy hoàn thành bài thi thử đầu tiên để nhận đánh giá chi tiết từ trợ lý học tập.";

        if (avgBand.Value < 5.0)
        {
            return "Tập trung học từ vựng học thuật cơ bản và luyện tập các chủ đề quen thuộc hàng ngày.";
        }
        if (avgBand.Value < 6.0)
        {
            if (skill is "READING" or "LISTENING") return "Luyện tập phương pháp Skimming và Scanning để tăng tốc độ tìm ý chính.";
            return "Học cách mở rộng câu phức và cấu trúc ngữ pháp mạch lạc cho bài nói/viết.";
        }
        if (avgBand.Value < 7.0)
        {
            if (skill is "READING" or "LISTENING") return "Tập trung luyện các câu hỏi khó như Headings và Multiple Choice.";
            return "Tập trung nâng cấp từ vựng chuyên sâu (collocations) và phân bổ lập luận chặt chẽ.";
        }
        return "Duy trì phong độ làm đề nâng cao, tối ưu hóa các lỗi diễn đạt nhỏ để hướng tới band điểm tối đa.";
    }
}
