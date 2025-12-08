const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { Resend } = require('resend');
const db = require('./db');

const app = express();
// Use API_PORT (4000) - DO NOT use PORT env var as that's for nginx (8080) on Railway
const PORT = process.env.API_PORT || 4000;

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['*'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    console.warn(`🚫 Blocked CORS request from origin: ${origin}`);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.options('*', cors());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Data directory - use DATA_DIR env var for Railway Volume, otherwise use local directory
// Railway Volume: DATA_DIR=/app/data (persists across deploys)
// Local/Ephemeral: defaults to current directory
const dataDir = process.env.DATA_DIR || __dirname;
const uploadsDir = path.join(dataDir, 'uploads');
const modifiedDir = path.join(dataDir, 'uploads', 'modified');
const databasePath = path.join(dataDir, 'database.sqlite');

// Log storage configuration
console.log('📁 Storage configuration:');
console.log('   - Data directory:', dataDir);
console.log('   - Uploads directory:', uploadsDir);
console.log('   - Modified files:', modifiedDir);
console.log('   - Database:', databasePath);
console.log('   - Persistent:', process.env.DATA_DIR ? '✅ Railway Volume' : '⚠️ Ephemeral (will reset on deploy)');

// Ensure uploads directory exists
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(modifiedDir);

// Firebase adapter helpers (optional) - only if Firebase is properly configured
let firebaseUploadFn = null;
const useFirebaseEnv = process.env.USE_FIREBASE === 'true' || process.env.USE_FIREBASE === '1';
const hasFirebaseCredentials = !!(process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.FIREBASE_STORAGE_BUCKET);

if (useFirebaseEnv && hasFirebaseCredentials) {
  try {
    const firestoreAdapter = require('./db/firestore-adapter');
    if (firestoreAdapter && firestoreAdapter.uploadLocalFileToStorage) {
      firebaseUploadFn = firestoreAdapter.uploadLocalFileToStorage;
      console.log('☁️ Firebase Storage: ✅ Enabled');
    }
  } catch (e) {
    console.warn('⚠️ Firebase upload helper not available:', e.message);
  }
} else {
  console.log('☁️ Firebase Storage: ❌ Disabled (using local storage)');
  if (useFirebaseEnv && !hasFirebaseCredentials) {
    console.warn('   ⚠️ USE_FIREBASE is set but credentials are missing');
  }
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedExtensions = ['.bin', '.hex', '.ori', '.winols', '.dam'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: .bin, .hex, .ori, .winols, .dam'));
    }
  }
});

// Admin password (set via environment variable or use default)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // CHANGE THIS IN PRODUCTION!

