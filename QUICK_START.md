# Quick Start Guide

## PowerShell Execution Policy Issue - SOLVED! ✅

If you get the error: "running scripts is disabled on this system"

### Solution 1: Use npm.cmd (Recommended)
Instead of `npm`, use `npm.cmd`:
```powershell
npm.cmd install
npm.cmd start
npm.cmd run dev
```

### Solution 2: Use the helper script
```powershell
.\npm.ps1 install
.\npm.ps1 start
```

### Solution 3: Use Command Prompt (cmd.exe)
Open Command Prompt instead of PowerShell:
```cmd
npm install
npm start
```

## Running the Application

1. **Install dependencies** (if not already done):
   ```powershell
   npm.cmd install
   ```

2. **Start the server**:
   ```powershell
   npm.cmd start
   ```

3. **Open in browser**:
   - Client Interface: http://localhost:3000
   - Admin Panel: http://localhost:3000/admin

4. **For development** (auto-reload on changes):
   ```powershell
   npm.cmd run dev
   ```

## Server Status

The server is currently running in the background. You can:
- Access it at http://localhost:3000
- Stop it by closing the terminal or pressing Ctrl+C
- Restart it with `npm.cmd start`

## Notes

- The database (database.sqlite) is created automatically
- Uploaded files are stored in the `uploads/` directory
- Modified files are stored in `uploads/modified/`

