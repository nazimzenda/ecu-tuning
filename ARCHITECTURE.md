# 🏗️ ECU Tuning Service - Complete Architecture Diagram

Complete technical architecture showing all systems, data flow, and how everything connects.

---

## 📊 High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          INTERNET / USERS                                   │
│  (Clients + Admins accessing your website)                                  │
└────────────────┬────────────────────────┬────────────────────────┬──────────┘
                 │                        │                        │
        ┌────────▼────────┐      ┌─────────▼──────────┐   ┌─────────▼──────────┐
        │   CLIENT PORTAL │      │   ADMIN PANEL      │   │   EMAIL/WHATSAPP   │
        │  (Port 3000)    │      │   (Port 3001)      │   │   NOTIFICATIONS    │
        │                 │      │                    │   │                    │
        │ - File Upload   │      │ - Order Management │   │ - Gmail (Email)    │
        │ - Track Status  │      │ - View Details     │   │ - Twilio (SMS/WA)  │
        │ - Download File │      │ - Change Status    │   │                    │
        └────────┬────────┘      └────────┬───────────┘   └────────┬───────────┘
                 │                        │                        │
                 └────────────┬───────────┴────────────┬───────────┘
                              │                        │
                    ┌─────────▼────────┐     ┌─────────▼──────────┐
                    │   API SERVER     │     │  NOTIFICATION      │
                    │   (Port 4000)    │     │  SERVICE           │
                    │                  │     │                    │
                    │ - File Upload    │     │ - Send Emails      │
                    │ - Create Orders  │────▶│ - Send WhatsApp    │
                    │ - Return Files   │     │                    │
                    │ - Auth Check     │     └────────────────────┘
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
    ┌─────────▼──────────┐      ┌──────────▼──────────┐
    │    DATABASE        │      │   FILE STORAGE     │
    │                    │      │                    │
    │ - SQLite (Local)   │      │ - uploads/         │
    │   OR               │      │   (Original files) │
    │ - Firestore        │      │                    │
    │   (Firebase)       │      │ - uploads/modified/│
    │                    │      │   (Modified files) │
    └────────────────────┘      └────────────────────┘
