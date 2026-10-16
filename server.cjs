const path = require("path");
const { PORT } = require("./server-port.cjs");
const express = require("express"),
  http = require("http");
const { Server } = require("socket.io");
const { createScaledMask } = require("./collision-masks.cjs");
const inventoryStorage = require("./inventoryStorage.cjs");
const {
  TURRET_TYPES,
  COLLECTIBLE_TURRET_IDS,
  DUPLICATE_FRAGMENTS,
  FRAGMENTS_PER_KEY,
  ADMIN_DISCORD_ID,
} = require("./turretConfig.cjs");
const { BABY_CYBORG_CONFIG } = require("./babyCyborgConfig.cjs");
const guestInventories = new Map();
function getGuestInventory(socketId, inventoryId) {
  if (!guestInventories.has(socketId)) {
    guestInventories.set(socketId, inventoryStorage.getInventory(inventoryId));
  }
  return guestInventories.get(socketId);
}
const app = express(),
  server = http.createServer(app),
  io = new Server(server);
// Keep transport failures visible without logging OAuth tokens or handshake payloads.
io.engine.on("connection_error", error => {
  console.warn("[transport handshake]", JSON.stringify({ code: error.code, message: error.message, detail: error.context?.message }));
});
io.engine.on("connection", connection => {
  const started = Date.now();
  connection.on("close", (reason, description) => {
    if (reason === "transport error" || (reason === "transport close" && Date.now() - started < 15000)) {
      console.warn("[transport closed]", JSON.stringify({
        transport: connection.transport?.name, reason, ageMs: Date.now() - started,
        detail: description?.message, code: description?.code,
        cause: description?.description?.message || description?.description?.code,
      }));
    }
  });
});
const WIDTH = 3600,
  HEIGHT = 3600,
  ARENA_CENTER = { x: 1800, y: 1800 },
  ARENA_RADIUS = 1650,
  BULLET_SPEED = 520,
  BULLET_RADIUS = 5,
  BULLET_LIFETIME = 1800,
  SHOT_COOLDOWN = 320,
  MINIGUN_COOLDOWN = 70,
  MAX_HEALTH = 20,
  SPAWN_PROTECTION = 5000,
  DASH_COOLDOWN = 2500,
  DASH_DURATION = 220,
  DASH_PEAK_SPEED = 1250,
  DODGE_COOLDOWN = 4000,
  DODGE_DURATION = 240,
  PARRY_COOLDOWN = 4500,
  PARRY_DURATION = 700,
  PARRY_PADDING = 18;

function getCapsuleClosestPoint(px, py, ox, oy, angle, halfLength) {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const dx = px - ox;
  const dy = py - oy;
  const proj = dx * cosA + dy * sinA;
  const clampedProj = Math.max(-halfLength, Math.min(halfLength, proj));
  return {
    cx: ox + clampedProj * cosA,
    cy: oy + clampedProj * sinA,
  };
}
const CHARACTER_STATS = {
  granny: { width: 41, height: 43, speed: 255, damage: 1, bulletRadius: 5, bulletSpeed: 520, parryCooldown: 4500, maxHealth: 20 },
  cyborg: { width: 109, height: 130, speed: 175, damage: 2.25, bulletRadius: 6.5, bulletSpeed: 520, parryCooldown: 4500, maxHealth: 20 },
  mama_cyborg: { width: 109, height: 130, speed: 280, damage: 2.0, bulletRadius: 8, bulletSpeed: 480, parryCooldown: 4000, maxHealth: 50 },
  angry_granny: { width: 70, height: 130, speed: 280, damage: 2.0, bulletRadius: 8, bulletSpeed: 480, parryCooldown: 4000, maxHealth: 50 },
  sigmatom: { width: 223, height: 270, speed: 215, damage: 4.5, bulletRadius: 20, bulletSpeed: 1014, parryCooldown: 2250, maxHealth: 200 },
  scientist: { width: 43, height: 43, speed: 255, damage: 1, bulletRadius: 5, bulletSpeed: 520, parryCooldown: 4500, maxHealth: 20 },
};

const ENEMY_CONFIG = {
  cyborgian_1: {
    type: "cyborgian_1",
    name: "Scout",
    texture: "cyborgian (1).png",
    width: 58,
    height: 92,
    radius: 38,
    speed: 215,
    damage: 1.5,
    maxHp: 5,
    xp: 25,
    hasDodge: true,
    dodgeCooldown: 4000,
    dodgeDistance: 110,
  },
  cyborgian_2: {
    type: "cyborgian_2",
    name: "Grunt",
    texture: "cyborgian (2).png",
    width: 67,
    height: 108,
    radius: 43,
    speed: 155,
    damage: 2.0,
    maxHp: 8,
    xp: 30,
    hasDodge: false,
  },
  cyborgian_3: {
    type: "cyborgian_3",
    name: "Brawler",
    texture: "cyborgian (3).png",
    width: 79,
    height: 127,
    radius: 50,
    speed: 130,
    damage: 3.2,
    maxHp: 16,
    xp: 45,
    hasDodge: false,
  },
  cyborgian_4: {
    type: "cyborgian_4",
    name: "Striker",
    texture: "cyborgian (4).png",
    width: 62,
    height: 101,
    radius: 41,
    speed: 190,
    damage: 2.2,
    maxHp: 7,
    xp: 35,
    hasDodge: false,
  },
  cyborgian_5: {
    type: "cyborgian_5",
    name: "Phantom",
    texture: "cyborgian (5).png",
    width: 43,
    height: 118,
    radius: 38,
    speed: 235,
    damage: 2.1,
    maxHp: 6,
    xp: 40,
    hasDodge: true,
    dodgeCooldown: 3500,
    dodgeDistance: 130,
  },
  cyborgian_6: {
    type: "cyborgian_6",
    name: "Berserker",
    texture: "cyborgian (6).png",
    width: 60,
    height: 115,
    radius: 42,
    speed: 175,
    damage: 2.8,
    maxHp: 11,
    xp: 35,
    hasDodge: false,
  },
  cyborgian_8: {
    type: "cyborgian_8",
    name: "Stalker",
    texture: "cyborgian (8).png",
    width: 46,
    height: 125,
    radius: 41,
    speed: 165,
    damage: 2.5,
    maxHp: 10,
    xp: 35,
    hasDodge: false,
  },
  cyborgian_9: {
    type: "cyborgian_9",
    name: "Goliath Splitter",
    texture: "cyborgian (9).png",
    width: 134,
    height: 213,
    radius: 82,
    speed: 95,
    damage: 4.5,
    maxHp: 26,
    xp: 70,
    hasDodge: false,
    isSplitter: true,
  },
  cyborgian_split_1: {
    type: "cyborgian_split_1",
    name: "Split Cyber-Alpha",
    texture: "split_1.png",
    width: 52,
    height: 68,
    radius: 26,
    speed: 240,
    damage: 1.8,
    maxHp: 1,
    xp: 8,
    hasDodge: false,
    isSplitChild: true,
  },
  cyborgian_split_2: {
    type: "cyborgian_split_2",
    name: "Split Cyber-Beta",
    texture: "split_2.png",
    width: 52,
    height: 68,
    radius: 26,
    speed: 240,
    damage: 1.8,
    maxHp: 1,
    xp: 8,
    hasDodge: false,
    isSplitChild: true,
  },
  cyborgian_10: {
    type: "cyborgian_10",
    name: "Vanguard",
    texture: "cyborgian (10).png",
    width: 72,
    height: 115,
    radius: 46,
    speed: 140,
    damage: 2.6,
    maxHp: 13,
    xp: 40,
    hasDodge: false,
  },
  cyborgian_11: {
    type: "cyborgian_11",
    name: "Shadow",
    texture: "cyborgian (11).png",
    width: 65,
    height: 104,
    radius: 41,
    speed: 205,
    damage: 2.3,
    maxHp: 8,
    xp: 45,
    hasDodge: true,
    dodgeCooldown: 4500,
    dodgeDistance: 120,
  },
};

