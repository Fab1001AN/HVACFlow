# HVACFlow — Windows Installation Guide

Follow every step in exact order.
Do not skip ahead. Each step depends on the one before it.
If you see an error at any point, stop and paste the error message for help.

---

## PART 1 — Install Required Software

You need four programs. Check if you already have each one before installing.

---

### 1.1 Node.js 22 LTS

**Check if already installed:**
Open Command Prompt (press Win+R, type `cmd`, press Enter) and run:
```
node --version
```
If you see `v22.x.x` — skip to step 1.2.
If you see an older version or "not recognized" — install it.

**Install:**
1. Go to https://nodejs.org
2. Download the **LTS** version (left button — currently 22.x)
3. Run the installer
4. On the "Tools for Native Modules" screen — check **"Automatically install the necessary tools"**
5. Click through all defaults
6. When the installer finishes, a black PowerShell window may open and run for several minutes — let it complete
7. **Close and reopen** Command Prompt after install

**Verify:**
```
node --version
npm --version
```
You should see `v22.x.x` and `10.x.x` or higher.

---

### 1.2 Docker Desktop

**Check if already installed:**
```
docker --version
```
If you see `Docker version 27.x.x` — skip to step 1.3.

**Install:**
1. Go to https://www.docker.com/products/docker-desktop
2. Click **"Download for Windows"**
3. Run the installer — accept all defaults
4. Restart your computer when prompted
5. After restart, Docker Desktop will open automatically — wait for the whale icon in the taskbar system tray to stop animating (it turns solid white when ready)

**Verify:**
```
docker --version
docker-compose --version
```

> **Important:** Docker Desktop must be running (whale icon in taskbar) every time you work with HVACFlow. If the icon is not there, search for "Docker Desktop" in the Start menu and launch it.

---

### 1.3 Git

**Check if already installed:**
```
git --version
```
If you see `git version 2.x.x` — skip to step 1.4.

**Install:**
1. Go to https://git-scm.com/download/win
2. Download the 64-bit installer
3. Run it — accept all defaults (you can leave every option as-is)

---

### 1.4 Visual Studio Code

**Install:**
1. Go to https://code.visualstudio.com
2. Download and install — accept all defaults
3. On the "Select Additional Tasks" screen — check **"Add to PATH"**

**Recommended extensions (install after VS Code opens):**
- **Prisma** (by Prisma) — schema syntax highlighting
- **ESLint** (by Microsoft)
- **Prettier** (by Prettier)
- **GitLens** (by GitKraken) — optional but useful

---

## PART 2 — Extract and Open the Project

### 2.1 Extract the archive

1. Create a folder where you want to keep the project. Recommended:
   ```
   C:\Projects\
   ```
2. Copy `hvacflow-final.tar.gz` into `C:\Projects\`
3. Right-click the file → **Extract All** won't work for `.tar.gz` on Windows

   Use one of these methods:

   **Option A — Using Git Bash** (installed with Git):
   - Right-click inside `C:\Projects\` → **Git Bash Here**
   - Run:
     ```bash
     tar -xzf hvacflow-final.tar.gz
     ```

   **Option B — Using Windows PowerShell**:
   - Open PowerShell in `C:\Projects\` (Shift+right-click → Open PowerShell)
   - Run:
     ```powershell
     tar -xzf hvacflow-final.tar.gz
     ```

   Either way, you should now have a folder: `C:\Projects\hvacflow\`

### 2.2 Open in Visual Studio Code

In the same terminal, run:
```
code hvacflow
```

Or manually: Open VS Code → File → Open Folder → select `C:\Projects\hvacflow`

You should see the project tree on the left with folders: `apps`, `packages`, `prisma`.

---

## PART 3 — Create Environment Files

You need three `.env` files. The project ships with `.example` templates.

Open the **VS Code integrated terminal**: press `` Ctrl+` `` (backtick key, top-left of keyboard)

Make sure the terminal shows `C:\Projects\hvacflow>` as the path.

### 3.1 Root .env

```powershell
copy .env.example .env
```

Now open `.env` in VS Code and replace the placeholder secrets with real ones.

