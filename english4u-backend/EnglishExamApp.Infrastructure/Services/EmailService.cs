using System.Net;
using System.Net.Mail;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace EnglishExamApp.Infrastructure.Services;

public class EmailService(
    IConfiguration configuration,
    ILogger<EmailService> logger) : IEmailService
{
    public async Task SendEmailAsync(string toEmail, string subject, string body)
    {
        var smtpServer = configuration["Email:SmtpServer"] ?? "smtp.gmail.com";
        var smtpPort = int.Parse(configuration["Email:SmtpPort"] ?? "587");
        var fromEmail = configuration["Email:FromEmail"] ?? string.Empty;
        var appPassword = configuration["Email:AppPassword"]?.Replace(" ", "");

        if (string.IsNullOrWhiteSpace(fromEmail) || string.IsNullOrWhiteSpace(appPassword))
        {
            logger.LogInformation("Email delivery skipped because SMTP credentials are not configured. To: {ToEmail}, Subject: {Subject}", toEmail, subject);
            return;
        }

        try 
        {
            using var client = new SmtpClient(smtpServer, smtpPort);
            client.EnableSsl = true;
            client.Credentials = new NetworkCredential(fromEmail, appPassword);

            using var mailMessage = new MailMessage
            {
                From = new MailAddress(fromEmail, "English4U"),
                Subject = subject,
                Body = body,
                IsBodyHtml = true
            };
            
            mailMessage.To.Clear();
            mailMessage.To.Add(toEmail.Trim());

            logger.LogInformation("Sending email to {ToEmail}.", toEmail.Trim());
            await client.SendMailAsync(mailMessage);
            logger.LogInformation("Email sent to {ToEmail}.", toEmail.Trim());
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to send email to {ToEmail}.", toEmail);
            throw;
        }
    }
}
