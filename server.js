const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs-extra');
const { v4: uuidv4 } = require('uuid');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
const modifiedDir = path.join(__dirname, 'uploads', 'modified');
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(modifiedDir);

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

// Initialize database
db.init();

// Admin password (set via environment variable or use default)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123'; // CHANGE THIS IN PRODUCTION!

// Email configuration (set via environment variables)
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || '', // Your email
    pass: process.env.SMTP_PASS || '' // Your email password or app password
  }
};

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

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Admin login page
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
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

    const order = await db.createOrder({
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      filePath: req.file.path,
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

    // Move file to modified directory
    const modifiedFilePath = path.join(modifiedDir, req.file.filename);
    await fs.move(req.file.path, modifiedFilePath);

    await db.updateOrderModifiedFile(req.params.id, {
      modifiedFileName: req.file.originalname,
      modifiedStoredFileName: req.file.filename,
      modifiedFilePath: modifiedFilePath
    });

    await db.updateOrderStatus(req.params.id, 'completed');

    // Get order details for notifications
    const order = await db.getOrder(req.params.id);
    
    // Send email and WhatsApp notifications
    if (order) {
      await sendFileReadyNotifications(order, modifiedFilePath);
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

    if (!order.modified_file_path) {
      return res.status(404).json({ error: 'Modified file not available yet' });
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
  try {
    // Send email notification with file attachment
    if (order.customer_email) {
      await sendEmailNotification(order, filePath);
    }

    // Send WhatsApp notification
    if (order.customer_phone) {
      await sendWhatsAppNotification(order);
    }
  } catch (error) {
    console.error('Error sending notifications:', error);
  }
}

// Function to send email with file attachment
async function sendEmailNotification(order, filePath) {
  try {
    if (!emailConfig.auth.user || !emailConfig.auth.pass) {
      console.log('⚠️ Email not configured. Set SMTP_USER and SMTP_PASS environment variables.');
      return;
    }

    const mailOptions = {
      from: `"ECU Tuning Pro" <${emailConfig.auth.user}>`,
      to: order.customer_email,
      subject: `✅ Your Modified ECU File is Ready - Order #${String(order.id).padStart(3, '0')}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #FFD700;">Your Modified ECU File is Ready!</h2>
          <p>Hello ${order.customer_name || 'Customer'},</p>
          <p>We're pleased to inform you that your ECU file modification has been completed.</p>
          
          <div style="background: #2d2d2d; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #FFD700; margin-top: 0;">Order Details:</h3>
            <p><strong>Order ID:</strong> #${String(order.id).padStart(3, '0')}</p>
            <p><strong>Service:</strong> ${order.service}</p>
            <p><strong>Vehicle:</strong> ${order.vehicle_info}</p>
            <p><strong>Original File:</strong> ${order.original_file_name}</p>
            <p><strong>Modified File:</strong> ${order.modified_file_name || 'modified_' + order.original_file_name}</p>
          </div>

          <p>Your modified file is attached to this email. Please download it and flash it to your vehicle's ECU.</p>
          
          <p style="color: #888; font-size: 12px; margin-top: 30px;">
            If you have any questions, please contact us.<br>
            ECU Tuning Pro
          </p>
        </div>
      `,
      attachments: [
        {
          filename: order.modified_file_name || 'modified_' + order.original_file_name,
          path: filePath
        }
      ]
    };

    const info = await emailTransporter.sendMail(mailOptions);
    console.log('✅ Email sent successfully:', info.messageId);
  } catch (error) {
    console.error('❌ Error sending email:', error);
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
app.listen(PORT, () => {
  const isCloud = process.env.RAILWAY_ENVIRONMENT || process.env.RENDER;
  const url = isCloud ? process.env.RAILWAY_PUBLIC_DOMAIN || process.env.RENDER_EXTERNAL_URL : `http://localhost:${PORT}`;
  
  console.log(`🚀 Server running on ${url}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`🌐 Environment: ${isCloud ? 'Cloud' : 'Local'}`);
  
  if (!emailConfig.auth.user || !emailConfig.auth.pass) {
    console.log('⚠️ Email not configured. Set SMTP_USER and SMTP_PASS environment variables.');
  } else {
    console.log('✅ Email configured');
  }
  
  if (!twilioClient) {
    console.log('⚠️ WhatsApp not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.');
  } else {
    console.log('✅ WhatsApp configured');
  }
});

