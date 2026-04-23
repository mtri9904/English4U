using System.Net;
using System.Net.Mail;
using EnglishExamApp.Application.Interfaces;
using Microsoft.Extensions.Configuration;

namespace EnglishExamApp.Infrastructure.Services;

public class EmailService(IConfiguration configuration) : IEmailService
{
    public async Task SendEmailAsync(string toEmail, string subject, string body)
    {
        var smtpServer = configuration["Email:SmtpServer"] ?? "smtp.gmail.com";
        var smtpPort = int.Parse(configuration["Email:SmtpPort"] ?? "587");
        var fromEmail = configuration["Email:FromEmail"] ?? "minhtritamm@gmail.com";
        var appPassword = configuration["Email:AppPassword"]?.Replace(" ", ""); // Remove spaces

        if (string.IsNullOrEmpty(appPassword))
        {
            Console.WriteLine($"[EMAIL MOCK] To: {toEmail}, Subject: {subject}");
            Console.WriteLine($"Body: {body}");
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

            Console.WriteLine($"[EMAIL SENDING] Attempting to send from {fromEmail} to {toEmail.Trim()}...");
            await client.SendMailAsync(mailMessage);
            Console.WriteLine($"[EMAIL SUCCESS] Sent activation to: {toEmail.Trim()}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[EMAIL ERROR] Failed to send email to {toEmail}: {ex.Message}");
            throw; // Reraise to let AuthController know
        }
    }
}