```

---

## 🖥️ Detailed System Components

### 1️⃣ **CLIENT PORTAL** (Port 3000)
```
┌─────────────────────────────────────────────────────────┐
│  CLIENT PORTAL - http://localhost:3000                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  public/index.html - Upload Form                │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │ Customer Name                              │ │  │
│  │  │ Customer Email                             │ │  │
│  │  │ WhatsApp Number                            │ │  │
│  │  │ Vehicle Make/Model/Year                    │ │  │
│  │  │ Vehicle Engine Specs                       │ │  │
│  │  │ Service Selection (7 options)              │ │  │
│  │  │ Custom Description                         │ │  │
│  │  │ ECU File Upload (.bin, .hex, etc)         │ │  │
│  │  │ [SUBMIT BUTTON]                           │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│                         │ (JavaScript)                  │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  public/app.js - Client-Side Logic              │  │
│  │  - Form validation                              │  │
│  │  - File size check (50MB max)                   │  │
│  │  - FormData preparation                         │  │
│  │  - API call to server.js                        │  │
│  │  - Show order ID after upload                   │  │
│  │  - Download section for completed orders        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Served by: client-server.js (Express)                │
│  Files: public/index.html + app.js + styles.css       │
└─────────────────────────────────────────────────────────┘
```

---

### 2️⃣ **ADMIN PANEL** (Port 3001)
```
┌─────────────────────────────────────────────────────────┐
│  ADMIN PANEL - http://localhost:3001                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  LOGIN PAGE                                      │  │
│  │  ┌────────────────────────────────────────────┐ │  │
│  │  │ Password: [____________]  [LOGIN]         │ │  │
│  │  └────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
│                         │                               │
│            (Session stored in memory)                  │
│                         │                               │
│                         ▼                               │
│  ┌──────────────────────────────────────────────────┐  │
│  │  ADMIN DASHBOARD                                │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │ ORDER #010 | Status: PENDING            │  │  │
│  │  │ Customer: John | Email: john@email.com  │  │  │
│  │  │ Vehicle: BMW 2020 M340i                 │  │  │
│  │  │ [🔍 View Full Details]                  │  │  │
│  │  │ [Upload Modified File]                  │  │  │
│  │  │ [Change Status]                         │  │  │
│  │  │ [Download Original]                     │  │  │
│  │  │ [Download Modified]                     │  │  │
│  │  │ [Delete Order]                          │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  │                                                  │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │ [VIEW FULL DETAILS MODAL]                │  │  │
│  │  │ ┌─ ORDER STATUS (Yellow) ──────────────┐ │  │  │
│  │  │ │ Order #010 | PENDING | 2025-12-06  │ │  │  │
│  │  │ ├─ VEHICLE INFO (Blue) ────────────────┤ │  │  │
│  │  │ │ BMW M340i 2020 | 3.0L Twin-Turbo   │ │  │  │
│  │  │ ├─ SERVICE INFO (Orange) ──────────────┤ │  │  │
│  │  │ │ DPF Delete | Custom: Remove codes  │ │  │  │
│  │  │ ├─ CUSTOMER INFO (Green) ──────────────┤ │  │  │
│  │  │ │ John Doe | john@email.com | +212... │ │  │  │
│  │  │ ├─ FILE INFO (Purple) ─────────────────┤ │  │  │
│  │  │ │ Original: M340i_Stock.bin          │ │  │  │
│  │  │ │ Modified: (not uploaded yet)       │ │  │  │
│  │  │ └─ ACTION BUTTONS ─────────────────────┘ │  │  │
│  │  │    [Change Status] [Upload] [Download]   │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Served by: admin-server.js (Express)                 │
│  Files: public/admin.html + admin.js + styles.css     │
└─────────────────────────────────────────────────────────┘
```

---

### 3️⃣ **API SERVER** (Port 4000) - The Brain
```
┌─────────────────────────────────────────────────────────┐
│  API SERVER - http://localhost:4000                     │
│  File: server.js (Express.js)                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  REQUEST FLOW:                                          │
│                                                          │
│  Client/Admin sends HTTP request                        │
│         │                                               │
│         ▼                                               │
│  ┌────────────────────────────────────────────────┐    │
│  │  MULTER FILE HANDLER                          │    │
│  │  - Validate file type (.bin, .hex, etc)      │    │
│  │  - Check file size (max 50MB)                 │    │
│  │  - Save to: uploads/ folder                  │    │
│  └────────────────────────────────────────────────┘    │
│         │                                               │
│         ▼                                               │
│  ┌────────────────────────────────────────────────┐    │
│  │  CREATE ORDER                                 │    │
│  │  - Extract form data                          │    │
│  │  - Validate email & phone                     │    │
│  │  - Generate Order ID                          │    │
│  │  - Store in database.js                       │    │
│  └────────────────────────────────────────────────┘    │
│         │                                               │
│         ▼                                               │
│  ┌────────────────────────────────────────────────┐    │
│  │  SEND NOTIFICATIONS                           │    │
│  │  - Email to customer (Gmail)                  │    │
│  │  - WhatsApp (Twilio) - if configured         │    │
│  │  - Include order ID + tracking link           │    │
│  └────────────────────────────────────────────────┘    │
│         │                                               │
│         ▼                                               │
│  ┌────────────────────────────────────────────────┐    │
│  │  RETURN RESPONSE                              │    │
│  │  {                                             │    │
│  │    "status": "success",                       │    │
│  │    "orderId": "010",                          │    │
│  │    "message": "File uploaded successfully"    │    │
│  │  }                                             │    │
│  └────────────────────────────────────────────────┘    │
│                                                          │
│  ENDPOINTS:                                             │
│  ├─ POST   /api/orders              (Create order)    │
│  ├─ GET    /api/orders              (Get all)         │
│  ├─ GET    /api/orders/:id          (Get single)      │
│  ├─ PUT    /api/orders/:id/status   (Update status)   │
│  ├─ POST   /api/orders/:id/modified (Upload modified) │
│  ├─ DELETE /api/orders/:id          (Delete order)    │
│  ├─ GET    /api/orders/:id/download/original          │
│  ├─ GET    /api/orders/:id/download/modified          │
│  └─ GET    /                        (Health check)    │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

### 4️⃣ **DATABASE LAYER** - Data Storage

