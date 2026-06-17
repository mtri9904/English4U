namespace EnglishExamApp.API.Authentication;

internal static class AuthEmailTemplates
{
    public static string BuildActivationOtpEmail(string otp) =>
        $@"
                <div style='font-family: Arial, sans-serif; padding: 20px; text-align: center; border: 1px solid #eee; border-radius: 10px;'>
                    <h2 style='color: #137dc5;'>Chao mung ban den voi English4U!</h2>
                    <p>Ma xac thuc cua ban la:</p>
                    <div style='font-size: 32px; font-weight: bold; letter-spacing: 10px; padding: 20px; background: #f4f4f4; border-radius: 5px; display: inline-block; margin: 10px 0;'>
                        {otp}
                    </div>
                    <p>Ma nay se het han sau 1 phut.</p>
                    <p>Vui long khong chia se ma nay voi bat ky ai.</p>
                </div>";

    public static string BuildActivationLinkEmail(string activationLink) =>
        $@"
        <div style='font-family: Arial, sans-serif; padding: 20px; text-align: center; border: 1px solid #eee; border-radius: 10px; max-width: 500px; margin: auto;'>
            <h2 style='color: #137dc5;'>Chào mừng bạn đến với English4U!</h2>
            <p>Bạn đã đăng ký tài khoản thành công. Vui lòng bấm vào nút bên dưới để xác nhận đăng nhập và kích hoạt tài khoản của mình:</p>
            <div style='margin: 30px 0;'>
                <a href='{activationLink}' style='padding: 14px 28px; background: #137dc5; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;'>Đăng nhập ngay</a>
            </div>
            <p style='color: #666; font-size: 13px;'>Liên kết này sẽ hết hạn sau 24 giờ.</p>
        </div>";

    public static string BuildResetPasswordEmail(string resetLink) =>
        $@"
            <div style='font-family: Arial, sans-serif; padding: 20px;'>
                <h2>Yeu cau dat lai mat khau</h2>
                <p>Ban da yeu cau dat lai mat khau. Click vao link ben duoi de tiep tuc:</p>
                <a href='{resetLink}' style='padding: 10px 20px; background: #137dc5; color: white; text-decoration: none; border-radius: 5px;'>Dat lai mat khau</a>
                <p>Link nay se het han sau 1 gio.</p>
            </div>";
}