**Generate two secrets** — run this twice, copy each output:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Edit `.env` so it looks like this (use your generated values):
```
POSTGRES_USER=hvacflow
POSTGRES_PASSWORD=HVACFlow2024!
POSTGRES_DB=hvacflow
POSTGRES_PORT=5432
DATABASE_URL="postgresql://hvacflow:HVACFlow2024!@localhost:5432/hvacflow?schema=public"

REDIS_URL="redis://localhost:6379"

API_PORT=4000
API_PREFIX=api/v1
NODE_ENV=development

JWT_ACCESS_SECRET=PASTE_YOUR_FIRST_64_CHAR_SECRET_HERE
JWT_REFRESH_SECRET=PASTE_YOUR_SECOND_64_CHAR_SECRET_HERE
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

> The password `HVACFlow2024!` is just an example. Use anything you like.
> The DATABASE_URL password must match POSTGRES_PASSWORD exactly.

Save the file (Ctrl+S).

### 3.2 API .env

```powershell
copy apps\api\.env.example apps\api\.env
```

Open `apps\api\.env` and set the same DATABASE_URL and JWT secrets you used above:
```
NODE_ENV=development
API_PORT=4000
API_PREFIX=api/v1
DATABASE_URL="postgresql://hvacflow:HVACFlow2024!@localhost:5432/hvacflow?schema=public"
JWT_ACCESS_SECRET=PASTE_YOUR_FIRST_64_CHAR_SECRET_HERE
JWT_REFRESH_SECRET=PASTE_YOUR_SECOND_64_CHAR_SECRET_HERE
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

Save.

### 3.3 Web .env.local

```powershell
copy apps\web\.env.local.example apps\web\.env.local
```

This file is already correct — no changes needed.

---

## PART 4 — Install Dependencies

In the VS Code terminal (still in `C:\Projects\hvacflow`):

```powershell
npm install
```

This installs packages for all three workspaces (root, api, web) at once.
It will take 2–5 minutes depending on your internet speed.

You will see warnings — these are normal. Only errors (in red) matter.

**Expected end of output:**
```
added XXXX packages ...
```

---

## PART 5 — Start PostgreSQL

### 5.1 Make sure Docker Desktop is running
Check that the whale icon is in your taskbar system tray. If not, start Docker Desktop from the Start menu and wait for it to be ready.

### 5.2 Start the database

In the VS Code terminal:
```powershell
docker-compose up -d postgres
```

**Expected output:**
```
[+] Running 2/2
 ✔ Network hvacflow_default  Created
 ✔ Container hvacflow_postgres  Started
```

### 5.3 Verify the database is running
```powershell
docker-compose ps
```

**Expected output:**
```
NAME                  IMAGE                STATUS         PORTS
hvacflow_postgres     postgres:16-alpine   running        0.0.0.0:5432->5432/tcp
```

The status must say **running**. If it says `exited`, check your `.env` file — the POSTGRES_PASSWORD may have a special character that needs quoting.

---

## PART 6 — Set Up the Database

### 6.1 Generate Prisma Client
```powershell
npm run db:generate
```

**Expected output:**
```
✔ Generated Prisma Client (v6.x.x)
```

### 6.2 Run Migrations
```powershell
npm run db:migrate
```

You will be prompted to name the migration. Type:
```
init
```
Press Enter.

**Expected output:**
```
Applying migration `20241201000000_init`
Database migrated successfully.
```

### 6.3 Seed the Database
```powershell
npm run db:seed
```

This creates all the default configuration: departments, processes, roles, permissions, priorities, and the admin user.

**Expected output:**
```
🌱 Starting HVACFlow seed...

Creating permissions...
Creating roles...
Creating priority levels...
Creating departments...
Creating process definitions...
Creating unit types...
Creating part types...
Creating unit type compositions...
Creating process routes...
Creating checklist templates...
Creating default admin user...
Creating default dashboard configurations...

✅ Seed complete!
   Admin login: admin@hvacflow.com / Admin@HVACFlow1
   Change the admin password immediately in production.
```

---

## PART 7 — Start the Application

You need **two terminals running at the same time** — one for the API, one for the web.

### 7.1 Open a second terminal
In VS Code: click the **+** icon in the terminal panel to open a second terminal.

### 7.2 Start the API (Terminal 1)

In your **first terminal**:
```powershell
cd apps\api
npm run dev
```

Wait for this output before continuing:
```
🚀 HVACFlow API running on http://localhost:4000/api/v1
📖 Swagger: http://localhost:4000/api/v1/docs
LOG [NestApplication] Nest application successfully started
```

This takes about 10–15 seconds on first run.