#### Option A: SQLite (Default - Local)
```
┌─────────────────────────────────────────────────────────┐
│  DATABASE: SQLite (Local File)                          │
│  File: database.sqlite                                  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  database.js (SQLite Interface)                │  │
│  │                                                  │  │
│  │  ┌───────────────────────────────────────────┐ │  │
│  │  │ ORDERS TABLE                             │ │  │
│  │  │ ┌─────────────────────────────────────┐  │ │  │
│  │  │ │ id              (Order ID)          │  │ │  │
│  │  │ │ customer_name   (John Doe)         │  │ │  │
│  │  │ │ customer_email  (john@example.com) │  │ │  │
│  │  │ │ customer_phone  (+212 xxx xxx xxx) │  │ │  │
│  │  │ │ vehicle_make    (BMW)              │  │ │  │
│  │  │ │ vehicle_model   (M340i)            │  │ │  │
│  │  │ │ vehicle_year    (2020)             │  │ │  │
│  │  │ │ vehicle_engine  (3.0L Twin-Turbo) │  │ │  │
│  │  │ │ service_type    (DPF Delete)       │  │ │  │
│  │  │ │ custom_desc     (Remove DTC codes) │  │ │  │
│  │  │ │ original_file   (filename.bin)     │  │ │  │
│  │  │ │ modified_file   (NULL)             │  │ │  │
│  │  │ │ status          (PENDING)          │  │ │  │
│  │  │ │ created_at      (2025-12-06 10:30) │  │ │  │
│  │  │ │ updated_at      (2025-12-06 10:30) │  │ │  │
│  │  │ └─────────────────────────────────────┘  │ │  │
│  │  └───────────────────────────────────────────┘ │  │
│  │                                                  │  │
│  │  Functions:                                     │  │
│  │  - createOrder(orderData)                       │  │
│  │  - getAllOrders()                               │  │
│  │  - getOrder(id)                                 │  │
│  │  - updateOrderStatus(id, status)                │  │
│  │  - updateOrderModifiedFile(id, filename)        │  │
│  │  - deleteOrder(id)                              │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  Storage Location:                                      │
│  C:\Users\remad\myapp\database.sqlite                  │
│                                                          │
│  File Size: Depends on orders (typically < 10MB)       │
│  Backup: scripts\backup-before-migrate.ps1             │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### Option B: Firebase Firestore (Cloud - Optional)
```
┌─────────────────────────────────────────────────────────┐
│  DATABASE: Firebase Firestore (Cloud)                  │
│  Requires: USE_FIREBASE=1 environment variable         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  db/firestore-adapter.js                        │  │
│  │  (Maps to Firebase Firestore)                   │  │
│  │                                                  │  │
│  │  ┌───────────────────────────────────────────┐ │  │
│  │  │ FIRESTORE COLLECTION: orders             │ │  │
│  │  │                                           │ │  │
│  │  │ Document: {order-id-010}                 │ │  │
│  │  │ {                                         │ │  │
│  │  │   "customerName": "John Doe",            │ │  │
│  │  │   "customerEmail": "john@example.com",   │ │  │
│  │  │   "vehicleMake": "BMW",                  │ │  │
│  │  │   "vehicleModel": "M340i",               │ │  │
│  │  │   "serviceType": "DPF Delete",           │ │  │
│  │  │   "status": "PENDING",                   │ │  │
│  │  │   "originalFile": "M340i_Stock.bin",     │ │  │
│  │  │   "modifiedFile": null,                  │ │  │
│  │  │   "createdAt": "2025-12-06T10:30:00Z",   │ │  │
│  │  │   "updatedAt": "2025-12-06T10:30:00Z"    │ │  │
│  │  │ }                                         │ │  │
│  │  └───────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  FREE LIMITS:                                           │
│  - 1 GB storage                                        │
│  - 50,000 reads/day                                    │
│  - 20,000 writes/day                                   │
│  - 20,000 deletes/day                                  │
│                                                          │
│  Location: Cloud (Firebase Console)                    │
│  Console: https://console.firebase.google.com/         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

### 5️⃣ **FILE STORAGE SYSTEM**

