const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
const modifiedDir = path.join(__dirname, 'uploads', 'modified');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(modifiedDir);

// Firebase adapter helpers (optional)
let firebaseUploadFn = null;
if (process.env.USE_FIREBASE === 'true' || process.env.USE_FIREBASE === '1') {
  try {
    const firestoreAdapter = require('./db/firestore-adapter');
    if (firestoreAdapter && firestoreAdapter.uploadLocalFileToStorage) {
      firebaseUploadFn = firestoreAdapter.uploadLocalFileToStorage;
    }
  } catch (e) {
    console.warn('⚠️ Firebase upload helper not available:', e.message);
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

// Email configuration (set via environment variables)
// Supports multiple variable name formats for flexibility
const emailUser = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.GMAIL_USER || '';
const emailPass = process.env.SMTP_PASS || process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || process.env.GMAIL_PASS || '';

// Use Gmail service directly for better compatibility with cloud environments
const emailConfig = {
  service: 'gmail',  // Use service instead of host/port for better compatibility
  auth: {
    user: emailUser,
    pass: emailPass
  },
  // Connection settings for cloud environments
  connectionTimeout: 30000,  // 30 seconds
  greetingTimeout: 30000,
  socketTimeout: 60000,
  // TLS settings
  tls: {
    rejectUnauthorized: false  // Allow self-signed certificates
  }
};

// Log email configuration status at startup
console.log('📧 Email configuration:');
console.log('   - Service: Gmail');
console.log('   - User:', emailUser ? `${emailUser.substring(0, 3)}***@***` : '❌ NOT SET');
console.log('   - Pass:', emailPass ? `✅ SET (${emailPass.length} chars)` : '❌ NOT SET');

// Create email transporter
const emailTransporter = nodemailer.createTransport(emailConfig);

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
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

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
        await fs.move(req.file.path, modifiedFilePath);
      }
    } else {
      await fs.move(req.file.path, modifiedFilePath);
    }

    await db.updateOrderModifiedFile(req.params.id, {
      modifiedFileName: req.file.originalname,
      modifiedStoredFileName: req.file.filename,
      modifiedFilePath: modifiedFilePath,
      modifiedFileDownloadURL: modifiedFileDownloadURL
    });

    await db.updateOrderStatus(req.params.id, 'completed');

    // Get order details for notifications
    const order = await db.getOrder(req.params.id);
    
    // Send email and WhatsApp notifications (non-blocking - don't wait)
    if (order) {
      sendFileReadyNotifications(order, modifiedFilePath).catch(err => {
        console.error('Notification error (non-blocking):', err.message);
      });
    }

    res.json({ success: true, message: 'Modified file uploaded successfully' });
  } catch (error) {
    console.error('Error uploading modified file:', error);
    res.status(500).json({ error: 'Failed to upload modified file' });
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
    console.log('📧 Order ID:', order?.id);
    console.log('📧 Customer Email:', order?.customer_email);
    console.log('📧 SMTP User:', emailUser ? `${emailUser.substring(0, 5)}...` : 'NOT SET');
    console.log('📧 SMTP Pass:', emailPass ? `SET (${emailPass.length} chars)` : 'NOT SET');
    
    if (!emailUser || !emailPass) {
      console.log('⚠️ Email not configured. Set SMTP_USER/SMTP_PASS or EMAIL_USER/EMAIL_PASSWORD environment variables.');
      console.log('   Current values - User:', emailUser ? 'SET' : 'EMPTY', '| Pass:', emailPass ? 'SET' : 'EMPTY');
      return;
    }
    
    if (!order?.customer_email) {
      console.log('⚠️ No customer email in order, skipping email notification');
      return;
    }

    // Check if file exists before trying to attach
    const fileExists = await fs.pathExists(filePath);
    if (!fileExists) {
      console.error('❌ Modified file not found at:', filePath);
      // Try alternative path from order
      if (order.modified_file_path && await fs.pathExists(order.modified_file_path)) {
        filePath = order.modified_file_path;
      } else {
        console.error('❌ Cannot find modified file to attach. Sending email without attachment.');
      }
    }

    const modifiedFileName = order.modified_file_name || order.modified_stored_file_name || 'modified_file.bin';
    const serviceName = order.service || 'ECU Tuning Service';
    const vehicleInfo = order.vehicle_info || 'Vehicle';
    const originalFileName = order.original_file_name || 'original_file.bin';

    const mailOptions = {
      from: `"ECU Tuning Pro" <${emailConfig.auth.user}>`,
      to: order.customer_email,
      subject: `✅ Your Modified ECU File is Ready - Order #${String(order.id).padStart(3, '0')}`,
      html: `
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

          <p>Your modified file is attached to this email. Please download it and flash it to your vehicle's ECU.</p>
          
          <p style="color: #888; font-size: 12px; margin-top: 30px;">
            If you have any questions, please contact us.<br>
            <strong style="color: #FFD700;">ECU Tuning Pro</strong>
          </p>
        </div>
      `
    };

    // Only add attachment if file exists
    if (await fs.pathExists(filePath)) {
      mailOptions.attachments = [
        {
          filename: modifiedFileName,
          path: filePath
        }
      ];
    }

    console.log('📧 Sending email to:', order.customer_email);
    console.log('📧 Mail options:', JSON.stringify({ to: mailOptions.to, subject: mailOptions.subject, hasAttachment: !!mailOptions.attachments }));
    
    const info = await emailTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
    console.log('📧 ========== EMAIL NOTIFICATION END ==========');
  } catch (error) {
    console.error('❌ Error sending email:', error.message);
    console.error('❌ Full error:', error);
    throw error; // Re-throw to be caught by parent
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
      
      if (!emailConfig.auth.user || !emailConfig.auth.pass) {
        console.log('⚠️ Email not configured. Set SMTP_USER and SMTP_PASS environment variables.');
      } else {
        console.log('✅ Email configured - testing connection...');
        // Test email connection
        emailTransporter.verify()
          .then(() => console.log('✅ Email connection verified successfully!'))
          .catch(err => console.log('⚠️ Email connection test failed:', err.message));
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