function sweptBulletTouchesCircle(bullet, prevX, prevY, cx, cy, cRadius) {
  const bRadius = bullet.radius || BULLET_RADIUS;
  const segX = bullet.x - prevX;
  const segY = bullet.y - prevY;
  const segLenSq = segX * segX + segY * segY;
  const combinedR = cRadius + bRadius;
  if (segLenSq === 0) {
    return Math.hypot(bullet.x - cx, bullet.y - cy) <= combinedR;
  }
  const t = Math.max(0, Math.min(1, ((cx - prevX) * segX + (cy - prevY) * segY) / segLenSq));
  const projX = prevX + segX * t;
  const projY = prevY + segY * t;
  return Math.hypot(projX - cx, projY - cy) <= combinedR;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

const hordeGames = new Map();

const HORDE_CARDS = {
  // Ability Cards (Rare, Individual, Non-Stackable)
  ability_dash: {
    id: "ability_dash",
    category: "ability",
    rarity: "rare",
    name: "Dash Thrusters",
    desc: "Unlock Dash [Spacebar]. Dash forward and stun enemies hit for 3s.",
    icon: "⚡",
    faIcon: "fa-solid fa-bolt-lightning",
    condition: (player, horde) => !player.hasDash,
    apply: (player, horde) => { player.hasDash = true; }
  },
  ability_dodge: {
    id: "ability_dodge",
    category: "ability",
    rarity: "rare",
    name: "Tactical Dodge & Deflect",
    desc: "Unlock Deflect [R] to reflect enemy bullets and Dodge [Shift / F] with brief invulnerability.",
    icon: "🌀",
    faIcon: "fa-solid fa-wind",
    condition: (player, horde) => !player.hasDodge,
    apply: (player, horde) => { player.hasDodge = true; }
  },
  player_zoom: {
    id: "player_zoom",
    category: "upgrade",
    rarity: "uncommon",
    name: "Tactical Zoom",
    desc: "Zooms out camera to see more of the map (stacks up to 2x).",
    icon: "🔭",
    faIcon: "fa-solid fa-magnifying-glass-plus",
    condition: (player, horde) => (player.zoomLevel || 0) < 2,
    apply: (player, horde) => {
      player.zoomLevel = Math.min(2, (player.zoomLevel || 0) + 1);
    }
  },
  weapon_damage: {
    id: "weapon_damage",
    category: "upgrade",
    rarity: "common",
    name: "Plasma Overcharge",
    desc: "+20% bullet damage (stacks).",
    icon: "⚡",
    faIcon: "fa-solid fa-bolt",
    condition: () => true,
    apply: (player) => {
      player.bonusDamageMult = (player.bonusDamageMult || 0) + 0.20;
    }
  },
  weapon_heavy_caliber: {
    id: "weapon_heavy_caliber",
    category: "upgrade",
    rarity: "common",
    name: "High-Caliber Ordnance",
    desc: "+15% bullet damage (stacks).",
    icon: "💥",
    faIcon: "fa-solid fa-burst",
    condition: () => true,
    apply: (player) => {
      player.bonusDamageMult = (player.bonusDamageMult || 0) + 0.15;
    }
  },
  weapon_piercing_core: {
    id: "weapon_piercing_core",
    category: "upgrade",
    rarity: "uncommon",
    name: "Tungsten Penetrator",
    desc: "+18% bullet damage (stacks).",
    icon: "🎯",
    faIcon: "fa-solid fa-bullseye",
    condition: () => true,
    apply: (player) => {
      player.bonusDamageMult = (player.bonusDamageMult || 0) + 0.18;
    }
  },
  weapon_hollow_point: {
    id: "weapon_hollow_point",
    category: "upgrade",
    rarity: "rare",
    name: "Hyper-Charge Capacitors",
    desc: "+25% bullet damage (stacks).",
    icon: "⚛️",
    faIcon: "fa-solid fa-atom",
    condition: () => true,
    apply: (player) => {
      player.bonusDamageMult = (player.bonusDamageMult || 0) + 0.25;
    }
  },
  weapon_rapid_fire: {
    id: "weapon_rapid_fire",
    category: "upgrade",
    rarity: "uncommon",
    name: "Hair Trigger",
    desc: "+15% faster firing rate (stacks).",
    icon: "🔫",
    faIcon: "fa-solid fa-gun",
    condition: () => true,
    apply: (player) => {
      player.fireRateMult = (player.fireRateMult || 1.0) * 0.85;
    }
  },
  weapon_overclock_actuator: {
    id: "weapon_overclock_actuator",
    category: "upgrade",
    rarity: "common",
    name: "Overclocked Actuator",
    desc: "+12% faster firing rate (stacks).",
    icon: "⚙️",
    faIcon: "fa-solid fa-gauge-high",
    condition: () => true,
    apply: (player) => {
      player.fireRateMult = (player.fireRateMult || 1.0) * 0.88;
    }
  },
  weapon_lightweight_bolt: {
    id: "weapon_lightweight_bolt",
    category: "upgrade",
    rarity: "common",
    name: "Lightweight Bolt",
    desc: "+10% faster firing rate (stacks).",
    icon: "💨",
    faIcon: "fa-solid fa-forward-fast",
    condition: () => true,
    apply: (player) => {
      player.fireRateMult = (player.fireRateMult || 1.0) * 0.90;
    }
  },
  weapon_twin_feed: {
    id: "weapon_twin_feed",
    category: "upgrade",
    rarity: "rare",
    name: "Twin-Feed Loader",
    desc: "+20% faster firing rate (stacks).",
    icon: "🔁",
    faIcon: "fa-solid fa-arrows-spin",
    condition: () => true,
    apply: (player) => {
      player.fireRateMult = (player.fireRateMult || 1.0) * 0.80;
    }
  },

  // Granny Utility Cards (Stackable team upgrades)
  granny_turret: {
    id: "granny_turret",
    category: "utility",
    rarity: "common",
    name: "Granny Defense Cannon",
    desc: "Granny statue auto-shoots nearby enemies. Stacks for faster fire rate.",
    icon: "🔱",
    faIcon: "fa-solid fa-crosshairs",
    condition: (player, horde) => true,
    apply: (player, horde) => {
      horde.grannyTurretLevel = (horde.grannyTurretLevel || 0) + 1;
    }
  },
  repair_all_structures: {
    id: "repair_all_structures",
    category: "upgrade",
    rarity: "rare",
    name: "Repair All Structures",
    desc: "Instantly repairs all placed barricades, sentries, and traps to 100% HP.",
    icon: "🔧",
    faIcon: "fa-solid fa-wrench",
    condition: (player, horde) => (horde.placedObjects || []).some(o => o.hp < o.maxHp),
    apply: (player, horde) => {
      let repairedCount = 0;
      for (const obj of (horde.placedObjects || [])) {
        if (obj.hp < obj.maxHp) {
          obj.hp = obj.maxHp;
          repairedCount++;
        }
      }
      io.to(horde.room).emit("structures_repaired", {
        repairedCount,
        restoredBy: player.name || "Operative",
      });
    }
  },
  granny_repair: {
    id: "granny_repair",
    category: "utility",
    rarity: "common",
    name: "Core Repair",
    desc: "Instantly restores Granny Core to 100% HP.",
    icon: "🔧",
    faIcon: "fa-solid fa-screwdriver-wrench",
    condition: (player, horde) => horde.baseHealth < horde.maxBaseHealth,
    apply: (player, horde) => {
      horde.baseHealth = horde.maxBaseHealth;
    }
  },
  granny_heal_aura: {
    id: "granny_heal_aura",
    category: "utility",
    rarity: "uncommon",
    name: "Healing Aura",
    desc: "Heals players standing near Granny. Stacking increases heal amount and range.",
    icon: "💚",
    faIcon: "fa-solid fa-heart-pulse",
    condition: (player, horde) => true,
    apply: (player, horde) => {
      horde.healAuraLevel = (horde.healAuraLevel || 0) + 1;
    }
  },

  // Object Placement Cards
  object_barricade: {
    id: "object_barricade",
    category: "object",
    rarity: "common",
    name: "Barricade",
    desc: "Deploy a barricade to block enemies and absorb damage.",
    icon: "🛡️",
    faIcon: "fa-solid fa-shield-halved",
    condition: (player, horde) => horde.placedObjects.filter(o => o.type === "wall" || o.type === "barricade").length < 12,
    apply: (player, horde) => {
      player.pendingPlacements = player.pendingPlacements || [];
      player.pendingPlacements.push("barricade");
    }
  },
  object_turret: {
    id: "object_turret",
    category: "object",
    rarity: "uncommon",
    name: "Sentry Turret",
    desc: "Deploy an automated turret that shoots nearby enemies.",
    icon: "📡",
    faIcon: "fa-solid fa-tower-broadcast",
    condition: (player, horde) => horde.placedObjects.filter(o => o.type === "turret").length < 6,
    apply: (player, horde) => {
      player.pendingPlacements = player.pendingPlacements || [];
      player.pendingPlacements.push("turret");
    }
  },
  object_trap: {
    id: "object_trap",
    category: "object",
    rarity: "uncommon",
    name: "Freeze Trap",
    desc: "Deploy a trap that freezes enemies in the area for 5s when triggered.",
    icon: "❄️",
    faIcon: "fa-solid fa-snowflake",
    condition: (player, horde) => horde.placedObjects.filter(o => o.type === "trap").length < 6,
    apply: (player, horde) => {
      player.pendingPlacements = player.pendingPlacements || [];
      player.pendingPlacements.push("trap");
    }
  },

  // Object Upgrade Cards (ONLY appear when matching object is actually placed!)
  turret_range: {
    id: "turret_range",
    category: "upgrade",
    rarity: "common",
    name: "Turret Range",
    desc: "+70px range for all sentry turrets.",
    icon: "🔭",
    faIcon: "fa-solid fa-satellite-dish",
    condition: (player, horde) => horde.placedObjects.some(o => o.type === "turret"),
    apply: (player, horde) => {
      horde.turretRangeBoost = (horde.turretRangeBoost || 0) + 70;
    }
  },
  turret_cooldown: {
    id: "turret_cooldown",
    category: "upgrade",
    rarity: "common",
    name: "Turret Fire Rate",
    desc: "All sentry turrets shoot 25% faster.",
    icon: "⚙️",
    faIcon: "fa-solid fa-gauge-high",
    condition: (player, horde) => horde.placedObjects.some(o => o.type === "turret"),
    apply: (player, horde) => {
      horde.turretCooldownMult = (horde.turretCooldownMult || 1.0) * 0.75;
    }
  },
  turret_damage: {
    id: "turret_damage",
    category: "upgrade",
    rarity: "common",
    name: "Turret Damage",
    desc: "+1.2 bullet damage for all sentry turrets.",
    icon: "💥",
    faIcon: "fa-solid fa-burst",
    condition: (player, horde) => horde.placedObjects.some(o => o.type === "turret"),
    apply: (player, horde) => {
      horde.turretDamageBoost = (horde.turretDamageBoost || 0) + 1.2;
    }
  },
  trap_cooldown: {
    id: "trap_cooldown",
    category: "upgrade",
    rarity: "common",
    name: "Trap Cooldown",
    desc: "Reduces trap re-arm cooldown by 1.3s.",
    icon: "⏱️",
    faIcon: "fa-solid fa-clock-rotate-left",
    condition: (player, horde) => horde.placedObjects.some(o => o.type === "trap"),
    apply: (player, horde) => {
      horde.trapRecoveryTime = Math.max(1200, (horde.trapRecoveryTime || 5000) - 1300);
    }
  }
};
HORDE_CARDS.object_wall = HORDE_CARDS.object_barricade;

class HordeGame {
  constructor(room) {
    this.room = room;
    this.baseHealth = 100;
    this.maxBaseHealth = 100;
    this.wave = 1;
    this.waveState = "active";
    this.intermissionUntil = 0;
    this.enemies = [];
    this.enemiesSpawnedThisWave = 0;
    this.enemiesToSpawnThisWave = 6;
    this.lastSpawnAt = Date.now() - 2400;
    this.spawnInterval = 3200;
    this.nextEnemyId = 1;
    this.lastBaseDamageAt = 0;

    // Placed Objects (Wall, Turret, Trap)
    this.placedObjects = [];
    this.nextObjectId = 1;

    // Upgrades
    this.grannyTurretLevel = 0;
    this.lastGrannyShotAt = 0;
    this.healAuraLevel = 0;
    this.lastHealAuraPulseAt = 0;
    this.turretRangeBoost = 0;
    this.turretCooldownMult = 1.0;
    this.turretDamageBoost = 0;
    this.trapRecoveryTime = 5000;

    // Boss Fight State
    this.boss = null;
    this.isBossWave = false;
    this.pendingBossSpawnAt = null;
    this.pendingBossType = null;

    // Upgrade Selection State
    this.pendingPlayersToChoose = new Set();
    this.cardOfferings = new Map();
    this.upgradeTimeout = null;
  }

  getWaveEnemyCount(wave, playerCount) {
    const base = 4 + wave * 2; // wave 1: 6, wave 2: 8, wave 3: 10
    const playerMult = 0.65 + 0.35 * Math.max(1, playerCount);
    return Math.max(5, Math.round(base * playerMult));
  }

  getSpawnInterval(wave, playerCount) {
    const base = Math.max(1200, 3600 - (wave - 1) * 220);
    return Math.max(750, Math.round(base / Math.sqrt(Math.max(1, playerCount))));
  }

  getAvailableTypesForWave(wave) {
    if (wave === 1) return ["cyborgian_1", "cyborgian_2", "cyborgian_4"];
    if (wave === 2) return ["cyborgian_1", "cyborgian_2", "cyborgian_3", "cyborgian_4", "cyborgian_6"];
    if (wave === 3) return ["cyborgian_1", "cyborgian_2", "cyborgian_3", "cyborgian_4", "cyborgian_5", "cyborgian_6", "cyborgian_8", "cyborgian_9"];
    if (wave === 4) return ["cyborgian_1", "cyborgian_2", "cyborgian_3", "cyborgian_4", "cyborgian_5", "cyborgian_6", "cyborgian_8", "cyborgian_9", "cyborgian_10", "cyborgian_11"];
    return Object.keys(ENEMY_CONFIG).filter((k) => !ENEMY_CONFIG[k].isSplitChild);
  }

  spawnEnemy(activePlayerCount = 1) {
    const types = this.getAvailableTypesForWave(this.wave);
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const config = ENEMY_CONFIG[chosenType];
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = ARENA_RADIUS - 120 + (Math.random() - 0.5) * 80;
    const x = ARENA_CENTER.x + Math.cos(angle) * spawnDist;
    const y = ARENA_CENTER.y + Math.sin(angle) * spawnDist;

    // Continuous wave progression and multi-player health balancing:
    // Wave 1: 1 HP (warmup). Wave 2: 2 HP.
    // Wave 3+: smooth uncapped wave progression (wave 10: ~1.08x, wave 20: ~1.83x, wave 30: ~2.58x)
    // Co-op multiplier (+40% HP per additional player) so multi-player teams require coordinated teamwork
    let hp;
    let speed;
    let damage;
    const coOpHpMult = 1.0 + (Math.max(1, activePlayerCount) - 1) * 0.40;

    if (this.wave === 1) {
      hp = 1;
      speed = Math.min(105, config.speed * 0.62);
      damage = 1.0;
    } else if (this.wave === 2) {
      hp = 2;
      speed = Math.min(125, config.speed * 0.76);
      damage = 1.4;
    } else if (this.wave === 3) {
      hp = Math.max(3, Math.round(config.maxHp * 0.50 * coOpHpMult));
      speed = config.speed * 0.88;
      damage = Math.max(1.5, config.damage * 0.75);
    } else {
      const waveProgress = 0.55 + (this.wave - 3) * 0.075;
      hp = Math.max(3, Math.round(config.maxHp * waveProgress * coOpHpMult));
      speed = config.speed;
      damage = Math.round((config.damage * (1 + Math.min(1.2, (this.wave - 1) * 0.035))) * 10) / 10;
    }

    this.enemies.push({
      id: this.nextEnemyId++,
      type: chosenType,
      name: config.name,
      texture: config.texture,
      width: config.width,
      height: config.height,
      radius: config.radius,
      speed: speed,
      damage: damage,
      maxHp: hp,
      hp: hp,
      xp: config.xp,
      hasDodge: this.wave >= 2 ? config.hasDodge : false,
      dodgeCooldown: config.dodgeCooldown || 4000,
      dodgeDistance: config.dodgeDistance || 110,
      dodgeReadyAt: 0,
      dodgeUntil: 0,
      dodgeVx: 0,
      dodgeVy: 0,
      frozenUntil: 0,
      stunnedUntil: 0,
      x,
      y,
      facing: { x: -Math.cos(angle), y: -Math.sin(angle) },
      lastAttackAt: 0,
      lastPlayerAttackAt: 0,
      attackCooldown: 900,
      recoilVx: 0,
      recoilVy: 0,
    });
  }

  spawnCyborgianSplit(parentEnemy, io) {
    if (!parentEnemy || parentEnemy.hasSplit) return;
    parentEnemy.hasSplit = true;

    // Calculate perpendicular axis to parent's orientation / movement towards Granny
    let angle = 0;
    if (parentEnemy.facing && (parentEnemy.facing.x !== 0 || parentEnemy.facing.y !== 0)) {
      angle = Math.atan2(parentEnemy.facing.y, parentEnemy.facing.x);
    } else {
      angle = Math.atan2(ARENA_CENTER.y - parentEnemy.y, ARENA_CENTER.x - parentEnemy.x);
    }

    const perpAngle = angle + Math.PI / 2;
    const perpX = Math.cos(perpAngle);
    const perpY = Math.sin(perpAngle);
    const offsetDist = 48; // Centers will be 96px apart, completely preventing any collision overlap (radii are 26px)

    const childConfigs = [
      {
        type: "cyborgian_split_1",
        config: ENEMY_CONFIG.cyborgian_split_1,
        sign: 1,
      },
      {
        type: "cyborgian_split_2",
        config: ENEMY_CONFIG.cyborgian_split_2,
        sign: -1,
      },
    ];

    const spawnedChildren = [];

    for (const item of childConfigs) {
      const cfg = item.config;
      let cx = parentEnemy.x + perpX * offsetDist * item.sign;
      let cy = parentEnemy.y + perpY * offsetDist * item.sign;

      // Ensure spawned children remain inside arena
      const distFromCenter = Math.hypot(cx - ARENA_CENTER.x, cy - ARENA_CENTER.y);
      const maxDist = ARENA_RADIUS - cfg.radius - 8;
      if (distFromCenter > maxDist) {
        cx = ARENA_CENTER.x + ((cx - ARENA_CENTER.x) / (distFromCenter || 1)) * maxDist;
        cy = ARENA_CENTER.y + ((cy - ARENA_CENTER.y) / (distFromCenter || 1)) * maxDist;
      }

      const child = {
        id: this.nextEnemyId++,
        type: item.type,
        name: cfg.name,
        texture: cfg.texture,
        width: cfg.width,
        height: cfg.height,
        radius: cfg.radius,
        speed: cfg.speed, // Fast speed: 240
        damage: cfg.damage,
        maxHp: Math.max(1, Math.min(3, 1 + Math.floor((this.wave - 1) / 12))),
        hp: Math.max(1, Math.min(3, 1 + Math.floor((this.wave - 1) / 12))),
        xp: cfg.xp,
        hasDodge: false,
        dodgeCooldown: 4000,
        dodgeDistance: 110,
        dodgeReadyAt: 0,
        dodgeUntil: 0,
        dodgeVx: 0,
        dodgeVy: 0,
        frozenUntil: 0,
        stunnedUntil: 0,
        x: cx,
        y: cy,
        facing: { x: perpX * item.sign, y: perpY * item.sign },
        lastAttackAt: 0,
        lastPlayerAttackAt: 0,
        attackCooldown: 600,
        // Burst impulse pushing outward away from split origin
        recoilVx: perpX * item.sign * 220,
        recoilVy: perpY * item.sign * 220,
        isSplitChild: true,
      };

      this.enemies.push(child);
      spawnedChildren.push(child);
    }

    if (io && this.room && spawnedChildren.length === 2) {
      io.to(this.room).emit("cyborgian_split", {
        parentId: parentEnemy.id,
        x: parentEnemy.x,
        y: parentEnemy.y,
        angle: angle,
        child1: { id: spawnedChildren[0].id, x: spawnedChildren[0].x, y: spawnedChildren[0].y },
        child2: { id: spawnedChildren[1].id, x: spawnedChildren[1].x, y: spawnedChildren[1].y },
      });
    }
  }

  spawnBoss(activeCount, io) {
    const wallNow = Date.now();
    const spawnSide = Math.random() < 0.5 ? "left" : "right";
    const spawnX = spawnSide === "left" ? ARENA_CENTER.x - 1100 : ARENA_CENTER.x + 1100;
    const spawnY = ARENA_CENTER.y;
    // Health balanced for wave 10 to sustain a 2-minute multi-phase fight: base 1450 + 950 per extra player
    const maxHp = 1450 + (activeCount - 1) * 950;

    this.boss = {
      id: "boss_tung",
      name: "3x T",
      spawnSide,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      facing: spawnSide === "left" ? 1 : -1,
      radius: 78,
      hp: maxHp,
      maxHp: maxHp,
      phase: "intro", // "intro" | "phase1" | "spiral_phase" | "phase3" | "phase4" | "defeated"
      isAngry: false,
      isInvincible: true,
      introUntil: wallNow + 9500, // 7s GIF announcement + 2.5s cinematic stomp entry
      lastAttackAt: wallNow + 11000,
      attackCooldown: Math.max(2800, 4200 - (activeCount - 1) * 450),

      // Projectiles charging barrage
      chargingBarrage: false,
      barrageChargeUntil: 0,
      pendingProjectiles: [],

      // Spirals for Angry Mode
      spirals: [],

      // Stomp attack
      stompTimer: wallNow + 14000,
      stompState: "ready", // "ready" | "stunned_charge" | "airborne" | "landing"
      stompChargeUntil: 0,
      stompAirborneUntil: 0,
      stompTarget: null,

      // Bombs state
      bombs: [],
      lastBombRainAt: 0,
      bombRainCooldown: Math.max(5500, 7500 - (activeCount - 1) * 600),

      animState: "stomp",
      lastPlayerDamageAt: 0,
    };

    io.to(this.room).emit("boss_spawned", {
      boss: {
        id: this.boss.id,
        name: this.boss.name,
        spawnSide: this.boss.spawnSide,
        x: this.boss.x,
        y: this.boss.y,
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        phase: this.boss.phase,
        introUntil: this.boss.introUntil,
      }
    });
  }

  updateBoss(dt, wallNow, roomPlayerIds, bullets, io) {
    if (!this.boss || this.boss.phase === "defeated") return;
    if (this.boss.id === "boss_baby_cyborg") {
      this.updateBabyCyborg(dt, wallNow, roomPlayerIds, bullets, io);
      return;
    }

    const activePlayers = [...roomPlayerIds]
      .map(id => players.get(id))
      .filter(p => p && p.active && p.health > 0);

    const findClosestTarget = () => {
      // Prioritize active players first (ignore players with invincible respawn bubble!)
      const targetablePlayers = activePlayers.filter(p => !p.protectedUntil || p.protectedUntil <= wallNow);
      if (targetablePlayers.length > 0) {
        let closestPlayer = null;
        let closestDist = Infinity;
        for (const p of targetablePlayers) {
          const d = Math.hypot(this.boss.x - p.x, this.boss.y - p.y);
          if (d < closestDist) {
            closestDist = d;
            closestPlayer = p;
          }
        }
        if (closestPlayer) {
          return { x: closestPlayer.x, y: closestPlayer.y, isBase: false, player: closestPlayer };
        }
      }
      return { x: ARENA_CENTER.x, y: ARENA_CENTER.y, isBase: true };
    };

    // 1. Intro Cinematic Stomp into Arena
    if (this.boss.phase === "intro") {
      this.boss.animState = "stomp";
      if (wallNow >= this.boss.introUntil - 2500) {
        const targetX = this.boss.spawnSide === "left" ? ARENA_CENTER.x - 700 : ARENA_CENTER.x + 700;
        const dir = targetX > this.boss.x ? 1 : -1;
        this.boss.x += dir * 120 * dt;
        this.boss.facing = dir;
      }
      if (wallNow >= this.boss.introUntil) {
        this.boss.phase = "phase1";
        this.boss.isInvincible = false;
        this.boss.animState = "idle";
        this.boss.lastAttackAt = wallNow + 1200;
        io.to(this.room).emit("boss_intro_finished", { bossId: this.boss.id });
      }
      return;
    }

    // 2. Stomp Attack State Management (Phase 3 & Phase 4)
    if (this.boss.stompState === "stunned_charge") {
      this.boss.animState = "stomp";
      if (wallNow >= this.boss.stompChargeUntil) {
        this.boss.stompState = "airborne";
        this.boss.stompAirborneUntil = wallNow + 750;
        io.to(this.room).emit("boss_stomp_airborne", { bossId: this.boss.id });
      }
      return;
    } else if (this.boss.stompState === "airborne") {
      if (wallNow >= this.boss.stompAirborneUntil) {
        this.boss.stompState = "ready";
        this.boss.stompTimer = wallNow + Math.max(7000, 10000 - (activePlayers.length - 1) * 1000);
        if (this.boss.stompTarget) {
          this.boss.x = this.boss.stompTarget.x;
          this.boss.y = this.boss.stompTarget.y;
        }
        this.boss.animState = "idle";

        // Slam Damage to targets within 130px core impact zone
        for (const p of activePlayers) {
          const d = Math.hypot(p.x - this.boss.x, p.y - this.boss.y);
          if (d <= 130) {
            p.health = Math.max(0, p.health - 6.5);
            p.lastDamageAt = wallNow;
            io.to(p.id).emit("damage_taken", { health: p.health, damage: 6.5, source: "boss_stomp" });
          }
        }
        if (Math.hypot(ARENA_CENTER.x - this.boss.x, ARENA_CENTER.y - this.boss.y) <= 130) {
          this.baseHealth = Math.max(0, this.baseHealth - 8);
        }

        // Expanding Shockwave Ring (radius 360px) -> Stuns players unless dodging
        const shockwaveRadius = 360;
        for (const p of activePlayers) {
          const d = Math.hypot(p.x - this.boss.x, p.y - this.boss.y);
          if (d <= shockwaveRadius) {
            const isDodging = wallNow < (p.dodgeUntil || 0);
            if (!isDodging) {
              p.stunnedUntil = Math.max(p.stunnedUntil || 0, wallNow + 2500);
              io.to(p.id).emit("player_stunned", { duration: 2500 });
            }
          }
        }

        for (const obj of this.placedObjects) {
          const d = Math.hypot(obj.x - this.boss.x, obj.y - this.boss.y);
          if (d <= shockwaveRadius) {
            obj.hp = Math.max(0, obj.hp - 16);
          }
        }

        io.to(this.room).emit("boss_stomp_landed", {
          bossId: this.boss.id,
          x: this.boss.x,
          y: this.boss.y,
          radius: shockwaveRadius,
        });
      }
      return;
    }

    // 3. Phase Transitions Check
    // A) 100% -> 66.6% HP: Transition to Angry Spiral Mode
    if (this.boss.phase === "phase1" && this.boss.hp <= this.boss.maxHp * (2 / 3)) {
      this.boss.phase = "spiral_phase";
      this.boss.isAngry = true;
      this.boss.isInvincible = true;
      this.boss.chargingBarrage = false;
      this.boss.pendingProjectiles = [];
      this.boss.spirals = [];

      const spiralDist = 280;
      const sHp = 65 + Math.max(0, activePlayers.length - 1) * 35;
      for (let si = 0; si < 4; si++) {
        const sAngle = si * (Math.PI / 2);
        this.boss.spirals.push({
          id: this.nextObjectId++,
          x: this.boss.x + Math.cos(sAngle) * spiralDist,
          y: this.boss.y + Math.sin(sAngle) * spiralDist,
          radius: 46,
          hp: sHp,
          maxHp: sHp,
          angle: sAngle,
          lastShotAt: wallNow + 1200,
        });
      }

      io.to(this.room).emit("boss_phase_changed", {
        phase: "spiral_phase",
        isAngry: true,
        isInvincible: true,
        hp: this.boss.hp,
        spirals: this.boss.spirals,
      });
      return;
    }

    // B) Spiral Phase: Wait for all 4 spirals to be defeated
    if (this.boss.phase === "spiral_phase") {
      this.boss.animState = "idle";
      this.boss.isInvincible = true;

      for (const spiral of this.boss.spirals) {
        spiral.angle = (spiral.angle + 0.85 * dt) % (Math.PI * 2);
        if (wallNow - (spiral.lastShotAt || 0) >= 1450) {
          spiral.lastShotAt = wallNow;
          for (let b = 0; b < 4; b++) {
            const fireAngle = spiral.angle + b * (Math.PI / 2);
            const bx = spiral.x + Math.cos(fireAngle) * 44;
            const by = spiral.y + Math.sin(fireAngle) * 44;
            bullets.push({
              id: nextBulletId++,
              room: this.room,
              ownerId: "spiral_" + spiral.id,
              x: bx,
              y: by,
              vx: Math.cos(fireAngle) * 440,
              vy: Math.sin(fireAngle) * 440,
              damage: 2.6,
              radius: 9,
              character: "tung_projectile",
              bornAt: wallNow,
              expiresAt: wallNow + 1800,
            });
          }
          io.to(this.room).emit("spiral_fired", { id: spiral.id, angle: spiral.angle });
        }
      }

      if (this.boss.spirals.length === 0) {
        this.boss.phase = "phase3";
        this.boss.isInvincible = false;
        this.boss.isAngry = true;
        this.boss.hp = this.boss.maxHp; // Full health regeneration!
        this.boss.stompTimer = wallNow + 3500;
        this.boss.lastAttackAt = wallNow + 1800;
        io.to(this.room).emit("boss_phase_changed", {
          phase: "phase3",
          isAngry: true,
          isInvincible: false,
          regenerated: true,
          hp: this.boss.hp,
        });
      }
      return;
    }

    // C) Phase 3 -> Phase 4 at 50% HP (Bomb Rain begins)
    if (this.boss.phase === "phase3" && this.boss.hp <= this.boss.maxHp * 0.5) {
      this.boss.phase = "phase4";
      this.boss.lastBombRainAt = wallNow + 1800;
      io.to(this.room).emit("boss_phase_changed", {
        phase: "phase4",
        isAngry: true,
        isInvincible: false,
        hp: this.boss.hp,
      });
    }

    // 4. Stomp Attack Trigger (Phase 3 & Phase 4: every 8-10 seconds)
    const stompCandidates = activePlayers.filter(p => !p.protectedUntil || p.protectedUntil <= wallNow);
    if ((this.boss.phase === "phase3" || this.boss.phase === "phase4") &&
        this.boss.stompState === "ready" &&
        !this.boss.chargingBarrage &&
        wallNow >= this.boss.stompTimer &&
        stompCandidates.length > 0) {
      const targetP = stompCandidates[Math.floor(Math.random() * stompCandidates.length)];
      this.boss.stompTarget = { x: targetP.x, y: targetP.y };
      this.boss.stompState = "stunned_charge";
      this.boss.stompChargeUntil = wallNow + 2000;
      this.boss.animState = "stomp";
      io.to(this.room).emit("boss_stomp_telegraph", {
        bossId: this.boss.id,
        target: this.boss.stompTarget,
        duration: 2000,
      });
      return;
    }

    // 5. Bomb Rain (Phase 4: at <= 50% HP)
    if (this.boss.phase === "phase4") {
      if (wallNow - (this.boss.lastBombRainAt || 0) >= this.boss.bombRainCooldown) {
        this.boss.lastBombRainAt = wallNow;
        this.boss.bombs = [];
        const bombCount = 8 + activePlayers.length * 2;
        for (let bi = 0; bi < bombCount; bi++) {
          const bAngle = Math.random() * Math.PI * 2;
          const bDist = 140 + Math.random() * 380;
          const bx = Math.max(ARENA_CENTER.x - ARENA_RADIUS + 80, Math.min(ARENA_CENTER.x + ARENA_RADIUS - 80, this.boss.x + Math.cos(bAngle) * bDist));
          const by = Math.max(ARENA_CENTER.y - ARENA_RADIUS + 80, Math.min(ARENA_CENTER.y + ARENA_RADIUS - 80, this.boss.y + Math.sin(bAngle) * bDist));
          this.boss.bombs.push({
            id: this.nextObjectId++,
            x: bx,
            y: by,
            landAt: wallNow + 2000,
            exploded: false,
          });
        }
        io.to(this.room).emit("boss_bombs_telegraphed", { bombs: this.boss.bombs });
      }

      for (const bomb of this.boss.bombs) {
        if (!bomb.exploded && wallNow >= bomb.landAt) {
          bomb.exploded = true;
          for (const p of activePlayers) {
            if (p.protectedUntil && p.protectedUntil > wallNow) continue;
            const d = Math.hypot(p.x - bomb.x, p.y - bomb.y);
            if (d <= 95) {
              const dmg = 5.5;
              p.health = Math.max(0, p.health - dmg);
              p.lastDamageAt = wallNow;
              io.to(p.id).emit("damage_taken", { health: p.health, damage: dmg, source: "tung_bomb" });
            }
          }
          for (const obj of this.placedObjects) {
            const d = Math.hypot(obj.x - bomb.x, obj.y - bomb.y);
            if (d <= 95) {
              obj.hp = Math.max(0, obj.hp - 20);
            }
          }
          io.to(this.room).emit("boss_bomb_detonated", { x: bomb.x, y: bomb.y });
        }
      }
      this.boss.bombs = this.boss.bombs.filter(b => !b.exploded || wallNow - b.landAt < 1200);
    }

    // 6. 12-Projectile Massive Charging Barrage
    const target = findClosestTarget();
    if (!this.boss.chargingBarrage && wallNow - this.boss.lastAttackAt >= this.boss.attackCooldown) {
      this.boss.chargingBarrage = true;
      this.boss.barrageChargeUntil = wallNow + 1400;
      const aimAngle = Math.atan2(target.y - this.boss.y, target.x - this.boss.x);
      const perpAngle = aimAngle + Math.PI / 2;
      this.boss.pendingProjectiles = [];

      const projCount = 12;
      for (let k = 0; k < projCount; k++) {
        const offset = -120 + k * (240 / (projCount - 1));
        const px = this.boss.x + Math.cos(aimAngle) * 75 + Math.cos(perpAngle) * offset;
        const py = this.boss.y + Math.sin(aimAngle) * 75 + Math.sin(perpAngle) * offset;
        this.boss.pendingProjectiles.push({
          x: px,
          y: py,
          aimAngle,
        });
      }

      io.to(this.room).emit("boss_barrage_charging", {
        bossId: this.boss.id,
        pending: this.boss.pendingProjectiles,
      });
    }

    if (this.boss.chargingBarrage) {
      if (wallNow >= this.boss.barrageChargeUntil) {
        for (const proj of this.boss.pendingProjectiles) {
          const bSpeed = 580;
          bullets.push({
            id: nextBulletId++,
            room: this.room,
            ownerId: "boss_tung",
            x: proj.x,
            y: proj.y,
            vx: Math.cos(proj.aimAngle) * bSpeed,
            vy: Math.sin(proj.aimAngle) * bSpeed,
            damage: 4.0,
            radius: 14,
            character: "tung_projectile",
            bornAt: wallNow,
            expiresAt: wallNow + 2000,
          });
        }
        this.boss.chargingBarrage = false;
        this.boss.pendingProjectiles = [];
        this.boss.lastAttackAt = wallNow;
        io.to(this.room).emit("boss_barrage_fired", { bossId: this.boss.id });
      }
      return;
    }

    // 7. General Movement toward target (Slow, menacing, colossal titan stride)
    const dx = target.x - this.boss.x;
    const dy = target.y - this.boss.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 90) {
      const isAngry = this.boss.phase === "phase3" || this.boss.phase === "phase4";
      const speed = isAngry ? 85 : 70; // Way slower, menacing titan march (was 135)
      this.boss.vx = (dx / dist) * speed;
      this.boss.vy = (dy / dist) * speed;
      this.boss.x += this.boss.vx * dt;
      this.boss.y += this.boss.vy * dt;
      this.boss.facing = dx >= 0 ? 1 : -1;
      this.boss.animState = "walk";
    } else {
      this.boss.animState = "idle";
    }

    // Melee contact crushing damage to close players
    for (const p of activePlayers) {
      if (p.protectedUntil && p.protectedUntil > wallNow) continue;
      const pDist = Math.hypot(p.x - this.boss.x, p.y - this.boss.y);
      const pRadius = characterRadius(p.character);
      if (pDist <= this.boss.radius + pRadius) {
        if (wallNow - (this.boss.lastPlayerDamageAt || 0) >= 800) {
          this.boss.lastPlayerDamageAt = wallNow;
          const contactDmg = 4.5 + Math.min(2.5, (activePlayers.length - 1) * 0.7);
          p.health = Math.max(0, p.health - contactDmg);
          p.lastDamageAt = wallNow;
          const pushX = (p.x - this.boss.x) / (pDist || 1);
          const pushY = (p.y - this.boss.y) / (pDist || 1);
          p.x += pushX * 35;
          p.y += pushY * 35;
          io.to(p.id).emit("damage_taken", { health: p.health, damage: contactDmg, source: "boss_contact" });
        }
      }
    }

    const clamped = clampToArena(this.boss.x, this.boss.y, this.boss.radius);
    this.boss.x = clamped.x;
    this.boss.y = clamped.y;
  }

  spawnBabyCyborg(activeCount, io) {
    const wallNow = Date.now();
    const spawnSide = Math.random() < 0.5 ? "left" : "right";
    const spawnX = spawnSide === "left" ? ARENA_CENTER.x - 1000 : ARENA_CENTER.x + 1000;
    const spawnY = ARENA_CENTER.y;
    const maxHp = BABY_CYBORG_CONFIG.baseHp + Math.max(0, activeCount - 1) * BABY_CYBORG_CONFIG.hpPerExtraPlayer;

    this.boss = {
      id: BABY_CYBORG_CONFIG.id,
      name: BABY_CYBORG_CONFIG.name,
      spawnSide,
      x: spawnX,
      y: spawnY,
      vx: 0,
      vy: 0,
      facing: 1,
      radius: BABY_CYBORG_CONFIG.radius,
      renderSize: BABY_CYBORG_CONFIG.renderSize,
      hp: maxHp,
      maxHp: maxHp,
      phase: "intro", // "intro" | "phase1" | "phase2" | "phase3_cloning" | "phase3" | "defeated"
      isInvincible: true,
      introUntil: wallNow + 2500,
      animState: "walk",
      lastAttackAt: wallNow + 3500,
      attackType: "laser",
      lastPlayerDamageAt: 0,

      // Laser state
      laserState: "idle", // "idle" | "warning" | "firing"
      laserTarget: null,
      laserStartAt: 0,
      laserEndAt: 0,

      // Stomp state
      stompState: "idle", // "idle" | "warning" | "landing"
      stompTarget: null,
      stompWarnUntil: 0,
      stompLandUntil: 0,
      stompRadius: BABY_CYBORG_CONFIG.stomp.radius,
      stompDamage: BABY_CYBORG_CONFIG.stomp.damage,

      // Phase 3 Clones state
      transformationUntil: 0,
      clones: [],
    };

    io.to(this.room).emit("boss_spawned", {
      boss: {
        id: this.boss.id,
        name: this.boss.name,
        spawnSide: this.boss.spawnSide,
        x: this.boss.x,
        y: this.boss.y,
        hp: this.boss.hp,
        maxHp: this.boss.maxHp,
        phase: this.boss.phase,
        introUntil: this.boss.introUntil,
      }
    });
  }

  updateBabyCyborg(dt, wallNow, roomPlayerIds, bullets, io) {
    if (!this.boss || this.boss.phase === "defeated") return;

    const activePlayers = [...roomPlayerIds]
      .map(id => players.get(id))
      .filter(p => p && p.active && p.health > 0);

    const findClosestTarget = (fromX, fromY) => {
      const targetablePlayers = activePlayers.filter(p => !p.protectedUntil || p.protectedUntil <= wallNow);
      if (targetablePlayers.length > 0) {
        let closestPlayer = null;
        let closestDist = Infinity;
        for (const p of targetablePlayers) {
          const d = Math.hypot(fromX - p.x, fromY - p.y);
          if (d < closestDist) {
            closestDist = d;
            closestPlayer = p;
          }
        }
        if (closestPlayer) {
          return { x: closestPlayer.x, y: closestPlayer.y, isBase: false, player: closestPlayer };
        }
      }
      return { x: ARENA_CENTER.x, y: ARENA_CENTER.y, isBase: true };
    };

    const getEntityEyes = (entity, renderWidth, renderHeight) => {
      const leftX = entity.x + (BABY_CYBORG_CONFIG.leftEye.normX - 0.5) * renderWidth;
      const leftY = entity.y + (BABY_CYBORG_CONFIG.leftEye.normY - 0.5) * renderHeight;
      const rightX = entity.x + (BABY_CYBORG_CONFIG.rightEye.normX - 0.5) * renderWidth;
      const rightY = entity.y + (BABY_CYBORG_CONFIG.rightEye.normY - 0.5) * renderHeight;
      return { left: { x: leftX, y: leftY }, right: { x: rightX, y: rightY } };
    };

    const applyLaserBeamDamage = (eyeX, eyeY, targetX, targetY, dps) => {
      const angle = Math.atan2(targetY - eyeY, targetX - eyeX);
      const range = BABY_CYBORG_CONFIG.laser.range;
      const endX = eyeX + Math.cos(angle) * range;
      const endY = eyeY + Math.sin(angle) * range;
      const dmg = dps * dt;
      const beamRadius = 14;

      for (const p of activePlayers) {
        if (p.protectedUntil && p.protectedUntil > wallNow) continue;
        const pRadius = characterRadius(p.character);
        if (distanceToSegment(p.x, p.y, eyeX, eyeY, endX, endY) <= pRadius + beamRadius) {
          p.health = Math.max(0, p.health - dmg);
          p.lastDamageAt = wallNow;
          io.to(p.id).emit("damage_taken", { health: p.health, damage: dmg, source: "baby_laser" });
        }
      }

      if (distanceToSegment(ARENA_CENTER.x, ARENA_CENTER.y, eyeX, eyeY, endX, endY) <= 50 + beamRadius) {
        this.baseHealth = Math.max(0, this.baseHealth - dmg * 0.35);
      }

      for (const obj of this.placedObjects) {
        if (distanceToSegment(obj.x, obj.y, eyeX, eyeY, endX, endY) <= (obj.radius || 24) + beamRadius) {
          obj.hp = Math.max(0, obj.hp - dmg * 0.6);
        }
      }
    };

    const executeStompImpact = (targetX, targetY, radius, damage) => {
      for (const p of activePlayers) {
        if (p.protectedUntil && p.protectedUntil > wallNow) continue;
        const d = Math.hypot(p.x - targetX, p.y - targetY);
        if (d <= radius) {
          const isDodging = wallNow < (p.dodgeUntil || 0);
          if (!isDodging) {
            p.health = Math.max(0, p.health - damage);
            p.lastDamageAt = wallNow;
            io.to(p.id).emit("damage_taken", { health: p.health, damage, source: "baby_stomp" });
          }
        }
      }

      if (Math.hypot(ARENA_CENTER.x - targetX, ARENA_CENTER.y - targetY) <= radius) {
        this.baseHealth = Math.max(0, this.baseHealth - Math.round(damage * 0.18));
      }

      for (const obj of this.placedObjects) {
        const d = Math.hypot(obj.x - targetX, obj.y - targetY);
        if (d <= radius) {
          obj.hp = Math.max(0, obj.hp - damage * 0.5);
        }
      }

      io.to(this.room).emit("baby_stomp_landed", {
        x: targetX,
        y: targetY,
        radius: radius,
      });
    };

    // 1. Intro Walk-in
    if (this.boss.phase === "intro") {
      this.boss.animState = "walk";
      const targetX = this.boss.spawnSide === "left" ? ARENA_CENTER.x - 450 : ARENA_CENTER.x + 450;
      const dir = targetX > this.boss.x ? 1 : -1;
      this.boss.x += dir * BABY_CYBORG_CONFIG.speed * dt;
      if (wallNow >= this.boss.introUntil) {
        this.boss.phase = "phase1";
        this.boss.isInvincible = false;
        this.boss.animState = "idle";
        this.boss.lastAttackAt = wallNow + 1200;
        io.to(this.room).emit("boss_intro_finished", { bossId: this.boss.id });
      }
      return;
    }

    // 2. Phase Transitions
    if (this.boss.phase === "phase1" && this.boss.hp <= this.boss.maxHp * BABY_CYBORG_CONFIG.phaseThresholds.phase2) {
      this.boss.phase = "phase2";
      this.boss.laserState = "idle";
      this.boss.stompState = "idle";
      this.boss.lastAttackAt = wallNow + 1000;
      this.boss.attackType = "stomp";
      io.to(this.room).emit("boss_phase_changed", {
        bossId: this.boss.id,
        phase: "phase2",
        subtitle: "BABY TANTRUM",
        hp: this.boss.hp,
      });
    }

    if ((this.boss.phase === "phase1" || this.boss.phase === "phase2") && this.boss.hp <= this.boss.maxHp * BABY_CYBORG_CONFIG.phaseThresholds.phase3) {
      this.boss.phase = "phase3_cloning";
      this.boss.isInvincible = true;
      this.boss.laserState = "idle";
      this.boss.stompState = "idle";
      this.boss.transformationUntil = wallNow + BABY_CYBORG_CONFIG.transformationDuration;
      io.to(this.room).emit("boss_phase_changed", {
        bossId: this.boss.id,
        phase: "phase3_cloning",
        subtitle: "CLONE PROTOCOL",
        hp: this.boss.hp,
        transformationUntil: this.boss.transformationUntil,
      });
      return;
    }

    // 3. Phase 3 Cloning Transformation
    if (this.boss.phase === "phase3_cloning") {
      this.boss.animState = "idle";
      if (wallNow >= this.boss.transformationUntil) {
        this.boss.phase = "phase3";
        this.boss.isInvincible = false;
        const remainingHp = Math.max(300, this.boss.hp);
        const cloneHp = Math.round(remainingHp / 3);

        this.boss.clones = [
          {
            id: "clone_0",
            x: this.boss.x,
            y: this.boss.y,
            vx: 0,
            vy: 0,
            radius: BABY_CYBORG_CONFIG.cloneRadius,
            renderSize: BABY_CYBORG_CONFIG.cloneRenderSize,
            hp: cloneHp,
            maxHp: cloneHp,
            alive: true,
            animState: "walk",
            facing: 1,
            nextAttackAt: wallNow + 1000,
            attackType: "laser",
            laserState: "idle",
            laserTarget: null,
            laserStartAt: 0,
            laserEndAt: 0,
            stompState: "idle",
            stompTarget: null,
            stompWarnUntil: 0,
            stompLandUntil: 0,
            stompRadius: 110,
            stompDamage: 125,
          },
          {
            id: "clone_1",
            x: this.boss.x - 85,
            y: this.boss.y - 45,
            vx: 0,
            vy: 0,
            radius: BABY_CYBORG_CONFIG.cloneRadius,
            renderSize: BABY_CYBORG_CONFIG.cloneRenderSize,
            hp: cloneHp,
            maxHp: cloneHp,
            alive: true,
            animState: "walk",
            facing: 1,
            nextAttackAt: wallNow + 3400,
            attackType: "stomp",
            laserState: "idle",
            laserTarget: null,
            laserStartAt: 0,
            laserEndAt: 0,
            stompState: "idle",
            stompTarget: null,
            stompWarnUntil: 0,
            stompLandUntil: 0,
            stompRadius: 110,
            stompDamage: 125,
          },
          {
            id: "clone_2",
            x: this.boss.x + 85,
            y: this.boss.y + 45,
            vx: 0,
            vy: 0,
            radius: BABY_CYBORG_CONFIG.cloneRadius,
            renderSize: BABY_CYBORG_CONFIG.cloneRenderSize,
            hp: cloneHp,
            maxHp: cloneHp,
            alive: true,
            animState: "walk",
            facing: 1,
            nextAttackAt: wallNow + 5800,
            attackType: "laser",
            laserState: "idle",
            laserTarget: null,
            laserStartAt: 0,
            laserEndAt: 0,
            stompState: "idle",
            stompTarget: null,
            stompWarnUntil: 0,
            stompLandUntil: 0,
            stompRadius: 110,
            stompDamage: 125,
          },
        ];

        io.to(this.room).emit("boss_clones_spawned", { clones: this.boss.clones });
      }
      return;
    }

    // 4. Phase 1 & Phase 2 Loop
    if (this.boss.phase === "phase1" || this.boss.phase === "phase2") {
      if (this.boss.laserState === "warning") {
        this.boss.animState = "idle";
        if (wallNow >= this.boss.laserStartAt) {
          this.boss.laserState = "firing";
        }
      } else if (this.boss.laserState === "firing") {
        this.boss.animState = "idle";
        const eyes = getEntityEyes(this.boss, this.boss.renderSize, this.boss.renderSize);
        applyLaserBeamDamage(eyes.left.x, eyes.left.y, this.boss.laserTarget.x, this.boss.laserTarget.y, BABY_CYBORG_CONFIG.laser.dpsPerBeam);
        applyLaserBeamDamage(eyes.right.x, eyes.right.y, this.boss.laserTarget.x, this.boss.laserTarget.y, BABY_CYBORG_CONFIG.laser.dpsPerBeam);
        if (wallNow >= this.boss.laserEndAt) {
          this.boss.laserState = "idle";
          this.boss.lastAttackAt = wallNow + BABY_CYBORG_CONFIG.laser.cooldown;
          this.boss.attackType = "stomp";
        }
      } else if (this.boss.stompState === "warning") {
        this.boss.animState = "stomp";
        if (wallNow >= this.boss.stompWarnUntil) {
          this.boss.stompState = "landing";
        }
      } else if (this.boss.stompState === "landing") {
        if (wallNow >= this.boss.stompLandUntil) {
          executeStompImpact(this.boss.stompTarget.x, this.boss.stompTarget.y, this.boss.stompRadius, this.boss.stompDamage);
          this.boss.stompState = "idle";
          this.boss.lastAttackAt = wallNow + BABY_CYBORG_CONFIG.stomp.cooldown;
          this.boss.attackType = "laser";
        }
      } else {
        // Ready for next attack
        if (wallNow >= this.boss.lastAttackAt) {
          const ability = (this.boss.phase === "phase2" && this.boss.attackType === "stomp") ? "stomp" : "laser";
          const target = findClosestTarget(this.boss.x, this.boss.y);

          if (ability === "laser") {
            this.boss.laserState = "warning";
            this.boss.laserTarget = { x: target.x, y: target.y };
            this.boss.laserStartAt = wallNow + BABY_CYBORG_CONFIG.laser.warningDuration;
            this.boss.laserEndAt = this.boss.laserStartAt + BABY_CYBORG_CONFIG.laser.firingDuration;
            io.to(this.room).emit("baby_laser_warning", {
              bossId: this.boss.id,
              target: this.boss.laserTarget,
              duration: BABY_CYBORG_CONFIG.laser.warningDuration,
            });
          } else {
            this.boss.stompState = "warning";
            this.boss.stompTarget = { x: target.x, y: target.y };
            this.boss.stompWarnUntil = wallNow + BABY_CYBORG_CONFIG.stomp.warningDuration;
            this.boss.stompLandUntil = this.boss.stompWarnUntil + 400;
            io.to(this.room).emit("baby_stomp_warning", {
              bossId: this.boss.id,
              target: this.boss.stompTarget,
              radius: this.boss.stompRadius,
              duration: BABY_CYBORG_CONFIG.stomp.warningDuration,
            });
          }
        } else {
          // General movement towards arena center / closest target
          const target = findClosestTarget(this.boss.x, this.boss.y);
          const dx = target.x - this.boss.x;
          const dy = target.y - this.boss.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 90) {
            this.boss.vx = (dx / dist) * BABY_CYBORG_CONFIG.speed;
            this.boss.vy = (dy / dist) * BABY_CYBORG_CONFIG.speed;
            this.boss.x += this.boss.vx * dt;
            this.boss.y += this.boss.vy * dt;
            this.boss.animState = "walk";
          } else {
            this.boss.animState = "idle";
          }
          const clamped = clampToArena(this.boss.x, this.boss.y, this.boss.radius);
          this.boss.x = clamped.x;
          this.boss.y = clamped.y;
        }
      }

      // Contact crushing damage
      for (const p of activePlayers) {
        if (p.protectedUntil && p.protectedUntil > wallNow) continue;
        const pDist = Math.hypot(p.x - this.boss.x, p.y - this.boss.y);
        const pRadius = characterRadius(p.character);
        if (pDist <= this.boss.radius + pRadius) {
          if (wallNow - (this.boss.lastPlayerDamageAt || 0) >= 800) {
            this.boss.lastPlayerDamageAt = wallNow;
            const contactDmg = 4.0;
            p.health = Math.max(0, p.health - contactDmg);
            p.lastDamageAt = wallNow;
            io.to(p.id).emit("damage_taken", { health: p.health, damage: contactDmg, source: "boss_contact" });
          }
        }
      }
      return;
    }

    // 5. Phase 3: Independent Clone Loop
    if (this.boss.phase === "phase3") {
      let aliveCount = 0;
      let totalCloneHp = 0;

      for (const clone of this.boss.clones) {
        if (!clone.alive || clone.hp <= 0) continue;
        aliveCount++;
        totalCloneHp += clone.hp;

        const target = findClosestTarget(clone.x, clone.y);

        if (clone.laserState === "warning") {
          clone.animState = "idle";
          if (wallNow >= clone.laserStartAt) {
            clone.laserState = "firing";
          }
        } else if (clone.laserState === "firing") {
          clone.animState = "idle";
          const eyes = getEntityEyes(clone, clone.renderSize, clone.renderSize);
          applyLaserBeamDamage(eyes.left.x, eyes.left.y, clone.laserTarget.x, clone.laserTarget.y, BABY_CYBORG_CONFIG.laser.dpsPerBeam);
          applyLaserBeamDamage(eyes.right.x, eyes.right.y, clone.laserTarget.x, clone.laserTarget.y, BABY_CYBORG_CONFIG.laser.dpsPerBeam);
          if (wallNow >= clone.laserEndAt) {
            clone.laserState = "idle";
            clone.nextAttackAt = wallNow + BABY_CYBORG_CONFIG.laser.cooldown + Math.random() * 2000;
            clone.attackType = "stomp";
          }
        } else if (clone.stompState === "warning") {
          clone.animState = "stomp";
          if (wallNow >= clone.stompWarnUntil) {
            clone.stompState = "landing";
          }
        } else if (clone.stompState === "landing") {
          if (wallNow >= clone.stompLandUntil) {
            executeStompImpact(clone.stompTarget.x, clone.stompTarget.y, clone.stompRadius, clone.stompDamage);
            clone.stompState = "idle";
            clone.nextAttackAt = wallNow + BABY_CYBORG_CONFIG.stomp.cooldown + Math.random() * 2000;
            clone.attackType = "laser";
          }
        } else {
          // Ready for attack
          if (wallNow >= clone.nextAttackAt) {
            if (clone.attackType === "laser") {
              clone.laserState = "warning";
              clone.laserTarget = { x: target.x, y: target.y };
              clone.laserStartAt = wallNow + BABY_CYBORG_CONFIG.laser.warningDuration;
              clone.laserEndAt = clone.laserStartAt + BABY_CYBORG_CONFIG.laser.firingDuration;
              io.to(this.room).emit("baby_laser_warning", {
                bossId: clone.id,
                target: clone.laserTarget,
                duration: BABY_CYBORG_CONFIG.laser.warningDuration,
              });
            } else {
              clone.stompState = "warning";
              clone.stompTarget = { x: target.x, y: target.y };
              clone.stompWarnUntil = wallNow + BABY_CYBORG_CONFIG.stomp.warningDuration;
              clone.stompLandUntil = clone.stompWarnUntil + 400;
              io.to(this.room).emit("baby_stomp_warning", {
                bossId: clone.id,
                target: clone.stompTarget,
                radius: clone.stompRadius,
                duration: BABY_CYBORG_CONFIG.stomp.warningDuration,
              });
            }
          } else {
            // Move toward target
            const dx = target.x - clone.x;
            const dy = target.y - clone.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 70) {
              clone.vx = (dx / dist) * BABY_CYBORG_CONFIG.cloneSpeed;
              clone.vy = (dy / dist) * BABY_CYBORG_CONFIG.cloneSpeed;
              clone.x += clone.vx * dt;
              clone.y += clone.vy * dt;
              clone.animState = "walk";
            } else {
              clone.animState = "idle";
            }
            const clamped = clampToArena(clone.x, clone.y, clone.radius);
            clone.x = clamped.x;
            clone.y = clamped.y;
          }
        }
      }

      this.boss.hp = totalCloneHp;

      if (aliveCount === 0) {
        this.boss.phase = "defeated";
        this.boss.animState = "idle";
        io.to(this.room).emit("boss_defeated", { bossId: this.boss.id });
      }
    }
  }

  generateCardOptions(player) {
    const available = [];
    const seenCardIds = new Set();
    for (const card of Object.values(HORDE_CARDS)) {
      if (!card || seenCardIds.has(card.id)) continue;
      seenCardIds.add(card.id);
      try {
        if (typeof card.condition === "function" && card.condition(player, this)) {
          available.push(card);
        }
      } catch (e) {
        // Safe skip on condition evaluation error
      }
    }
    // Guarantee fallback cards if pool is too small
    if (available.length < 3) {
      if (!available.some(c => c.id === "granny_turret")) available.push(HORDE_CARDS.granny_turret);
      if (!available.some(c => c.id === "granny_heal_aura")) available.push(HORDE_CARDS.granny_heal_aura);
      if (!available.some(c => c.id === "object_wall" || c.id === "object_barricade")) available.push(HORDE_CARDS.object_barricade);
      if (!available.some(c => c.id === "object_turret")) available.push(HORDE_CARDS.object_turret);
      if (!available.some(c => c.id === "object_trap")) available.push(HORDE_CARDS.object_trap);
    }

    const pool = [];
    for (const card of available) {
      let weight = 10;
      if (card.category === "ability") weight = 4;
      else if (card.rarity === "uncommon") weight = 8;
      for (let i = 0; i < weight; i++) pool.push(card);
    }

    const chosen = [];
    const chosenIds = new Set();
    while (chosen.length < 3 && pool.length > 0) {
      const rand = pool[Math.floor(Math.random() * pool.length)];
      if (!chosenIds.has(rand.id)) {
        chosenIds.add(rand.id);
        chosen.push({
          id: rand.id,
          category: rand.category,
          rarity: rand.rarity,
          name: rand.name,
          desc: rand.desc,
          icon: rand.icon,
          faIcon: rand.faIcon,
        });
      }
      for (let i = pool.length - 1; i >= 0; i--) {
        if (pool[i].id === rand.id) pool.splice(i, 1);
      }
    }
    return chosen;
  }

  autoPlaceObject(player, rawType, io) {
    const type = (rawType === "wall" || rawType === "barricade") ? "barricade" : rawType;
    if (!["barricade", "turret", "trap"].includes(type)) return null;

    // Check caps (Barricade 12, Turret 6, Trap 6)
    const maxCaps = { barricade: 12, turret: 6, trap: 6 };
    const currentCount = this.placedObjects.filter(o => o.type === type).length;
    if (currentCount >= (maxCaps[type] || 12)) {
      // If already capped, remove the oldest one of this type to upgrade position
      const oldIdx = this.placedObjects.findIndex(o => o.type === type);
      if (oldIdx !== -1) {
        this.placedObjects.splice(oldIdx, 1);
      }
    }

    // Determine target placement rings and clearance around Granny (ARENA_CENTER = 1800, 1800)
    let ringRadius = 145;
    let minSpacing = 42;
    let fallbackRings = [145, 185];
    if (type === "turret") {
      ringRadius = 195;
      minSpacing = 65;
      fallbackRings = [195, 235];
    } else if (type === "trap") {
      ringRadius = 270;
      minSpacing = 85;
      fallbackRings = [270, 320, 225];
    }

    let bestX = ARENA_CENTER.x + ringRadius;
    let bestY = ARENA_CENTER.y;
    let bestAngle = 0;
    let maxMinDist = -1;

    for (const r of fallbackRings) {
      const candidates = 24;
      for (let i = 0; i < candidates; i++) {
        const candAngle = (i / candidates) * Math.PI * 2 + (type === "turret" ? 0.15 : (type === "trap" ? 0.3 : 0));
        const cx = ARENA_CENTER.x + Math.cos(candAngle) * r;
        const cy = ARENA_CENTER.y + Math.sin(candAngle) * r;

        let minDistSame = 99999;
        for (const obj of this.placedObjects) {
          if (obj.type === type) {
            const d = Math.hypot(cx - obj.x, cy - obj.y);
            if (d < minDistSame) minDistSame = d;
          }
        }

        const distToCenter = Math.hypot(cx - ARENA_CENTER.x, cy - ARENA_CENTER.y);
        if (distToCenter < 70) continue;

        if (minDistSame > maxMinDist) {
          maxMinDist = minDistSame;
          bestX = cx;
          bestY = cy;
          if (type === "barricade") {
            bestAngle = candAngle + Math.PI / 2; // Tangent defensive wall
          } else if (type === "turret") {
            bestAngle = candAngle; // Outward firing line
          } else {
            bestAngle = 0;
          }
        }
      }
      if (maxMinDist >= minSpacing) break;
    }

    let turretType = "default";
    let baseRadius = type === "barricade" ? 30 : (type === "turret" ? 22 : 60);
    let baseHp = type === "barricade" ? 60 : (type === "turret" ? 28 : 100);
    let baseRange = 240;
    let baseCooldown = 750;
    let baseDamage = 2.2;

    if (type === "turret") {
      const pInv = player?.discordId ? inventoryStorage.getInventory(player.discordId) : null;
      turretType = pInv?.equippedTurret || player?.equippedTurret || "default";
      const cfg = TURRET_TYPES[turretType] || TURRET_TYPES.default;
      baseHp = Math.round(28 * (cfg.healthMultiplier || 1.0));
      baseRadius = Math.round(22 * (cfg.sizeMultiplier || 1.0));
      baseRange = Math.round(240 * (cfg.rangeMultiplier || 1.0));
      baseCooldown = Math.round(750 * (cfg.cooldownMultiplier || 1.0));
      baseDamage = Math.round(2.2 * (cfg.damageMultiplier || 1.0) * 10) / 10;
    }

    const newObj = {
      id: this.nextObjectId++,
      type,
      turretType: type === "turret" ? turretType : undefined,
      ownerId: player ? player.id : "system",
      x: Math.round(bestX),
      y: Math.round(bestY),
      radius: baseRadius,
      hp: baseHp,
      maxHp: baseHp,
      angle: Number.isFinite(bestAngle) ? bestAngle : 0,
      state: "ready",
      lastShotAt: 0,
      baseRange,
      baseCooldown,
      baseDamage,
      frozenUntil: 0,
      recoveryUntil: 0,
      burstRemaining: 0,
      nextBurstShotAt: 0,
      burstIndex: 0,
    };

    this.placedObjects.push(newObj);
    io.to(this.room).emit("horde_object_placed", { object: newObj, autoPlaced: true });
    return newObj;
  }

  autoPlaceAllPending(player, io) {
    if (!player || !Array.isArray(player.pendingPlacements) || player.pendingPlacements.length === 0) return;
    const placed = [];
    while (player.pendingPlacements.length > 0) {
      const type = player.pendingPlacements.shift();
      const obj = this.autoPlaceObject(player, type, io);
      if (obj) placed.push(obj);
    }
    const targetSocket = io.sockets.sockets.get(player.id);
    if (targetSocket) {
      targetSocket.emit("exit_placement_mode");
      if (placed.length > 0) {
        targetSocket.emit("placement_autoplaced", { count: placed.length });
      }
    }
  }

  applyCardUpgrade(player, cardId, io) {
    const card = HORDE_CARDS[cardId];
    if (!card) return;

    // If player has unplaced/stacked objects from previous wave, auto-place them around Granny in a smart way
    if (player.pendingPlacements && player.pendingPlacements.length > 0) {
      this.autoPlaceAllPending(player, io);
    }

    card.apply(player, this);

    const upgradePayload = {
      cardId: card.id,
      name: card.name,
      category: card.category,
      hasDash: player.hasDash === true,
      hasDodge: player.hasDodge === true,
      zoomLevel: player.zoomLevel || 0,
      fireRateMult: player.fireRateMult || 1.0,
      bonusDamageMult: player.bonusDamageMult || 0,
    };
    const targetSocket = io.sockets.sockets.get(player.id);
    if (targetSocket) {
      targetSocket.emit("upgrade_applied", upgradePayload);
    }
    io.to(player.id).emit("upgrade_applied", upgradePayload);

    if (card.category === "object") {
      const objectType = card.id.replace("object_", "");
      if (targetSocket) {
        targetSocket.emit("enter_placement_mode", { objectType });
      }
      io.to(player.id).emit("enter_placement_mode", { objectType });
    }
  }

  startNextWave(io, roomPlayerIds) {
    // If any player hasn't placed their rewards before the next wave begins, auto-place them around Granny
    for (const pid of roomPlayerIds) {
      const p = players.get(pid);
      if (p && p.pendingPlacements && p.pendingPlacements.length > 0) {
        this.autoPlaceAllPending(p, io);
      }
    }

    this.wave += 1;
    this.waveState = "active";
    const activeCount = Math.max(1, [...roomPlayerIds].filter(id => players.get(id)?.active).length);
    this.enemiesSpawnedThisWave = 0;
    this.isBossWave = (this.wave === 10 || this.wave === 20);
    if (this.isBossWave) {
      this.enemiesToSpawnThisWave = 0;
      if (this.wave === 20) {
        io.to(this.room).emit("boss_music_intro", { bossId: "boss_baby_cyborg" });
        this.pendingBossSpawnAt = Date.now() + 2000;
        this.pendingBossType = "baby_cyborg";
        io.to(this.room).emit("wave_started", {
          wave: this.wave,
          totalEnemies: 1,
          isBossWave: true,
          bossType: "baby_cyborg",
        });
      } else {
        this.spawnBoss(activeCount, io);
        io.to(this.room).emit("wave_started", {
          wave: this.wave,
          totalEnemies: 1,
          isBossWave: true,
          bossType: "tung",
        });
      }
    } else {
      this.boss = null;
      this.enemiesToSpawnThisWave = this.getWaveEnemyCount(this.wave, activeCount);
      this.spawnInterval = this.getSpawnInterval(this.wave, activeCount);
      this.lastSpawnAt = Date.now() + 1500;
      io.to(this.room).emit("wave_started", {
        wave: this.wave,
        totalEnemies: this.enemiesToSpawnThisWave,
        isBossWave: false,
      });
    }
  }

  update(dt, wallNow, roomPlayerIds, bullets, io) {
    const activePlayerCount = Math.max(1, [...roomPlayerIds].filter(id => players.get(id)?.active).length);

    if (this.pendingBossSpawnAt && wallNow >= this.pendingBossSpawnAt) {
      this.pendingBossSpawnAt = null;
      if (this.pendingBossType === "baby_cyborg") {
        this.spawnBabyCyborg(activePlayerCount, io);
      }
    }

    if (this.waveState === "active") {
      const maxAlive = Math.min(25, 4 + this.wave * 2 + activePlayerCount * 2);
      if (this.enemiesSpawnedThisWave < this.enemiesToSpawnThisWave && this.enemies.length < maxAlive) {
        if (wallNow - this.lastSpawnAt >= this.spawnInterval) {
          this.lastSpawnAt = wallNow;
          this.enemiesSpawnedThisWave++;
          this.spawnEnemy(activePlayerCount);
        }
      }
    }

    if (this.boss) {
      this.updateBoss(dt, wallNow, roomPlayerIds, bullets, io);
    }

    // When upgrading, gameplay is paused!
    if (this.waveState === "upgrade_selection") {
      return;
    }

    // 1. Granny Core Cannon firing
    if (this.grannyTurretLevel > 0 && this.waveState === "active") {
      const cooldown = Math.max(650, 1800 - (this.grannyTurretLevel - 1) * 220);
      if (wallNow - (this.lastGrannyShotAt || 0) >= cooldown) {
        let closestEnemy = null;
        let closestDist = 720;
        for (const enemy of this.enemies) {
          if (!enemy) continue;
          const d = Math.hypot(enemy.x - ARENA_CENTER.x, enemy.y - ARENA_CENTER.y);
          if (d < closestDist) {
            closestDist = d;
            closestEnemy = enemy;
          }
        }
        if (this.boss && this.boss.phase !== "intro" && this.boss.phase !== "defeated") {
          if (this.boss.id === "boss_baby_cyborg" && this.boss.phase === "phase3" && Array.isArray(this.boss.clones)) {
            for (const clone of this.boss.clones) {
              if (!clone.alive || clone.hp <= 0) continue;
              const d = Math.hypot(clone.x - ARENA_CENTER.x, clone.y - ARENA_CENTER.y);
              if (d < closestDist) {
                closestDist = d;
                closestEnemy = clone;
              }
            }
          } else if (Array.isArray(this.boss.spirals) && this.boss.spirals.length > 0) {
            for (const spiral of this.boss.spirals) {
              const d = Math.hypot(spiral.x - ARENA_CENTER.x, spiral.y - ARENA_CENTER.y);
              if (d < closestDist) {
                closestDist = d;
                closestEnemy = spiral;
              }
            }
          } else if (!this.boss.isInvincible && this.boss.stompState !== "airborne") {
            const d = Math.hypot(this.boss.x - ARENA_CENTER.x, this.boss.y - ARENA_CENTER.y);
            if (d < closestDist) {
              closestDist = d;
              closestEnemy = this.boss;
            }
          }
        }
        if (closestEnemy) {
          this.lastGrannyShotAt = wallNow;
          const angle = Math.atan2(closestEnemy.y - ARENA_CENTER.y, closestEnemy.x - ARENA_CENTER.x);
          const damage = Math.round((2.2 + this.wave * 0.25) * 10) / 10;
          bullets.push({
            id: nextBulletId++,
            room: this.room,
            ownerId: "granny_statue",
            x: ARENA_CENTER.x + Math.cos(angle) * 45,
            y: ARENA_CENTER.y + Math.sin(angle) * 45,
            vx: Math.cos(angle) * 760,
            vy: Math.sin(angle) * 760,
            damage,
            radius: 9,
            character: "granny_plasma",
            bornAt: wallNow,
            expiresAt: wallNow + 1500,
          });
          io.to(this.room).emit("granny_fired", {
            angle,
            targetX: closestEnemy.x,
            targetY: closestEnemy.y,
          });
        }
      }
    }

    // 2. Granny Healing Aura pulse
    if (this.healAuraLevel > 0) {
      const cooldown = Math.max(1200, 3200 - (this.healAuraLevel - 1) * 600);
      if (wallNow - (this.lastHealAuraPulseAt || 0) >= cooldown) {
        this.lastHealAuraPulseAt = wallNow;
        const radius = 220 + this.healAuraLevel * 20;
        const healAmt = 2 + Math.floor(this.healAuraLevel * 0.5);

        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (!p || !p.active || p.health <= 0) continue;
          const d = Math.hypot(p.x - ARENA_CENTER.x, p.y - ARENA_CENTER.y);
          if (d <= radius) {
            const maxHp = getPlayerMaxHealth(p);
            if (p.health < maxHp) {
              p.health = Math.min(maxHp, p.health + healAmt);
              io.to(p.id).emit("heal_received", {
                health: p.health,
                amount: healAmt,
                source: "granny_aura",
              });
            }
          }
        }
      }
    }

    // 3. Placed Turrets automated firing
    for (const obj of this.placedObjects) {
      if (obj.type !== "turret" || obj.hp <= 0) continue;
      const tType = obj.turretType || "default";
      const config = TURRET_TYPES[tType] || TURRET_TYPES.default;
      const cooldown = Math.max(300, (obj.baseCooldown || 750) * (this.turretCooldownMult || 1.0));
      const range = (obj.baseRange || 240) + (this.turretRangeBoost || 0);

      const findClosestTarget = () => {
        let closest = null;
        let cDist = range;
        for (const enemy of this.enemies) {
          if (!enemy) continue;
          const d = Math.hypot(enemy.x - obj.x, enemy.y - obj.y);
          if (d < cDist) { cDist = d; closest = enemy; }
        }
        if (this.boss && this.boss.phase !== "intro" && this.boss.phase !== "defeated") {
          if (this.boss.id === "boss_baby_cyborg" && this.boss.phase === "phase3" && Array.isArray(this.boss.clones)) {
            for (const clone of this.boss.clones) {
              if (!clone.alive || clone.hp <= 0) continue;
              const d = Math.hypot(clone.x - obj.x, clone.y - obj.y);
              if (d < cDist) { cDist = d; closest = clone; }
            }
          } else if (Array.isArray(this.boss.spirals) && this.boss.spirals.length > 0) {
            for (const spiral of this.boss.spirals) {
              const d = Math.hypot(spiral.x - obj.x, spiral.y - obj.y);
              if (d < cDist) { cDist = d; closest = spiral; }
            }
          } else if (!this.boss.isInvincible && this.boss.stompState !== "airborne") {
            const d = Math.hypot(this.boss.x - obj.x, this.boss.y - obj.y);
            if (d < cDist) { cDist = d; closest = this.boss; }
          }
        }
        return closest;
      };

      // Handle ongoing burst shots for burst turrets (double_barrel, tripple_barrel)
      if (obj.burstRemaining > 0 && wallNow >= (obj.nextBurstShotAt || 0) && this.waveState === "active") {
        const target = findClosestTarget();
        if (target) {
          const angle = Math.atan2(target.y - obj.y, target.x - obj.x);
          obj.angle = angle;
          const barrelIdx = obj.burstIndex || 0;
          const lateralOffset = (config.barrelOffsets && config.barrelOffsets[barrelIdx]) || 0;
          const forwardDist = obj.radius + 6;
          const bx = obj.x + Math.cos(angle) * forwardDist - Math.sin(angle) * lateralOffset;
          const by = obj.y + Math.sin(angle) * forwardDist + Math.cos(angle) * lateralOffset;
          const bulletDamage = (obj.baseDamage || 2.2) + (this.turretDamageBoost || 0);

          bullets.push({
            id: nextBulletId++,
            room: this.room,
            ownerId: "turret_" + obj.id,
            turretType: tType,
            x: bx,
            y: by,
            vx: Math.cos(angle) * 680,
            vy: Math.sin(angle) * 680,
            damage: bulletDamage,
            radius: tType === "gold" ? 7 : (tType === "alien" ? 6 : 5),
            character: config.bulletType || "turret_plasma",
            bornAt: wallNow,
            expiresAt: wallNow + 1400,
          });

          io.to(this.room).emit("turret_fired", {
            id: obj.id,
            angle,
            x: bx,
            y: by,
            turretType: tType,
            barrelIndex: barrelIdx,
          });
        }
        obj.burstIndex = (obj.burstIndex || 0) + 1;
        obj.burstRemaining--;
        obj.nextBurstShotAt = wallNow + (config.burstDelay || 90);
      }

      // Check ready for next primary shot / burst volley
      if (wallNow - (obj.lastShotAt || 0) >= cooldown && this.waveState === "active" && (!obj.burstRemaining || obj.burstRemaining <= 0)) {
        const closestEnemy = findClosestTarget();
        if (closestEnemy) {
          obj.lastShotAt = wallNow;
          const angle = Math.atan2(closestEnemy.y - obj.y, closestEnemy.x - obj.x);
          obj.angle = angle;
          const lateralOffset = (config.barrelOffsets && config.barrelOffsets[0]) || 0;
          const forwardDist = obj.radius + 6;
          const bx = obj.x + Math.cos(angle) * forwardDist - Math.sin(angle) * lateralOffset;
          const by = obj.y + Math.sin(angle) * forwardDist + Math.cos(angle) * lateralOffset;
          const bulletDamage = (obj.baseDamage || 2.2) + (this.turretDamageBoost || 0);

          bullets.push({
            id: nextBulletId++,
            room: this.room,
            ownerId: "turret_" + obj.id,
            turretType: tType,
            x: bx,
            y: by,
            vx: Math.cos(angle) * 680,
            vy: Math.sin(angle) * 680,
            damage: bulletDamage,
            radius: tType === "gold" ? 7 : (tType === "alien" ? 6 : 5),
            character: config.bulletType || "turret_plasma",
            bornAt: wallNow,
            expiresAt: wallNow + 1400,
          });

          io.to(this.room).emit("turret_fired", {
            id: obj.id,
            angle,
            x: bx,
            y: by,
            turretType: tType,
            barrelIndex: 0,
          });

          if (config.burstCount > 1) {
            obj.burstRemaining = config.burstCount - 1;
            obj.burstIndex = 1;
            obj.nextBurstShotAt = wallNow + (config.burstDelay || 100);
          }
        }
      }
    }

    // 4. Placed Traps state cycling
    for (const obj of this.placedObjects) {
      if (!obj || obj.type !== "trap") continue;
      if (obj.state === "frozen") {
        if (wallNow >= (obj.frozenUntil || 0)) {
          obj.state = "recovery";
          obj.recoveryUntil = wallNow + (this.trapRecoveryTime || 5000);
          obj.frozenEnemyId = null;
          io.to(this.room).emit("trap_state_changed", { id: obj.id, state: "recovery" });
        }
      } else if (obj.state === "recovery") {
        if (wallNow >= (obj.recoveryUntil || 0)) {
          obj.state = "ready";
          io.to(this.room).emit("trap_state_changed", { id: obj.id, state: "ready" });
        }
      }
    }

    // 5. Enemy Dodge AI
    for (const enemy of this.enemies) {
      if (!enemy) continue;
      if (!enemy.hasDodge || wallNow < enemy.dodgeReadyAt || wallNow < enemy.dodgeUntil) continue;
      if ((enemy.frozenUntil && enemy.frozenUntil > wallNow) || (enemy.stunnedUntil && enemy.stunnedUntil > wallNow)) continue;
      for (const b of bullets) {
        if (!b || b.room !== this.room) continue;
        const bSpeed = Math.hypot(b.vx, b.vy);
        if (bSpeed < 50) continue;
        const toX = enemy.x - b.x;
        const toY = enemy.y - b.y;
        const dist = Math.hypot(toX, toY);
        if (dist > 185 || dist < 20) continue;
        const dot = (b.vx * toX + b.vy * toY) / (bSpeed * dist);
        if (dot > 0.65) {
          enemy.dodgeReadyAt = wallNow + enemy.dodgeCooldown;
          enemy.dodgeUntil = wallNow + 220;
          const perpX = -b.vy / bSpeed;
          const perpY = b.vx / bSpeed;
          const sign = Math.random() < 0.5 ? 1 : -1;
          const dodgeSpeed = enemy.dodgeDistance / 0.22;
          enemy.dodgeVx = sign * perpX * dodgeSpeed;
          enemy.dodgeVy = sign * perpY * dodgeSpeed;
          io.to(this.room).emit("enemy_dodged", {
            enemyId: enemy.id,
            x: enemy.x,
            y: enemy.y,
          });
          break;
        }
      }
    }

    // 6. Move enemies and collisions
    for (let ei = this.enemies.length - 1; ei >= 0; ei--) {
      const enemy = this.enemies[ei];
      if (!enemy) continue;

      // Fire Turret burning DoT effect (refreshes duration on hit, non-stacking)
      if (enemy.burningUntil && wallNow < enemy.burningUntil) {
        const burnDmg = (enemy.burnDps || 0.176) * dt;
        enemy.hp -= burnDmg;
        if (enemy.hp <= 0) {
          for (const pid of roomPlayerIds) {
            const pl = players.get(pid);
            if (pl && pl.active) awardXp(pl, Math.max(1, Math.round(enemy.xp * 0.5)));
          }
          io.to(this.room).emit("enemy_killed", {
            enemyId: enemy.id,
            type: enemy.type,
            x: enemy.x,
            y: enemy.y,
            killerId: "fire_dot",
            xp: enemy.xp,
          });
          this.enemies.splice(ei, 1);
          if (enemy.type === "cyborgian_9" || enemy.isSplitter) {
            this.spawnCyborgianSplit(enemy, io);
          }
          continue;
        }
      }

      // Frozen or Stunned check
      if ((enemy.frozenUntil && enemy.frozenUntil > wallNow) || (enemy.stunnedUntil && enemy.stunnedUntil > wallNow)) {
        continue;
      }

      // Check interaction with placed traps (Expanded cryo field)
      for (const obj of this.placedObjects) {
        if (!obj || obj.type !== "trap") continue;
        const d = Math.hypot(enemy.x - obj.x, enemy.y - obj.y);
        const triggerDist = (obj.radius || 60) + enemy.radius;
        if (d <= triggerDist) {
          if (obj.state === "ready") {
            // First enemy triggers the trap, activating the 5.0s cryo field
            obj.state = "frozen";
            obj.frozenUntil = wallNow + 5000;
            obj.frozenEnemyId = enemy.id;
            enemy.frozenUntil = wallNow + 5000;
            enemy.recoilVx = 0;
            enemy.recoilVy = 0;
            io.to(this.room).emit("trap_triggered", {
              trapId: obj.id,
              enemyId: enemy.id,
              x: obj.x,
              y: obj.y,
            });
            break;
          } else if (obj.state === "frozen" && wallNow < obj.frozenUntil) {
            // Trap is currently activated for 5 seconds: freeze every enemy touching it!
            if (!enemy.frozenUntil || enemy.frozenUntil <= wallNow) {
              enemy.frozenUntil = wallNow + 5000;
              enemy.recoilVx = 0;
              enemy.recoilVy = 0;
              io.to(this.room).emit("enemy_frozen", {
                trapId: obj.id,
                enemyId: enemy.id,
                x: enemy.x,
                y: enemy.y,
                duration: 5000,
              });
            }
            break;
          }
        }
      }

      if ((enemy.frozenUntil && enemy.frozenUntil > wallNow) || (enemy.stunnedUntil && enemy.stunnedUntil > wallNow)) {
        continue;
      }

      if (wallNow < enemy.dodgeUntil) {
        enemy.x += enemy.dodgeVx * dt;
        enemy.y += enemy.dodgeVy * dt;
      } else {
        let targetX = ARENA_CENTER.x;
        let targetY = ARENA_CENTER.y;
        let closestPlayer = null;
        let closestPlayerDist = 160;

        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (!p || !p.active || p.health <= 0 || (p.protectedUntil && p.protectedUntil > wallNow)) continue;
          const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
          if (d < closestPlayerDist) {
            closestPlayerDist = d;
            closestPlayer = p;
          }
        }
        if (closestPlayer) {
          targetX = closestPlayer.x;
          targetY = closestPlayer.y;
        }

        const dx = targetX - enemy.x;
        const dy = targetY - enemy.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 5) {
          const nx = dx / dist;
          const ny = dy / dist;
          enemy.facing = { x: nx, y: ny };
          let moveSpeed = enemy.speed;
          if (enemy.slowedUntil && wallNow < enemy.slowedUntil) {
            moveSpeed *= 0.75;
          }
          // Match the 5px arrival threshold above and avoid overshooting a target.
          const moveDistance = Math.min(moveSpeed * dt, dist - 5);
          enemy.x += nx * moveDistance;
          enemy.y += ny * moveDistance;
        }
      }

      if (enemy.recoilVx || enemy.recoilVy) {
        enemy.x += enemy.recoilVx * dt;
        enemy.y += enemy.recoilVy * dt;
        enemy.recoilVx *= Math.pow(0.85, dt * 60);
        enemy.recoilVy *= Math.pow(0.85, dt * 60);
      }

      // Check collision with placed walls and turrets
      for (let oi = this.placedObjects.length - 1; oi >= 0; oi--) {
        const obj = this.placedObjects[oi];
        if (obj.type === "wall" || obj.type === "barricade" || obj.type === "turret") {
          let cx = obj.x;
          let cy = obj.y;
          let minD = enemy.radius + obj.radius;
          if (obj.type === "wall" || obj.type === "barricade") {
            const pt = getCapsuleClosestPoint(enemy.x, enemy.y, obj.x, obj.y, obj.angle || 0, 62);
            cx = pt.cx;
            cy = pt.cy;
            minD = enemy.radius + 18;
          }
          const d = Math.hypot(enemy.x - cx, enemy.y - cy);
          if (d < minD) {
            const pushX = (enemy.x - cx) / (d || 1);
            const pushY = (enemy.y - cy) / (d || 1);
            enemy.x = cx + pushX * minD;
            enemy.y = cy + pushY * minD;

            if (wallNow - enemy.lastAttackAt >= enemy.attackCooldown && this.waveState === "active") {
              enemy.lastAttackAt = wallNow;
              obj.hp -= enemy.damage;
              io.to(this.room).emit("placed_object_hit", {
                id: obj.id,
                damage: enemy.damage,
                hp: Math.max(0, obj.hp),
                maxHp: obj.maxHp,
                x: obj.x,
                y: obj.y,
              });
              if (obj.hp <= 0) {
                io.to(this.room).emit("placed_object_destroyed", {
                  id: obj.id,
                  type: obj.type,
                  x: obj.x,
                  y: obj.y,
                });
                this.placedObjects.splice(oi, 1);
              }
            }
          }
        }
      }

      const clamped = clampToArena(enemy.x, enemy.y, enemy.radius);
      enemy.x = clamped.x;
      enemy.y = clamped.y;

      // Melee damage to Granny Statue base
      const distToCenter = Math.hypot(enemy.x - ARENA_CENTER.x, enemy.y - ARENA_CENTER.y);
      if (distToCenter <= enemy.radius + 45) {
        if (wallNow - enemy.lastAttackAt >= enemy.attackCooldown && this.waveState === "active") {
          enemy.lastAttackAt = wallNow;
          this.baseHealth = Math.max(0, this.baseHealth - enemy.damage);
          this.lastBaseDamageAt = wallNow;
          io.to(this.room).emit("base_hit", {
            damage: enemy.damage,
            baseHealth: Math.round(this.baseHealth * 10) / 10,
            maxBaseHealth: this.maxBaseHealth,
            x: enemy.x,
            y: enemy.y,
          });
          if (this.baseHealth <= 0) {
            this.waveState = "game_over";
            this.intermissionUntil = wallNow + 6500;
            this.enemies = [];
            this.boss = null;
            this.isBossWave = false;
            clearTimeout(this.upgradeTimeout);
            this.pendingPlayersToChoose.clear();
            io.to(this.room).emit("base_destroyed", { wave: this.wave });
            return;
          }
        }
      }

      // Player interaction: Deflect/Parry, Tactical Dodge damage, or Melee damage
      let enemyKilledThisTick = false;
      for (const pid of roomPlayerIds) {
        if (!enemy) break;
        const p = players.get(pid);
        if (!p || !p.active || p.health <= 0) continue;
        const pDist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        const pRadius = characterRadius(p.character);

        // 1. Deflect / Parry active -> Strike and knock back close enemies
        const isParrying = p.parryUntil > wallNow || (p.shieldUntil && p.shieldUntil > wallNow);
        if (isParrying && pDist <= enemy.radius + pRadius + 30) {
          if (!enemy.lastParryHits) enemy.lastParryHits = new Map();
          if (enemy.lastParryHits.get(p.id) !== p.parryId) {
            enemy.lastParryHits.set(p.id, p.parryId);
            const dmgMult = getPlayerDamageMultiplier(p);
            const deflectDmg = Math.round((3.2 + (p.level || 1) * 0.12) * dmgMult * 10) / 10;
            const pushX = (enemy.x - p.x) / (pDist || 1);
            const pushY = (enemy.y - p.y) / (pDist || 1);
            enemy.x += pushX * 36;
            enemy.y += pushY * 36;
            enemy.recoilVx += pushX * 260;
            enemy.recoilVy += pushY * 260;
            enemy.hp -= deflectDmg;
            io.to(p.id).emit("hit_marker", { targetId: "enemy_" + enemy.id, headshot: false });
            io.to(this.room).emit("enemy_hit", {
              enemyId: enemy.id,
              damage: deflectDmg,
              hp: Math.max(0, enemy.hp),
              maxHp: enemy.maxHp,
              x: enemy.x,
              y: enemy.y,
            });
            if (enemy.hp <= 0) {
              p.score.kills = (p.score.kills || 0) + 1;
              awardXp(p, enemy.xp);
              io.to(this.room).emit("enemy_killed", {
                enemyId: enemy.id,
                type: enemy.type,
                x: enemy.x,
                y: enemy.y,
                killerId: p.id,
              });
              this.enemies.splice(ei, 1);
              if (enemy.type === "cyborgian_9" || enemy.isSplitter) {
                this.spawnCyborgianSplit(enemy, io);
              }
              enemyKilledThisTick = true;
              break;
            }
          }
          continue; // Enemy blocked by deflect; cannot deal damage to player
        }

        // 2. Tactical Dodge active -> Strike and stagger close enemies
        const isDodging = wallNow < (p.dodgeUntil || 0);
        if (isDodging && pDist <= enemy.radius + pRadius + 24) {
          if (!enemy.lastDodgeHits) enemy.lastDodgeHits = new Map();
          if (enemy.lastDodgeHits.get(p.id) !== p.dodgeId) {
            enemy.lastDodgeHits.set(p.id, p.dodgeId);
            const dmgMult = getPlayerDamageMultiplier(p);
            const dodgeDmg = Math.round((2.2 + (p.level || 1) * 0.08) * dmgMult * 10) / 10;
            const dX = p.dodgeDirection?.x || ((enemy.x - p.x) / (pDist || 1));
            const dY = p.dodgeDirection?.y || ((enemy.y - p.y) / (pDist || 1));
            enemy.x += dX * 24;
            enemy.y += dY * 24;
            enemy.recoilVx += dX * 200;
            enemy.recoilVy += dY * 200;
            enemy.hp -= dodgeDmg;
            io.to(p.id).emit("hit_marker", { targetId: "enemy_" + enemy.id, headshot: false });
            io.to(this.room).emit("enemy_hit", {
              enemyId: enemy.id,
              damage: dodgeDmg,
              hp: Math.max(0, enemy.hp),
              maxHp: enemy.maxHp,
              x: enemy.x,
              y: enemy.y,
            });
            if (enemy.hp <= 0) {
              p.score.kills = (p.score.kills || 0) + 1;
              awardXp(p, enemy.xp, true);
              io.to(this.room).emit("enemy_killed", {
                enemyId: enemy.id,
                type: enemy.type,
                x: enemy.x,
                y: enemy.y,
                killerId: p.id,
              });
              this.enemies.splice(ei, 1);
              if (enemy.type === "cyborgian_9" || enemy.isSplitter) {
                this.spawnCyborgianSplit(enemy, io);
              }
              enemyKilledThisTick = true;
              break;
            }
          }
          continue; // Enemy avoided during tactical dodge roll; cannot deal damage to player
        }

        // 3. Tactical Dash active -> Strike, surge through, and STUN enemies for 3 seconds
        const isDashing = wallNow < (p.dashUntil || 0);
        if (isDashing && pDist <= enemy.radius + pRadius + 28) {
          if (!enemy.lastDashHits) enemy.lastDashHits = new Map();
          if (enemy.lastDashHits.get(p.id) !== p.dashId) {
            enemy.lastDashHits.set(p.id, p.dashId);
            const dmgMult = getPlayerDamageMultiplier(p);
            const dashDmg = Math.round((2.8 + (p.level || 1) * 0.10) * dmgMult * 10) / 10;
            const dX = p.dashDirection?.x || ((enemy.x - p.x) / (pDist || 1));
            const dY = p.dashDirection?.y || ((enemy.y - p.y) / (pDist || 1));
            enemy.x += dX * 24;
            enemy.y += dY * 24;
            enemy.recoilVx += dX * 240;
            enemy.recoilVy += dY * 240;
            enemy.hp -= dashDmg;

            // STUN for 3 seconds (3000ms)
            const stunDuration = 3000;
            enemy.stunnedUntil = Math.max(enemy.stunnedUntil || 0, wallNow + stunDuration);

            io.to(p.id).emit("hit_marker", { targetId: "enemy_" + enemy.id, headshot: false });
            io.to(this.room).emit("enemy_stunned", {
              enemyId: enemy.id,
              duration: stunDuration,
              x: enemy.x,
              y: enemy.y,
            });
            io.to(this.room).emit("enemy_hit", {
              enemyId: enemy.id,
              damage: dashDmg,
              hp: Math.max(0, enemy.hp),
              maxHp: enemy.maxHp,
              x: enemy.x,
              y: enemy.y,
            });

            if (enemy.hp <= 0) {
              p.score.kills = (p.score.kills || 0) + 1;
              awardXp(p, enemy.xp, true);
              io.to(this.room).emit("enemy_killed", {
                enemyId: enemy.id,
                type: enemy.type,
                x: enemy.x,
                y: enemy.y,
                killerId: p.id,
              });
              this.enemies.splice(ei, 1);
              if (enemy.type === "cyborgian_9" || enemy.isSplitter) {
                this.spawnCyborgianSplit(enemy, io);
              }
              enemyKilledThisTick = true;
              break;
            }
          }
          continue; // Enemy stunned and passed through by dash; cannot deal melee damage to dashing player
        }

        if (p.protectedUntil > wallNow) continue;
        if (!enemy) break;
        if ((enemy.frozenUntil && enemy.frozenUntil > wallNow) || (enemy.stunnedUntil && enemy.stunnedUntil > wallNow)) continue;

        // 4. Melee damage to player
        if (pDist <= enemy.radius + pRadius + 2) {
          if (wallNow - enemy.lastPlayerAttackAt >= enemy.attackCooldown) {
            enemy.lastPlayerAttackAt = wallNow;
            p.health = Math.max(0, p.health - enemy.damage);
            p.lastDamageAt = wallNow;
            const pushX = (p.x - enemy.x) / (pDist || 1);
            const pushY = (p.y - enemy.y) / (pDist || 1);
            p.x += pushX * 24;
            p.y += pushY * 24;
            io.to(p.id).emit("damage_taken", {
              health: p.health,
              damage: enemy.damage,
              attackerCharacter: "horde_melee",
            });
            if (p.health <= 0) {
              killPlayer(p, null, "horde_melee");
            }
          }
        }
      }
      if (enemyKilledThisTick) continue;
    }

    // 7. Wave Cleared -> Trigger Upgrade Selection (Game Pauses!)
    if (this.waveState === "active") {
      if (this.isBossWave) {
        if (!this.boss || this.boss.phase !== "defeated") {
          return;
        }
      }
      if (this.enemiesSpawnedThisWave >= this.enemiesToSpawnThisWave && this.enemies.length === 0) {
        if (this.isBossWave) {
          this.boss = null;
          this.isBossWave = false;
        }
        this.waveState = "upgrade_selection";
        this.baseHealth = Math.min(this.maxBaseHealth, this.baseHealth + 25);

        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (p) {
            p.active = true;
            p.deadSince = 0;
            p.health = Math.min(getPlayerMaxHealth(p), Math.max(p.health, 10) + 10);
            awardXp(p, 50 + this.wave * 15);
          }
        }

        this.pendingPlayersToChoose = new Set();
        this.cardOfferings.clear();

        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (p) {
            this.pendingPlayersToChoose.add(pid);
            const cards = this.generateCardOptions(p);
            this.cardOfferings.set(pid, cards);
            const payload = {
              wave: this.wave,
              options: cards,
              baseHealth: Math.round(this.baseHealth * 10) / 10,
            };
            const sock = io.sockets.sockets.get(pid);
            if (sock) {
              sock.emit("horde_upgrade_options", payload);
            }
            io.to(pid).emit("horde_upgrade_options", payload);
          }
        }

        const offeringsObj = {};
        for (const [pid, cards] of this.cardOfferings.entries()) {
          offeringsObj[pid] = cards;
        }

        io.to(this.room).emit("wave_cleared", {
          wave: this.wave,
          baseHealth: Math.round(this.baseHealth * 10) / 10,
          isUpgrading: true,
          offerings: offeringsObj,
        });

        clearTimeout(this.upgradeTimeout);
        this.upgradeTimeout = setTimeout(() => {
          if (this.waveState === "upgrade_selection") {
            for (const pid of this.pendingPlayersToChoose) {
              const offerings = this.cardOfferings.get(pid);
              if (offerings && offerings.length > 0) {
                const p = players.get(pid);
                if (p) this.applyCardUpgrade(p, offerings[0].id, io);
              }
            }
            this.pendingPlayersToChoose.clear();
            this.startNextWave(io, roomPlayerIds);
          }
        }, 30000);
      }
    } else if (this.waveState === "game_over") {
      if (wallNow >= this.intermissionUntil) {
        this.wave = 1;
        this.baseHealth = this.maxBaseHealth;
        this.waveState = "active";
        this.boss = null;
        this.isBossWave = false;
        this.enemies = [];
        this.enemiesSpawnedThisWave = 0;
        this.enemiesToSpawnThisWave = this.getWaveEnemyCount(1, activePlayerCount);
        this.spawnInterval = this.getSpawnInterval(1, activePlayerCount);
        this.lastSpawnAt = wallNow + 1200;
        this.placedObjects = [];
        this.grannyTurretLevel = 0;
        this.healAuraLevel = 0;
        this.turretRangeBoost = 0;
        this.turretCooldownMult = 1.0;
        this.turretDamageBoost = 0;
        this.trapRecoveryTime = 5000;
        clearTimeout(this.upgradeTimeout);
        this.pendingPlayersToChoose.clear();
        for (let i = bullets.length - 1; i >= 0; i--) {
          if (bullets[i].room === this.room) bullets.splice(i, 1);
        }
        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (p) {
            p.xp = 0;
            p.level = 1;
            p.health = 20;
            p.hasDash = false;
            p.hasDodge = false;
            p.stunnedUntil = 0;
            p.zoomLevel = 0;
            p.bonusDamageMult = 0;
            p.fireRateMult = 1.0;
            p.pendingPlacements = [];
            p.deadSince = 0;
            p.protectedUntil = wallNow + SPAWN_PROTECTION;
            p.x = ARENA_CENTER.x + (Math.random() - 0.5) * 180;
            p.y = ARENA_CENTER.y + (Math.random() - 0.5) * 180;
            if (p.score) {
              p.score.kills = 0;
              p.score.deaths = 0;
            }
            io.to(p.id).emit("xp_update", {
              xp: 0,
              level: 1,
              lost: true,
              demoted: false,
              nextLevelXp: getXpForNextLevel(1, true),
            });
          }
        }
        io.to(this.room).emit("horde_restarted", { wave: 1, baseHealth: this.baseHealth });
      }
    }
  }
}

