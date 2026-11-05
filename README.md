> **URLs synced (2026-11-05):** API `http://localhost:4000` · Client `http://localhost:3000` · Admin `http://localhost:3001` · nginx `:8080` (container) · Repo `https://github.com/nazimzenda/ecu-tuning.git`

# 🚗 ECU Tuning Pro - Professional ECU File Modification Service

A complete, production-ready web application for professional ECU tuning services. Clients can upload ECU files, select tuning services, track orders, and receive notifications. Admins manage orders through a powerful admin panel with detailed order views.

**Local URLs:** Client `http://localhost:3000` · Admin `http://localhost:3001` · API `http://localhost:4000` (see Quick Start below).

---

## ✨ Features

### 🎯 Client Portal (Port 3000)
- **Multi-Format Support**: Upload `.bin`, `.hex`, `.ori`, `.winols`, `.dam` files (up to 50MB)
- **7 Professional Services**: DPF Delete, EGR Delete, DTC Removal, AdBlue/SCR Delete, VMAX Remove, Stage 1 Tune, Custom
- **Vehicle Information**: Capture make, model, year, engine specs
- **Smart Notifications**: Email notifications when files are ready (with file attachment!)
- **Order Tracking**: Get order ID instantly after upload
- **Download Portal**: Secure download of modified files
- **Modern UI**: Responsive design with gray/black/yellow theme, optimized animations

### 🔐 Admin Panel (Port 3001)
- **Secure Login**: Password-protected admin access
- **Order Management**: View, filter, and manage all orders
- **Detailed Order View**: Click any order to see complete vehicle & customer info
- **6 Color-Coded Sections**: Order status, vehicle info, service details, customer info, file info, actions
- **File Upload**: Upload modified ECU files directly from admin panel
- **Status Updates**: Change order status (pending → processing → completed)
- **File Downloads**: Download both original and modified files
- **Order Deletion**: Remove completed or cancelled orders
- **Auto Notifications**: Email sent automatically when modified file is uploaded
- **Admin Alerts**: Receive email notification for new orders with direct link to admin panel

### 🔧 API Server (Port 4000)
- **RESTful API**: Complete CRUD operations for orders
- **File Management**: Secure upload/download with validation
- **Database Options**: SQLite (default) or Firebase Firestore
- **Email System**: Resend API (for Railway/production) or SMTP (local development)
- **File Attachments**: Modified files sent directly as email attachments
- **Gzip Compression**: All responses compressed for faster loading
- **Error Handling**: Comprehensive error responses
- **Health Checks**: `/` endpoint returns API status

### ⚡ Performance Optimizations
- **Gzip Compression**: All servers use compression middleware
- **Static File Caching**: 1-day cache for CSS, JS, images in production
- **CSS Animations**: Optimized with `prefers-reduced-motion` support
- **GPU Acceleration**: Hardware-accelerated transforms
- **Preload/Preconnect**: Critical resources loaded early
- **Deferred Scripts**: JavaScript loads after HTML parsing

### 🌍 Worldwide Lead Intelligence (Admin)
- **Worldwide map + lead database** at `/admin/leads`
- **OpenStreetMap discovery** via Overpass with Nominatim fallback
- **Official-website enrichment**: public email, phone, WhatsApp, socials, address, structured data
- **Verification + scoring** with evidence links and confidence reasons
- **Compliance guardrail**: flags emissions-delete/defeat wording for review; no automated outreach
- **Research runs, CSV import/export, opt-outs and a human-managed pipeline**
- **Starter dataset** of real OSM business records: `npm run leads:seed`
- Full documentation: [`leads/README.md`](leads/README.md)

The research workspace is deliberately limited to **lawful ECU calibration, diagnostics and emissions-system repair**. It does not market emissions-control defeat or modifications that violate applicable road-emissions rules.

---

## 🚀 Quick Start

### Option 1: One-Command Start (Recommended)
```powershell
.\scripts\start-clean.ps1
```
This stops any running services, checks ports, and starts all three servers + Firebase emulators in separate windows.

### Option 2: Manual Start
```powershell
# 1. Stop any running services
.\scripts\stop-all.ps1

# 2. Check ports are free
.\scripts\check-ports.ps1

# 3. Start servers individually
npm run start:api      # Port 4000
npm run start:client   # Port 3000
npm run start:admin    # Port 3001
```

### Access Your Application
- **Client Portal**: http://localhost:3000
- **Admin Panel**: http://localhost:3001 (password: `admin123`)
- **API Health**: http://localhost:4000

---

## 📦 Installation