// Admin email for notifications (receives alerts for new orders)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
// Admin panel URL (for links in notification emails)
const ADMIN_URL = process.env.ADMIN_URL || (process.env.RAILWAY_PUBLIC_DOMAIN 
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}/admin`
  : 'http://localhost:3001');

// Log admin config at startup
console.log('👤 Admin configuration:');
console.log('   - Admin Email:', ADMIN_EMAIL ? `${ADMIN_EMAIL.substring(0, 5)}***` : '❌ NOT SET');
console.log('   - Admin URL:', ADMIN_URL);

// Email configuration
// Priority: Resend API (recommended for Railway) > SMTP (for local dev)
const resendApiKey = process.env.RESEND_API_KEY || '';
const emailFrom = process.env.EMAIL_FROM || 'ECU Tuning Pro <onboarding@resend.dev>'; // Use your verified domain

// Legacy SMTP config (fallback for local development)
const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || '';
const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || process.env.GMAIL_PASS || '';

// Initialize Resend client if API key is available
const resend = resendApiKey ? new Resend(resendApiKey) : null;

// Fallback SMTP transporter for local development
let emailTransporter = null;
if (!resend && emailUser && emailPass) {
  const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  emailTransporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: emailUser, pass: emailPass },
    tls: { rejectUnauthorized: false }
  });
}

// Log email configuration status at startup
console.log('📧 Email configuration:');
if (resend) {
  console.log('   - Provider: Resend (HTTP API) ✅');
  console.log('   - API Key:', resendApiKey ? `${resendApiKey.substring(0, 8)}...` : '❌ NOT SET');
  console.log('   - From:', emailFrom);
} else if (emailTransporter) {
  console.log('   - Provider: SMTP (Nodemailer)');
  console.log('   - User:', emailUser ? `${emailUser.substring(0, 3)}***@***` : '❌ NOT SET');
} else {
  console.log('   - Provider: ❌ NOT CONFIGURED');
  console.log('   - Set RESEND_API_KEY for Railway or SMTP_USER/SMTP_PASS for local');
}

// Twilio configuration for WhatsApp (set via environment variables)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
  : null;
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886'; // Twilio sandbox number

// Simple session storage (in production, use proper session management)
const adminSessions = new Set();

// Admin authentication middleware
function requireAdmin(req, res, next) {
  const sessionId = req.headers['x-admin-session'] || req.query.session;
  
  if (adminSessions.has(sessionId)) {
    return next();
  }
  
  res.status(401).json({ error: 'Unauthorized. Please login first.' });
}

// Routes

// Health check / root
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'ECU Tuning API',
    version: '1.0.0',
    docs: 'See README for client/admin hosts.'
  });
});

// Admin login API
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === ADMIN_PASSWORD) {
    const sessionId = uuidv4();
    adminSessions.add(sessionId);
    res.json({ success: true, sessionId });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Admin logout API
app.post('/api/admin/logout', (req, res) => {
  const sessionId = req.headers['x-admin-session'];
  if (sessionId) {
    adminSessions.delete(sessionId);
  }
  res.json({ success: true });
});

// API: Submit order
app.post('/api/orders', upload.single('ecuFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { service, vehicleInfo, customerName, customerEmail, customerPhone, customServiceDescription } = req.body;

    if (!service || !vehicleInfo) {
      return res.status(400).json({ error: 'Service and vehicle info are required' });
    }

    // Validate custom service description if Custom is selected
    if (service === 'Custom' && !customServiceDescription) {
      return res.status(400).json({ error: 'Custom service description is required for custom modifications' });
    }

    // If Firebase is enabled, upload file to storage and set filePath to storage path + downloadURL
    let filePathToStore = req.file.path;
    let fileDownloadURL = null;
    if (firebaseUploadFn) {
      try {
        const dest = `orders/originals/${req.file.filename}`;
        const uploaded = await firebaseUploadFn(req.file.path, dest);
        if (uploaded && uploaded.path) {
          filePathToStore = uploaded.path;
          fileDownloadURL = uploaded.downloadURL;
          // Optionally remove local file after upload
          try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error('Firebase upload failed, falling back to local storage:', e);
      }
    }

    const order = await db.createOrder({
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      filePath: filePathToStore,
      fileDownloadURL: fileDownloadURL,
      service: service,
      customServiceDescription: customServiceDescription || null,
      vehicleInfo: vehicleInfo,
      customerName: customerName || 'Anonymous',
      customerEmail: customerEmail || '',
      customerPhone: customerPhone || null,
      status: 'pending'
    });

    // Send admin notification (fire-and-forget, don't block response)
    sendAdminNotification({
      id: order.id,
      customer_name: customerName || 'Anonymous',
      customer_email: customerEmail || '',
      customer_phone: customerPhone || null,
      vehicle_info: vehicleInfo,
      service: service,
      custom_service_description: customServiceDescription || null,
      original_file_name: req.file.originalname
    }).catch(err => console.error('Admin notification error:', err.message));

    res.json({ success: true, orderId: order.id, message: 'File uploaded successfully' });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// API: Get all orders (admin only)
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await db.getAllOrders();
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// API: Get single order (admin only)
app.get('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// API: Update order status (admin only)
app.put('/api/orders/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await db.updateOrderStatus(req.params.id, status);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Failed to update order status' });
  }
});

// API: Upload modified file (admin only)
app.post('/api/orders/:id/modified', requireAdmin, upload.single('modifiedFile'), async (req, res) => {
  try {
    console.log('📤 Upload modified file request for order:', req.params.id);
    
    if (!req.file) {
      console.error('❌ No file in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('📁 File received:', req.file.originalname, 'Size:', req.file.size);
    console.log('📁 Temp path:', req.file.path);

    // Ensure modified directory exists
    await fs.ensureDir(modifiedDir);
    console.log('📁 Modified directory ensured:', modifiedDir);

    // Move file to modified directory or upload to Firebase
    let modifiedFilePath = path.join(modifiedDir, req.file.filename);
    let modifiedFileDownloadURL = null;
    
    if (firebaseUploadFn) {
      // upload and remove local file
      try {
        const dest = `orders/${req.params.id}/modified/${req.file.filename}`;
        const uploaded = await firebaseUploadFn(req.file.path, dest);
        if (uploaded && uploaded.path) {
          modifiedFilePath = uploaded.path;
          modifiedFileDownloadURL = uploaded.downloadURL;
          try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
        }
      } catch (e) {
        console.error('Firebase upload failed for modified file, falling back to local move:', e);
        await fs.move(req.file.path, modifiedFilePath, { overwrite: true });
      }
    } else {
      console.log('📁 Moving file to:', modifiedFilePath);
      await fs.move(req.file.path, modifiedFilePath, { overwrite: true });
      console.log('✅ File moved successfully');
    }

    console.log('💾 Updating database...');
    await db.updateOrderModifiedFile(req.params.id, {
      modifiedFileName: req.file.originalname,
      modifiedStoredFileName: req.file.filename,
      modifiedFilePath: modifiedFilePath,
      modifiedFileDownloadURL: modifiedFileDownloadURL
    });

    await db.updateOrderStatus(req.params.id, 'completed');
    console.log('✅ Database updated');

    // Get order details for notifications
    const order = await db.getOrder(req.params.id);
    
    // Send email and WhatsApp notifications (non-blocking - don't fail the request)
    if (order) {
      console.log('📧 Preparing to send modified file notification...');
      
      // Fire and forget - don't wait for email
      sendFileReadyNotifications(order, modifiedFilePath)
        .then(() => console.log('✅ Notifications sent successfully'))
        .catch(err => console.error('⚠️ Notification error (non-blocking):', err.message));
    }

    // Return success immediately - don't wait for email
    console.log('✅ Upload complete, returning success');
    res.json({ success: true, message: 'Modified file uploaded successfully' });
  } catch (error) {
    console.error('❌ Error uploading modified file:', error);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({ error: 'Failed to upload modified file: ' + error.message });
  }
});

// API: Download original file (admin only)
app.get('/api/orders/:id/download/original', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // If file is stored in Firebase, redirect to download URL; otherwise serve local file
    if (order.file_download_url) {
      return res.redirect(order.file_download_url);
    }
    const filePath = order.file_path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    res.download(filePath, order.original_file_name);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// API: Download modified file (admin only)
app.get('/api/orders/:id/download/modified', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (!order.modified_file_path && !order.modified_file_download_url) {
      return res.status(404).json({ error: 'Modified file not available yet' });
    }

    if (order.modified_file_download_url) {
      return res.redirect(order.modified_file_download_url);
    }

    const filePath = order.modified_file_path;
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath, order.modified_file_name || 'modified_' + order.original_file_name);
  } catch (error) {
    console.error('Error downloading file:', error);
    res.status(500).json({ error: 'Failed to download file' });
  }
});

// API: Delete order (admin only)
app.delete('/api/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await db.getOrder(req.params.id);
    if (order) {
      // Delete files
      if (order.file_path && fs.existsSync(order.file_path)) {
        fs.unlinkSync(order.file_path);
      }
      if (order.modified_file_path && fs.existsSync(order.modified_file_path)) {
        fs.unlinkSync(order.modified_file_path);
      }
    }
    await db.deleteOrder(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// Function to send file ready notifications
async function sendFileReadyNotifications(order, filePath) {
  console.log('📤 Sending notifications for order:', order.id);
  console.log('📧 Customer email:', order.customer_email);
  console.log('📱 Customer phone:', order.customer_phone);
  console.log('📁 File path:', filePath);
  
  try {
    // Send email notification with file attachment
    if (order.customer_email) {
      await sendEmailNotification(order, filePath);
    } else {
      console.log('⚠️ No customer email provided, skipping email notification');
    }

    // Send WhatsApp notification
    if (order.customer_phone) {
      await sendWhatsAppNotification(order);
    } else {
      console.log('⚠️ No customer phone provided, skipping WhatsApp notification');
    }
    
    console.log('✅ Notifications completed for order:', order.id);
  } catch (error) {
    console.error('❌ Error sending notifications:', error.message);
    throw error;
  }
}

// Function to send email with file attachment
async function sendEmailNotification(order, filePath) {
  try {
    console.log('📧 ========== EMAIL NOTIFICATION START ==========');
    console.log('   - Order ID:', order?.id);
    console.log('   - Customer Email:', order?.customer_email);
    console.log('   - File Path:', filePath);
    console.log('   - Using:', resend ? 'Resend API' : 'SMTP');
    
    if (!resend && !emailTransporter) {
      console.log('⚠️ Email not configured. Set RESEND_API_KEY or SMTP credentials.');
      return;
    }
    
    if (!order?.customer_email) {
      console.log('⚠️ No customer email in order, skipping email notification');
      return;
    }

    const modifiedFileName = order.modified_file_name || order.modified_stored_file_name || 'modified_file.bin';
    const serviceName = order.service || 'ECU Tuning Service';
    const vehicleInfo = order.vehicle_info || 'Vehicle';
    const originalFileName = order.original_file_name || 'original_file.bin';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 20px; border-radius: 10px;">
        <h2 style="color: #FFD700;">🎉 Your Modified ECU File is Ready!</h2>
        <p>Hello ${order.customer_name || 'Customer'},</p>
        <p>We're pleased to inform you that your ECU file modification has been completed.</p>
        
        <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0; color: #fff;">
          <h3 style="color: #FFD700; margin-top: 0;">📋 Order Details:</h3>
          <p style="color: #fff;"><strong>Order ID:</strong> #${String(order.id).padStart(3, '0')}</p>
          <p style="color: #fff;"><strong>Service:</strong> ${serviceName}</p>
          <p style="color: #fff;"><strong>Vehicle:</strong> ${vehicleInfo}</p>
          <p style="color: #fff;"><strong>Original File:</strong> ${originalFileName}</p>
          <p style="color: #fff;"><strong>Modified File:</strong> ${modifiedFileName}</p>
        </div>

        <p><strong style="color: #FFD700;">📥 Your modified file is attached!</strong></p>
        <p>Download the attached file and flash it to your ECU. If you have any issues with the attachment, please reply to this email.</p>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px;">
          If you have any questions, please contact us.<br>
          <strong style="color: #FFD700;">ECU Tuning Pro</strong>
        </p>
      </div>
    `;

    console.log('📧 Sending email to:', order.customer_email);

    // Use Resend API (preferred for Railway)
    if (resend) {
      const emailOptions = {
        from: emailFrom,
        to: [order.customer_email],
        subject: `✅ Your Modified ECU File is Ready - Order #${String(order.id).padStart(3, '0')}`,
        html: emailHtml
      };

      // Add attachment if file exists
      if (filePath && await fs.pathExists(filePath)) {
        const fileContent = await fs.readFile(filePath);
        emailOptions.attachments = [{
          filename: modifiedFileName,
          content: fileContent
        }];
        console.log('📎 Attaching file:', modifiedFileName, '- Size:', fileContent.length, 'bytes');
      }

      const { data, error } = await resend.emails.send(emailOptions);

      if (error) {
        console.error('❌ Resend error:', error);
        throw new Error(error.message);
      }

      console.log('✅ Email sent via Resend with attachment:', data?.id);
    } 
    // Fallback to SMTP (for local development)
    else if (emailTransporter) {
      const mailOptions = {
        from: `"ECU Tuning Pro" <${emailUser}>`,
        to: order.customer_email,
        subject: `✅ Your Modified ECU File is Ready - Order #${String(order.id).padStart(3, '0')}`,
        html: emailHtml
      };

      // Add attachment if file exists
      if (filePath && await fs.pathExists(filePath)) {
        mailOptions.attachments = [{
          filename: modifiedFileName,
          path: filePath
        }];
      }

      const info = await emailTransporter.sendMail(mailOptions);
      console.log('✅ Email sent via SMTP:', info.messageId);
    }

    console.log('📧 ========== EMAIL NOTIFICATION END ==========');
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    throw error;
  }
}