function initHordeGame(room) {
  if (!hordeGames.has(room)) {
    hordeGames.set(room, new HordeGame(room));
  }
  const h = hordeGames.get(room);
  if (!Number.isFinite(h.baseHealth) || (h.baseHealth <= 0 && h.waveState !== "game_over")) {
    h.baseHealth = 100;
  }
  if (!Number.isFinite(h.maxBaseHealth) || h.maxBaseHealth <= 0) {
    h.maxBaseHealth = 100;
  }
  return h;
}

function getMaxHealth(character, level = 1, isHorde = false) {
  const base = CHARACTER_STATS[character]?.maxHealth || MAX_HEALTH;
  if (isHorde) {
    // Balanced health scaling up to level 100 (+0.8 max HP per level, reaching ~100 max HP at level 100)
    return Math.round((base + (Math.max(1, level) - 1) * 0.8) * 10) / 10;
  }
  return base;
}

function getPlayerBaseDamage(player) {
  const stats = CHARACTER_STATS[player?.character] || CHARACTER_STATS.granny;
  const isHorde = player?.mode === "horde" || (player?.room && player?.room.endsWith(":horde"));
  if (!isHorde) return stats.damage;

  // In Horde Mode, provide solid baseline firepower so default operatives aren't pea-shooters:
  // Granny / Scientist: 2.5 base damage (was 1.0)
  // Cyborg: 3.2 base damage (was 2.25)
  // Mama Cyborg / Angry Granny: 3.0 base damage (was 2.0)
  // Sigmatom: 5.0 base damage (was 4.5)
  if (stats.damage <= 1.0) return 2.5;
  if (stats.damage <= 2.0) return 3.0;
  if (stats.damage <= 2.5) return 3.2;
  return Math.max(3.5, stats.damage);
}

