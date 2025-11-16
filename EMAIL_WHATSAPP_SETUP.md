# 📧 Email & WhatsApp Setup Guide

## Email Configuration (Required for sending files)

### Option 1: Gmail (Recommended for testing)

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate App Password:**
   - Go to: https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Name it "ECU Tuning Service"
   - Copy the 16-character password

3. **Set Environment Variables:**
```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_SECURE="false"
$env:SMTP_USER="your-email@gmail.com"
$env:SMTP_PASS="your-16-char-app-password"
```

### Option 2: Other Email Providers

**Outlook/Hotmail:**
```powershell
$env:SMTP_HOST="smtp-mail.outlook.com"
$env:SMTP_PORT="587"
$env:SMTP_SECURE="false"
$env:SMTP_USER="your-email@outlook.com"
$env:SMTP_PASS="your-password"
```

**Yahoo:**
```powershell
$env:SMTP_HOST="smtp.mail.yahoo.com"
$env:SMTP_PORT="587"
$env:SMTP_SECURE="false"
$env:SMTP_USER="your-email@yahoo.com"
$env:SMTP_PASS="your-app-password"
```

**Custom SMTP:**
```powershell
$env:SMTP_HOST="smtp.yourdomain.com"
$env:SMTP_PORT="587"
$env:SMTP_SECURE="false"
$env:SMTP_USER="noreply@yourdomain.com"
$env:SMTP_PASS="your-password"
```

## WhatsApp Configuration (Optional)

### Option 1: Twilio WhatsApp API (Automated)

1. **Sign up for Twilio:** https://www.twilio.com/try-twilio
2. **Get your credentials:**
   - Account SID
   - Auth Token
   - WhatsApp Sandbox Number (for testing)

3. **Set Environment Variables:**
```powershell
$env:TWILIO_ACCOUNT_SID="your-account-sid"
$env:TWILIO_AUTH_TOKEN="your-auth-token"
$env:TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"  # Twilio sandbox
```

4. **Join Twilio Sandbox:**
   - Send "join [your-code]" to the Twilio WhatsApp number
   - This is required for testing

### Option 2: Manual WhatsApp (No API needed)

If you don't configure Twilio, the system will generate a WhatsApp link that you can click to send the message manually. The link will appear in the server console when a file is ready.

## Complete Setup Example

Create a `.env` file or set environment variables:

```powershell
# Email Configuration
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_SECURE="false"
$env:SMTP_USER="your-email@gmail.com"
$env:SMTP_PASS="your-app-password"

# WhatsApp Configuration (Optional)
$env:TWILIO_ACCOUNT_SID="your-account-sid"
$env:TWILIO_AUTH_TOKEN="your-auth-token"
$env:TWILIO_WHATSAPP_NUMBER="whatsapp:+14155238886"

# Admin Password
$env:ADMIN_PASSWORD="your-secure-password"
```

## Testing

1. **Test Email:**
   - Create a test order
   - Upload a modified file in admin panel
   - Check customer's email inbox

2. **Test WhatsApp:**
   - If Twilio configured: Message will be sent automatically
   - If not configured: Check server console for WhatsApp link

## Troubleshooting

### Email Issues:
- **"Invalid login"**: Check your email and password
- **"Connection timeout"**: Check SMTP host and port
- **Gmail blocks**: Use App Password, not regular password
- **File too large**: Some email providers limit attachment size (usually 25MB)

### WhatsApp Issues:
- **Twilio not sending**: Check sandbox setup
- **Number format**: Must include country code (e.g., +1234567890)
- **Not configured**: System will generate manual link in console

## Production Recommendations

1. **Use dedicated email service** (SendGrid, Mailgun, AWS SES)
2. **Use Twilio WhatsApp Business API** for production
3. **Store credentials securely** (use environment variables, not code)
4. **Monitor email delivery** rates
5. **Set up email templates** for better branding

## Security Notes

- ⚠️ Never commit `.env` files to git
- ⚠️ Use strong passwords for email accounts
- ⚠️ Rotate credentials regularly
- ⚠️ Use App Passwords instead of main passwords
- ⚠️ Enable 2FA on all accounts

---

**Need help?** Check server console for detailed error messages.

