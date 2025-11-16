# 🚀 How to Start the Server

## Quick Start (Easiest Way)

**Option 1: Use the start script**
```powershell
.\start-server.ps1
```

**Option 2: Manual commands**
```powershell
# Step 1: Install dependencies (only needed once)
npm.cmd install

# Step 2: Start the server
npm.cmd start
```

## Step-by-Step Instructions

### 1️⃣ Install Dependencies (First Time Only)

If you haven't installed dependencies yet, run:
```powershell
npm.cmd install
```

This will install all required packages (Express, Multer, SQLite, etc.)

### 2️⃣ Start the Server

Run this command:
```powershell
npm.cmd start
```

You should see:
```
🚀 Server running on http://localhost:3000
📁 Uploads directory: C:\Users\remad\myapp\uploads
✅ Connected to SQLite database
✅ Database tables created
```

### 3️⃣ Access the Application

Once the server is running, open your browser:

- **Client Interface**: http://localhost:3000
  - Upload ECU files
  - Select services
  - Submit orders

- **Admin Panel**: http://localhost:3000/admin
  - View all orders
  - Manage order status
  - Upload modified files
  - Download files

## Development Mode (Auto-reload)

For development with automatic server restart on file changes:
```powershell
npm.cmd run dev
```

## Stop the Server

Press `Ctrl + C` in the terminal where the server is running.

## Troubleshooting

### If npm doesn't work:
Use `npm.cmd` instead of `npm`:
```powershell
npm.cmd install
npm.cmd start
```

### If port 3000 is already in use:
Edit `server.js` and change the port:
```javascript
const PORT = process.env.PORT || 3001; // Change to 3001 or any other port
```

### To check if server is running:
Open http://localhost:3000 in your browser

## What Gets Created Automatically

- `database.sqlite` - SQLite database file
- `uploads/` - Directory for uploaded files
- `uploads/modified/` - Directory for modified files

---

**That's it! Your ECU Tuning Service is ready to use! 🎉**