```powershell
# Clone repository
git clone https://github.com/nazimzenda/ecu-tuning.git
cd ecu-tuning

# Install dependencies
npm install

# Create .env file (optional)
@"
USE_FIREBASE=0
ADMIN_PASSWORD=admin123
API_PORT=4000
CLIENT_PORT=3000
ADMIN_PORT=3001
"@ | Out-File -FilePath .env -Encoding utf8

# Start application
.\scripts\start-clean.ps1
```

---

## 📁 Project Structure

```
myapp/
├── 🖥️  SERVERS (3 Node.js Express apps)
│   ├── server.js              # API server (port 4000) - file uploads, orders, notifications
│   ├── client-server.js       # Client UI server (port 3000) - serves public/
│   └── admin-server.js        # Admin UI server (port 3001) - serves admin panel
│
├── 💾 DATABASE
│   ├── database.js            # SQLite operations (default)
│   ├── database.sqlite        # SQLite database file
│   └── db/
│       ├── index.js           # Database abstraction layer
│       └── firestore-adapter.js  # Firebase Firestore adapter (USE_FIREBASE=1)
│
├── 🎨 FRONTEND
│   └── public/
│       ├── index.html         # Client upload form with vehicle info
│       ├── admin.html         # Admin panel with order management
│       ├── app.js             # Client-side logic (upload, validation)
│       ├── admin.js           # Admin logic (login, orders, detailed view)
│       └── styles.css         # Modern responsive styling
│
├── 📂 FILE STORAGE
│   └── uploads/
│       ├── /                  # Original ECU files
│       └── modified/          # Modified ECU files ready for download
│
├── 🌍 LEAD RESEARCH
│   └── leads/
│       ├── catalog.js         # Priority markets, keywords, compliance patterns
│       ├── agent.js           # Discovery → enrichment → verification pipeline
│       ├── enrich.js          # Safe website fetcher + public contact extraction
│       ├── sources/           # Overpass and Nominatim connectors
│       ├── store.js           # Lead/job SQLite store (same database file)
│       ├── routes.js          # Admin-only /api/leads API
│       ├── seed.js            # Curated real OSM starter set
│       ├── cli.js             # Command-line research runner
│       └── README.md          # Method, API, compliance and scaling notes
│
├── 🔧 SCRIPTS (PowerShell helpers)
│   ├── start-clean.ps1        # One-command startup (stops all → starts all)
│   ├── start-clean-debug.ps1  # Debug mode (same terminal, capture crashes)
│   ├── stop-all.ps1           # Stop all services on ports 3000, 3001, 4000, 4005
│   ├── check-ports.ps1        # Check which ports are listening
│   ├── e2e-smoke.ps1          # Smoke test all endpoints
│   └── backup-before-migrate.ps1  # Backup database before migration
│
├── 🔥 FIREBASE (Optional)
│   ├── firebase.json          # Firebase project config
│   ├── firebase.emulators.json   # Emulator ports (Firestore:8080, Storage:9199, UI:4005)
│   ├── firebase-admin-init.js # Firebase Admin SDK initialization
│   ├── firestore.rules        # Firestore security rules
│   ├── storage.rules          # Storage security rules
│   └── migration/
│       └── migrate-sqlite-to-firestore.js  # SQLite → Firestore migration script
│
├── 🐳 DEPLOYMENT
│   ├── Dockerfile             # Multi-stage Docker build
│   ├── docker-compose.yml     # Docker Compose config
│   ├── railway.json           # Railway deployment config
│   ├── Procfile               # Heroku/Railway process config
│   └── package.json           # NPM scripts + dependencies
│
└── 📚 DOCUMENTATION
    ├── README.md              # This file - complete guide
    ├── DIRECTORY_STRUCTURE.md # Detailed file/folder descriptions
    ├── FIREBASE_SETUP.md      # Firebase setup instructions
    ├── DEPLOYMENT.md          # Cloud deployment guide
    └── MAINTENANCE.md         # Backup & maintenance procedures
```

---

## 🔌 API Endpoints

### Orders
| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/orders` | Create new order (upload ECU file) | No |
| `GET` | `/api/orders` | Get all orders | Admin |
| `GET` | `/api/orders/:id` | Get single order details | No |
| `PUT` | `/api/orders/:id/status` | Update order status | Admin |
| `POST` | `/api/orders/:id/modified` | Upload modified file | Admin |
| `DELETE` | `/api/orders/:id` | Delete order | Admin |

### Downloads
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/orders/:id/download/original` | Download original ECU file |
| `GET` | `/api/orders/:id/download/modified` | Download modified ECU file |

