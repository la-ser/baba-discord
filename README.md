# Baba Cyborg - Discord Activity Server

Production deployment repository for the Baba Cyborg Discord Voice Channel Activity.

Contains the pre-built client (`dist/`) and the Node.js Socket.IO server (`server.cjs`).

---

## Requirements

- Node.js 20.x or 22.x
- npm or pnpm
- (Optional) PM2 for process management

---

## Server Setup & Deployment

### 1. Clone the repository
```bash
git clone https://github.com/la-ser/baba-discord.git
cd baba-discord
```

### 2. Install production dependencies
```bash
npm install --omit=dev
```

### 3. Configure environment variables
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```
Fill in your credentials:
```env
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_CLIENT_SECRET=your_discord_client_secret
PORT=8080
```

### 4. Run the server

#### Direct execution:
```bash
npm start
```

#### With PM2 (Recommended for servers):
```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

---

## Updating the Server

When updates are pushed to this repo, update your server with:
```bash
git pull
npm install --omit=dev
pm2 restart baba-discord
```

---

## Health Check

Check that the server is running and responding:
```bash
curl http://localhost:8080/health
# Output: {"ok":true,"players":0}
```
