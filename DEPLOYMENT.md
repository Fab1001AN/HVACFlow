# HVACFlow — Deployment Guide

This covers running HVACFlow properly for real use, as opposed to development.

---

## Development vs production — which file do I run?

| File                     | What it does                              | Use it for              |
| ------------------------ | ----------------------------------------- | ----------------------- |
| `start.bat`              | Development server                        | Testing changes         |
| `build-production.bat`   | Compiles an optimised build (a few mins)  | Once after install/update |
| `start-production.bat`   | Runs the compiled build                   | **Real day-to-day use** |

**Use the production files for anything real.** The development server
recompiles constantly, uses far more memory, is noticeably slower, and exposes
development tooling. It exists to help write code, not to run a business.

---

## First-time setup

1. **Install Docker Desktop** and make sure it starts with Windows.
2. **Run `start.bat` once.** This creates the `.env` file, starts the database
   and sets up initial data. Confirm you can log in.
3. **Decide how staff will reach the system** — see the next section. This
   matters *before* you build.
4. **Run `build-production.bat`.** Takes a few minutes.
5. **Run `start-production.bat`.** This is what you use from now on.

Default login: `admin@hvacflow.com` / `Admin@HVACFlow1`
**Change this password immediately** (sign in, then use the key icon beside
Sign out).

---

## Will other computers use HVACFlow? Read this before building

The web address of the API is **compiled into** the build. Getting this wrong
is the most common deployment mistake.

### Only this computer will use it

Leave `.env` as it is. `localhost` is correct. Build and go.

### Other computers on the office network will use it

You must set the server's address **before** building:

1. Find this machine's IP: open Command Prompt, type `ipconfig`, look for
   `IPv4 Address` (e.g. `192.168.1.50`).
2. Open **`apps\web\.env.local`** in Notepad and change these two lines to
   that address:

   ```
   NEXT_PUBLIC_API_URL=http://192.168.1.50:4000/api/v1
   NEXT_PUBLIC_WS_URL=http://192.168.1.50:4000
   ```

   (This is the file Next.js reads — not the `.env` in the main folder.)

3. Run `build-production.bat` again.

Staff then open `http://192.168.1.50:3000` in their browser.

**If you skip this**, other computers get a blank or broken screen — their
browser looks for the API on *their own* machine, where nothing is running.

A fixed IP is strongly recommended for the server (ask whoever manages your
network to reserve one), otherwise the address can change on reboot and
everyone loses access until you rebuild.

Windows Firewall will likely prompt on first run — allow HVACFlow on
**private networks** so other computers can connect.

---

## Updating to a new version

1. Tell staff to sign out.
2. Close the `start-production.bat` window.
3. **Take a backup** — run `backup.bat` (see `BACKUP.md`). Do not skip this.
4. Get the new code (`git pull`, or however you receive updates).
5. Run `npm.cmd install` — updates may add new components.
6. Run `build-production.bat`.
7. Run `start-production.bat`. Database updates apply automatically at startup.

If startup fails after an update, your data has not been altered — restore the
backup from step 3 and check the error message.

---

## Keeping it running

`start-production.bat` must stay open — closing the window stops HVACFlow.

For a machine that acts as the office server:

- **Set Windows to never sleep.** Settings → System → Power → Screen and
  sleep → set sleep to *Never* when plugged in. A sleeping server means
  nobody can work.
- **Start automatically after a reboot:** press `Win + R`, type
  `shell:startup`, press Enter, and put a shortcut to `start-production.bat`
  in that folder. Docker Desktop must also be set to start with Windows
  (Docker Desktop → Settings → General → *Start Docker Desktop when you sign
  in*).
- For a more robust setup that survives sign-out and restarts unattended,
  a tool such as NSSM can run it as a proper Windows service. Worth doing if
  the shop depends on it daily.

---

## Everyday checklist

| Task                     | How                                        |
| ------------------------ | ------------------------------------------ |
| Start the system         | `start-production.bat`                     |
| Stop the system          | Close that window                          |
| Back up data             | `backup.bat` (schedule it — see BACKUP.md) |
| Restore data             | `restore.bat`                              |
| Apply an update          | See "Updating" above                       |
| Clear test units         | `npm.cmd run db:clear-units`               |

---

## Troubleshooting

**"No production build found"**
Run `build-production.bat` first.

**"Docker Desktop does not appear to be running"**
Open Docker Desktop and wait for the whale icon to stop animating.

**Other computers show a blank screen**
The API address was not set before building — see the network section above,
fix `apps\web\.env.local`, and rebuild.

**Everything is slow**
You are probably running `start.bat` (development) instead of
`start-production.bat`.

**Port already in use**
Something else is using port 3000 or 4000, or a previous HVACFlow window is
still open. Close it and retry.