// Function to send admin notification for new orders
async function sendAdminNotification(order) {
  try {
    console.log('📧 ========== ADMIN NOTIFICATION START ==========');
    console.log('   - Order ID:', order?.id);
    console.log('   - Admin Email:', ADMIN_EMAIL || '(not set)');
    
    if (!ADMIN_EMAIL) {
      console.log('⚠️ ADMIN_EMAIL not configured. Set ADMIN_EMAIL environment variable to receive new order notifications.');
      return;
    }
    
    if (!resend && !emailTransporter) {
      console.log('⚠️ Email not configured. Cannot send admin notification.');
      return;
    }

    const orderId = String(order.id).padStart(3, '0');
    const adminLink = `${ADMIN_URL}`;
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a1a; color: #fff; padding: 20px; border-radius: 10px;">
        <h2 style="color: #00FF00;">🚀 New Order Received!</h2>
        <p>A new ECU tuning order has been submitted.</p>
        
        <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #FFD700; margin-top: 0;">📋 Order Details:</h3>
          <p style="color: #fff;"><strong>Order ID:</strong> #${orderId}</p>
          <p style="color: #fff;"><strong>Customer:</strong> ${order.customer_name || 'Anonymous'}</p>
          <p style="color: #fff;"><strong>Email:</strong> ${order.customer_email || 'Not provided'}</p>
          <p style="color: #fff;"><strong>Phone:</strong> ${order.customer_phone || 'Not provided'}</p>
          <p style="color: #fff;"><strong>Vehicle:</strong> ${order.vehicle_info || 'Not specified'}</p>
          <p style="color: #fff;"><strong>Service:</strong> ${order.service || 'Not specified'}</p>
          ${order.custom_service_description ? `<p style="color: #fff;"><strong>Custom Request:</strong> ${order.custom_service_description}</p>` : ''}
          <p style="color: #fff;"><strong>Original File:</strong> ${order.original_file_name || 'Unknown'}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${adminLink}" style="display: inline-block; background: #FFD700; color: #000; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px;">
            🔐 Go to Admin Panel
          </a>
        </div>
        
        <p style="color: #888; font-size: 12px; margin-top: 30px; text-align: center;">
          ECU Tuning Pro - Admin Notification
        </p>
      </div>
    `;

    console.log('📧 Sending admin notification to:', ADMIN_EMAIL);

    if (resend) {
      const { data, error } = await resend.emails.send({
        from: emailFrom,
        to: [ADMIN_EMAIL],
        subject: `🚀 New Order #${orderId} - ${order.customer_name || 'Anonymous'} - ${order.service || 'ECU Service'}`,
        html: emailHtml
      });

      if (error) {
        console.error('❌ Resend error (admin):', error);
        throw new Error(error.message);
      }

      console.log('✅ Admin notification sent via Resend:', data?.id);
    } else if (emailTransporter) {
      const info = await emailTransporter.sendMail({
        from: `"ECU Tuning Pro" <${emailUser}>`,
        to: ADMIN_EMAIL,
        subject: `🚀 New Order #${orderId} - ${order.customer_name || 'Anonymous'} - ${order.service || 'ECU Service'}`,
        html: emailHtml
      });

      console.log('✅ Admin notification sent via SMTP:', info.messageId);
    }

    console.log('📧 ========== ADMIN NOTIFICATION END ==========');
  } catch (error) {
    console.error('❌ Error sending admin notification:', error.message);
    // Don't throw - admin notification failure shouldn't break order creation
  }
}

