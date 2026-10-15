using EnglishExamApp.Infrastructure.Data;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace EnglishExamApp.Infrastructure.Migrations
{
    [DbContext(typeof(ApplicationDbContext))]
    [Migration("20260425121500_AddSpeakingQuestionAnswerLink")]
    /// <inheritdoc />
    public partial class AddSpeakingQuestionAnswerLink : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF COL_LENGTH('user_answers', 'speakingQuestionId') IS NULL
                BEGIN
                    ALTER TABLE [user_answers]
                    ADD [speakingQuestionId] uniqueidentifier NULL;
                END

                IF NOT EXISTS (
                    SELECT 1
                    FROM sys.indexes
                    WHERE name = 'IX_user_answers_speakingQuestionId'
                      AND object_id = OBJECT_ID('user_answers')
                )
                BEGIN
                    CREATE INDEX [IX_user_answers_speakingQuestionId]
                    ON [user_answers] ([speakingQuestionId]);
                END

                IF NOT EXISTS (
                    SELECT 1
                    FROM sys.foreign_keys
                    WHERE name = 'FK_user_answers_speaking_questions_speakingQuestionId'
                )
                BEGIN
                    ALTER TABLE [user_answers]
                    ADD CONSTRAINT [FK_user_answers_speaking_questions_speakingQuestionId]
                    FOREIGN KEY ([speakingQuestionId]) REFERENCES [speaking_questions]([id]);
                END
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                IF EXISTS (
                    SELECT 1
                    FROM sys.foreign_keys
                    WHERE name = 'FK_user_answers_speaking_questions_speakingQuestionId'
                )
                BEGIN
                    ALTER TABLE [user_answers]
                    DROP CONSTRAINT [FK_user_answers_speaking_questions_speakingQuestionId];
                END

                IF EXISTS (
                    SELECT 1
                    FROM sys.indexes
                    WHERE name = 'IX_user_answers_speakingQuestionId'
                      AND object_id = OBJECT_ID('user_answers')
                )
                BEGIN
                    DROP INDEX [IX_user_answers_speakingQuestionId] ON [user_answers];
                END

                IF COL_LENGTH('user_answers', 'speakingQuestionId') IS NOT NULL
                BEGIN
                    ALTER TABLE [user_answers]
                    DROP COLUMN [speakingQuestionId];
                END
                """);
        }
    }
}
