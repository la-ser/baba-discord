const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env"), override: true });
const express = require("express"),
  http = require("http");
const { Server } = require("socket.io");
const { createScaledMask } = require("./collision-masks.cjs");
const app = express(),
  server = http.createServer(app),
  io = new Server(server);
const PORT = Number(process.env.PORT || 8080),
  WIDTH = 2400,
  HEIGHT = 1350,
  BULLET_SPEED = 520,
  BULLET_RADIUS = 5,
  BULLET_LIFETIME = 1800,
  SHOT_COOLDOWN = 320,
  MINIGUN_COOLDOWN = 70,
  MAX_HEALTH = 10,
  SPAWN_PROTECTION = 5000,
  DASH_COOLDOWN = 2500,
  DASH_DURATION = 220,
  DASH_PEAK_SPEED = 1250,
  PARRY_COOLDOWN = 4500,
  PARRY_DURATION = 700,
  PARRY_PADDING = 18;
const CHARACTER_STATS = {
  granny: { width: 34, height: 36, speed: 255, damage: 1 },
  cyborg: { width: 91, height: 108, speed: 175, damage: 2.25 },
};
const CHARACTER_MASKS = Object.fromEntries(
  Object.entries(CHARACTER_STATS).map(([character, stats]) => [
    character,
    createScaledMask(
      path.join(__dirname, "TEMP", `${character}.png`),
      stats.width,
      stats.height,
    ),
  ]),
);
const players = new Map(),
  rooms = new Map(),
  roomScores = new Map();
const bullets = [];
let nextBulletId = 1;
const characterDimensions = (character) =>
  CHARACTER_STATS[character] || CHARACTER_STATS.granny;
