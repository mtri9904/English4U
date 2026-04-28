using EnglishExamApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260427103000_AddSpeakingEvidenceData")]
    /// <inheritdoc />
    public partial class AddSpeakingEvidenceData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('user_audio_records', 'audioQualityData') IS NULL
                BEGIN
                    ALTER TABLE [user_audio_records]
                    ADD [audioQualityData] nvarchar(max) NULL;
                END

                IF COL_LENGTH('user_audio_records', 'speechRatio') IS NULL
                BEGIN
                    ALTER TABLE [user_audio_records]
                    ADD [speechRatio] float NULL;
                END

                IF COL_LENGTH('speech_transcripts', 'wordTimestampsData') IS NULL
                BEGIN
                    ALTER TABLE [speech_transcripts]
                    ADD [wordTimestampsData] nvarchar(max) NULL;
                END

                IF COL_LENGTH('speech_transcripts', 'pauseStatsData') IS NULL
                BEGIN
                    ALTER TABLE [speech_transcripts]
                    ADD [pauseStatsData] nvarchar(max) NULL;
                END

                IF COL_LENGTH('ai_feedbacks', 'confidenceScore') IS NULL
                BEGIN
                    ALTER TABLE [ai_feedbacks]
                    ADD [confidenceScore] float NULL;
                END

                IF COL_LENGTH('ai_feedbacks', 'evidenceData') IS NULL
                BEGIN
                    ALTER TABLE [ai_feedbacks]
                    ADD [evidenceData] nvarchar(max) NULL;
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('ai_feedbacks', 'evidenceData') IS NOT NULL
                BEGIN
                    ALTER TABLE [ai_feedbacks] DROP COLUMN [evidenceData];
                END

                IF COL_LENGTH('ai_feedbacks', 'confidenceScore') IS NOT NULL
                BEGIN
                    ALTER TABLE [ai_feedbacks] DROP COLUMN [confidenceScore];
                END

                IF COL_LENGTH('speech_transcripts', 'pauseStatsData') IS NOT NULL
                BEGIN
                    ALTER TABLE [speech_transcripts] DROP COLUMN [pauseStatsData];
                END

                IF COL_LENGTH('speech_transcripts', 'wordTimestampsData') IS NOT NULL
                BEGIN
                    ALTER TABLE [speech_transcripts] DROP COLUMN [wordTimestampsData];
                END

                IF COL_LENGTH('user_audio_records', 'speechRatio') IS NOT NULL
                BEGIN
                    ALTER TABLE [user_audio_records] DROP COLUMN [speechRatio];
                END

                IF COL_LENGTH('user_audio_records', 'audioQualityData') IS NOT NULL
                BEGIN
                    ALTER TABLE [user_audio_records] DROP COLUMN [audioQualityData];
                END
                """);
        }
    }
}
