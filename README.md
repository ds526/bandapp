# BandList

A small app for your band: submit songs, vote 1–5, rank by average score, and
track key/tempo/time signature plus when each song was actually learned.

Built deliberately simple so it doubles as a Node/Express learning project:
- **Backend:** Node.js + Express, plain REST API, no framework magic
- **Database:** SQLite via `better-sqlite3` — a single file, no server to run
- **Frontend:** Vanilla HTML/CSS/JS — no build step, no bundler, view source
  and it's all readable

## Project structure

```
bandapp/
  server/
    index.js         Express app entrypoint
    db/
      index.js        opens the SQLite file, runs schema.sql on boot
      schema.sql       table definitions
    routes/
      songs.js         CRUD + ranking logic
      members.js        band roster
      votes.js          cast/update a vote (upsert)
  public/
    index.html         single page shell, four tabs
    styles.css
    app.js             all frontend logic, talks to the API with fetch()
  data/                 created automatically, holds bandlist.db (gitignored)
  ecosystem.config.js    PM2 process config for deployment
  deploy/nginx.conf.example
```

## Running it locally

```bash
npm install
npm start
```

Then open http://localhost:3000. The SQLite file is created automatically at
`data/bandlist.db` on first run — nothing to configure.

For development with auto-restart on file changes:
```bash
npm run dev
```

### First steps in the app
1. Go to the **Members** tab and add your band members.
2. Pick yourself from the "Voting as" dropdown in the top bar.
3. Submit a song or two, then click into one and vote.
4. The **Rankings** tab sorts by average score — highest first, ties broken
   by vote count, then by submission date.

## Accounts and login

Each member has a real password now - no more picking a name from a
dropdown and voting as whoever. Sessions are opaque tokens stored server-
side in a `sessions` table and referenced by an `httpOnly` cookie, so
there's nothing for the client to forge. Every API route except
`/api/auth/*` requires a valid session, and vote/song attribution always
comes from that session, never from anything the client sends - so one
member genuinely cannot vote as, or overwrite, another.

**If you already had band members set up from before this change:** those
names exist but have no password yet. Have each person go to **Sign up**
and enter their exact existing name plus a new password - this "claims"
the existing account (and any votes/songs already attached to it) rather
than creating a duplicate. This only works once per name; after a password
is set, that name has to log in normally.

## How the data model works

- `songs.status` moves through `proposed → learning → learned` (or
  `shelved` if you drop it). The rankings view defaults to showing
  `proposed` songs — the ones actually up for a vote.
- `votes` has a unique constraint on `(song_id, member_id)`, so casting a
  new vote for a song you already voted on **replaces** your old score
  instead of adding a duplicate.
- Marking a song `learned` automatically stamps `date_learned` with the
  current time if you don't set one explicitly (see `PATCH /api/songs/:id`
  in `server/routes/songs.js`).

## API reference

All endpoints are under `/api`. Bodies and responses are JSON.