### 7.3 Start the Frontend (Terminal 2)

In your **second terminal**:
```powershell
cd apps\web
npm run dev
```

Wait for this output:
```
▲ Next.js 15.x.x
- Local:   http://localhost:3000
- Ready in Xs
```

---

## PART 8 — Verify Everything is Working

### 8.1 Test the API
Open your browser and go to:
```
http://localhost:4000/api/v1/docs
```
You should see the Swagger documentation page with all API endpoints listed.

### 8.2 Test the Frontend
Open your browser and go to:
```
http://localhost:3000
```
You should be redirected to the login page.

### 8.3 Log In
- Email: `admin@hvacflow.com`
- Password: `Admin@HVACFlow1`

Click **Sign In**.

### 8.4 Verify Mission Control loads
After login you should see the **Mission Control** screen with Kanban columns for each department (Fabrication, Foaming, Assembly, Electrical, Painting, Quality Assurance, Logistics).

The columns will be empty — this is correct. No production tasks exist yet because no units have been created.

### 8.5 Verify configuration loaded correctly
Click **Configuration → Departments** in the sidebar.
You should see 7 departments listed with colored dots.

Click **Configuration → Processes**.
You should see 10 process definitions grouped by department.

Click **Configuration → Priority Levels**.
You should see Low, Normal, High, Urgent listed.

---

## PART 9 — Create a Test Unit (End-to-End Smoke Test)

This confirms the entire system is working — database, API, task engine, and real-time updates.

1. **Go to Customers** → click **New Customer**
   - Name: `Test Customer`
   - Code: `TEST`
   - Click **Create Customer**

2. **Click on Test Customer** → click **New Project**
   - Name: `Test Project`
   - Code: `PROJ-001`
   - Click **Create Project**

3. **Click on Test Project** → click **New Order**
   - Order Number: `ORD-001`
   - Priority: `Normal`
   - Click **Create Order**

4. **Click Confirm** on the order to move it from Draft → Confirmed.

5. **Click on ORD-001** → click **New Unit**
   - Unit Type: `Rooftop Package Unit`
   - Serial Number: `HU-0001`
   - Click **Create Unit**

6. **Go back to Mission Control** (click it in the sidebar).

You should now see task cards appearing in the Kanban columns (Fabrication, Foaming, Assembly, etc.). These were automatically generated from the process routes configured in the seed data.

**If task cards appear on Mission Control → the system is fully working.**

---

## Stopping and Restarting

### To stop the application
Press `Ctrl+C` in both terminals (API and web).

### To stop the database
```powershell
docker-compose down
```

### To start again next time
Make sure Docker Desktop is running, then:

**Terminal 1:**
```powershell
docker-compose up -d postgres
cd apps\api
npm run dev
```

**Terminal 2:**
```powershell
cd apps\web
npm run dev
```

---

## Common Errors and Solutions

### Error: `EADDRINUSE: address already in use :::4000`
Port 4000 is in use by another process.
```powershell
netstat -ano | findstr :4000
taskkill /PID <PID_NUMBER> /F
```

### Error: `EADDRINUSE: address already in use :::3000`
Port 3000 is in use.
```powershell
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F
```

### Error: `Can't reach database server at localhost:5432`
The PostgreSQL container is not running.
```powershell
docker-compose up -d postgres
docker-compose ps
```

### Error: `P1001: Can't reach database server`
Check that your `DATABASE_URL` in `apps\api\.env` has the correct password matching your `docker-compose.yml` POSTGRES_PASSWORD.

### Error: `Cannot find module '@hvacflow/shared-types'`
Run from the project root:
```powershell
npm install
npm run db:generate
```

### Error: `Cannot find module 'bcrypt'` during seed
Run from the project root:
```powershell
npm install
```
Then retry `npm run db:seed`.

### Error: `nest: not found` or `next: not found`
You are not in the correct directory. The API must be started from `apps\api` and the web from `apps\web`. Or run from the project root with `npm run dev` (runs both via Turborepo).

### Docker Desktop not starting
Make sure Windows Subsystem for Linux 2 (WSL2) is enabled:
```powershell
wsl --install
```
Restart and try again.

### Seed fails with `already exists` error
The database was already seeded. This is fine — your data is there. Skip seeding.
If you want a fresh start:
```powershell
npm run db:reset
```
> Warning: this deletes all data.