function getPlayerDamageMultiplier(player) {
  if (!player) return 1.0;
  const isHorde = player.mode === "horde" || (player.room && player.room.endsWith(":horde"));
  if (isHorde) {
    // Operative weapon & ability damage scales +2.5% per level above 1 plus card bonuses
    const levelBonus = (Math.max(1, player.level || 1) - 1) * 0.025;
    const cardBonus = player.bonusDamageMult || 0;
    return 1 + levelBonus + cardBonus;
  }
  return 1.0;
}

function getPlayerMaxHealth(player) {
  if (!player) return MAX_HEALTH;
  const isHorde = player.mode === "horde" || (player.room && player.room.endsWith(":horde"));
  return getMaxHealth(player.character, player.level || 1, isHorde);
}


function clampToArena(x, y, radius = 0) {
  const dx = x - ARENA_CENTER.x;
  const dy = y - ARENA_CENTER.y;
  const dist = Math.hypot(dx, dy);
  const maxDist = Math.max(0, ARENA_RADIUS - radius);
  if (dist > maxDist && dist > 0.001) {
    return {
      x: ARENA_CENTER.x + (dx / dist) * maxDist,
      y: ARENA_CENTER.y + (dy / dist) * maxDist,
      clamped: true,
      nx: dx / dist,
      ny: dy / dist,
    };
  }
  return { x, y, clamped: false, nx: 0, ny: 0 };
}