```
┌──────────────────────────────────────────────────────────┐
│  FILE STORAGE - Local Filesystem                        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Location: C:\Users\remad\myapp\uploads\                │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ORIGINAL FILES                                    │ │
│  │  (As uploaded by customers)                        │ │
│  │                                                    │ │
│  │  uploads/                                          │ │
│  │  ├─ 010_M340i_Stock.bin                           │ │
│  │  ├─ 011_A6_Original.hex                           │ │
│  │  ├─ 012_Golf_Engine.ori                           │ │
│  │  └─ ...                                            │ │
│  │                                                    │ │
│  │  File naming: {order-id}_{customer-name}_{file}  │ │
│  │                                                    │ │
│  │  Access: GET /api/orders/:id/download/original   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │  MODIFIED FILES                                    │ │
│  │  (After admin processing & upload)                │ │
│  │                                                    │ │
│  │  uploads/modified/                                 │ │
│  │  ├─ 010_M340i_Modified.bin                        │ │
│  │  ├─ 011_A6_Modified.hex                           │ │
│  │  ├─ 012_Golf_Modified.ori                         │ │
│  │  └─ ...                                            │ │
│  │                                                    │ │
│  │  File naming: {order-id}_{customer-name}_{file}  │ │
│  │                                                    │ │
│  │  Access: GET /api/orders/:id/download/modified   │ │
│  │  Upload: POST /api/orders/:id/modified           │ │
│  │  (Admin uses this when ready to send to customer) │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  File Size Limits:                                       │
│  - Max upload: 50 MB                                    │
│  - Total storage: Limited by server disk space          │
│                                                           │
│  Example Directory Tree:                                │
│  uploads/                                               │
│  ├── 010_John_M340i.bin                  (45 MB)       │
│  ├── 011_Ahmed_A6.hex                    (32 MB)       │
│  ├── modified/                                          │
│  │   ├── 010_John_M340i_TUNED.bin       (46 MB)       │
│  │   ├── 011_Ahmed_A6_TUNED.hex         (33 MB)       │
│  │   └── 012_Sara_Golf_TUNED.ori        (28 MB)       │
│  └── ...                                               │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

### 6️⃣ **NOTIFICATION SYSTEM**

```
┌──────────────────────────────────────────────────────────┐
│  NOTIFICATIONS - Real-Time Customer Updates             │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  EMAIL NOTIFICATIONS (Nodemailer + Gmail)      │   │
│  │                                                 │   │
│  │  Configuration:                                │   │
│  │  - SERVICE: gmail                              │   │
│  │  - USER: your-email@gmail.com                  │   │
│  │  - PASSWORD: app-specific password (16 chars) │   │
│  │                                                 │   │
│  │  Triggers:                                     │   │
│  │  1. Order created                              │   │
│  │     Subject: "Your ECU File Uploaded"         │   │
│  │     Content: Order ID, status, tracking link  │   │
│  │                                                 │   │
│  │  2. Status changed to PROCESSING               │   │
│  │     Subject: "Your Order Is Being Processed"  │   │
│  │                                                 │   │
│  │  3. Status changed to COMPLETED                │   │
│  │     Subject: "Your Modified File Is Ready!"   │   │
│  │     Content: Download link                     │   │
│  │                                                 │   │
│  │  Cost: FREE (within Gmail limits: 500/day)    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  WhatsApp NOTIFICATIONS (Twilio - Optional)    │   │
│  │                                                 │   │
│  │  Configuration:                                │   │
│  │  - TWILIO_ACCOUNT_SID: your-sid               │   │
│  │  - TWILIO_AUTH_TOKEN: your-token              │   │
│  │  - TWILIO_WHATSAPP_FROM: +1415xxx...          │   │
│  │                                                 │   │
│  │  Triggers: Same as email                       │   │
│  │                                                 │   │
│  │  Cost: ~$0.01 per message (PAID)              │   │
│  │         Example: 100 orders = $1-2/month      │   │
│  │                                                 │   │
│  │  Status: OPTIONAL (skip to save costs)        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  Flow:                                                  │
│  API receives order                                    │
│     │                                                   │
│     ├─▶ Save to database                              │
│     │                                                   │
│     ├─▶ Send Email (Gmail) ✅                          │
│     │   "Thank you for uploading your file"           │
│     │   Include: Order ID, tracking link              │
│     │                                                   │
│     └─▶ Send WhatsApp (Twilio) - Optional            │
│        "Your order #010 received, tracking ID..."    │
│                                                          │
│  Returns to client:                                    │
│  { status: "success", orderId: "010" }                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🔄 Complete Data Flow - From Upload to Download

### Step 1: Customer Uploads File
```
CUSTOMER BROWSER (Port 3000)
        │
        └─▶ Fills form (name, email, phone, vehicle info, service)
             │
             └─▶ Selects ECU file (max 50MB)
                  │
                  └─▶ Submits form
                       │
                       ├─▶ JavaScript validates (app.js)
                       │
                       └─▶ FormData with file
```