All routes below except `/api/auth/*` require a session cookie (see
"Accounts and login" above) - an unauthenticated request gets a 401.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | Create an account, or claim an existing name that has no password yet. Body: `name`, `password` (min 6 chars). Sets the session cookie. |
| POST | `/api/auth/login` | Log in. Body: `name`, `password`. Sets the session cookie. |
| POST | `/api/auth/logout` | Clear the current session. |
| GET | `/api/auth/me` | Who the current session cookie belongs to. 401 if not logged in. |
| GET | `/api/songs?status=proposed` | List songs, ranked by avg vote. `status` optional. |
| GET | `/api/songs/:id` | One song plus its individual votes. |
| POST | `/api/songs` | Submit a song. Body: `title` (required), `artist`, `song_key`, `time_signature`, `tempo_bpm`, `notes`. `submitted_by` is taken from your session, not the body. |
| PATCH | `/api/songs/:id` | Edit metadata or change `status`. |
| DELETE | `/api/songs/:id` | Remove a song. |
| GET | `/api/members` | List band members (names only). |
| POST | `/api/votes` | Cast/update your own vote. Body: `song_id`, `score` (1–5). `member_id` is taken from your session. |
| DELETE | `/api/votes/:id` | Retract your own vote (rejected if it isn't yours). |

## Running it in a container

```bash
docker compose up --build
```

Then open http://localhost:3000. This builds the image, starts the
container, and bind-mounts `./data` on your host to `/app/data` in the
container so `bandlist.db` survives rebuilds. Stop with `Ctrl+C`, or
`docker compose down` to remove the container (the `./data` folder stays).

To run it without compose:
```bash
docker build -t bandlist .
docker run -d --name bandlist -p 3000:3000 -v "$(pwd)/data:/app/data" bandlist
```

### Why the Dockerfile has two stages
`better-sqlite3` is a native module - it compiles a small C++ binding
against Node during `npm install`. The `deps` stage installs `python3`,
`make`, and `g++` to build it, then the final image copies over just the
built `node_modules` folder and drops those build tools entirely. That
keeps the shipped image smaller and avoids a C++ toolchain sitting in your
production container for no reason.

### Notes
- **Data persistence**: the container itself is disposable - all state
  lives in the mounted `data/` folder. Back that up the same way as the
  non-containerized setup (see the backup command further down).
- **Logs**: `docker compose logs -f bandlist` (or `docker logs -f bandlist`
  without compose).
- **Rebuilding after a code change**: `docker compose up --build` again -
  Docker will reuse cached layers where nothing changed.
- **Env vars**: `PORT` and `DB_PATH` are both configurable via
  `environment:` in `docker-compose.yml` if you need to change them.

## Deploying to AWS (EC2 free tier)

You can deploy this either the "bare" way (Node + PM2 directly on the
instance, described below) or by installing Docker on the instance and
running `docker compose up -d` there instead of steps 3-4 below. Bare
Node/PM2 is a bit lighter for a single `t3.micro`; Docker is nice if you
want the exact same environment locally and in prod, or plan to run other
containers alongside this one. Both sit behind the same Nginx config either
way - the reverse proxy doesn't care whether port 3000 is a bare process or
a container.

This app is light enough to run comfortably on a `t2.micro`/`t3.micro`
free-tier instance. No RDS, no load balancer — just Node behind Nginx.

1. **Launch an EC2 instance**
   - Ubuntu 22.04 LTS, `t3.micro` (or `t2.micro` if that's what your free
     tier offers), in a VPC with a public IP.
   - Security group: allow inbound 22 (SSH, ideally locked to your IP),
     80, and 443.

2. **Install Node and PM2 on the instance**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs nginx
   sudo npm install -g pm2
   ```

3. **Ship the code**
   ```bash
   # from your machine
   scp -r bandapp ubuntu@<your-ec2-ip>:~/bandapp
   # on the instance
   cd ~/bandapp
   npm install --production
   ```

4. **Start it with PM2**
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup   # follow the printed instructions to run PM2 on boot
   ```

5. **Put Nginx in front of it**
   - Copy `deploy/nginx.conf.example` to
     `/etc/nginx/sites-available/bandlist`, edit `server_name` to your
     domain (or the instance's public DNS if you don't have one yet).
     ```bash
     sudo ln -s /etc/nginx/sites-available/bandlist /etc/nginx/sites-enabled/
     sudo nginx -t && sudo systemctl reload nginx
     ```

6. **HTTPS with Let's Encrypt** (once you have a domain pointed at the
   instance)
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.example.com
   ```

7. **Back up the database occasionally** — it's one file:
   ```bash
   scp ubuntu@<your-ec2-ip>:~/bandapp/data/bandlist.db ./bandlist-backup.db
   ```

### Updating after a code change
```bash
scp -r bandapp/server bandapp/public bandapp/package.json ubuntu@<ip>:~/bandapp/
ssh ubuntu@<ip> "cd ~/bandapp && npm install --production && pm2 restart bandlist"
```

## Ideas for later (didn't build these to keep v1 lean)
- Removing a member account currently has to be done directly against the
  SQLite file (`DELETE FROM members WHERE name = '...'`) - there's no admin
  role or UI for it yet.
- A "your votes" filter so a member can see what they haven't scored yet.
- CSV export of the learned archive for setlist printing.
- Password reset (there's no email/SMS in this app, so "forgot password"
  currently means asking you to reset their `password_hash` directly in
  the database).