### Lead Research (Admin)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/leads` | Filtered, paginated lead database |
| `GET` | `/api/leads/stats` | Coverage and potential totals |
| `GET` | `/api/leads/map` | Map points |
| `GET` | `/api/leads/:id` | Full lead + evidence |
| `PATCH` | `/api/leads/:id` | Pipeline, notes and contact updates |
| `POST` | `/api/leads/:id/verify` | Re-check the official website |
| `POST` | `/api/leads/research` | Start a bounded research job |
| `GET` | `/api/leads/jobs` | Research run status |
| `GET` | `/api/leads/export` | CSV export (filter-aware) |
| `POST` | `/api/leads/import` | JSON/CSV-derived import |

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | API health check (returns status) |

---

## 🎯 Available ECU Tuning Services

1. **DPF/FPF Delete** - Remove diesel/petrol particulate filter, eliminate regeneration issues
2. **EGR Delete** - Disable exhaust gas recirculation, improve airflow & performance
3. **DTC Removal** - Delete diagnostic trouble codes (P-codes, engine lights)
4. **AdBlue/SCR Delete** - Remove urea injection system, eliminate DEF fluid requirements
5. **VMAX Remove** - Delete speed limiter, unlock maximum vehicle speed
6. **Stage 1 Tune** - Performance upgrade: +15-30% power/torque, optimize fuel maps
7. **Custom Service** - Specify custom modifications (launch control, pop & bang, etc.)

---

## 💾 Database Configuration

### Default: SQLite (Zero Configuration)
```javascript
// database.js automatically creates database.sqlite on first run
// No setup required - just run the app!
```

### Optional: Firebase Firestore
```powershell
# 1. Set environment variable
$env:USE_FIREBASE='1'

# 2. Add service-account.json to project root
# (Download from Firebase Console → Project Settings → Service Accounts)

# 3. Start with Firebase
npm run start:api
```

**Migration Script** (SQLite → Firestore):
```powershell
# Backup first
.\scripts\backup-before-migrate.ps1

# Preview migration (dry run)
npm run migrate:firestore -- --dry

# Run actual migration
npm run migrate:firestore
```

---

## 📧 Email Notifications Setup

### Option 1: Resend API (Recommended for Railway/Production)
Resend uses HTTP-based email delivery, which works on Railway where SMTP ports are blocked.

```env
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=ECU Tuning Pro <noreply@yourdomain.com>
ADMIN_EMAIL=admin@yourdomain.com
```

**Features:**
- ✅ Works on Railway (no SMTP port issues)
- ✅ Modified files sent as email attachments
- ✅ Admin notifications for new orders
- ✅ Professional email templates