### Step 2: API Processes Upload
```
API SERVER (Port 4000)
        │
        ├─▶ Multer validates file
        │   - Extension check (.bin, .hex, etc)
        │   - Size check (max 50MB)
        │   - Saves to: uploads/{order-id}_filename.ext
        │
        ├─▶ database.js creates order record
        │   {
        │     id: "010",
        │     customerName: "John",
        │     originalFile: "010_M340i_Stock.bin",
        │     status: "PENDING",
        │     ...
        │   }
        │
        └─▶ Sends notifications
            ├─▶ Email (Gmail) → customer@email.com
            └─▶ WhatsApp (Twilio) → +212 xxx xxx
```

### Step 3: Admin Reviews Order
```
ADMIN PANEL (Port 3001)
        │
        ├─▶ Admin logs in with password
        │
        ├─▶ Sees all orders (API: GET /api/orders)
        │
        ├─▶ Clicks "View Full Details" on order #010
        │   - See customer info (blue section)
        │   - See vehicle info (blue section)
        │   - See service requested (orange section)
        │
        └─▶ Downloads original file
            └─▶ API: GET /api/orders/010/download/original
                └─▶ Files: C:/myapp/uploads/010_M340i_Stock.bin
```

### Step 4: Admin Modifies File
```
ADMIN COMPUTER (External Tool)
        │
        └─▶ Opens downloaded file in WinOLS/MapTuner
            │
            └─▶ Makes modifications (DPF delete, etc)
                 │
                 └─▶ Exports modified file
                     └─▶ Saves as: 010_M340i_Modified.bin
```

### Step 5: Admin Uploads Modified File
```
ADMIN PANEL (Port 3001)
        │
        ├─▶ Clicks "Upload Modified File"
        │
        ├─▶ Selects modified file from their computer
        │
        └─▶ POST /api/orders/010/modified
            │
            ├─▶ Multer saves to: uploads/modified/010_M340i_Modified.bin
            │
            ├─▶ database.js updates order
            │   {
            │     id: "010",
            │     modifiedFile: "010_M340i_Modified.bin",
            │     status: "COMPLETED",
            │     ...
            │   }
            │
            └─▶ Sends notification
                └─▶ Email/WhatsApp: "Your file is ready! Download it."
```

### Step 6: Customer Downloads Modified File
```
CUSTOMER BROWSER (Port 3000)
        │
        ├─▶ Returns to tracking page
        │
        ├─▶ Enters Order ID: "010"
        │
        ├─▶ Sees "Download Modified File" button
        │
        └─▶ Clicks download
            │
            └─▶ GET /api/orders/010/download/modified
                │
                └─▶ API serves: uploads/modified/010_M340i_Modified.bin
                     │
                     └─▶ Browser downloads file
```

---

## 📡 Port Configuration Overview

```
┌────────────────────────────────────────────────────────┐
│ PORT ASSIGNMENTS - All Running on Localhost            │
├────────────────────────────────────────────────────────┤
│                                                         │
│  PORT 3000 ────▶ CLIENT PORTAL                        │
│                 http://localhost:3000                  │
│                 ├─ Upload form (public/index.html)    │
│                 ├─ JavaScript logic (public/app.js)   │
│                 └─ Styling (public/styles.css)        │
│                                                         │
│  PORT 3001 ────▶ ADMIN PANEL                          │
│                 http://localhost:3001                  │
│                 ├─ Login page (public/admin.html)     │
│                 ├─ Order management (public/admin.js) │
│                 └─ Styling (public/styles.css)        │
│                                                         │
│  PORT 4000 ────▶ API SERVER (server.js)              │
│                 http://localhost:4000                  │
│                 ├─ File upload endpoint               │
│                 ├─ Order CRUD operations              │
│                 ├─ File download endpoint             │
│                 └─ Notification sender                │
│                                                         │
│  PORT 4005 ────▶ Firebase Emulator UI (Optional)      │
│                 http://localhost:4005                  │
│                 ├─ Firestore data viewer              │
│                 ├─ Storage browser                    │
│                 └─ Authentication tester              │
│                                                         │
│  PORT 8080 ────▶ Firestore Emulator (Optional)       │
│  PORT 9099 ────▶ Auth Emulator (Optional)            │
│  PORT 9199 ────▶ Storage Emulator (Optional)         │
│                                                         │
└────────────────────────────────────────────────────────┘
```

