// Email notifications via the Resend HTTP API (no SDK). All user-controlled
// fields are HTML-escaped, and the customer email links to a presigned
// download instead of attaching the file (10MB Resend attachment cap).

import { SERVICE_PRICES, escapeHtml, sanitizeSubject } from './util.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const CONTACT_PHONE = '+213663334559';

const padId = (id) => String(id).padStart(3, '0');

async function sendResendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) {
    console.warn('Email skipped: RESEND_API_KEY secret is not configured');
    return;
  }
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM || 'AZ Performance <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend API error ${response.status}: ${await response.text()}`);
  }
}

export function adminNotificationHtml(order, adminUrl) {
  const orderId = escapeHtml(padId(order.id));
  const customer = escapeHtml(order.customer_name || 'Anonymous');
  const email = escapeHtml(order.customer_email || 'Not provided');
  const phone = escapeHtml(order.customer_phone || 'Not provided');
  const vehicle = escapeHtml(order.vehicle_info || 'Not specified');
  const ecu = order.ecu_reference
    ? `<p style="color: #fff;"><strong>ECU Reference:</strong> ${escapeHtml(order.ecu_reference)}</p>`
    : '';
  const service = escapeHtml(order.service || 'Not specified');
  const price = escapeHtml(SERVICE_PRICES[order.service] || 'On request');
  const description = order.custom_service_description
    ? `<p style="color: #fff;"><strong>Custom Request:</strong> ${escapeHtml(order.custom_service_description)}</p>`
    : '';
  const original = escapeHtml(order.original_file_name || 'Unknown');
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 20px; border-radius: 10px;">
        <h2 style="color: #00FF00;">🚀 New Order Received!</h2>
        <p>A new ECU tuning order has been submitted.</p>
        <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #FFD700; margin-top: 0;">📋 Order Details:</h3>
          <p style="color: #fff;"><strong>Order ID:</strong> #${orderId}</p>
          <p style="color: #fff;"><strong>Customer:</strong> ${customer}</p>
          <p style="color: #fff;"><strong>Email:</strong> ${email}</p>
          <p style="color: #fff;"><strong>Phone:</strong> ${phone}</p>
          <p style="color: #fff;"><strong>Vehicle:</strong> ${vehicle}</p>
          ${ecu}
          <p style="color: #fff;"><strong>Service:</strong> ${service}</p>
          <p style="color: #fff;"><strong>Price:</strong> ${price}</p>
          <p>Prices in EUR</p>
          ${description}
          <p style="color: #fff;"><strong>Original File:</strong> ${original}</p>
        </div>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${escapeHtml(adminUrl)}" style="display: inline-block; background: #FFD700; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            🔐 Go to Admin Panel
          </a>
        </div>
        <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">
          AZ Performance - Admin Notification<br>
          ${CONTACT_PHONE}
        </p>
      </div>
    `;
}

export function customerNotificationHtml(order, downloadUrl) {
  const orderId = escapeHtml(padId(order.id));
  const customer = escapeHtml(order.customer_name || 'Customer');
  const service = escapeHtml(order.service || 'ECU Tuning Service');
  const price = escapeHtml(SERVICE_PRICES[order.service] || 'On request');
  const vehicle = escapeHtml(order.vehicle_info || 'Vehicle');
  const ecu = order.ecu_reference
    ? `<p style="color: #fff;"><strong>ECU Reference:</strong> ${escapeHtml(order.ecu_reference)}</p>`
    : '';
  const original = escapeHtml(order.original_file_name || 'original_file.bin');
  const modified = escapeHtml(order.modified_file_name || 'modified_file.bin');
  return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 20px; border-radius: 10px;">
        <h2 style="color: #FFD700;">🎉 Your Modified ECU File is Ready!</h2>
        <p>Hello ${customer},</p>
        <p>We're pleased to inform you that your ECU file modification has been completed.</p>
        <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0; color: #fff;">
          <h3 style="color: #FFD700; margin-top: 0;">📋 Order Details:</h3>
          <p style="color: #fff;"><strong>Order ID:</strong> #${orderId}</p>
          <p style="color: #fff;"><strong>Service:</strong> ${service}</p>
          <p style="color: #fff;"><strong>Price:</strong> ${price}</p>
          <p>Prices in EUR</p>
          <p style="color: #fff;"><strong>Vehicle:</strong> ${vehicle}</p>
          ${ecu}
          <p style="color: #fff;"><strong>Original File:</strong> ${original}</p>
          <p style="color: #fff;"><strong>Modified File:</strong> ${modified}</p>
        </div>
        <p><strong style="color: #FFD700;">📥 Download your modified file here:</strong></p>
        <p style="text-align: center; margin: 25px 0;">
          <a href="${escapeHtml(downloadUrl)}" style="display: inline-block; background: #FFD700; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            ⬇️ Download Modified File
          </a>
        </p>
        <p>Flash the file to your ECU. This link is valid for 24 hours — if it has expired, please reply to this email and we will send a new one.</p>
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
          If you have any questions, please contact us at ${CONTACT_PHONE}.<br>
          <strong style="color: #FFD700;">AZ Performance</strong> - ${CONTACT_PHONE}
        </p>
      </div>
    `;
}

// Fire-and-forget admin notification for new orders (never blocks the response).
export async function notifyAdminNewOrder(env, order, adminUrl) {
  try {
    if (!env.ADMIN_EMAIL) {
      console.warn('Admin notification skipped: ADMIN_EMAIL var is not configured');
      return;
    }
    await sendResendEmail(env, {
      to: env.ADMIN_EMAIL,
      subject: sanitizeSubject(
        `🚀 New Order #${padId(order.id)} - ${order.customer_name || 'Anonymous'} - ${order.service || 'ECU Service'}`,
      ),
      html: adminNotificationHtml(order, adminUrl),
    });
  } catch (error) {
    console.error('Admin notification failed:', error.message);
  }
}

// Fire-and-forget "file ready" notification to the customer with a presigned
// download link (link instead of attachment — see audit BUG-005/BUG-014).
export async function notifyCustomerFileReady(env, order, downloadUrl) {
  try {
    if (!order.customer_email) {
      console.warn('Customer notification skipped: no customer_email on order', order.id);
      return;
    }
    await sendResendEmail(env, {
      to: order.customer_email,
      subject: sanitizeSubject(`✅ Your Modified ECU File is Ready - Order #${padId(order.id)}`),
      html: customerNotificationHtml(order, downloadUrl),
    });
  } catch (error) {
    console.error('Customer notification failed:', error.message);
  }
}