const OBJECT_CONFIG = {
  car1: { width: 52, height: 52, radius: 25, maxHp: 3, xp: 20, contactDamage: 0.8 },
  car2: { width: 66, height: 40, radius: 28, maxHp: 5, xp: 35, contactDamage: 1.2 },
};
const OBJECT_COUNT = 35;
const roomObjects = new Map();
let nextObjectId = 1;
const grapplerHooks = [];
let nextHookId = 1;

function createRandomObject(room, type = Math.random() < 0.5 ? "car1" : "car2") {
  const config = OBJECT_CONFIG[type];
  const radius = config.radius;
  const maxSpawnDist = ARENA_RADIUS - radius - 120;
  const objs = roomObjects.get(room) || [];
  const roomPlayerIds = rooms.get(room) || new Set();

  let bestX = ARENA_CENTER.x + (Math.random() - 0.5) * 400;
  let bestY = ARENA_CENTER.y + (Math.random() - 0.5) * 400;
  let maxMinClearance = -Infinity;

  for (let attempt = 0; attempt < 80; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = (0.15 + 0.85 * Math.sqrt(Math.random())) * maxSpawnDist;
    const testX = ARENA_CENTER.x + Math.cos(angle) * r;
    const testY = ARENA_CENTER.y + Math.sin(angle) * r;

    if (room && room.endsWith(":horde") && Math.hypot(testX - ARENA_CENTER.x, testY - ARENA_CENTER.y) < 360) {
      continue;
    }

    let minClearance = Infinity;

    for (const other of objs) {
      const d = Math.hypot(testX - other.x, testY - other.y) - (radius + other.radius);
      if (d < minClearance) minClearance = d;
    }

    for (const pid of roomPlayerIds) {
      const p = players.get(pid);
      if (p) {
        const pRad = characterRadius(p.character);
        const d = Math.hypot(testX - p.x, testY - p.y) - (radius + pRad);
        if (d < minClearance) minClearance = d;
      }
    }

    if (minClearance > 120) {
      bestX = testX;
      bestY = testY;
      break;
    }

    if (minClearance > maxMinClearance) {
      maxMinClearance = minClearance;
      bestX = testX;
      bestY = testY;
    }
  }

  return {
    id: nextObjectId++,
    room,
    type,
    x: bestX,
    y: bestY,
    vx: (Math.random() - 0.5) * 45,
    vy: (Math.random() - 0.5) * 45,
    angle: Math.random() * Math.PI * 2,
    vAngle: (Math.random() - 0.5) * 0.9,
    hp: config.maxHp,
    maxHp: config.maxHp,
    radius: config.radius,
    xp: config.xp,
    contactDamage: config.contactDamage,
  };
}

function initRoomObjects(room) {
  if (room.endsWith(":horde")) return;
  if (roomObjects.has(room)) return;
  const list = [];
  for (let i = 0; i < OBJECT_COUNT; i++) {
    list.push(createRandomObject(room));
  }
  roomObjects.set(room, list);
}

function respawnObject(room, type) {
  if (room.endsWith(":horde")) return;
  const list = roomObjects.get(room);
  if (!list) return;
  list.push(createRandomObject(room, type));
}

const LEVEL_XP_THRESHOLDS = [0];
let runningXpThreshold = 0;
for (let lvl = 2; lvl <= 100; lvl++) {
  const delta = Math.round(180 + Math.pow(lvl - 1, 1.82) * 55);
  runningXpThreshold += delta;
  LEVEL_XP_THRESHOLDS.push(runningXpThreshold);
}

function getLevelForXp(xp, isHorde = false) {
  const maxLvl = isHorde ? 100 : 10;
  for (let lvl = maxLvl; lvl >= 1; lvl--) {
    if (xp >= LEVEL_XP_THRESHOLDS[lvl - 1]) return lvl;
  }
  return 1;
}

function getXpForNextLevel(level, isHorde = false) {
  const maxLvl = isHorde ? 100 : 10;
  if (level >= maxLvl) return LEVEL_XP_THRESHOLDS[maxLvl - 1];
  return LEVEL_XP_THRESHOLDS[level] || LEVEL_XP_THRESHOLDS[maxLvl - 1];
}

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
const randomPosition = (character, room = null) => {
  const pRadius = characterRadius(character);
  const maxSpawnDist = ARENA_RADIUS - pRadius - 100;
  const objs = room ? (roomObjects.get(room) || []) : [];
  const roomPlayerIds = room ? (rooms.get(room) || new Set()) : new Set();

  let bestX = ARENA_CENTER.x + (Math.random() - 0.5) * 300;
  let bestY = ARENA_CENTER.y + (Math.random() - 0.5) * 300;
  let maxMinClearance = -Infinity;

  for (let attempt = 0; attempt < 80; attempt++) {
    const angle = Math.random() * Math.PI * 2;
    const r = (0.1 + 0.9 * Math.sqrt(Math.random())) * maxSpawnDist;
    const testX = ARENA_CENTER.x + Math.cos(angle) * r;
    const testY = ARENA_CENTER.y + Math.sin(angle) * r;

    let minClearance = Infinity;

    for (const obj of objs) {
      const d = Math.hypot(testX - obj.x, testY - obj.y) - (pRadius + obj.radius);
      if (d < minClearance) minClearance = d;
    }

    for (const pid of roomPlayerIds) {
      const other = players.get(pid);
      if (other) {
        const d = Math.hypot(testX - other.x, testY - other.y) - (pRadius + characterRadius(other.character));
        if (d < minClearance) minClearance = d;
      }
    }

    if (minClearance > 140) {
      return { x: testX, y: testY };
    }

    if (minClearance > maxMinClearance) {
      maxMinClearance = minClearance;
      bestX = testX;
      bestY = testY;
    }
  }

  return { x: bestX, y: bestY };
};

const getPlayerSpawn = (character, room = null) => {
  if (room && room.endsWith(":horde")) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 50 + Math.random() * 140;
    return {
      x: ARENA_CENTER.x + Math.cos(angle) * dist,
      y: ARENA_CENTER.y + Math.sin(angle) * dist,
    };
  }
  return randomPosition(character, room);
};

