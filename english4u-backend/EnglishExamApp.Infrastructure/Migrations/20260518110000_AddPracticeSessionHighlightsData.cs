using EnglishExamApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260518110000_AddPracticeSessionHighlightsData")]
    /// <inheritdoc />
    public partial class AddPracticeSessionHighlightsData : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('exam_sessions', 'highlightsData') IS NULL
                BEGIN
                    ALTER TABLE [exam_sessions]
                    ADD [highlightsData] nvarchar(max) NULL;
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('exam_sessions', 'highlightsData') IS NOT NULL
                BEGIN
                    ALTER TABLE [exam_sessions]
                    DROP COLUMN [highlightsData];
                END
                """);
        }
    }
}
