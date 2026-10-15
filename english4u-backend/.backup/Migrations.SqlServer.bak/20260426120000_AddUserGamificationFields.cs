using EnglishExamApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260426120000_AddUserGamificationFields")]
    /// <inheritdoc />
    public partial class AddUserGamificationFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('users', 'dailyStreakCount') IS NULL
                BEGIN
                    ALTER TABLE [users]
                    ADD [dailyStreakCount] int NOT NULL CONSTRAINT [DF_users_dailyStreakCount] DEFAULT (0);
                END

                IF COL_LENGTH('users', 'experiencePoints') IS NULL
                BEGIN
                    ALTER TABLE [users]
                    ADD [experiencePoints] int NOT NULL CONSTRAINT [DF_users_experiencePoints] DEFAULT (0);
                END

                IF COL_LENGTH('users', 'lastActivityAt') IS NULL
                BEGIN
                    ALTER TABLE [users]
                    ADD [lastActivityAt] datetime2 NULL;
                END

                IF COL_LENGTH('users', 'longestStreakCount') IS NULL
                BEGIN
                    ALTER TABLE [users]
                    ADD [longestStreakCount] int NOT NULL CONSTRAINT [DF_users_longestStreakCount] DEFAULT (0);
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('users', 'dailyStreakCount') IS NOT NULL
                BEGIN
                    ALTER TABLE [users] DROP CONSTRAINT IF EXISTS [DF_users_dailyStreakCount];
                    ALTER TABLE [users] DROP COLUMN [dailyStreakCount];
                END

                IF COL_LENGTH('users', 'experiencePoints') IS NOT NULL
                BEGIN
                    ALTER TABLE [users] DROP CONSTRAINT IF EXISTS [DF_users_experiencePoints];
                    ALTER TABLE [users] DROP COLUMN [experiencePoints];
                END

                IF COL_LENGTH('users', 'lastActivityAt') IS NOT NULL
                BEGIN
                    ALTER TABLE [users] DROP COLUMN [lastActivityAt];
                END

                IF COL_LENGTH('users', 'longestStreakCount') IS NOT NULL
                BEGIN
                    ALTER TABLE [users] DROP CONSTRAINT IF EXISTS [DF_users_longestStreakCount];
                    ALTER TABLE [users] DROP COLUMN [longestStreakCount];
                END
                """);
        }
    }
}