---

## 🔐 Authentication & Session Management

```
┌─────────────────────────────────────────────────────────┐
│  ADMIN AUTHENTICATION FLOW                              │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Admin visits http://localhost:3001                  │
│     │                                                    │
│     └─▶ Login form appears                              │
│                                                          │
│  2. Admin enters password: admin123                      │
│     │                                                    │
│     └─▶ POST /admin/login                               │
│          │                                               │
│          ├─▶ Verify password vs ENV variable           │
│          │   (default: admin123)                        │
│          │                                               │
│          ├─▶ Generate session ID                        │
│          │   (random string stored in memory)           │
│          │                                               │
│          └─▶ Return sessionId in response               │
│              { sessionId: "abc123xyz456" }              │
│                                                          │
│  3. Browser stores sessionId                            │
│     │                                                    │
│     └─▶ In-memory session object (server-side)         │
│          {                                              │
│            "abc123xyz456": {                            │
│              loggedIn: true,                            │
│              timestamp: 2025-12-06T10:30:00Z           │
│            }                                            │
│          }                                              │
│                                                          │
│  4. Admin makes subsequent requests                     │
│     │                                                    │
│     └─▶ Include sessionId in:                           │
│          - Header: x-admin-session                      │
│          - Query param: ?session=abc123xyz456           │
│                                                          │
│  5. Server validates sessionId                          │
│     │                                                    │
│     ├─▶ If valid: Allow access to admin endpoints      │
│     │                                                    │
│     └─▶ If invalid: Return 401 Unauthorized            │
│                                                          │
│  NOTE: Sessions stored in memory (lost on server restart)
│                                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 💻 How Everything Runs Together - Local Development

```
┌──────────────────────────────────────────────────────────┐
│  LOCAL DEVELOPMENT STARTUP                              │
│  (Running all servers on your computer)                │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  Command: .\scripts\start-clean.ps1                     │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Terminal Window 1: Firebase Emulators             │ │
│  │ Command: npm run emulators                        │ │
│  │ Status: ✅ Running                                │ │
│  │ Firestore UI: http://localhost:4005               │ │
│  │ ├─ Port 8080 → Firestore Database               │ │
│  │ ├─ Port 9099 → Auth Service                     │ │
│  │ └─ Port 9199 → Storage Service                  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Terminal Window 2: API Server                     │ │
│  │ Command: npm run start:api                        │ │
│  │ Status: ✅ Running                                │ │
│  │ Server: http://localhost:4000                     │ │
│  │ Processes:                                        │ │
│  │ ├─ Listen on port 4000                          │ │
│  │ ├─ Connect to database.sqlite                    │ │
│  │ ├─ Initialize Multer (file upload)               │ │
│  │ ├─ Setup Nodemailer (email)                      │ │
│  │ └─ Setup CORS (cross-origin requests)            │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Terminal Window 3: Client Server                  │ │
│  │ Command: npm run start:client                     │ │
│  │ Status: ✅ Running                                │ │
│  │ Server: http://localhost:3000                     │ │
│  │ Serves: public/index.html + app.js               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Terminal Window 4: Admin Server                   │ │
│  │ Command: npm run start:admin                      │ │
│  │ Status: ✅ Running                                │ │
│  │ Server: http://localhost:3001                     │ │
│  │ Serves: public/admin.html + admin.js              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  All running simultaneously!                             │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 Production Deployment (Railway)