// Function to send WhatsApp notification
async function sendWhatsAppNotification(order) {
  try {
    if (!twilioClient) {
      console.log('⚠️ WhatsApp not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
      // Fallback: Create WhatsApp link (manual sending)
      const whatsappLink = `https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
        `✅ Your ECU file modification is ready!\n\n` +
        `Order #${String(order.id).padStart(3, '0')}\n` +
        `Service: ${order.service}\n` +
        `Vehicle: ${order.vehicle_info}\n\n` +
        `Your modified file has been sent to your email: ${order.customer_email}\n\n` +
        `Thank you for using ECU Tuning Pro!`
      )}`;
      console.log(`📱 WhatsApp link: ${whatsappLink}`);
      return;
    }

    const message = await twilioClient.messages.create({
      from: twilioWhatsAppNumber,
      to: `whatsapp:${order.customer_phone}`,
      body: `✅ Your ECU file modification is ready!\n\n` +
            `Order #${String(order.id).padStart(3, '0')}\n` +
            `Service: ${order.service}\n` +
            `Vehicle: ${order.vehicle_info}\n\n` +
            `Your modified file has been sent to your email: ${order.customer_email}\n\n` +
            `Thank you for using ECU Tuning Pro!`
    });

    console.log('✅ WhatsApp message sent successfully:', message.sid);
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    // Fallback: Create WhatsApp link
    const whatsappLink = `https://wa.me/${order.customer_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
      `✅ Your ECU file modification is ready! Order #${String(order.id).padStart(3, '0')}. Check your email for the file.`
    )}`;
    console.log(`📱 WhatsApp link (fallback): ${whatsappLink}`);
  }
}

// Start server
async function startServer() {
  try {
    // Initialize database first
    await db.init();
    
    app.listen(PORT, () => {
      const isCloud = process.env.RAILWAY_ENVIRONMENT || process.env.RENDER;
      const url = isCloud ? process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RENDER_EXTERNAL_URL : `http://localhost:${PORT}`;
      
      console.log(`🚀 Server running on ${url}`);
      console.log(`📁 Uploads directory: ${uploadsDir}`);
      console.log(`🌐 Environment: ${isCloud ? 'Cloud' : 'Local'}`);
      
      // Email status
      if (resend) {
        console.log('✅ Email configured via Resend API (ready to send)');
      } else if (emailTransporter) {
        console.log('✅ Email configured via SMTP - testing connection...');
        emailTransporter.verify()
          .then(() => console.log('✅ SMTP connection verified!'))
          .catch(err => console.log('⚠️ SMTP connection test failed:', err.message));
      } else {
        console.log('⚠️ Email not configured. Set RESEND_API_KEY for Railway.');
      }
      
      if (!twilioClient) {
        console.log('⚠️ WhatsApp not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
      } else {
        console.log('✅ WhatsApp configured');
      }
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

