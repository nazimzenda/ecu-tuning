# ECU Tuning Service - Web Application

A professional web application for ECU file modification services. Clients can upload their ECU files, select services, and download modified files. Admins can manage orders through a dedicated admin panel.

## Features

- **File Upload**: Support for .bin, .hex, .ori, .winols, .dam files
- **Service Selection**: DPF Removal, EGR Delete, DTC Removal, Stage 1 Tune, etc.
- **Order Management**: Admin panel for managing all orders
- **File Download**: Download original and modified files
- **Status Tracking**: Track order status (pending, processing, completed)
- **Modern UI**: Gray, black, and yellow theme with responsive design

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

3. Open your browser:
- Client Interface: http://localhost:3000
- Admin Panel: http://localhost:3000/admin

## Project Structure

```
myapp/
├── server.js          # Express server and API routes
├── database.js        # SQLite database operations
├── package.json       # Dependencies
├── public/            # Frontend files
│   ├── index.html     # Client upload page
│   ├── admin.html     # Admin panel
│   ├── styles.css     # Styling
│   ├── app.js         # Client-side JavaScript
│   └── admin.js       # Admin panel JavaScript
└── uploads/           # Uploaded files (created automatically)
    └── modified/      # Modified files
```

## API Endpoints

- `POST /api/orders` - Create new order (file upload)
- `GET /api/orders` - Get all orders
- `GET /api/orders/:id` - Get single order
- `PUT /api/orders/:id/status` - Update order status
- `POST /api/orders/:id/modified` - Upload modified file
- `GET /api/orders/:id/download/original` - Download original file
- `GET /api/orders/:id/download/modified` - Download modified file
- `DELETE /api/orders/:id` - Delete order

## Services Available

1. **DPF/FPF Delete** - Remove particulate filter
2. **EGR Delete** - Disable exhaust gas recirculation
3. **DTC Removal** - Delete fault codes
4. **AdBlue/SCR Delete** - Remove urea system
5. **VMAX Remove** - Delete speed limiter
6. **Stage 1 Tune** - Performance upgrade
7. **Custom** - Custom modifications

## Database

Uses SQLite for simplicity. Database file is created automatically on first run.

## File Storage

- Original files: `uploads/`
- Modified files: `uploads/modified/`

## Security Notes

This is a basic implementation. For production use, consider:
- User authentication
- File size limits
- Virus scanning
- Rate limiting
- HTTPS
- Input validation
- SQL injection prevention (already using parameterized queries)

## License

ISC