const characterRadius = (character) => {
  const dimensions = characterDimensions(character);
  return Math.hypot(dimensions.width, dimensions.height) / 2;
};
const randomPosition = (character) => {
  const radius = characterRadius(character);
  return {
    x: radius + Math.random() * (WIDTH - radius * 2),
    y: radius + Math.random() * (HEIGHT - radius * 2),
  };
};
function circleTouchesMask(mask, player, circleX, circleY, radius) {
  const left = player.x - mask.width / 2;
  const top = player.y - mask.height / 2;

  const tightLeft = left + (mask.minX ?? 0);
  const tightRight = left + (mask.maxX ?? mask.width - 1) + 1;
  const tightTop = top + (mask.minY ?? 0);
  const tightBottom = top + (mask.maxY ?? mask.height - 1) + 1;

  if (
    circleX + radius < tightLeft ||
    circleX - radius > tightRight ||
    circleY + radius < tightTop ||
    circleY - radius > tightBottom
  ) {
    return false;
  }

  const minimumX = Math.max(0, Math.floor(circleX - radius - left));
  const maximumX = Math.min(mask.width - 1, Math.ceil(circleX + radius - left));
  const minimumY = Math.max(0, Math.floor(circleY - radius - top));
  const maximumY = Math.min(mask.height - 1, Math.ceil(circleY + radius - top));
  const radiusSq = radius * radius;

  for (let pixelY = minimumY; pixelY <= maximumY; pixelY += 1) {
    const rowOffset = pixelY * mask.width;
    for (let pixelX = minimumX; pixelX <= maximumX; pixelX += 1) {
      if (!mask.solid[rowOffset + pixelX]) continue;
      const nearestX = clamp(circleX, left + pixelX, left + pixelX + 1);
      const nearestY = clamp(circleY, top + pixelY, top + pixelY + 1);
      const dx = circleX - nearestX;
      const dy = circleY - nearestY;
      if (dx * dx + dy * dy <= radiusSq)
        return true;
    }
  }
  return false;
}
function sweptBulletTouchesPlayer(bullet, player, previousX, previousY) {
  const mask = CHARACTER_MASKS[player.character] || CHARACTER_MASKS.granny;
  const segmentX = bullet.x - previousX;
  const segmentY = bullet.y - previousY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const maxRadius = characterRadius(player.character) + BULLET_RADIUS;
  if (segmentLengthSquared > 0) {
    const progress = clamp(
      ((player.x - previousX) * segmentX + (player.y - previousY) * segmentY) /
        segmentLengthSquared,
      0,
      1,
    );
    const closestX = previousX + segmentX * progress;
    const closestY = previousY + segmentY * progress;
    if (Math.hypot(closestX - player.x, closestY - player.y) > maxRadius) {
      return false;
    }
  }
  const distance = Math.hypot(segmentX, segmentY);
  const steps = Math.max(1, Math.ceil(distance / 2));
  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    const x = previousX + (bullet.x - previousX) * progress;
    const y = previousY + (bullet.y - previousY) * progress;
    if (circleTouchesMask(mask, player, x, y, BULLET_RADIUS)) return true;
  }
  return false;
}
function sweptBulletTouchesParry(bullet, player, previousX, previousY) {
  const segmentX = bullet.x - previousX;
  const segmentY = bullet.y - previousY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const progress = segmentLengthSquared
    ? clamp(
        ((player.x - previousX) * segmentX +
          (player.y - previousY) * segmentY) /
          segmentLengthSquared,
        0,
        1,
      )
    : 0;
  const impactX = previousX + segmentX * progress;
  const impactY = previousY + segmentY * progress;
  const radius = characterRadius(player.character) + PARRY_PADDING;
  if (Math.hypot(impactX - player.x, impactY - player.y) > radius + BULLET_RADIUS)
    return null;
  const normalLength = Math.hypot(impactX - player.x, impactY - player.y) || 1;
  return {
    x: (impactX - player.x) / normalLength,
    y: (impactY - player.y) / normalLength,
    radius,
  };
}
app.use(express.json({ limit: "8kb" }));
app.post("/api/token", async (req, res) => {
  const code = req.body?.code;
  if (typeof code !== "string" || code.length > 2048)
    return res.status(400).json({ error: "Invalid OAuth code" });
  try {
    const body = new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID,
      client_secret: process.env.DISCORD_CLIENT_SECRET,
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://127.0.0.1",
    });
    const r = await fetch("https://discord.com/api/v10/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await r.json();
    if (!r.ok)
      return res
        .status(401)
        .json({
          error: "Discord OAuth exchange failed",
          details: data.message || data.error,
        });
    res.json({ access_token: data.access_token });
  } catch (e) {
    console.error("OAuth error", e);
    res.status(502).json({ error: "Discord OAuth request failed" });
  }
});
app.use(
  express.static(path.join(__dirname, "dist"), {
    maxAge: "1y",
    immutable: true,
    setHeaders(res, filePath) {
      // The HTML points at hashed bundles and must never outlive a deployment.
      // Hashed JS and media remain safe to cache indefinitely.
      if (path.extname(filePath).toLowerCase() === ".html") {
        res.set({
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        });
      }
    },
  }),
);
app.get("/health", (req, res) => res.json({ ok: true, players: players.size }));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
io.use(async (socket, next) => {
  const { accessToken, instanceId } = socket.handshake.auth || {};
  if (
    typeof accessToken !== "string" ||
    accessToken.length > 4096 ||
    typeof instanceId !== "string" ||
    !/^[-\w]{1,128}$/.test(instanceId)
  )
    return next(
      new Error("Missing Discord authentication or Activity instance"),
    );
  try {
    const r = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return next(new Error("Discord login expired or invalid"));
    const user = await r.json();
    if (!user.id) return next(new Error("Invalid Discord user"));
    socket.data.identity = {
      id: user.id,
      name: String(user.global_name || user.username || "Player").slice(0, 24),
      instanceId,
    };
    next();
  } catch (e) {
    next(new Error("Could not verify Discord user"));
  }
});
io.on("connection", (socket) => {
  const { id: discordId, name, instanceId } = socket.data.identity;
  const room = `activity:${instanceId}`;
  socket.join(room);
  if (!roomScores.has(room)) roomScores.set(room, new Map());
  const scores = roomScores.get(room);
  const score = scores.get(discordId) || {
    discordId,
    name,
    kills: 0,
    deaths: 0,
    socketId: socket.id,
  };
  score.name = name;
  score.socketId = socket.id;
  scores.set(discordId, score);
  const spawn = randomPosition("granny");
  const p = {
    id: socket.id,
    discordId,
    name,
    x: spawn.x,
    y: spawn.y,
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 65%)`,
    character: "granny",
    keys: { up: false, down: false, left: false, right: false },
    facing: { x: 1, y: 0 },
    parryId: 0,
    parryStartedAt: 0,
    parryUntil: 0,
    parryReadyAt: 0,
    lastInputSeq: 0,
    dashId: 0,
    dashStartedAt: 0,
    dashUntil: 0,
    dashReadyAt: 0,
    dashDirection: { x: 1, y: 0 },
    lastShotAt: 0,
    health: MAX_HEALTH,
    score,
    minigun: false,
    active: false,
    protectedUntil: 0,
    room,
  };
  players.set(socket.id, p);
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(socket.id);
  socket.emit("init", {
    id: socket.id,
    width: WIDTH,
    height: HEIGHT,
    serverTime: Date.now(),
  });
  socket.on("time_sync", (acknowledge) => {
    if (typeof acknowledge === "function") acknowledge(Date.now());
  });
  socket.on("input", (payload) => {
    const keys = payload?.keys || payload;
    if (!keys || typeof keys !== "object") return;
    for (const k of ["up", "down", "left", "right"])
      p.keys[k] = keys[k] === true;
    if (Number.isSafeInteger(payload?.sequence))
      p.lastInputSeq = Math.max(p.lastInputSeq, payload.sequence);
  });
  socket.on("character", (character) => {
    if (!p.active && (character === "granny" || character === "cyborg")) {
      p.character = character;
      const radius = characterRadius(character);
      p.x = clamp(p.x, radius, WIDTH - radius);
      p.y = clamp(p.y, radius, HEIGHT - radius);
    }
  });
  socket.on("active", (active) => {
    const nextActive = active === true;
    if (nextActive && !p.active) {
      const nextSpawn = randomPosition(p.character);
      p.x = nextSpawn.x;
      p.y = nextSpawn.y;
      p.health = MAX_HEALTH;
      p.protectedUntil = Date.now() + SPAWN_PROTECTION;
      p.lastShotAt = 0;
      p.dashStartedAt = 0;
      p.dashUntil = 0;
      p.dashReadyAt = 0;
      p.parryStartedAt = 0;
      p.parryUntil = 0;
      p.parryReadyAt = 0;
    }
    p.active = nextActive;
    if (!p.active) {
      p.keys = { up: false, down: false, left: false, right: false };
      p.protectedUntil = 0;
      p.dashUntil = 0;
      p.parryUntil = 0;
      for (let index = bullets.length - 1; index >= 0; index--)
        if (bullets[index].ownerId === p.id) bullets.splice(index, 1);
    }
  });
  socket.on("minigun", () => {
    p.minigun = true;
  });
  socket.on("parry", () => {
    const now = Date.now();
    if (
      !p.active ||
      p.health <= 0 ||
      now < p.parryReadyAt ||
      now < p.dashUntil
    )
      return;
    p.parryId += 1;
    p.parryStartedAt = now;
    p.parryUntil = now + PARRY_DURATION;
    p.parryReadyAt = now + PARRY_COOLDOWN;
    io.to(room).emit("parry_started", {
      playerId: p.id,
      parryId: p.parryId,
      parryStartedAt: p.parryStartedAt,
      parryUntil: p.parryUntil,
      parryReadyAt: p.parryReadyAt,
    });
  });
  socket.on("dash", (payload) => {
    const now = Date.now();
    if (
      !p.active ||
      p.health <= 0 ||
      now < p.dashReadyAt ||
      now < p.parryUntil
    )
      return;
    let dx = Number(payload?.x);
    let dy = Number(payload?.y);
    const length = Math.hypot(dx, dy);
    if (Number.isFinite(dx) && Number.isFinite(dy) && length > 0.001) {
      dx /= length;
      dy /= length;
    } else {
      dx = Number(p.keys.right) - Number(p.keys.left);
      dy = Number(p.keys.down) - Number(p.keys.up);
      const kLen = Math.hypot(dx, dy);
      if (kLen) {
        dx /= kLen;
        dy /= kLen;
      } else {
        dx = p.facing.x;
        dy = p.facing.y;
      }
    }
    p.dashId += 1;
    p.dashStartedAt = now;
    p.dashUntil = now + DASH_DURATION;
    p.dashReadyAt = now + DASH_COOLDOWN;
    p.dashDirection = { x: dx, y: dy };
    p.facing = { x: dx, y: dy };
    io.to(room).emit("dash_started", {
      playerId: p.id,
      dashId: p.dashId,
      dashStartedAt: p.dashStartedAt,
      dashUntil: p.dashUntil,
      dashReadyAt: p.dashReadyAt,
      dashDirection: p.dashDirection,
    });
  });
  socket.on("shoot", (target) => {
    const now = Date.now();
    if (
      !p.active ||
      p.health <= 0 ||
      now < p.parryUntil ||
      now - p.lastShotAt < (p.minigun ? MINIGUN_COOLDOWN : SHOT_COOLDOWN) ||
      !target ||
      !Number.isFinite(target.x) ||
      !Number.isFinite(target.y) ||
      target.x < 0 ||
      target.x > WIDTH ||
      target.y < 0 ||
      target.y > HEIGHT
    )
      return;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const direction = { x: dx / length, y: dy / length };
    p.lastShotAt = now;
    p.protectedUntil = 0;
    const stats = CHARACTER_STATS[p.character];
    const muzzleDistance = characterRadius(p.character) + 8;
    bullets.push({
      id: nextBulletId++,
      ownerId: p.id,
      room,
      x: p.x + direction.x * muzzleDistance,
      y: p.y + direction.y * muzzleDistance,
      vx: direction.x * BULLET_SPEED,
      vy: direction.y * BULLET_SPEED,
      damage: stats.damage,
      character: p.character,
      expiresAt: now + BULLET_LIFETIME,
    });
  });
  socket.on("disconnect", () => {
    if (score.socketId === socket.id) score.socketId = null;
    players.delete(socket.id);
    const ids = rooms.get(room);
    ids?.delete(socket.id);
    if (ids?.size === 0) {
      rooms.delete(room);
      roomScores.delete(room);
      for (let i = bullets.length - 1; i >= 0; i--)
        if (bullets[i].room === room) bullets.splice(i, 1);
    }
  });
});
let last = performance.now();
let physicsTicks = 0;
let worldSequence = 0;
setInterval(() => {
  const now = performance.now(),
    dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  for (const p of players.values()) {
    if (!p.active || p.health <= 0) continue;
    let dx;
    let dy;
    let speed;
    if (Date.now() < p.dashUntil) {
      const dashElapsed = DASH_DURATION - (p.dashUntil - Date.now());
      const dashProgress = clamp(dashElapsed / DASH_DURATION, 0, 1);
      const ease = Math.pow(1 - dashProgress, 1.8);
      const baseSpeed = CHARACTER_STATS[p.character].speed;
      speed = baseSpeed + (DASH_PEAK_SPEED - baseSpeed) * ease;
      dx = p.dashDirection.x;
      dy = p.dashDirection.y;
    } else {
      dx = Number(p.keys.right) - Number(p.keys.left);
      dy = Number(p.keys.down) - Number(p.keys.up);
      const length = Math.hypot(dx, dy);
      if (length) {
        dx /= length;
        dy /= length;
        p.facing = { x: dx, y: dy };
      }
      speed = CHARACTER_STATS[p.character].speed;
    }
    const radius = characterRadius(p.character);
    p.x = clamp(p.x + dx * speed * dt, radius, WIDTH - radius);
    p.y = clamp(p.y + dy * speed * dt, radius, HEIGHT - radius);
  }
  const wallNow = Date.now();
  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const previousX = bullet.x;
    const previousY = bullet.y;
    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    if (
      wallNow >= bullet.expiresAt ||
      bullet.x < -BULLET_RADIUS ||
      bullet.x > WIDTH + BULLET_RADIUS ||
      bullet.y < -BULLET_RADIUS ||
      bullet.y > HEIGHT + BULLET_RADIUS
    ) {
      bullets.splice(i, 1);
      continue;
    }
    const roomPlayers = rooms.get(bullet.room);
    if (!roomPlayers) {
      bullets.splice(i, 1);
      continue;
    }
    let deflected = false;
    for (const playerId of roomPlayers) {
      const defender = players.get(playerId);
      if (
        !defender ||
        !defender.active ||
        defender.health <= 0 ||
        defender.id === bullet.ownerId ||
        defender.parryUntil <= wallNow
      )
        continue;
      const contact = sweptBulletTouchesParry(
        bullet,
        defender,
        previousX,
        previousY,
      );
      if (!contact) continue;
      const dot = bullet.vx * contact.x + bullet.vy * contact.y;
      if (dot >= 0) continue;
      bullet.vx -= 2 * dot * contact.x;
      bullet.vy -= 2 * dot * contact.y;
      const currentSpeed = Math.hypot(bullet.vx, bullet.vy);
      if (currentSpeed > 0) {
        const boosted = Math.max(currentSpeed, BULLET_SPEED * 1.15);
        bullet.vx = (bullet.vx / currentSpeed) * boosted;
        bullet.vy = (bullet.vy / currentSpeed) * boosted;
      }
      bullet.x = defender.x + contact.x * (contact.radius + BULLET_RADIUS + 3);
      bullet.y = defender.y + contact.y * (contact.radius + BULLET_RADIUS + 3);
      bullet.ownerId = defender.id;
      bullet.character = defender.character;
      bullet.damage = CHARACTER_STATS[defender.character].damage;
      bullet.expiresAt = wallNow + BULLET_LIFETIME;
      io.to(bullet.room).emit("shot_deflected", {
        playerId: defender.id,
        x: bullet.x,
        y: bullet.y,
        vx: bullet.vx,
        vy: bullet.vy,
      });
      deflected = true;
      break;
    }
    if (deflected) continue;
    const hit = [...roomPlayers]
      .map((id) => players.get(id))
      .find((target) => {
        if (
          !target ||
          !target.active ||
          target.id === bullet.ownerId ||
          target.health <= 0 ||
          target.protectedUntil > Date.now()
        )
          return false;
        return sweptBulletTouchesPlayer(bullet, target, previousX, previousY);
      });
    if (hit) {
      hit.health = Math.max(0, hit.health - bullet.damage);
      io.to(hit.id).emit("jumpscare", {
        health: hit.health,
        damage: bullet.damage,
        attackerCharacter: bullet.character,
      });
      if (hit.health === 0) {
        hit.score.deaths += 1;
        const attacker = players.get(bullet.ownerId);
        if (attacker && attacker.room === hit.room) attacker.score.kills += 1;
        setTimeout(() => {
          if (!players.has(hit.id)) return;
          const nextSpawn = randomPosition(hit.character);
          hit.x = nextSpawn.x;
          hit.y = nextSpawn.y;
          hit.health = MAX_HEALTH;
          hit.protectedUntil = Date.now() + SPAWN_PROTECTION;
          hit.lastShotAt = 0;
          hit.dashUntil = 0;
          hit.dashReadyAt = 0;
          hit.parryUntil = 0;
          hit.parryReadyAt = 0;
        }, 1200);
      }
      bullets.splice(i, 1);
    }
  }
  physicsTicks += 1;
  if (physicsTicks % 3 !== 0) return;
  worldSequence += 1;
  const snapshotTime = Date.now();
  for (const [room, ids] of rooms) {
    const state = [...ids]
      .map((id) => players.get(id))
      .filter((p) => p?.active)
      .map((p) => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        color: p.color,
        character: p.character,
        facing: p.facing,
        parryId: p.parryId,
        parryStartedAt: p.parryStartedAt,
        parryUntil: p.parryUntil,
        parryReadyAt: p.parryReadyAt,
        dashId: p.dashId,
        dashStartedAt: p.dashStartedAt,
        dashUntil: p.dashUntil,
        dashReadyAt: p.dashReadyAt,
        dashDirection: p.dashDirection,
        lastInputSeq: p.lastInputSeq,
        health: p.health,
        kills: p.score.kills,
        deaths: p.score.deaths,
        minigun: p.minigun,
        protectedUntil: p.protectedUntil,
      }));
    const leaderboard = [...(roomScores.get(room)?.values() || [])]
      .filter((score) => score.socketId && players.has(score.socketId))
      .map((score) => ({
        id: score.socketId,
        name: score.name,
        kills: score.kills,
        deaths: score.deaths,
        active: players.get(score.socketId)?.active === true,
      }))
      .sort((a, b) =>
        b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name),
      );
    io.to(room).volatile.emit("world", {
      sequence: worldSequence,
      serverTime: snapshotTime,
      leaderId:
        leaderboard.find((entry) => entry.active && entry.kills > 0)?.id || null,
      leaderboard,
      players: state,
      bullets: bullets
        .filter((bullet) => bullet.room === room)
        .map(({ id, x, y, vx, vy, character }) => ({
          id,
          x,
          y,
          vx,
          vy,
          character,
        })),
    });
  }
}, 1000 / 60);
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Discord Activity server ready at http://localhost:${PORT}`),
);
