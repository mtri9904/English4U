using EnglishExamApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260418103000_AddQuestionOptionImageUrl")]
    public partial class AddQuestionOptionImageUrl : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('question_options', 'imageUrl') IS NULL
                BEGIN
                    ALTER TABLE [question_options]
                    ADD [imageUrl] nvarchar(500) NULL;
                END
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('question_options', 'imageUrl') IS NOT NULL
                BEGIN
                    ALTER TABLE [question_options]
                    DROP COLUMN [imageUrl];
                END
                """);
        }
    }
}