```
┌──────────────────────────────────────────────────────────┐
│  CLOUD DEPLOYMENT ON RAILWAY                            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐ │
│  │ SOURCE (GitHub repo)                              │ │
│  │ https://github.com/nazimzenda/ecu-tuning          │ │
│  └────────────────────────────────────────────────────┘ │
│                        │                                 │
│                        ▼                                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ RAILWAY INFRASTRUCTURE (Cloud)                    │ │
│  │                                                    │ │
│  │ ┌──────────────────────────────────────────────┐ │ │
│  │ │ Docker Container with Node.js               │ │ │
│  │ │ ├─ npm install (dependencies)                │ │ │
│  │ │ ├─ npm run start:api (Port 4000 internal)   │ │ │
│  │ │ ├─ npm run start:client (Port 3000 internal)│ │ │
│  │ │ └─ npm run start:admin (Port 3001 internal) │ │ │
│  │ └──────────────────────────────────────────────┘ │ │
│  │                                                    │ │
│  │ ┌──────────────────────────────────────────────┐ │ │
│  │ │ Environment Variables (Encrypted)            │ │ │
│  │ │ ├─ ADMIN_PASSWORD = secure-password         │ │ │
│  │ │ ├─ USE_FIREBASE = 0 (SQLite)               │ │ │
│  │ │ ├─ EMAIL_SERVICE = gmail                    │ │ │
│  │ │ ├─ EMAIL_USER = your-email@gmail.com       │ │ │
│  │ │ └─ EMAIL_PASSWORD = app-password           │ │ │
│  │ └──────────────────────────────────────────────┘ │ │
│  │                                                    │ │
│  │ ┌──────────────────────────────────────────────┐ │ │
│  │ │ File Storage (Persistent Volume)             │ │ │
│  │ │ ├─ database.sqlite (persists)                │ │ │
│  │ │ ├─ uploads/ (persists)                       │ │ │
│  │ │ └─ uploads/modified/ (persists)              │ │ │
│  │ └──────────────────────────────────────────────┘ │ │
│  │                                                    │ │
│  │ ┌──────────────────────────────────────────────┐ │ │
│  │ │ Networking                                    │ │ │
│  │ │ ├─ Outbound: Gmail (SMTP)                    │ │ │
│  │ │ ├─ Outbound: Twilio (WhatsApp) - optional   │ │ │
│  │ │ └─ Inbound: HTTPS (SSL/TLS automatic)        │ │ │
│  │ └──────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────┘ │
│                                                           │
│  GitHub ◀─▶ Railway (Auto-deploy on push)              │
│  Every push to master branch = automatic deployment      │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 📊 Technology Stack Summary

```
┌──────────────────────────────────────────────────────────┐
│  TECHNOLOGY STACK                                        │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  FRONTEND (Client-Side)                                 │
│  ├─ HTML5 (public/index.html)                          │
│  ├─ CSS3 (public/styles.css)                           │
│  ├─ Vanilla JavaScript (public/app.js)                 │
│  └─ FormData API (file uploads)                        │
│                                                           │
│  BACKEND (Server-Side)                                 │
│  ├─ Node.js (v25+)                                    │
│  ├─ Express.js (web framework)                        │
│  ├─ Multer (file uploads)                             │
│  └─ CORS (cross-origin requests)                      │
│                                                           │
│  DATABASE OPTIONS                                       │
│  ├─ SQLite3 (default - local file)                    │
│  ├─ Firebase Firestore (optional - cloud)             │
│  └─ db/index.js (abstraction layer)                   │
│                                                           │
│  FILE STORAGE                                           │
│  ├─ Local filesystem (uploads/)                       │
│  ├─ Firebase Storage (optional)                       │
│  └─ Multer (file validation)                          │
│                                                           │
│  NOTIFICATIONS                                          │
│  ├─ Nodemailer (email via Gmail)                      │
│  ├─ Twilio (WhatsApp - optional)                      │
│  └─ Express (HTTP endpoints)                          │
│                                                           │
│  AUTHENTICATION                                         │
│  ├─ Session-based (in-memory)                         │
│  └─ Simple password check                             │
│                                                           │
│  DEPLOYMENT                                             │
│  ├─ Railway (recommended)                             │
│  ├─ Docker (containerization)                         │
│  ├─ Git/GitHub (version control)                      │
│  └─ npm (package management)                          │
│                                                           │
│  DEVELOPMENT TOOLS                                     │
│  ├─ PowerShell scripts (Windows automation)            │
│  ├─ Firebase Emulators (local testing)                │
│  ├─ npm scripts (start/test/deploy)                   │
│  └─ GitHub (repository)                              │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

## 🔄 Request/Response Lifecycle Example

### Example: Customer Uploads ECU File