function killPlayer(victim, killerId = null, attackerCharacter = "environment") {
  if (!victim || !victim.active || victim.health <= 0) return;
  victim.health = 0;
  victim.deadSince = Date.now();
  victim.score.deaths += 1;
  victim.soundwaveActive = false;

  // Clean up any grappler hooks involving this victim
  for (let hi = grapplerHooks.length - 1; hi >= 0; hi--) {
    if (grapplerHooks[hi].ownerId === victim.id || grapplerHooks[hi].targetId === victim.id) {
      grapplerHooks.splice(hi, 1);
    }
  }

  let attacker = killerId ? players.get(killerId) : null;
  if (attacker && attacker.room === victim.room) {
    attacker.score.kills += 1;
    awardXp(attacker, 50); // Elimination bonus
    io.to(attacker.id).emit("hit_marker", {
      targetId: victim.id,
      kill: true,
    });
    io.to(victim.room).emit("player_kill", {
      killerId: attacker.id,
      killerName: attacker.name,
      killerCharacter: attacker.character,
      killerLevel: attacker.level || 1,
      victimId: victim.id,
      victimName: victim.name,
      victimCharacter: victim.character,
      victimLevel: victim.level || 1,
      weapon: attackerCharacter,
    });
  } else {
    io.to(victim.room).emit("player_kill", {
      killerId: null,
      killerName: attackerCharacter === "car" ? "Obstacle" : "The Void",
      killerCharacter: attackerCharacter,
      killerLevel: 1,
      victimId: victim.id,
      victimName: victim.name,
      victimCharacter: victim.character,
      victimLevel: victim.level || 1,
      weapon: attackerCharacter,
    });
  }

  // In Diep.io, dying halves XP / level
  victim.xp = Math.floor((victim.xp || 0) * 0.5);
  victim.level = getLevelForXp(victim.xp);

  let demoted = false;
  if (victim.character === "mama_cyborg" && victim.level < 10) {
    victim.character = "cyborg";
    demoted = true;
    io.to(victim.room).emit("character_switched", {
      playerId: victim.id,
      character: "cyborg",
    });
  } else if (victim.character === "angry_granny" && victim.level < 10) {
    victim.character = "granny";
    demoted = true;
    io.to(victim.room).emit("character_switched", {
      playerId: victim.id,
      character: "granny",
    });
  }

  io.to(victim.id).emit("xp_update", {
    xp: victim.xp,
    level: victim.level,
    lost: true,
    demoted,
    nextLevelXp: getXpForNextLevel(victim.level),
  });

  io.to(victim.id).emit("jumpscare", {
    health: 0,
    damage: 100,
    attackerCharacter,
  });

  setTimeout(() => {
    if (!players.has(victim.id)) return;
    const nextSpawn = getPlayerSpawn(victim.character, victim.room);
    victim.x = nextSpawn.x;
    victim.y = nextSpawn.y;
    victim.health = getPlayerMaxHealth(victim);
    victim.deadSince = 0;
    victim.soundwaveActive = false;
    victim.shieldUntil = 0;
    victim.protectedUntil = Date.now() + SPAWN_PROTECTION;
    victim.lastShotAt = 0;
    victim.dashUntil = 0;
    victim.dashReadyAt = 0;
    victim.parryUntil = 0;
    victim.parryReadyAt = 0;
  }, 1200);
}
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
  const bRadius = bullet.radius || BULLET_RADIUS;
  const segmentX = bullet.x - previousX;
  const segmentY = bullet.y - previousY;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const maxRadius = characterRadius(player.character) + bRadius;
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
    if (circleTouchesMask(mask, player, x, y, bRadius)) return true;
  }
  return false;
}
function sweptBulletTouchesParry(bullet, player, previousX, previousY) {
  const bRadius = bullet.radius || BULLET_RADIUS;
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
  if (Math.hypot(impactX - player.x, impactY - player.y) > radius + bRadius)
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
    maxAge: "1h",
    setHeaders(res, filePath) {
      // The HTML points at hashed bundles and must never outlive a deployment.
      // Hashed JS and media remain safe to cache indefinitely.
      if (filePath.startsWith(path.join(__dirname, "dist", "assets") + path.sep)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
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
let clientBuild = null;
try {
  clientBuild = require("fs").readFileSync(path.join(__dirname, "dist", "index.html"), "utf8").match(/src="([^" ]+\.js)"/)?.[1] || null;
} catch {}
app.get("/health", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, players: players.size, build: clientBuild, processId: process.pid });
});
app.get("/favicon.ico", (req, res) => res.redirect(302, "/favicon.svg"));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
io.use(async (socket, next) => {
  const { accessToken, instanceId, guestName, customName, mode, guestId } = socket.handshake.auth || {};
  const requestedMode = mode === "horde" ? "horde" : "ffa";
  const validCustomName = (typeof customName === "string" && customName.trim().length > 0)
    ? customName.trim().slice(0, 20)
    : null;
  if (accessToken === "dev-token" || !accessToken || accessToken.startsWith("guest-")) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const validGuest = (typeof guestName === "string" && /^Guest\d{4}$/.test(guestName))
      ? guestName
      : `Guest${randomNum}`;
    socket.data.identity = {
      id: typeof guestId === "string" && /^[a-f0-9-]{36}$/i.test(guestId) ? "guest-" + guestId : "guest-" + validGuest,
      name: validCustomName || validGuest,
      instanceId: instanceId || "browser-arena",
      isGuest: true,
      mode: requestedMode,
    };
    return next();
  }
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
      signal: AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return next(new Error("Discord login expired or invalid"));
    const user = await r.json();
    if (!user.id) return next(new Error("Invalid Discord user"));
    socket.data.identity = {
      id: user.id,
      name: validCustomName || String(user.global_name || user.username || "Player").slice(0, 20),
      instanceId,
      mode: requestedMode,
    };
    next();
  } catch (e) {
    next(new Error("Could not verify Discord user"));
  }
});
const attachParty = require("./parties.cjs")(io);
io.on("connection", (socket) => {
  const { id: discordId, name, instanceId, mode: initialMode } = socket.data.identity;
  const isGuest = Boolean(socket.data.identity?.isGuest);
  let playerInv = null;
  if (!isGuest) {
    playerInv = inventoryStorage.getInventory(discordId);
  } else {
    playerInv = getGuestInventory(socket.id, discordId);
  }
  let currentMode = initialMode === "horde" ? "horde" : "ffa";
  const hordeRoom = `activity:${instanceId}:horde`;
  const ffaRoom = `activity:${instanceId}:ffa`;
  const hordeActiveCount = [...(rooms.get(hordeRoom) || [])].length;
  const ffaActiveCount = [...(rooms.get(ffaRoom) || [])].length;
  if (initialMode !== "horde" && hordeActiveCount > 0 && ffaActiveCount === 0) {
    currentMode = "horde";
  }
  const room = `activity:${instanceId}:${currentMode}`;
  socket.join(room);
  if (currentMode === "horde") {
    initHordeGame(room);
  } else {
    initRoomObjects(room);
  }
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
  const isHorde = currentMode === "horde";
  const defaultChar = isHorde ? "scientist" : "granny";
  const spawn = getPlayerSpawn(defaultChar, room);
  const p = {
    id: socket.id,
    discordId,
    name,
    x: spawn.x,
    y: spawn.y,
    color: `hsl(${Math.floor(Math.random() * 360)} 75% 65%)`,
    character: defaultChar,
    mode: currentMode,
    lastFfaCharacter: "granny",
    equippedTurret: playerInv.equippedTurret || "default",
    keys: { up: false, down: false, left: false, right: false },
    facing: { x: 1, y: 0 },
    parryId: 0,
    parryStartedAt: 0,
    parryUntil: 0,
    parryReadyAt: 0,
    shieldUntil: 0,
    deadSince: 0,
    lastInputSeq: 0,
    dashId: 0,
    dashStartedAt: 0,
    dashUntil: 0,
    dashReadyAt: 0,
    dashDirection: { x: 1, y: 0 },
    lastShotAt: 0,
    health: getMaxHealth(defaultChar),
    score,
    minigun: false,
    active: false,
    protectedUntil: 0,
    room,
    xp: 0,
    level: 1,
    lastObjectHitAt: 0,
    lastDamageAt: 0,
    soundwaveActive: false,
    soundwaveAngle: 0,
    hasDash: currentMode !== "horde",
    hasDodge: false,
    zoomLevel: 0,
    pendingPlacements: [],
    lastSoundwavePulseAt: 0,
  };
  players.set(socket.id, p);

  // Sync inventory state to player
  socket.emit("inventory_sync", {
    inventory: playerInv,
    isAdmin: !isGuest && discordId === ADMIN_DISCORD_ID,
    isGuest,
  });

  // Check pending gifts for authenticated user
  if (!isGuest) {
    const pending = inventoryStorage.getPendingGiftsForUser(discordId);
    if (pending && pending.length > 0) {
      socket.emit("pending_gifts", { gifts: pending });
    }
  }
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room).add(socket.id);
  socket.emit("init", {
    id: socket.id,
    width: WIDTH,
    height: HEIGHT,
    serverTime: Date.now(),
    xp: p.xp,
    level: p.level,
    name: p.name,
    discordId: p.discordId,
    mode: p.mode,
    character: p.character,
  });
  socket.on("time_sync", (acknowledge) => {
    if (typeof acknowledge === "function") acknowledge(Date.now());
  });
  socket.on("input", (payload) => {
    if (Number.isSafeInteger(payload?.sequence) && payload.sequence <= p.lastInputSeq) return;
    const keys = payload?.keys || payload;
    if (!keys || typeof keys !== "object") return;
    for (const k of ["up", "down", "left", "right"])
      p.keys[k] = keys[k] === true;
    if (Number.isSafeInteger(payload?.sequence))
      p.lastInputSeq = Math.max(p.lastInputSeq, payload.sequence);
  });
  socket.on("character", (character) => {
    if (p.mode === "horde") return;
    if (!p.active) {
      if ((character === "mama_cyborg" || character === "angry_granny") && p.level < 10 && p.xp < 1000) return;
      if (character === "granny" || character === "cyborg" || character === "mama_cyborg" || character === "angry_granny") {
        p.character = character;
        p.lastFfaCharacter = character;
        p.health = getPlayerMaxHealth(p);
        const radius = characterRadius(character);
        p.x = clamp(p.x, radius, WIDTH - radius);
        p.y = clamp(p.y, radius, HEIGHT - radius);
      }
    }
  });
  socket.on("switch_character", (character) => {
    if (p.mode === "horde") {
      if (character !== "sigmatom" && character !== "scientist") return;
    } else {
      const validCharacters = ["granny", "cyborg", "mama_cyborg", "angry_granny", "sigmatom"];
      if (!validCharacters.includes(character)) return;
      if ((character === "mama_cyborg" || character === "angry_granny") && (p.level < 10 && p.xp < 1000)) return;
    }
    p.character = character;
    if (p.mode !== "horde") {
      p.lastFfaCharacter = character;
    }
    const maxHp = getPlayerMaxHealth(p);
    p.health = maxHp;
    p.soundwaveActive = false;
    const radius = characterRadius(character);
    p.x = clamp(p.x, radius, WIDTH - radius);
    p.y = clamp(p.y, radius, HEIGHT - radius);
    io.to(p.room).emit("character_switched", {
      playerId: p.id,
      character: p.character,
      health: p.health,
      maxHealth: maxHp,
    });
  });
  function moveMode(targetMode, explicitRoom) {
    const validMode = targetMode === "horde" ? "horde" : "ffa";
    const targetRoom = explicitRoom || (validMode === "horde" && party.room()) || `activity:${instanceId}:${validMode}`;
    if (p.mode === validMode && p.room === targetRoom && rooms.get(targetRoom)?.has(socket.id)) {
      if (validMode === "horde") {
        initHordeGame(targetRoom);
      }
      socket.emit("mode_switched", { mode: validMode, character: p.character });
      return;
    }
    const oldRoom = p.room;
    socket.leave(oldRoom);
    rooms.get(oldRoom)?.delete(socket.id);

    p.mode = validMode;
    const newRoom = targetRoom;
    p.room = newRoom;
    socket.join(newRoom);
    if (!rooms.has(newRoom)) rooms.set(newRoom, new Set());
    rooms.get(newRoom).add(socket.id);

    if (validMode === "horde") {
      p.character = "scientist";
      p.xp = 0;
      p.level = 1;
      p.health = 20;
      p.hasDash = false;
      p.hasDodge = false;
      p.zoomLevel = 0;
      p.pendingPlacements = [];
      const spawn = getPlayerSpawn("scientist", newRoom);
      p.x = spawn.x;
      p.y = spawn.y;
      initHordeGame(newRoom);
      io.to(p.id).emit("xp_update", {
        xp: 0,
        level: 1,
        lost: false,
        demoted: false,
        nextLevelXp: getXpForNextLevel(1, true),
      });
    } else {
      p.character = p.lastFfaCharacter || "granny";
      p.health = getPlayerMaxHealth(p);
      p.hasDash = true;
      p.hasDodge = false;
      p.zoomLevel = 0;
      p.pendingPlacements = [];
      const spawn = getPlayerSpawn(p.character, newRoom);
      p.x = spawn.x;
      p.y = spawn.y;
      initRoomObjects(newRoom);
    }
    p.deadSince = 0;
    p.protectedUntil = Date.now() + SPAWN_PROTECTION;
    socket.emit("mode_switched", { mode: validMode, character: p.character });
  }
  const party = attachParty(socket, p, moveMode);
  socket.on("switch_mode", targetMode => { if (targetMode !== "horde") party.leave(); moveMode(targetMode); });
  socket.on("change_name", (rawName) => {
    if (typeof rawName !== "string") return;
    const cleanName = rawName.trim().slice(0, 20);
    if (!cleanName) return;
    p.name = cleanName;
    const scores = roomScores.get(p.room);
    if (scores && p.discordId) {
      const scoreEntry = scores.get(p.discordId);
      if (scoreEntry) scoreEntry.name = cleanName;
    }
    socket.emit("name_updated", cleanName);
  });
  socket.on("choose_horde_upgrade", (payload) => {
    if (p.mode !== "horde") return;
    const horde = hordeGames.get(p.room);
    if (!horde || horde.waveState !== "upgrade_selection") return;
    const cardId = payload?.cardId;
    if (!cardId) return;

    horde.applyCardUpgrade(p, cardId, io);
    horde.pendingPlayersToChoose.delete(socket.id);

    const roomPids = rooms.get(horde.room) || new Set();
    const stillWaiting = [...horde.pendingPlayersToChoose].some(id => roomPids.has(id) && io.sockets.sockets.has(id));
    if (!stillWaiting || horde.pendingPlayersToChoose.size === 0) {
      clearTimeout(horde.upgradeTimeout);
      horde.startNextWave(io, roomPids);
    }
  });
  socket.on("request_horde_upgrades", () => {
    if (p.mode !== "horde") return;
    const horde = hordeGames.get(p.room);
    if (!horde || horde.waveState !== "upgrade_selection") return;
    let cards = horde.cardOfferings.get(socket.id);
    if (!cards || cards.length === 0) {
      horde.pendingPlayersToChoose.add(socket.id);
      cards = horde.generateCardOptions(p);
      horde.cardOfferings.set(socket.id, cards);
    }
    const payload = {
      wave: horde.wave,
      options: cards,
      baseHealth: Math.round(horde.baseHealth * 10) / 10,
    };
    socket.emit("horde_upgrade_options", payload);
  });
  socket.on("dev_spawn_boss", (payload) => {
    const horde = hordeGames.get(p.room);
    if (!horde) return;
    const activeCount = Math.max(1, [...(rooms.get(p.room) || [])].filter(id => players.get(id)?.active).length);
    const bossType = payload?.type || "baby_cyborg";
    horde.isBossWave = true;
    horde.enemiesToSpawnThisWave = 0;
    horde.enemies = [];
    if (bossType === "baby_cyborg") {
      io.to(horde.room).emit("boss_music_intro", { bossId: "boss_baby_cyborg" });
      horde.spawnBabyCyborg(activeCount, io);
      io.to(horde.room).emit("wave_started", {
        wave: horde.wave,
        totalEnemies: 1,
        isBossWave: true,
        bossType: "baby_cyborg",
      });
    } else {
      horde.spawnBoss(activeCount, io);
      io.to(horde.room).emit("wave_started", {
        wave: horde.wave,
        totalEnemies: 1,
        isBossWave: true,
        bossType: "tung",
      });
    }
  });
  socket.on("place_horde_object", (payload) => {
    if (p.mode !== "horde") return;
    if (Date.now() < (p.stunnedUntil || 0)) return;
    const horde = hordeGames.get(p.room);
    if (!horde) return;
    const type = payload?.type;
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    const angle = Number(payload?.angle) || 0;
    if (!["wall", "barricade", "turret", "trap"].includes(type)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const distFromCenter = Math.hypot(x - ARENA_CENTER.x, y - ARENA_CENTER.y);
    if (distFromCenter > ARENA_RADIUS - 50 || distFromCenter < 65) return;

    let idx = (p.pendingPlacements || []).indexOf(type);
    if (idx === -1 && (type === "barricade" || type === "wall")) {
      idx = (p.pendingPlacements || []).findIndex(t => t === "barricade" || t === "wall");
    }
    if (idx === -1) return;
    p.pendingPlacements.splice(idx, 1);

    let turretType = "default";
    let baseRadius = isBarricade ? 30 : (type === "turret" ? 22 : 60);
    let baseHp = isBarricade ? 60 : (type === "turret" ? 28 : 100);
    let baseRange = 240;
    let baseCooldown = 750;
    let baseDamage = 2.2;

    if (type === "turret") {
      const pInv = p?.discordId ? inventoryStorage.getInventory(p.discordId) : null;
      turretType = pInv?.equippedTurret || p?.equippedTurret || "default";
      const cfg = TURRET_TYPES[turretType] || TURRET_TYPES.default;
      baseHp = Math.round(28 * (cfg.healthMultiplier || 1.0));
      baseRadius = Math.round(22 * (cfg.sizeMultiplier || 1.0));
      baseRange = Math.round(240 * (cfg.rangeMultiplier || 1.0));
      baseCooldown = Math.round(750 * (cfg.cooldownMultiplier || 1.0));
      baseDamage = Math.round(2.2 * (cfg.damageMultiplier || 1.0) * 10) / 10;
    }

    const newObj = {
      id: horde.nextObjectId++,
      type: isBarricade ? "barricade" : type,
      turretType: type === "turret" ? turretType : undefined,
      ownerId: p.id,
      x: Math.round(x),
      y: Math.round(y),
      radius: baseRadius,
      hp: baseHp,
      maxHp: baseHp,
      angle: Number.isFinite(angle) ? angle : 0,
      state: "ready",
      lastShotAt: 0,
      baseRange,
      baseCooldown,
      baseDamage,
      frozenUntil: 0,
      recoveryUntil: 0,
      burstRemaining: 0,
      nextBurstShotAt: 0,
      burstIndex: 0,
    };
    horde.placedObjects.push(newObj);
    io.to(p.room).emit("horde_object_placed", { object: newObj });
    if (p.pendingPlacements && p.pendingPlacements.length > 0) {
      socket.emit("enter_placement_mode", { objectType: p.pendingPlacements[0] });
    } else {
      socket.emit("exit_placement_mode");
    }
  });
  socket.on("cancel_placement", () => {
    if (p.mode !== "horde") return;
    const horde = hordeGames.get(p.room);
    if (!horde) return;
    if (p.pendingPlacements && p.pendingPlacements.length > 0) {
      horde.autoPlaceAllPending(p, io);
    } else {
      socket.emit("exit_placement_mode");
    }
  });
  socket.on("tom_aura", () => {
    const now = Date.now();
    if (!p.active || p.health <= 0 || p.character !== "sigmatom") return;
    if (p.lastTomAuraAt && now - p.lastTomAuraAt < 1200) return;
    p.lastTomAuraAt = now;
    io.to(p.room).emit("tom_aura_played", {
      playerId: p.id,
      x: p.x,
      y: p.y,
      timestamp: now,
    });
    const horde = hordeGames.get(p.room);
    if (horde) {
      for (const enemy of horde.enemies) {
        if (!enemy) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 340) {
          const pushX = dx / (d || 1);
          const pushY = dy / (d || 1);
          enemy.x += pushX * 140;
          enemy.y += pushY * 140;
          const clamped = clampToArena(enemy.x, enemy.y, enemy.radius);
          enemy.x = clamped.x;
          enemy.y = clamped.y;
        }
      }
    }
  });
  socket.on("soundwave_start", (payload) => {
    if (!p.active || p.health <= 0 || p.character !== "sigmatom") return;
    p.soundwaveActive = true;
    p.soundwaveAngle = Number(payload?.angle) || Math.atan2(p.facing.y, p.facing.x);
    p.lastSoundwavePulseAt = Date.now();
    io.to(p.room).emit("soundwave_started", {
      playerId: p.id,
      angle: p.soundwaveAngle,
    });
  });
  socket.on("soundwave_aim", (payload) => {
    if (!p.active || p.health <= 0 || p.character !== "sigmatom" || !p.soundwaveActive) return;
    p.soundwaveAngle = Number(payload?.angle) || 0;
    io.to(p.room).emit("soundwave_aimed", {
      playerId: p.id,
      angle: p.soundwaveAngle,
    });
  });
  socket.on("soundwave_stop", () => {
    if (!p.soundwaveActive) return;
    p.soundwaveActive = false;
    io.to(p.room).emit("soundwave_stopped", {
      playerId: p.id,
    });
  });
  socket.on("active", (active) => {
    const nextActive = active === true;
    if (nextActive && !party.canActivate()) return;
    if (nextActive && (!p.active || p.health <= 0)) {
      const nextSpawn = getPlayerSpawn(p.character, p.room);
      p.x = nextSpawn.x;
      p.y = nextSpawn.y;
      p.health = getPlayerMaxHealth(p);
      p.soundwaveActive = false;
      p.deadSince = 0;
      p.shieldUntil = 0;
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
    if (p.mode === "horde" && p.active) {
      const horde = initHordeGame(p.room);
      if (horde && horde.waveState === "upgrade_selection") {
        let cards = horde.cardOfferings.get(socket.id);
        if (!cards || cards.length === 0) {
          horde.pendingPlayersToChoose.add(socket.id);
          cards = horde.generateCardOptions(p);
          horde.cardOfferings.set(socket.id, cards);
        }
        socket.emit("horde_upgrade_options", {
          wave: horde.wave,
          options: cards,
          baseHealth: Math.round(horde.baseHealth * 10) / 10,
        });
      }
    }
    if (!p.active) {
      p.keys = { up: false, down: false, left: false, right: false };
      p.protectedUntil = 0;
      p.dashUntil = 0;
      p.parryUntil = 0;
      p.shieldUntil = 0;
      p.deadSince = 0;
      for (let index = bullets.length - 1; index >= 0; index--)
        if (bullets[index].ownerId === p.id) bullets.splice(index, 1);
    }
  });
  socket.on("respawn", () => {
    if (!p.active) p.active = true;
    if (p.mode === "horde") {
      initHordeGame(p.room);
    }
    if (p.health <= 0) {
      const nextSpawn = getPlayerSpawn(p.character, p.room);
      p.x = nextSpawn.x;
      p.y = nextSpawn.y;
      p.health = getPlayerMaxHealth(p);
      p.deadSince = 0;
      p.soundwaveActive = false;
      p.shieldUntil = 0;
      p.protectedUntil = Date.now() + SPAWN_PROTECTION;
      p.lastShotAt = 0;
      p.dashStartedAt = 0;
      p.dashUntil = 0;
      p.dashReadyAt = 0;
      p.parryStartedAt = 0;
      p.parryUntil = 0;
      p.parryReadyAt = 0;
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
      (p.mode === "horde" && p.character !== "sigmatom" && !p.hasDodge) ||
      now < (p.stunnedUntil || 0) ||
      now < p.parryReadyAt ||
      now < p.dashUntil
    )
      return;
    const stats = CHARACTER_STATS[p.character] || CHARACTER_STATS.granny;
    const parryCooldown = stats.parryCooldown || PARRY_COOLDOWN;
    p.parryId += 1;
    p.parryStartedAt = now;
    p.parryUntil = now + PARRY_DURATION;
    p.parryReadyAt = now + parryCooldown;
    io.to(p.room).emit("parry_started", {
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
      now < (p.stunnedUntil || 0) ||
      (p.mode === "horde" && !p.hasDash && p.character !== "sigmatom") ||
      now < p.dashReadyAt ||
      now < p.parryUntil
    )
      return;

    // Default Dash: dashes towards where player is currently heading
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
      if (kLen > 0.001) {
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
    io.to(p.room).emit("dash_started", {
      playerId: p.id,
      dashId: p.dashId,
      dashStartedAt: p.dashStartedAt,
      dashUntil: p.dashUntil,
      dashReadyAt: p.dashReadyAt,
      dashDirection: p.dashDirection,
    });
  });
  socket.on("dodge", (payload) => {
    const now = Date.now();
    if (
      !p.active ||
      p.health <= 0 ||
      now < (p.stunnedUntil || 0) ||
      (p.mode === "horde" && !p.hasDodge) ||
      now < (p.dodgeReadyAt || 0) ||
      now < p.parryUntil
    ) {
      return;
    }

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
      if (kLen > 0.001) {
        dx /= kLen;
        dy /= kLen;
      } else {
        dx = p.facing.x;
        dy = p.facing.y;
      }
    }
    p.dodgeId = (p.dodgeId || 0) + 1;
    p.dodgeStartedAt = now;
    p.dodgeUntil = now + DODGE_DURATION;
    p.dodgeReadyAt = now + DODGE_COOLDOWN;
    p.dodgeDirection = { x: dx, y: dy };
    p.facing = { x: dx, y: dy };
    p.protectedUntil = Math.max(p.protectedUntil || 0, now + 350);
    io.to(p.room).emit("player_dodged", {
      playerId: p.id,
      dodgeId: p.dodgeId,
      dodgeStartedAt: p.dodgeStartedAt,
      dodgeUntil: p.dodgeUntil,
      dodgeReadyAt: p.dodgeReadyAt,
      dodgeDirection: p.dodgeDirection,
      x: p.x,
      y: p.y,
    });
  });
  socket.on("shoot", (target) => {
    const now = Date.now();
    const baseShotCooldown = (p.character === "sigmatom" || p.minigun) ? MINIGUN_COOLDOWN : SHOT_COOLDOWN;
    const effectiveShotCooldown = Math.max(100, Math.round(baseShotCooldown * (p.fireRateMult || 1.0)));
    if (
      !p.active ||
      p.health <= 0 ||
      now < (p.stunnedUntil || 0) ||
      now < p.parryUntil ||
      now - p.lastShotAt < effectiveShotCooldown ||
      !target ||
      !Number.isFinite(target.x) ||
      !Number.isFinite(target.y)
    )
      return;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const length = Math.hypot(dx, dy);
    if (length < 1) return;
    const direction = { x: dx / length, y: dy / length };
    p.lastShotAt = now;
    p.protectedUntil = 0;

    // Grappler hook for Tom / Sigma Tom
    if (target.grapple === true && p.character === "sigmatom") {
      const hasHook = grapplerHooks.some((h) => h.ownerId === p.id && h.state !== "returning");
      if (!hasHook) {
        const muzzleDistance = characterRadius(p.character) + 30;
        grapplerHooks.push({
          id: nextHookId++,
          ownerId: p.id,
          room: p.room,
          x: p.x + direction.x * muzzleDistance,
          y: p.y + direction.y * muzzleDistance,
          startX: p.x,
          startY: p.y,
          vx: direction.x * 960,
          vy: direction.y * 960,
          angle: Math.atan2(direction.y, direction.x),
          state: "flying",
          targetId: null,
          maxDistance: 920,
          createdAt: now,
          expiresAt: now + 3000,
        });
        io.to(p.room).emit("hook_fired", {
          playerId: p.id,
          x: p.x,
          y: p.y,
        });
      }
      return;
    }

    const stats = CHARACTER_STATS[p.character] || CHARACTER_STATS.granny;
    const bSpeed = stats.bulletSpeed || BULLET_SPEED;
    const bRadius = stats.bulletRadius || BULLET_RADIUS;
    const muzzleDistance = characterRadius(p.character) + bRadius + 4;
    const isMama = p.character === "mama_cyborg";
    const isAngry = p.character === "angry_granny";
    const canSplit = isMama || isAngry;
    bullets.push({
      id: nextBulletId++,
      ownerId: p.id,
      room: p.room,
      x: p.x + direction.x * muzzleDistance,
      y: p.y + direction.y * muzzleDistance,
      vx: direction.x * bSpeed,
      vy: direction.y * bSpeed,
      radius: bRadius,
      damage: Math.round(getPlayerBaseDamage(p) * getPlayerDamageMultiplier(p) * 100) / 100,
      character: p.character,
      homing: p.character === "sigmatom",
      canSplit: canSplit,
      splitAt: canSplit ? now + 1000 : 0,
      expiresAt: now + (p.character === "sigmatom" ? 2800 : (canSplit ? 1200 : BULLET_LIFETIME)),
    });
  });

  // === INVENTORY & CS CASE OPENING HANDLERS ===
  socket.on("get_inventory", () => {
    const inv = isGuest ? getGuestInventory(socket.id) : inventoryStorage.getInventory(discordId);
    socket.emit("inventory_sync", {
      inventory: inv,
      isAdmin: !isGuest && discordId === ADMIN_DISCORD_ID,
      isGuest,
    });
  });

  socket.on("open_turret_case", () => {
    const res = inventoryStorage.openTurretCase(discordId);
    socket.emit("case_opening_result", res);
    if (res.success) {
      socket.emit("inventory_sync", {
        inventory: res.inventory,
        isAdmin: !isGuest && discordId === ADMIN_DISCORD_ID,
        isGuest,
      });
    }
  });

  socket.on("craft_key", () => {
    const res = inventoryStorage.craftKeyFromFragments(discordId);
    if (res.success) {
      socket.emit("inventory_sync", {
        inventory: res.inventory,
        isAdmin: !isGuest && discordId === ADMIN_DISCORD_ID,
        isGuest,
      });
    } else {
      socket.emit("craft_result", res);
    }
  });

  socket.on("equip_turret", (data) => {
    const turretId = typeof data === "string" ? data : data?.turretId;
    if (!turretId || !TURRET_TYPES[turretId]) return;
    const res = inventoryStorage.equipTurret(discordId, turretId);
    if (res.success) {
      p.equippedTurret = turretId;
      socket.emit("inventory_sync", {
        inventory: res.inventory,
        isAdmin: !isGuest && discordId === ADMIN_DISCORD_ID,
        isGuest,
      });
    }
  });

  // === ADMIN GIFTING PROTOCOL ===
  socket.on("admin_send_gift", (data) => {
    if (isGuest || discordId !== ADMIN_DISCORD_ID) {
      return socket.emit("admin_error", { error: "Forbidden: Not an authorized administrator." });
    }
    const rawTarget = String(data?.recipientDiscordId || data?.recipientId || "").trim();
    const keys = parseInt(data?.keys, 10);
    const note = (data?.note || "").trim();

    // Check if target matches an active online player username
    let finalRecipientId = rawTarget;
    for (const [, s] of io.sockets.sockets) {
      if (!s.data?.identity?.isGuest) {
        if (s.data?.identity?.id === rawTarget || (s.data?.identity?.username && s.data.identity.username.toLowerCase() === rawTarget.toLowerCase())) {
          finalRecipientId = s.data.identity.id;
          break;
        }
      }
    }

    const res = inventoryStorage.createAdminGift(ADMIN_DISCORD_ID, finalRecipientId, keys, note);
    if (!res.success) {
      return socket.emit("admin_error", { error: res.error });
    }

    // Success response to admin with updated history
    socket.emit("admin_gift_sent", {
      success: true,
      gift: res.gift,
      allGifts: inventoryStorage.getAllGiftsHistory(ADMIN_DISCORD_ID),
    });

    // Check if recipient is online right now and notify them immediately
    for (const [, s] of io.sockets.sockets) {
      if (s.data?.identity?.id === finalRecipientId && !s.data?.identity?.isGuest) {
        s.emit("key_gift_received", { gift: res.gift });
      }
    }
  });

  socket.on("admin_get_gifts", () => {
    if (isGuest || discordId !== ADMIN_DISCORD_ID) {
      return socket.emit("admin_error", { error: "Forbidden: Not an authorized administrator." });
    }
    socket.emit("admin_gifts_list", {
      gifts: inventoryStorage.getAllGiftsHistory(ADMIN_DISCORD_ID),
    });
  });

  socket.on("claim_gift", (data) => {
    if (isGuest) {
      return socket.emit("gift_error", { error: "Guests cannot claim Discord gifts." });
    }
    const giftId = typeof data === "string" ? data : data?.giftId;
    const res = inventoryStorage.claimGift(discordId, giftId);
    if (res.success) {
      socket.emit("gift_claimed", {
        giftId: res.gift.id,
        addedKeys: res.addedKeys,
      });
      socket.emit("inventory_sync", {
        inventory: res.inventory,
        isAdmin: discordId === ADMIN_DISCORD_ID,
        isGuest: false,
      });
    } else {
      socket.emit("gift_error", { error: res.error });
    }
  });

  socket.on("decline_gift", (data) => {
    if (isGuest) return;
    const giftId = typeof data === "string" ? data : data?.giftId;
    const res = inventoryStorage.declineGift(discordId, giftId);
    if (res.success) {
      socket.emit("gift_declined", { giftId: res.gift.id });
    }
  });

  socket.on("disconnect", () => {
    guestInventories.delete(socket.id);
    if (score.socketId === socket.id) score.socketId = null;
    players.delete(socket.id);
    const horde = hordeGames.get(p.room);
    if (horde && horde.waveState === "upgrade_selection") {
      horde.pendingPlayersToChoose.delete(socket.id);
      if (horde.pendingPlayersToChoose.size === 0) {
        clearTimeout(horde.upgradeTimeout);
        horde.startNextWave(io, rooms.get(horde.room) || new Set());
      }
    }
    const ids = rooms.get(p.room);
    ids?.delete(socket.id);
    if (ids?.size === 0) {
      rooms.delete(p.room);
      roomScores.delete(p.room);
      roomObjects.delete(p.room);
      if (p.room.endsWith(":horde")) {
        hordeGames.delete(p.room);
      }
      for (let i = bullets.length - 1; i >= 0; i--)
        if (bullets[i].room === p.room) bullets.splice(i, 1);
    }
  });
});

function awardXp(player, amount, shareAssist = false) {
  if (!player) return;
  player.xp = (player.xp || 0) + amount;
  const oldLevel = player.level || 1;
  const isHorde = player.mode === "horde" || (player.room && player.room.endsWith(":horde"));
  const newLevel = getLevelForXp(player.xp, isHorde);
  player.level = newLevel;

  io.to(player.id).emit("xp_update", {
    xp: player.xp,
    level: player.level,
    gained: amount,
    nextLevelXp: getXpForNextLevel(player.level, isHorde),
  });

  if (newLevel > oldLevel) {
    const oldMaxHp = getMaxHealth(player.character, oldLevel, isHorde);
    const newMaxHp = getMaxHealth(player.character, newLevel, isHorde);
    const hpGain = Math.max(0, newMaxHp - oldMaxHp);
    player.health = Math.min(newMaxHp, (player.health || oldMaxHp) + hpGain);

    io.to(player.room).emit("player_leveled_up", {
      playerId: player.id,
      name: player.name,
      level: newLevel,
      health: player.health,
      maxHealth: newMaxHp,
      unlockedMamaCyborg: !isHorde && newLevel === 10,
    });
  }

  // Co-op assist XP: distribute fair assist rewards to active teammates in Horde mode
  if (shareAssist && isHorde && player.room) {
    const roomPids = Array.from(rooms.get(player.room) || []).filter(pid => {
      const pl = players.get(pid);
      return pl && pl.active;
    });
    const teamCount = roomPids.length;
    // Scale assist percentage so total team XP earned per player mirrors solo progression
    const assistRatio = teamCount > 1 ? Math.min(0.35, 0.50 / (teamCount - 0.5)) : 0;
    const assistXp = Math.max(1, Math.round(amount * assistRatio));
    for (const pid of roomPids) {
      if (pid !== player.id) {
        const teammate = players.get(pid);
        if (teammate && teammate.active) {
          awardXp(teammate, assistXp, false);
        }
      }
    }
  }
}

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
    } else if (Date.now() < (p.dodgeUntil || 0)) {
      const dodgeElapsed = DODGE_DURATION - (p.dodgeUntil - Date.now());
      const dodgeProgress = clamp(dodgeElapsed / DODGE_DURATION, 0, 1);
      const ease = Math.pow(1 - dodgeProgress, 1.4);
      const baseSpeed = CHARACTER_STATS[p.character].speed;
      speed = baseSpeed + (640 - baseSpeed) * ease;
      dx = p.dodgeDirection.x;
      dy = p.dodgeDirection.y;
    } else if (Date.now() < (p.stunnedUntil || 0)) {
      dx = 0;
      dy = 0;
      speed = 0;
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
    const clampedPos = clampToArena(p.x + dx * speed * dt, p.y + dy * speed * dt, radius);
    p.x = clampedPos.x;
    p.y = clampedPos.y;
  }

  // Update Map Objects drifting and circular arena wall bounce
  for (const [room, objs] of roomObjects) {
    for (const obj of objs) {
      obj.x += obj.vx * dt;
      obj.y += obj.vy * dt;
      obj.angle += obj.vAngle * dt;
      obj.vx *= Math.pow(0.97, dt * 60);
      obj.vy *= Math.pow(0.97, dt * 60);
      const clamped = clampToArena(obj.x, obj.y, obj.radius);
      if (clamped.clamped) {
        obj.x = clamped.x;
        obj.y = clamped.y;
        const dot = obj.vx * clamped.nx + obj.vy * clamped.ny;
        if (dot > 0) {
          obj.vx -= 1.8 * dot * clamped.nx;
          obj.vy -= 1.8 * dot * clamped.ny;
        }
      }
    }
  }

  const wallNow = Date.now();

  // Update Horde Game Waves & Enemies
  for (const r of rooms.keys()) {
    if (r.endsWith(":horde") && !hordeGames.has(r)) {
      initHordeGame(r);
    }
  }
  for (const horde of hordeGames.values()) {
    const roomPlayerIds = rooms.get(horde.room) || new Set();
    horde.update(dt, wallNow, roomPlayerIds, bullets, io);
  }

  // Dead Player Watchdog: Ensure no player stays stuck dead under any condition
  for (const p of players.values()) {
    if (p.active && p.health <= 0) {
      if (!p.deadSince) p.deadSince = wallNow;
      if (wallNow - p.deadSince > 1300) {
        const nextSpawn = getPlayerSpawn(p.character, p.room);
        p.x = nextSpawn.x;
        p.y = nextSpawn.y;
        p.health = getPlayerMaxHealth(p);
        p.deadSince = 0;
        p.soundwaveActive = false;
        p.shieldUntil = 0;
        p.protectedUntil = wallNow + SPAWN_PROTECTION;
        p.lastShotAt = 0;
        p.dashUntil = 0;
        p.dashReadyAt = 0;
        p.dodgeUntil = 0;
        p.dodgeReadyAt = 0;
        p.parryUntil = 0;
        p.parryReadyAt = 0;
        p.stunnedUntil = 0;
      }
    }
  }

  // Health Regeneration: All players regenerate health over time!
  for (const p of players.values()) {
    if (!p.active || p.health <= 0) continue;
    const maxHp = getPlayerMaxHealth(p);
    if (p.health < maxHp) {
      const isHorde = p.mode === "horde" || (p.room && p.room.endsWith(":horde"));
      const timeSinceDamage = wallNow - (p.lastDamageAt || 0);
      const timeSinceShot = wallNow - (p.lastShotAt || 0);

      // Regeneration is paused for a few seconds while shooting or getting hit
      const damageCooldown = isHorde ? 4500 : 3500;
      const shootCooldown = isHorde ? 3000 : 2000;

      if (timeSinceDamage < damageCooldown || timeSinceShot < shootCooldown) {
        continue;
      }

      // Greatly reduced default passive regeneration in Horde mode without Granny's healing aura:
      // In Horde mode: 0.8% max HP / sec (takes ~125s from 0 to full).
      // Granny's healing aura provides 2-4 HP per pulse every 1.5-2.5s, making the aura crucial.
      // In FFA mode: 4.5% max HP / sec out of combat.
      const regenRate = isHorde ? (maxHp * 0.008) : (maxHp * 0.045);
      p.health = Math.min(maxHp, p.health + regenRate * dt);
    }
  }

  // Player collisions with Map Objects (diep.io style collision)
  for (const p of players.values()) {
    if (!p.active || p.health <= 0) continue;
    const objs = roomObjects.get(p.room);
    if (!objs) continue;
    for (let oi = objs.length - 1; oi >= 0; oi--) {
      const obj = objs[oi];
      const pRadius = characterRadius(p.character);
      const dist = Math.hypot(p.x - obj.x, p.y - obj.y);
      const minDist = pRadius + obj.radius;
      if (dist < minDist) {
        let nx, ny;
        if (dist > 0.001) {
          nx = (p.x - obj.x) / dist;
          ny = (p.y - obj.y) / dist;
        } else {
          const randAngle = Math.random() * Math.PI * 2;
          nx = Math.cos(randAngle);
          ny = Math.sin(randAngle);
        }
        const overlap = minDist - dist;
        p.x += nx * (overlap * 0.6 + 2);
        p.y += ny * (overlap * 0.6 + 2);
        obj.x -= nx * (overlap * 0.4 + 2);
        obj.y -= ny * (overlap * 0.4 + 2);

        const clampedP = clampToArena(p.x, p.y, pRadius);
        p.x = clampedP.x;
        p.y = clampedP.y;
        const clampedObj = clampToArena(obj.x, obj.y, obj.radius);
        obj.x = clampedObj.x;
        obj.y = clampedObj.y;

        const isParrying = p.parryUntil > wallNow || (p.shieldUntil && p.shieldUntil > wallNow);
        const isDashing = p.dashUntil > wallNow;

        if (isParrying) {
          obj.hp -= 3.5;
          obj.vx -= nx * 200;
          obj.vy -= ny * 200;
        } else if (isDashing) {
          obj.hp -= 4.0;
          p.lastDamageAt = wallNow;
          if (p.health - 0.2 <= 0) {
            killPlayer(p, null, "car");
          } else {
            p.health = Math.max(0, p.health - 0.2);
            io.to(p.id).emit("damage_taken", { health: p.health, damage: 0.2, attackerCharacter: "car" });
          }
          obj.vx -= nx * 280;
          obj.vy -= ny * 280;
        } else {
          if (p.protectedUntil <= wallNow && (!p.lastObjectHitAt || wallNow - p.lastObjectHitAt > 450)) {
            p.lastObjectHitAt = wallNow;
            p.lastDamageAt = wallNow;
            if (p.health - obj.contactDamage <= 0) {
              killPlayer(p, null, "car");
            } else {
              p.health = Math.max(0, p.health - obj.contactDamage);
              io.to(p.id).emit("damage_taken", { health: p.health, damage: obj.contactDamage, attackerCharacter: "car" });
            }
          }
          obj.hp -= 1.5;
          obj.vx -= nx * 90;
          obj.vy -= ny * 90;
        }

        if (obj.hp <= 0) {
          objs.splice(oi, 1);
          awardXp(p, obj.xp);
          io.to(p.room).emit("object_destroyed", {
            id: obj.id,
            type: obj.type,
            x: obj.x,
            y: obj.y,
            killerId: p.id,
            xp: obj.xp,
          });
          setTimeout(() => respawnObject(p.room, obj.type), 3500);
        }
      }
    }
  }

  // Sigma Tom Soundwave & Earthquake Physics
  for (const p of players.values()) {
    if (!p.active || p.health <= 0 || p.character !== "sigmatom" || !p.soundwaveActive) continue;
    if (wallNow - (p.lastSoundwavePulseAt || 0) < 75) continue;
    p.lastSoundwavePulseAt = wallNow;

    const coneAngle = p.soundwaveAngle || 0;
    const coneRange = 850;
    const coneSpread = 0.58; // ~33 deg half-angle (66 deg total cone)
    const roomPlayers = rooms.get(p.room);

    if (roomPlayers) {
      for (const targetId of roomPlayers) {
        if (targetId === p.id) continue;
        const target = players.get(targetId);
        if (!target || !target.active || target.health <= 0 || target.protectedUntil > wallNow) continue;
        const dx = target.x - p.x;
        const dy = target.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > coneRange || dist < 1) continue;
        const angleToTarget = Math.atan2(dy, dx);
        let angleDiff = angleToTarget - coneAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (Math.abs(angleDiff) <= coneSpread) {
          const damage = 0.55;
          target.lastDamageAt = wallNow;

          // Seismic earthquake knockback clamped to circular arena
          const knockback = (1 - dist / coneRange) * 26 + 10;
          const knocked = clampToArena(
            target.x + Math.cos(angleToTarget) * knockback,
            target.y + Math.sin(angleToTarget) * knockback,
            characterRadius(target.character)
          );
          target.x = knocked.x;
          target.y = knocked.y;

          if (target.health - damage <= 0) {
            killPlayer(target, p.id, "sigmatom_soundwave");
          } else {
            target.health = Math.max(0, target.health - damage);
            io.to(target.id).emit("damage_taken", {
              health: target.health,
              damage,
              attackerCharacter: "sigmatom_soundwave",
            });
            io.to(p.id).emit("hit_marker", {
              targetId: target.id,
              damage,
              kill: false,
            });
          }
        }
      }
    }

    // Horde enemies in soundwave cone
    const horde = hordeGames.get(p.room);
    if (horde) {
      for (let ei = horde.enemies.length - 1; ei >= 0; ei--) {
        const enemy = horde.enemies[ei];
        if (!enemy) continue;
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > coneRange || dist < 1) continue;
        const angleToEnemy = Math.atan2(dy, dx);
        let angleDiff = angleToEnemy - coneAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (Math.abs(angleDiff) <= coneSpread) {
          const damage = 0.55;
          enemy.hp -= damage;
          const force = (1 - dist / coneRange) * 32 + 14;
          enemy.x += Math.cos(angleToEnemy) * force;
          enemy.y += Math.sin(angleToEnemy) * force;
          const clamped = clampToArena(enemy.x, enemy.y, enemy.radius);
          enemy.x = clamped.x;
          enemy.y = clamped.y;

          const isKill = enemy.hp <= 0;
          io.to(p.id).emit("hit_marker", {
            targetId: "enemy_" + enemy.id,
            damage,
            kill: isKill,
          });
          io.to(p.room).emit("enemy_hit", {
            enemyId: enemy.id,
            damage,
            hp: Math.max(0, enemy.hp),
            maxHp: enemy.maxHp,
            x: enemy.x,
            y: enemy.y,
          });
          if (isKill) {
            p.score.kills += 1;
            awardXp(p, enemy.xp, true);
            io.to(p.room).emit("enemy_killed", {
              enemyId: enemy.id,
              type: enemy.type,
              x: enemy.x,
              y: enemy.y,
              killerId: p.id,
              xp: enemy.xp,
            });
            horde.enemies.splice(ei, 1);
            if (enemy.type === "cyborgian_9" || enemy.isSplitter) {
              horde.spawnCyborgianSplit(enemy, io);
            }
          }
        }
      }
    }

    // Map objects in soundwave cone
    const objs = roomObjects.get(p.room);
    if (objs) {
      for (let oi = objs.length - 1; oi >= 0; oi--) {
        const obj = objs[oi];
        const dx = obj.x - p.x;
        const dy = obj.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > coneRange || dist < 1) continue;
        const angleToObj = Math.atan2(dy, dx);
        let angleDiff = angleToObj - coneAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        if (Math.abs(angleDiff) <= coneSpread) {
          obj.hp -= 0.75;
          const force = (1 - dist / coneRange) * 140 + 40;
          obj.vx += Math.cos(angleToObj) * force;
          obj.vy += Math.sin(angleToObj) * force;
          if (obj.hp <= 0) {
            objs.splice(oi, 1);
            awardXp(p, obj.xp);
            io.to(p.room).emit("object_destroyed", {
              id: obj.id,
              type: obj.type,
              x: obj.x,
              y: obj.y,
              killerId: p.id,
              xp: obj.xp,
            });
            setTimeout(() => respawnObject(p.room, obj.type), 3500);
          }
        }
      }
    }
  }

  for (let i = bullets.length - 1; i >= 0; i--) {
    const bullet = bullets[i];
    const previousX = bullet.x;
    const previousY = bullet.y;

    // Sigma Tom Bullet Homing (Auto-Aim): Bullets track the nearest enemy player or horde enemy
    if (bullet.character === "sigmatom" || bullet.homing) {
      let nearestTarget = null;
      let nearestDist = 2400;
      const isHorde = bullet.room.endsWith(":horde");
      const horde = isHorde ? hordeGames.get(bullet.room) : null;

      if (horde && Array.isArray(horde.enemies) && horde.enemies.length > 0) {
        for (const enemy of horde.enemies) {
          if (!enemy) continue;
          const d = Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestTarget = enemy;
          }
        }
      } else {
        const roomPlayers = rooms.get(bullet.room);
        if (roomPlayers) {
          for (const targetId of roomPlayers) {
            if (targetId === bullet.ownerId) continue;
            const target = players.get(targetId);
            if (
              !target ||
              !target.active ||
              target.health <= 0 ||
              target.protectedUntil > wallNow
            )
              continue;
            const d = Math.hypot(target.x - bullet.x, target.y - bullet.y);
            if (d < nearestDist) {
              nearestDist = d;
              nearestTarget = target;
            }
          }
        }
      }

      if (nearestTarget) {
        const tdx = nearestTarget.x - bullet.x;
        const tdy = nearestTarget.y - bullet.y;
        const targetAngle = Math.atan2(tdy, tdx);
        const currentSpeed = Math.hypot(bullet.vx, bullet.vy) || 1014;
        let currentAngle = Math.atan2(bullet.vy, bullet.vx);
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxTurn = 7.5 * dt;
        const turn = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
        currentAngle += turn;
        bullet.vx = Math.cos(currentAngle) * currentSpeed;
        bullet.vy = Math.sin(currentAngle) * currentSpeed;
      }
    }

    bullet.x += bullet.vx * dt;
    bullet.y += bullet.vy * dt;
    const bRadius = bullet.radius || BULLET_RADIUS;
    if (bullet.canSplit && wallNow >= bullet.splitAt) {
      bullet.canSplit = false;
      const bSpeed = Math.hypot(bullet.vx, bullet.vy) || 480;
      const ux = bullet.vx / bSpeed;
      const uy = bullet.vy / bSpeed;
      const leftVx = uy * bSpeed;
      const leftVy = -ux * bSpeed;
      const rightVx = -uy * bSpeed;
      const rightVy = ux * bSpeed;
      const splitLifetime = 2000;
      const isAngry = bullet.character === "angry_granny";
      const splitChar = isAngry ? "angry_granny_split" : "mama_cyborg_split";
      bullets.push({
        id: nextBulletId++,
        ownerId: bullet.ownerId,
        room: bullet.room,
        x: bullet.x,
        y: bullet.y,
        vx: leftVx,
        vy: leftVy,
        radius: bullet.radius,
        damage: bullet.damage,
        character: splitChar,
        canSplit: false,
        splitAt: 0,
        expiresAt: wallNow + splitLifetime,
      });
      bullets.push({
        id: nextBulletId++,
        ownerId: bullet.ownerId,
        room: bullet.room,
        x: bullet.x,
        y: bullet.y,
        vx: rightVx,
        vy: rightVy,
        radius: bullet.radius,
        damage: bullet.damage,
        character: splitChar,
        canSplit: false,
        splitAt: 0,
        expiresAt: wallNow + splitLifetime,
      });
      io.to(bullet.room).emit("bullet_split", {
        x: bullet.x,
        y: bullet.y,
        character: isAngry ? "angry_granny" : "mama_cyborg",
      });
      bullets.splice(i, 1);
      continue;
    }

    if (
      wallNow >= bullet.expiresAt ||
      bullet.x < -bRadius ||
      bullet.x > WIDTH + bRadius ||
      bullet.y < -bRadius ||
      bullet.y > HEIGHT + bRadius ||
      Math.hypot(bullet.x - ARENA_CENTER.x, bullet.y - ARENA_CENTER.y) > ARENA_RADIUS + bRadius + 15
    ) {
      bullets.splice(i, 1);
      continue;
    }
    const roomPlayers = rooms.get(bullet.room);
    if (!roomPlayers) {
      bullets.splice(i, 1);
      continue;
    }

    // Bullet vs Map Objects collision
    const roomObjs = roomObjects.get(bullet.room);
    if (roomObjs) {
      let hitObj = false;
      for (let oi = roomObjs.length - 1; oi >= 0; oi--) {
        const obj = roomObjs[oi];
        const dist = Math.hypot(bullet.x - obj.x, bullet.y - obj.y);
        if (dist <= bRadius + obj.radius) {
          obj.hp -= bullet.damage;
          const bSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
          obj.vx += (bullet.vx / bSpeed) * 45;
          obj.vy += (bullet.vy / bSpeed) * 45;
          io.to(bullet.room).emit("object_hit", {
            id: obj.id,
            damage: bullet.damage,
            hp: obj.hp,
            maxHp: obj.maxHp,
            x: bullet.x,
            y: bullet.y,
          });
          if (obj.hp <= 0) {
            roomObjs.splice(oi, 1);
            const killer = players.get(bullet.ownerId);
            if (killer) awardXp(killer, obj.xp);
            io.to(bullet.room).emit("object_destroyed", {
              id: obj.id,
              type: obj.type,
              x: obj.x,
              y: obj.y,
              killerId: bullet.ownerId,
              xp: obj.xp,
            });
            setTimeout(() => respawnObject(bullet.room, obj.type), 3500);
          }
          bullets.splice(i, 1);
          hitObj = true;
          break;
        }
      }
      if (hitObj) continue;
    }

    const isHordeRoom = bullet.room.endsWith(":horde");
    if (isHordeRoom) {
      const horde = hordeGames.get(bullet.room);
      if (horde) {
        if (bullet.character === "tung_projectile") {
          let hitPlaced = false;
          for (let oi = horde.placedObjects.length - 1; oi >= 0; oi--) {
            const obj = horde.placedObjects[oi];
            if (obj.hp <= 0) continue;
            const dist = Math.hypot(bullet.x - obj.x, bullet.y - obj.y);
            if (dist <= bRadius + obj.radius) {
              obj.hp = Math.max(0, obj.hp - bullet.damage * 4.0);
              io.to(bullet.room).emit("object_hit", {
                id: obj.id,
                damage: bullet.damage * 4.0,
                hp: obj.hp,
                maxHp: obj.maxHp,
                x: bullet.x,
                y: bullet.y,
              });
              if (obj.hp <= 0) {
                horde.placedObjects.splice(oi, 1);
              }
              bullets.splice(i, 1);
              hitPlaced = true;
              break;
            }
          }
          if (hitPlaced) continue;

          const distBase = Math.hypot(bullet.x - ARENA_CENTER.x, bullet.y - ARENA_CENTER.y);
          if (distBase <= bRadius + 40) {
            horde.baseHealth = Math.max(0, horde.baseHealth - bullet.damage * 1.5);
            io.to(bullet.room).emit("base_hit", {
              damage: bullet.damage * 1.5,
              health: horde.baseHealth,
              x: bullet.x,
              y: bullet.y,
            });
            if (horde.baseHealth <= 0 && horde.waveState !== "game_over") {
              horde.waveState = "game_over";
              horde.intermissionUntil = wallNow + 6500;
              horde.enemies = [];
              horde.boss = null;
              horde.isBossWave = false;
              clearTimeout(horde.upgradeTimeout);
              horde.pendingPlayersToChoose.clear();
              io.to(bullet.room).emit("base_destroyed", { wave: horde.wave });
            }
            bullets.splice(i, 1);
            continue;
          }
        }
        let hitEnemy = false;
        for (let ei = horde.enemies.length - 1; ei >= 0; ei--) {
          const enemy = horde.enemies[ei];
          if (!enemy) continue;
          if (sweptBulletTouchesCircle(bullet, previousX, previousY, enemy.x, enemy.y, enemy.radius)) {
            enemy.hp -= bullet.damage;
            const bSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
            enemy.recoilVx += (bullet.vx / bSpeed) * 140;
            enemy.recoilVy += (bullet.vy / bSpeed) * 140;

            // Apply special turret effects to normal enemies (bosses immune)
            if (bullet.turretType === "fire") {
              enemy.burningUntil = Math.max(enemy.burningUntil || 0, wallNow + 2500);
              enemy.burnDps = 2.2 * 0.08;
            } else if (bullet.turretType === "ice") {
              enemy.slowedUntil = Math.max(enemy.slowedUntil || 0, wallNow + 1750);
            } else if (bullet.turretType === "alien") {
              if (!enemy.knockbackImmuneUntil || enemy.knockbackImmuneUntil <= wallNow) {
                enemy.knockbackImmuneUntil = wallNow + 800;
                const kDist = 22;
                enemy.x += (bullet.vx / bSpeed) * kDist;
                enemy.y += (bullet.vy / bSpeed) * kDist;
                const dFromCenter = Math.hypot(enemy.x - ARENA_CENTER.x, enemy.y - ARENA_CENTER.y);
                if (dFromCenter > ARENA_RADIUS - 10) {
                  const norm = (ARENA_RADIUS - 10) / dFromCenter;
                  enemy.x = ARENA_CENTER.x + (enemy.x - ARENA_CENTER.x) * norm;
                  enemy.y = ARENA_CENTER.y + (enemy.y - ARENA_CENTER.y) * norm;
                }
              }
            }
            const isKill = enemy.hp <= 0;
            io.to(bullet.ownerId).emit("hit_marker", {
              targetId: "enemy_" + enemy.id,
              damage: bullet.damage,
              kill: isKill,
            });
            io.to(bullet.room).emit("enemy_hit", {
              enemyId: enemy.id,
              damage: bullet.damage,
              hp: Math.max(0, enemy.hp),
              maxHp: enemy.maxHp,
              x: bullet.x,
              y: bullet.y,
            });
            if (isKill) {
              const killer = players.get(bullet.ownerId);
              if (killer) {
                killer.score.kills += 1;
                awardXp(killer, enemy.xp, true);
              } else {
                for (const pid of roomPlayers) {
                  const pl = players.get(pid);
                  if (pl && pl.active) awardXp(pl, Math.max(1, Math.round(enemy.xp * 0.5)));
                }
              }
              io.to(bullet.room).emit("enemy_killed", {
                enemyId: enemy.id,
                type: enemy.type,
                x: enemy.x,
                y: enemy.y,
                killerId: bullet.ownerId,
                xp: enemy.xp,
              });
              horde.enemies.splice(ei, 1);
              if (enemy.type === "cyborgian_9" || enemy.isSplitter) {
                horde.spawnCyborgianSplit(enemy, io);
              }
            }
            bullets.splice(i, 1);
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) continue;

        const isPlayerOrTurretBullet = bullet.ownerId !== "boss_tung" && bullet.ownerId !== "boss_baby_cyborg" && !String(bullet.ownerId).startsWith("clone_") && !String(bullet.ownerId).startsWith("spiral_");
        if (isPlayerOrTurretBullet && horde.boss && horde.boss.phase === "spiral_phase" && Array.isArray(horde.boss.spirals)) {
          let hitSpiral = false;
          for (let si = horde.boss.spirals.length - 1; si >= 0; si--) {
            const spiral = horde.boss.spirals[si];
            if (sweptBulletTouchesCircle(bullet, previousX, previousY, spiral.x, spiral.y, spiral.radius)) {
              spiral.hp -= bullet.damage;
              const isKill = spiral.hp <= 0;
              io.to(bullet.ownerId).emit("hit_marker", {
                targetId: "spiral_" + spiral.id,
                damage: bullet.damage,
                kill: isKill,
              });
              io.to(bullet.room).emit("spiral_hit", {
                id: spiral.id,
                damage: bullet.damage,
                hp: Math.max(0, spiral.hp),
                maxHp: spiral.maxHp,
                x: bullet.x,
                y: bullet.y,
              });
              if (isKill) {
                const killer = players.get(bullet.ownerId);
                if (killer) {
                  killer.score.kills = (killer.score.kills || 0) + 1;
                  awardXp(killer, 120, false);
                }
                for (const pid of roomPlayers) {
                  const pl = players.get(pid);
                  if (pl && pl.active && pl.id !== bullet.ownerId) awardXp(pl, 60);
                }
                io.to(bullet.room).emit("spiral_destroyed", {
                  id: spiral.id,
                  x: spiral.x,
                  y: spiral.y,
                });
                horde.boss.spirals.splice(si, 1);
              }
              bullets.splice(i, 1);
              hitSpiral = true;
              break;
            }
          }
          if (hitSpiral) continue;
        }

        if (isPlayerOrTurretBullet && horde.boss && horde.boss.phase !== "intro" && horde.boss.phase !== "defeated" && horde.boss.stompState !== "airborne") {
          if (horde.boss.id === "boss_baby_cyborg") {
            // Phase 3 Clones Bullet Collision
            if (horde.boss.phase === "phase3" && Array.isArray(horde.boss.clones)) {
              let hitClone = false;
              for (const clone of horde.boss.clones) {
                if (!clone.alive || clone.hp <= 0) continue;
                if (sweptBulletTouchesCircle(bullet, previousX, previousY, clone.x, clone.y, clone.radius)) {
                  clone.hp = Math.max(0, clone.hp - bullet.damage);
                  const isCloneKilled = clone.hp <= 0;
                  if (isCloneKilled) {
                    clone.alive = false;
                    io.to(bullet.room).emit("boss_clone_destroyed", { cloneId: clone.id, x: clone.x, y: clone.y });
                  }
                  horde.boss.hp = horde.boss.clones.filter(c => c.alive).reduce((sum, c) => sum + c.hp, 0);
                  const allDefeated = horde.boss.clones.every(c => !c.alive || c.hp <= 0);

                  io.to(bullet.ownerId).emit("hit_marker", {
                    targetId: clone.id,
                    damage: bullet.damage,
                    kill: isCloneKilled,
                  });
                  io.to(bullet.room).emit("boss_hit", {
                    bossId: horde.boss.id,
                    cloneId: clone.id,
                    damage: bullet.damage,
                    hp: horde.boss.hp,
                    maxHp: horde.boss.maxHp,
                    x: bullet.x,
                    y: bullet.y,
                  });

                  if (allDefeated) {
                    horde.boss.phase = "defeated";
                    horde.boss.animState = "idle";
                    const killer = players.get(bullet.ownerId);
                    if (killer) {
                      killer.score.kills = (killer.score.kills || 0) + 1;
                      awardXp(killer, 2500, false);
                    }
                    for (const pid of roomPlayers) {
                      const pl = players.get(pid);
                      if (pl && pl.active && pl.id !== bullet.ownerId) {
                        awardXp(pl, 2000);
                      }
                    }
                    io.to(bullet.room).emit("boss_defeated", {
                      bossId: horde.boss.id,
                      killerId: bullet.ownerId,
                    });
                  }

                  bullets.splice(i, 1);
                  hitClone = true;
                  break;
                }
              }
              if (hitClone) continue;
            } else if (horde.boss.phase === "phase1" || horde.boss.phase === "phase2") {
              // Main Boss Body collision in Phase 1 & 2
              if (sweptBulletTouchesCircle(bullet, previousX, previousY, horde.boss.x, horde.boss.y, horde.boss.radius)) {
                if (horde.boss.isInvincible) {
                  io.to(bullet.room).emit("boss_shield_deflect", {
                    bossId: horde.boss.id,
                    x: bullet.x,
                    y: bullet.y,
                  });
                  bullets.splice(i, 1);
                  continue;
                }

                horde.boss.hp = Math.max(0, horde.boss.hp - bullet.damage);

                // Check phase thresholds
                if (horde.boss.phase === "phase1" && horde.boss.hp <= horde.boss.maxHp * BABY_CYBORG_CONFIG.phaseThresholds.phase2) {
                  horde.boss.phase = "phase2";
                  horde.boss.laserState = "idle";
                  horde.boss.stompState = "idle";
                  horde.boss.lastAttackAt = Date.now() + 1000;
                  horde.boss.attackType = "stomp";
                  io.to(bullet.room).emit("boss_phase_changed", {
                    bossId: horde.boss.id,
                    phase: "phase2",
                    subtitle: "BABY TANTRUM",
                    hp: horde.boss.hp,
                  });
                }

                if (horde.boss.hp <= horde.boss.maxHp * BABY_CYBORG_CONFIG.phaseThresholds.phase3) {
                  horde.boss.phase = "phase3_cloning";
                  horde.boss.isInvincible = true;
                  horde.boss.laserState = "idle";
                  horde.boss.stompState = "idle";
                  horde.boss.transformationUntil = Date.now() + BABY_CYBORG_CONFIG.transformationDuration;
                  io.to(bullet.room).emit("boss_phase_changed", {
                    bossId: horde.boss.id,
                    phase: "phase3_cloning",
                    subtitle: "CLONE PROTOCOL",
                    hp: horde.boss.hp,
                    transformationUntil: horde.boss.transformationUntil,
                  });
                }

                io.to(bullet.ownerId).emit("hit_marker", {
                  targetId: horde.boss.id,
                  damage: bullet.damage,
                  kill: false,
                });
                io.to(bullet.room).emit("boss_hit", {
                  bossId: horde.boss.id,
                  damage: bullet.damage,
                  hp: horde.boss.hp,
                  maxHp: horde.boss.maxHp,
                  x: bullet.x,
                  y: bullet.y,
                });
                bullets.splice(i, 1);
                continue;
              }
            }
          } else {
            // Tung boss logic
            if (sweptBulletTouchesCircle(bullet, previousX, previousY, horde.boss.x, horde.boss.y, horde.boss.radius)) {
              if (horde.boss.isInvincible) {
                io.to(bullet.room).emit("boss_shield_deflect", {
                  bossId: horde.boss.id,
                  x: bullet.x,
                  y: bullet.y,
                });
                bullets.splice(i, 1);
                continue;
              } else {
                horde.boss.hp = Math.max(0, horde.boss.hp - bullet.damage);
                const isDefeated = horde.boss.hp <= 0;
                io.to(bullet.ownerId).emit("hit_marker", {
                  targetId: "boss_tung",
                  damage: bullet.damage,
                  kill: isDefeated,
                });
                io.to(bullet.room).emit("boss_hit", {
                  bossId: horde.boss.id,
                  damage: bullet.damage,
                  hp: horde.boss.hp,
                  maxHp: horde.boss.maxHp,
                  x: bullet.x,
                  y: bullet.y,
                });
                if (isDefeated) {
                  horde.boss.phase = "defeated";
                  horde.boss.animState = "idle";
                  const killer = players.get(bullet.ownerId);
                  if (killer) {
                    killer.score.kills = (killer.score.kills || 0) + 1;
                    awardXp(killer, 1500, false);
                  }
                  for (const pid of roomPlayers) {
                    const pl = players.get(pid);
                    if (pl && pl.active && pl.id !== bullet.ownerId) {
                      awardXp(pl, 1200);
                    }
                  }
                  io.to(bullet.room).emit("boss_defeated", {
                    bossId: horde.boss.id,
                    killerId: bullet.ownerId,
                  });
                }
                bullets.splice(i, 1);
                continue;
              }
            }
          }
        }
      }
    }

    let deflected = false;
    for (const playerId of roomPlayers) {
      const defender = players.get(playerId);
      if (
        !defender ||
        !defender.active ||
        defender.health <= 0 ||
        defender.id === bullet.ownerId ||
        (defender.parryUntil <= wallNow && (!defender.shieldUntil || defender.shieldUntil <= wallNow))
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
      bullet.x = defender.x + contact.x * (contact.radius + bRadius + 3);
      bullet.y = defender.y + contact.y * (contact.radius + bRadius + 3);
      bullet.ownerId = defender.id;
      bullet.character = defender.character;
      bullet.damage = CHARACTER_STATS[defender.character].damage;
      bullet.canSplit = defender.character === "mama_cyborg" || defender.character === "angry_granny";
      bullet.splitAt = (defender.character === "mama_cyborg" || defender.character === "angry_granny") ? wallNow + 1000 : 0;
      bullet.expiresAt = wallNow + ((defender.character === "mama_cyborg" || defender.character === "angry_granny") ? 1200 : BULLET_LIFETIME);
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

    // Friendly fire disabled in Horde Mode:
    if (isHordeRoom) continue;
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
      if (hit.health - bullet.damage <= 0) {
        killPlayer(hit, bullet.ownerId, bullet.character);
      } else {
        hit.health = Math.max(0, hit.health - bullet.damage);
        hit.lastDamageAt = wallNow;
        io.to(hit.id).emit("damage_taken", {
          health: hit.health,
          damage: bullet.damage,
          attackerCharacter: bullet.character,
        });
        io.to(bullet.ownerId).emit("hit_marker", {
          targetId: hit.id,
          damage: bullet.damage,
          kill: false,
        });
      }
      bullets.splice(i, 1);
    }
  }

  // Update Grappler Hooks Physics & Auto-Aim
  for (let hi = grapplerHooks.length - 1; hi >= 0; hi--) {
    const hook = grapplerHooks[hi];
    const owner = players.get(hook.ownerId);
    if (!owner || !owner.active || owner.health <= 0 || wallNow > hook.expiresAt) {
      grapplerHooks.splice(hi, 1);
      continue;
    }

    if (hook.state === "flying") {
      // Auto-aim: Steer towards nearest active enemy player in room
      const roomPids = rooms.get(hook.room) || new Set();
      let bestTarget = null;
      let bestDist = 680;
      for (const pid of roomPids) {
        if (pid === hook.ownerId) continue;
        const target = players.get(pid);
        if (!target || !target.active || target.health <= 0 || target.protectedUntil > wallNow) continue;
        const d = Math.hypot(target.x - hook.x, target.y - hook.y);
        if (d < bestDist) {
          const angleToT = Math.atan2(target.y - hook.y, target.x - hook.x);
          let diff = angleToT - hook.angle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          if (Math.abs(diff) < 1.35) {
            bestDist = d;
            bestTarget = target;
          }
        }
      }

      if (bestTarget) {
        const desiredAngle = Math.atan2(bestTarget.y - hook.y, bestTarget.x - hook.x);
        let angleDiff = desiredAngle - hook.angle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const maxTurn = 8.5 * dt;
        hook.angle += clamp(angleDiff, -maxTurn, maxTurn);
        const hookSpeed = 960;
        hook.vx = Math.cos(hook.angle) * hookSpeed;
        hook.vy = Math.sin(hook.angle) * hookSpeed;
      }

      hook.x += hook.vx * dt;
      hook.y += hook.vy * dt;

      // Check max range from owner
      const distFromOwner = Math.hypot(hook.x - owner.x, hook.y - owner.y);
      if (distFromOwner > hook.maxDistance) {
        hook.state = "returning";
      }

      // Check collision with enemy players
      for (const pid of roomPids) {
        if (pid === hook.ownerId) continue;
        const victim = players.get(pid);
        if (!victim || !victim.active || victim.health <= 0 || victim.protectedUntil > wallNow) continue;
        const vRadius = characterRadius(victim.character);
        if (Math.hypot(hook.x - victim.x, hook.y - victim.y) < vRadius + 24) {
          hook.state = "pulling";
          hook.targetId = victim.id;
          hook.pullExpiresAt = wallNow + 2500;
          victim.lastDamageAt = wallNow;
          const grappleDamage = 1.8;
          if (victim.health - grappleDamage <= 0) {
            killPlayer(victim, owner.id, "hook");
            grapplerHooks.splice(hi, 1);
          } else {
            victim.health = Math.max(0, victim.health - grappleDamage);
            io.to(victim.id).emit("damage_taken", {
              health: victim.health,
              damage: grappleDamage,
              attackerCharacter: "hook",
            });
            io.to(owner.id).emit("hit_marker", {
              targetId: victim.id,
              damage: grappleDamage,
              kill: false,
            });
          }
          break;
        }
      }
    } else if (hook.state === "pulling") {
      const victim = players.get(hook.targetId);
      if (!victim || !victim.active || victim.health <= 0 || (hook.pullExpiresAt && wallNow > hook.pullExpiresAt)) {
        grapplerHooks.splice(hi, 1);
        continue;
      }

      // Pull victim towards owner
      const dx = owner.x - victim.x;
      const dy = owner.y - victim.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 78) {
        const pullSpeed = 880;
        const dirX = dx / dist;
        const dirY = dy / dist;
        const pulled = clampToArena(
          victim.x + dirX * pullSpeed * dt,
          victim.y + dirY * pullSpeed * dt,
          characterRadius(victim.character)
        );
        victim.x = pulled.x;
        victim.y = pulled.y;
        hook.x = victim.x;
        hook.y = victim.y;
        hook.angle = Math.atan2(-dy, -dx);
      } else {
        grapplerHooks.splice(hi, 1);
      }
    } else if (hook.state === "returning") {
      const dx = owner.x - hook.x;
      const dy = owner.y - hook.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 65) {
        const returnSpeed = 1150;
        hook.x += (dx / dist) * returnSpeed * dt;
        hook.y += (dy / dist) * returnSpeed * dt;
        hook.angle = Math.atan2(dy, dx);
      } else {
        grapplerHooks.splice(hi, 1);
      }
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
        shieldUntil: p.shieldUntil || 0,
        dashId: p.dashId,
        dashStartedAt: p.dashStartedAt,
        dashUntil: p.dashUntil,
        dashReadyAt: p.dashReadyAt,
        dashDirection: p.dashDirection,
        dodgeId: p.dodgeId || 0,
        dodgeStartedAt: p.dodgeStartedAt || 0,
        dodgeUntil: p.dodgeUntil || 0,
        dodgeReadyAt: p.dodgeReadyAt || 0,
        dodgeDirection: p.dodgeDirection,
        lastInputSeq: p.lastInputSeq,
        health: Math.round(p.health * 10) / 10,
        maxHealth: getPlayerMaxHealth(p),
        kills: p.score.kills,
        deaths: p.score.deaths,
        minigun: p.minigun,
        protectedUntil: p.protectedUntil,
        soundwaveActive: p.soundwaveActive === true,
        soundwaveAngle: p.soundwaveAngle || 0,
        xp: p.xp,
        level: p.level,
        hasDash: p.hasDash === true,
        hasDodge: p.hasDodge === true,
        zoomLevel: p.zoomLevel || 0,
        fireRateMult: p.fireRateMult || 1.0,
        bonusDamageMult: p.bonusDamageMult || 0,
        stunnedUntil: p.stunnedUntil || 0,
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
    const isHordeRoom = room.endsWith(":horde");
    if (isHordeRoom && !hordeGames.has(room)) {
      initHordeGame(room);
    }
    const horde = isHordeRoom ? hordeGames.get(room) : null;
    const hordePayload = horde ? {
      mode: "horde",
      baseHealth: Number.isFinite(horde.baseHealth) ? Math.round(horde.baseHealth * 10) / 10 : 100,
      maxBaseHealth: Number.isFinite(horde.maxBaseHealth) ? horde.maxBaseHealth : 100,
      wave: horde.wave || 1,
      waveState: horde.waveState || "active",
      enemiesRemaining: Math.max(0, (horde.enemies ? horde.enemies.length : 0) + ((horde.enemiesToSpawnThisWave || 0) - (horde.enemiesSpawnedThisWave || 0))),
      intermissionRemaining: Math.max(0, Math.ceil(((horde.intermissionUntil || 0) - Date.now()) / 1000)),
      grannyTurretLevel: horde.grannyTurretLevel || 0,
      healAuraLevel: horde.healAuraLevel || 0,
      healAuraRadius: horde.healAuraLevel > 0 ? (220 + horde.healAuraLevel * 20) : 0,
      turretRangeBoost: horde.turretRangeBoost || 0,
      turretCooldownMult: horde.turretCooldownMult || 1.0,
      turretDamageBoost: horde.turretDamageBoost || 0,
      trapRecoveryTime: horde.trapRecoveryTime || 5000,
      placedObjects: (horde.placedObjects || []).map((o) => ({
        id: o.id,
        type: o.type,
        turretType: o.turretType || "default",
        ownerId: o.ownerId,
        x: o.x,
        y: o.y,
        radius: o.radius,
        hp: Math.max(0, Math.round(o.hp * 10) / 10),
        maxHp: o.maxHp,
        angle: o.angle || 0,
        baseRange: o.baseRange || 240,
        state: o.state || "ready",
        frozenEnemyId: o.frozenEnemyId || null,
      })),
      boss: (horde.boss && horde.boss.phase !== "defeated") ? {
        id: horde.boss.id,
        name: horde.boss.name,
        spawnSide: horde.boss.spawnSide,
        x: Math.round(horde.boss.x * 10) / 10,
        y: Math.round(horde.boss.y * 10) / 10,
        radius: horde.boss.radius,
        renderSize: horde.boss.renderSize || (horde.boss.id === "boss_baby_cyborg" ? 160 : 200),
        hp: Math.max(0, Math.round(horde.boss.hp * 10) / 10),
        maxHp: horde.boss.maxHp,
        phase: horde.boss.phase,
        isAngry: horde.boss.isAngry,
        isInvincible: horde.boss.isInvincible,
        facing: horde.boss.facing,
        animState: horde.boss.animState,
        introUntil: horde.boss.introUntil || 0,
        transformationUntil: horde.boss.transformationUntil || 0,
        laserState: horde.boss.laserState || "idle",
        laserTarget: horde.boss.laserTarget || null,
        stompState: horde.boss.stompState,
        stompTarget: horde.boss.stompTarget,
        stompWarnUntil: horde.boss.stompWarnUntil || 0,
        stompLandUntil: horde.boss.stompLandUntil || 0,
        stompRadius: horde.boss.stompRadius || 140,
        chargingBarrage: horde.boss.chargingBarrage,
        pendingProjectiles: horde.boss.pendingProjectiles || [],
        clones: Array.isArray(horde.boss.clones) ? horde.boss.clones.map(c => ({
          id: c.id,
          x: Math.round(c.x * 10) / 10,
          y: Math.round(c.y * 10) / 10,
          radius: c.radius,
          renderSize: c.renderSize,
          hp: Math.max(0, Math.round(c.hp * 10) / 10),
          maxHp: c.maxHp,
          alive: c.alive,
          facing: c.facing || 1,
          animState: c.animState || "idle",
          laserState: c.laserState || "idle",
          laserTarget: c.laserTarget || null,
          stompState: c.stompState || "idle",
          stompTarget: c.stompTarget || null,
          stompWarnUntil: c.stompWarnUntil || 0,
          stompRadius: c.stompRadius || 110,
        })) : [],
        spirals: (horde.boss.spirals || []).map(s => ({
          id: s.id,
          x: Math.round(s.x * 10) / 10,
          y: Math.round(s.y * 10) / 10,
          radius: s.radius,
          hp: Math.max(0, Math.round(s.hp * 10) / 10),
          maxHp: s.maxHp,
          angle: Math.round(s.angle * 100) / 100,
        })),
        bombs: (horde.boss.bombs || []).map(b => ({
          id: b.id,
          x: Math.round(b.x * 10) / 10,
          y: Math.round(b.y * 10) / 10,
          landAt: b.landAt,
          exploded: b.exploded,
        })),
      } : null,
    } : { mode: "ffa" };

    io.to(room).volatile.emit("world", {
      sequence: worldSequence,
      serverTime: snapshotTime,
      leaderId:
        leaderboard.find((entry) => entry.active && entry.kills > 0)?.id || null,
      leaderboard,
      players: state,
      horde: hordePayload,
      enemies: (horde && Array.isArray(horde.enemies)) ? horde.enemies.filter(Boolean).map((e) => ({
        id: e.id,
        type: e.type,
        name: e.name,
        texture: e.texture,
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        hp: Math.round(e.hp * 10) / 10,
        maxHp: e.maxHp,
        radius: e.radius,
        width: e.width,
        height: e.height,
        facing: e.facing,
        dodging: wallNow < e.dodgeUntil,
        frozen: Boolean(e.frozenUntil && wallNow < e.frozenUntil),
        stunned: Boolean(e.stunnedUntil && wallNow < e.stunnedUntil),
        burning: Boolean(e.burningUntil && wallNow < e.burningUntil),
        slowed: Boolean(e.slowedUntil && wallNow < e.slowedUntil),
      })) : [],
      objects: isHordeRoom ? [] : (roomObjects.get(room) || []).map((o) => ({
        id: o.id,
        type: o.type,
        x: Math.round(o.x * 10) / 10,
        y: Math.round(o.y * 10) / 10,
        angle: Math.round(o.angle * 100) / 100,
        hp: Math.round(o.hp * 10) / 10,
        maxHp: o.maxHp,
      })),
      hooks: grapplerHooks
        .filter((h) => h.room === room)
        .map(({ id, ownerId, x, y, angle, state, targetId }) => ({
          id,
          ownerId,
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          angle: Math.round(angle * 100) / 100,
          state,
          targetId,
        })),
      bullets: bullets
        .filter((bullet) => bullet.room === room)
        .map(({ id, x, y, vx, vy, character, radius }) => ({
          id,
          x,
          y,
          vx,
          vy,
          character,
          radius: radius || (character === "sigmatom" ? 20 : (character === "sigmatom_spiral" ? 10 : (character === "mama_cyborg" || character === "mama_cyborg_split" || character === "mama_cyborg_spiral" || character === "angry_granny" || character === "angry_granny_split" || character === "angry_granny_spiral" ? 8 : (character === "cyborg" ? 6.5 : 5)))),
        })),
    });
  }
}, 1000 / 60);
server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Cannot start: port ${PORT} is already occupied. PORT was resolved from ${path.join(__dirname, ".env")} first, then the process environment. Stop the duplicate service or set a free PORT in that .env and update your tunnel target. Use ecosystem.config.js for a single game process.`);
    process.exit(78);
  }
  console.error("Game server failed to listen:", err);
  process.exit(1);
});
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Discord Activity server ready at http://localhost:${PORT}`),
);