**Setup:**
1. Sign up at [resend.com](https://resend.com)
2. Get your API key from the dashboard
3. (Optional) Verify a custom domain to send to any email address
4. Add `RESEND_API_KEY` to Railway environment variables

### Option 2: SMTP/Gmail (Local Development)
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

### WhatsApp (Twilio - Optional)
Set environment variables:
```env
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

---

## 🛠️ Development Tools

### Helper Scripts
```powershell
# Check which ports are listening
.\scripts\check-ports.ps1

# Stop all services
.\scripts\stop-all.ps1

# Clean start (stop → start all)
.\scripts\start-clean.ps1

# Debug mode (capture crashes)
.\scripts\start-clean-debug.ps1

# Test all endpoints
.\scripts\e2e-smoke.ps1

# Backup database
.\scripts\backup-before-migrate.ps1
```

### Firebase Emulators (Local Testing)
```powershell
# Start emulators
npm run emulators

# Emulator UI: http://localhost:4005
# Firestore: localhost:8080
# Auth: localhost:9099
# Storage: localhost:9199
```

---

## 🚀 Deployment

### Railway (Recommended)
```powershell
# Install Railway CLI
npm install -g @railway/cli

# Login & initialize
railway login
railway init

# Set environment variables
railway variables set ADMIN_PASSWORD=your-secure-password
railway variables set USE_FIREBASE=1
# Add GOOGLE_SERVICE_ACCOUNT_JSON (paste content from service-account.json)

# Deploy
railway up
```

### Docker
```powershell
# Build image
docker build -t ecu-tuning-service .

# Run container
docker run -p 4000:4000 -p 3000:3000 -p 3001:3001 ecu-tuning-service

# Or use Docker Compose
docker-compose up
```

### Render / Heroku
1. Connect GitHub repository
2. Set environment variables in dashboard
3. Deploy from `master` branch

See **DEPLOYMENT.md** for detailed cloud deployment instructions.

---

## 🔒 Security Features

- ✅ **File Validation**: Only `.bin`, `.hex`, `.ori`, `.winols`, `.dam` allowed
- ✅ **Size Limits**: 50MB max upload size (configurable)
- ✅ **SQL Injection Prevention**: Parameterized queries throughout
- ✅ **Admin Authentication**: Session-based login with password
- ✅ **Input Sanitization**: Email/phone validation, trimmed inputs
- ✅ **CORS Protection**: Configured for specific origins
- ✅ **Path Traversal Prevention**: Validated file paths

### Production Security Recommendations
- [ ] Use HTTPS (SSL/TLS certificates)
- [ ] Add rate limiting (express-rate-limit)
- [ ] Implement virus scanning (ClamAV)
- [ ] Use strong admin passwords (environment variable)
- [ ] Enable Firebase security rules (if using Firestore)
- [ ] Add CSP headers (Content Security Policy)
- [ ] Implement request logging
- [ ] Set up monitoring/alerts

---

## 📝 Environment Variables

Create `.env` file in project root:

```env
# Firebase
USE_FIREBASE=0                    # 0=SQLite, 1=Firestore

# Server Ports
API_PORT=4000
CLIENT_PORT=3000
ADMIN_PORT=3001

# Admin Authentication
ADMIN_PASSWORD=admin123           # Change in production!

# Email Notifications
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password

# WhatsApp Notifications (Twilio)
TWILIO_ACCOUNT_SID=ACxxxx...
TWILIO_AUTH_TOKEN=your-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# Lead research (public data providers use this contact in the User-Agent)
LEAD_RESEARCH_CONTACT=ops@yourdomain.com
```

---

## 🐛 Troubleshooting

### Port Already in Use (EADDRINUSE)
```powershell
# Check what's using the port
.\scripts\check-ports.ps1

# Stop all services
.\scripts\stop-all.ps1

# Restart clean
.\scripts\start-clean.ps1
```

### Firebase Emulator Port Collision
Firebase emulator UI was moved to port **4005** (instead of 4000) to avoid collision with API server.

### Terminal Crashes (Exit Code -1073741510)
```powershell
# Use debug mode to capture logs
.\scripts\start-clean-debug.ps1
```

### Database Issues
```powershell
# Check if database.sqlite exists
Test-Path .\database.sqlite

# Backup before changes
.\scripts\backup-before-migrate.ps1

# Recreate database (will lose data!)
Remove-Item .\database.sqlite
npm run start:api  # Creates new database
```

---

## 📊 Admin Panel Features

### Fast Search & Filters (New!)
- **Search bar** above the orders list: type customer name, email, vehicle, or service to live-filter results.
- **Clickable stats**: click **Total**, **Pending**, **Processing**, or **Completed** to instantly filter by status. Click **Total** to reset.
- **Combined filters**: status + search can be used together (e.g., pending orders for a specific customer).

### Detailed Order View
Click **"🔍 View Full Details"** on any order to see:

1. **📋 Order Status** (Yellow) - Status badge, order ID, formatted timestamp
2. **🚗 Vehicle Information** (Blue) - Make, model, year, engine in large readable text
3. **⚙️ Service Information** (Orange) - Selected service + custom description
4. **👤 Customer Information** (Green) - Name, email, WhatsApp in organized grid
5. **📁 File Information** (Purple) - Original & modified file names with sizes
6. **🎬 Action Buttons** - All order actions available from the modal

### Order Actions
- Change status (Pending → Processing → Completed)
- Upload modified ECU file (fixed modal and upload flow)
- Download original file
- Download modified file
- Delete order

---

## 📢 Latest Updates (2025-12-07)
- Admin panel: added search bar (name/email/vehicle/service) and clickable status cards; upload modified modal fixed.
- Styling: premium background applied across client/admin; cursor/hover tweaks on stat cards.
- Deployment docs: merged deployment guides into `DEPLOYMENT.md`; removed `FREE_DEPLOYMENT_GUIDE.md` and `IMAGE_SETUP.md`; quick start now lives in `MAINTENANCE.md` (replaces `QUICK_START.md`).
- Scripts/docs: `docker-start.ps1` admin URL corrected to port 3001; directory structure doc refreshed; removed legacy debug/helper files.

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature-name`
3. Commit changes: `git commit -am 'Add feature'`
4. Push to branch: `git push origin feature-name`
5. Submit Pull Request

---

## 📄 License

ISC License - See LICENSE file for details

---

## 🆘 Support

- **Documentation**: Check `DIRECTORY_STRUCTURE.md` for complete file descriptions
- **Firebase Setup**: See `FIREBASE_SETUP.md` for detailed Firebase instructions
- **Deployment**: See `DEPLOYMENT.md` for cloud deployment guides
- **Issues**: Report bugs on GitHub Issues
- **Repository**: https://github.com/nazimzenda/ecu-tuning

---

## 🎉 Credits

Built with Node.js, Express, SQLite, Firebase, and modern web technologies.

**Version**: 2.0.0  
**Last Updated**: December 7, 2025