```
┌─────────────────────────────────────────────────────────┐
│ BROWSER (Customer at http://localhost:3000)             │
│                                                          │
│ Form Submitted:                                         │
│ {                                                       │
│   "customerName": "John Doe",                          │
│   "customerEmail": "john@example.com",                 │
│   "customerPhone": "+212 5XX XXX XXX",                 │
│   "vehicleMake": "BMW",                                │
│   "vehicleModel": "M340i",                             │
│   "vehicleYear": "2020",                               │
│   "vehicleEngine": "3.0L Twin-Turbo",                 │
│   "serviceType": "DPF Delete",                         │
│   "customDescription": "Remove DTC codes",             │
│   "file": <binary file data>                          │
│ }                                                       │
└────────────────────┬────────────────────────────────────┘
                     │ POST /api/orders
                     │ (multipart/form-data)
                     ▼
┌─────────────────────────────────────────────────────────┐
│ API SERVER (Port 4000)                                  │
│                                                          │
│ 1. Multer middleware:                                  │
│    ├─ Check: File extension in [.bin, .hex, ...]? ✓  │
│    ├─ Check: File size < 50MB? ✓                      │
│    └─ Save: uploads/010_John_M340i.bin (45 MB)       │
│                                                          │
│ 2. Create database record:                            │
│    database.js → createOrder({                        │
│      id: "010",                                        │
│      customerName: "John Doe",                        │
│      customerEmail: "john@example.com",               │
│      ...                                               │
│      originalFile: "010_John_M340i.bin",             │
│      status: "PENDING"                                │
│    })                                                  │
│                                                          │
│ 3. Send notifications:                                │
│    ├─ Nodemailer → Gmail                             │
│    │  To: john@example.com                           │
│    │  Subject: "Your ECU File Uploaded"              │
│    │  Body: "Order #010, tracking link..."           │
│    │                                                   │
│    └─ Twilio → WhatsApp (if configured)              │
│       To: +212 5XX XXX XXX                           │
│       Message: "Order #010 received!"                │
│                                                          │
│ 4. Return response:                                   │
└────────────────────┬────────────────────────────────────┘
                     │ 200 OK
                     │ {
                     │   "status": "success",
                     │   "orderId": "010",
                     │   "message": "File uploaded successfully"
                     │ }
                     ▼
┌─────────────────────────────────────────────────────────┐
│ BROWSER (Customer)                                      │
│                                                          │
│ JavaScript (app.js):                                   │
│ - Parse response                                       │
│ - Extract orderId: "010"                              │
│ - Display: "Success! Your Order ID is: 010"          │
│ - Offer: "Download confirmation email"               │
│ - Suggest: "Check your email & WhatsApp"             │
│                                                          │
│ DATABASE (SQLite):                                    │
│ - Order record saved                                 │
│ - Can retrieve with GET /api/orders/010             │
│                                                          │
│ FILE STORAGE:                                         │
│ - Original file: uploads/010_John_M340i.bin         │
│ - Ready for admin to download & process             │
└─────────────────────────────────────────────────────────┘
```

---

## 🎯 Key Takeaways

| Component | Purpose | Technology | Location |
|-----------|---------|-----------|----------|
| **Client Portal** | Customer uploads files | HTML/CSS/JS | Port 3000 |
| **Admin Panel** | Manage orders & files | HTML/CSS/JS | Port 3001 |
| **API Server** | Process requests | Node.js/Express | Port 4000 |
| **Database** | Store orders | SQLite or Firestore | database.sqlite |
| **File Storage** | Store ECU files | Local filesystem | uploads/ |
| **Notifications** | Notify customers | Gmail + Twilio | Email/WhatsApp |
| **Authentication** | Admin login | Session-based | In-memory |
| **Deployment** | Production hosting | Railway + Docker | Cloud |

---

## 🚀 Performance Metrics

```
┌──────────────────────────────────────────────────────────┐
│ EXPECTED PERFORMANCE (Local Development)               │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ File Upload (50MB):        3-10 seconds                 │
│ Create Order:              50-100ms                     │
│ Send Email:                1-3 seconds (async)          │
│ Send WhatsApp:             2-5 seconds (async)          │
│ Get All Orders:            10-50ms (depends on count)   │
│ Download File (50MB):      5-15 seconds                 │
│ Admin Login:               100-200ms                    │
│                                                           │
│ EXPECTED PERFORMANCE (Production - Railway)            │
├──────────────────────────────────────────────────────────┤
│                                                           │
│ File Upload (50MB):        5-15 seconds                 │
│ Create Order:              100-200ms                    │
│ Send Email:                2-5 seconds (async)          │
│ API Response Time:         100-300ms                    │
│ Database Query:            10-50ms                      │
│                                                           │
└──────────────────────────────────────────────────────────┘
```

---

**Version**: 2.0.0  
**Last Updated**: December 6, 2025  
**Designed for**: ECU Tuning Pro Service
