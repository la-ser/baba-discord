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
  WIDTH = 3600,
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
  granny: { width: 34, height: 36, speed: 255, damage: 1, bulletRadius: 5, bulletSpeed: 520, parryCooldown: 4500, maxHealth: 20 },
  cyborg: { width: 91, height: 108, speed: 175, damage: 2.25, bulletRadius: 6.5, bulletSpeed: 520, parryCooldown: 4500, maxHealth: 20 },
  mama_cyborg: { width: 91, height: 108, speed: 280, damage: 2.0, bulletRadius: 8, bulletSpeed: 480, parryCooldown: 4000, maxHealth: 50 },
  angry_granny: { width: 58, height: 108, speed: 280, damage: 2.0, bulletRadius: 8, bulletSpeed: 480, parryCooldown: 4000, maxHealth: 50 },
  sigmatom: { width: 186, height: 225, speed: 215, damage: 4.5, bulletRadius: 20, bulletSpeed: 1014, parryCooldown: 2250, maxHealth: 200 },
  scientist: { width: 36, height: 36, speed: 255, damage: 1, bulletRadius: 5, bulletSpeed: 520, parryCooldown: 4500, maxHealth: 20 },
};

const ENEMY_CONFIG = {
  cyborgian_1: {
    type: "cyborgian_1",
    name: "Scout",
    texture: "cyborgian (1).png",
    width: 48,
    height: 77,
    radius: 32,
    speed: 215,
    damage: 1.5,
    maxHp: 6,
    xp: 25,
    hasDodge: true,
    dodgeCooldown: 4000,
    dodgeDistance: 110,
  },
  cyborgian_2: {
    type: "cyborgian_2",
    name: "Grunt",
    texture: "cyborgian (2).png",
    width: 56,
    height: 90,
    radius: 36,
    speed: 155,
    damage: 2.0,
    maxHp: 12,
    xp: 30,
    hasDodge: false,
  },
  cyborgian_3: {
    type: "cyborgian_3",
    name: "Brawler",
    texture: "cyborgian (3).png",
    width: 66,
    height: 106,
    radius: 42,
    speed: 130,
    damage: 3.5,
    maxHp: 20,
    xp: 45,
    hasDodge: false,
  },
  cyborgian_4: {
    type: "cyborgian_4",
    name: "Striker",
    texture: "cyborgian (4).png",
    width: 52,
    height: 84,
    radius: 34,
    speed: 190,
    damage: 2.2,
    maxHp: 10,
    xp: 35,
    hasDodge: false,
  },
  cyborgian_5: {
    type: "cyborgian_5",
    name: "Phantom",
    texture: "cyborgian (5).png",
    width: 36,
    height: 98,
    radius: 32,
    speed: 235,
    damage: 2.1,
    maxHp: 8,
    xp: 40,
    hasDodge: true,
    dodgeCooldown: 3500,
    dodgeDistance: 130,
  },
  cyborgian_6: {
    type: "cyborgian_6",
    name: "Berserker",
    texture: "cyborgian (6).png",
    width: 50,
    height: 96,
    radius: 35,
    speed: 175,
    damage: 3.0,
    maxHp: 15,
    xp: 35,
    hasDodge: false,
  },
  cyborgian_8: {
    type: "cyborgian_8",
    name: "Stalker",
    texture: "cyborgian (8).png",
    width: 38,
    height: 104,
    radius: 34,
    speed: 165,
    damage: 2.6,
    maxHp: 14,
    xp: 35,
    hasDodge: false,
  },
  cyborgian_9: {
    type: "cyborgian_9",
    name: "Goliath",
    texture: "cyborgian (9).png",
    width: 74,
    height: 118,
    radius: 46,
    speed: 105,
    damage: 5.0,
    maxHp: 32,
    xp: 70,
    hasDodge: false,
  },
  cyborgian_10: {
    type: "cyborgian_10",
    name: "Vanguard",
    texture: "cyborgian (10).png",
    width: 60,
    height: 96,
    radius: 38,
    speed: 140,
    damage: 2.8,
    maxHp: 18,
    xp: 40,
    hasDodge: false,
  },
  cyborgian_11: {
    type: "cyborgian_11",
    name: "Shadow",
    texture: "cyborgian (11).png",
    width: 54,
    height: 87,
    radius: 34,
    speed: 205,
    damage: 2.4,
    maxHp: 11,
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

const hordeGames = new Map();

const HORDE_CARDS = {
  // Ability Cards (Rare, Individual, Non-Stackable)
  ability_dash: {
    id: "ability_dash",
    category: "ability",
    rarity: "rare",
    name: "Dash Thrusters",
    desc: "Unlock Spacebar Dash. Burst forward with a high-speed surge to escape danger.",
    icon: "⚡",
    faIcon: "fa-solid fa-bolt-lightning",
    condition: (player, horde) => !player.hasDash,
    apply: (player, horde) => { player.hasDash = true; }
  },
  ability_dodge: {
    id: "ability_dodge",
    category: "ability",
    rarity: "rare",
    name: "Tactical Dodge",
    desc: "Unlock manual Dodge roll with invulnerability frames (Shift / F) (4s cooldown).",
    icon: "🌀",
    faIcon: "fa-solid fa-wind",
    condition: (player, horde) => !player.hasDodge,
    apply: (player, horde) => { player.hasDodge = true; }
  },

  // Granny Utility Cards (Stackable team upgrades)
  granny_turret: {
    id: "granny_turret",
    category: "utility",
    rarity: "common",
    name: "Granny Defense Cannon",
    desc: "Granny statue auto-fires high-power plasma at nearest enemy. Stacking reduces fire delay.",
    icon: "🔱",
    faIcon: "fa-solid fa-crosshairs",
    condition: (player, horde) => true,
    apply: (player, horde) => {
      horde.grannyTurretLevel = (horde.grannyTurretLevel || 0) + 1;
    }
  },
  granny_repair: {
    id: "granny_repair",
    category: "utility",
    rarity: "common",
    name: "Core Nanite Repair",
    desc: "Instantly restore the Granny Core back to 100% full health.",
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
    name: "Bio-Regen Field",
    desc: "Emits a protective rejuvenation ring around Granny that heals nearby players. Stacking increases rate and range.",
    icon: "💚",
    faIcon: "fa-solid fa-heart-pulse",
    condition: (player, horde) => true,
    apply: (player, horde) => {
      horde.healAuraLevel = (horde.healAuraLevel || 0) + 1;
    }
  },

  // Object Placement Cards
  object_wall: {
    id: "object_wall",
    category: "object",
    rarity: "common",
    name: "Reinforced Barricade",
    desc: "Deploy a sturdy defensive wall that blocks enemy pathing and absorbs melee attacks.",
    icon: "🧱",
    faIcon: "fa-solid fa-shield-halved",
    condition: (player, horde) => horde.placedObjects.filter(o => o.type === "wall").length < 12,
    apply: (player, horde) => {
      player.pendingPlacements = player.pendingPlacements || [];
      player.pendingPlacements.push("wall");
    }
  },
  object_turret: {
    id: "object_turret",
    category: "object",
    rarity: "uncommon",
    name: "Autonomous Sentry",
    desc: "Deploy an automated sentry gun station that fires at approaching enemies within its radius.",
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
    name: "Cryo Freeze Trap",
    desc: "Deploy a floor trap that freezes any enemy walking over it for 5 seconds.",
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
    name: "Turret Radar Optics",
    desc: "Upgrade all sentry turrets with +70px targeting and firing range.",
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
    name: "Turret Overclock",
    desc: "Accelerate turret barrel cycling: reduce firing cooldown by 25%.",
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
    name: "High-Caliber Rounds",
    desc: "Increase all sentry turret bullet damage by +1.2 per shot.",
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
    name: "Rapid Cryo Cycling",
    desc: "Reduce trap recovery time after freeze from 5.0s down to 3.2s (or faster).",
    icon: "⏱️",
    faIcon: "fa-solid fa-clock-rotate-left",
    condition: (player, horde) => horde.placedObjects.some(o => o.type === "trap"),
    apply: (player, horde) => {
      horde.trapRecoveryTime = Math.max(1200, (horde.trapRecoveryTime || 5000) - 1300);
    }
  }
};

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
    if (wave === 3) return ["cyborgian_1", "cyborgian_2", "cyborgian_3", "cyborgian_4", "cyborgian_5", "cyborgian_6", "cyborgian_8"];
    if (wave === 4) return ["cyborgian_1", "cyborgian_2", "cyborgian_3", "cyborgian_4", "cyborgian_5", "cyborgian_6", "cyborgian_8", "cyborgian_10", "cyborgian_11"];
    return Object.keys(ENEMY_CONFIG);
  }

  spawnEnemy(activePlayerCount = 1) {
    const types = this.getAvailableTypesForWave(this.wave);
    const chosenType = types[Math.floor(Math.random() * types.length)];
    const config = ENEMY_CONFIG[chosenType];
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = ARENA_RADIUS - 120 + (Math.random() - 0.5) * 80;
    const x = ARENA_CENTER.x + Math.cos(angle) * spawnDist;
    const y = ARENA_CENTER.y + Math.sin(angle) * spawnDist;

    // In Wave 1, all enemies have 1 HP (one-hit kill!)
    // In Wave 2, 2 HP.
    // In Wave 3+, scales smoothly with wave and enemy base tier
    let hp;
    let speed;
    let damage;
    if (this.wave === 1) {
      hp = 1;
      speed = Math.min(105, config.speed * 0.62);
      damage = 1.0;
    } else if (this.wave === 2) {
      hp = 2;
      speed = Math.min(125, config.speed * 0.76);
      damage = 1.4;
    } else if (this.wave === 3) {
      hp = Math.max(2, Math.round(config.maxHp * 0.35));
      speed = config.speed * 0.88;
      damage = Math.max(1.5, config.damage * 0.75);
    } else {
      const waveProgress = Math.min(2.0, 0.4 + (this.wave - 3) * 0.15);
      hp = Math.max(3, Math.round(config.maxHp * waveProgress));
      speed = config.speed;
      damage = config.damage;
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

  generateCardOptions(player) {
    const available = [];
    for (const card of Object.values(HORDE_CARDS)) {
      if (card.condition(player, this)) {
        available.push(card);
      }
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

  applyCardUpgrade(player, cardId, io) {
    const card = HORDE_CARDS[cardId];
    if (!card) return;
    card.apply(player, this);

    io.to(player.id).emit("upgrade_applied", {
      cardId: card.id,
      name: card.name,
      category: card.category,
      hasDash: player.hasDash === true,
      hasDodge: player.hasDodge === true,
    });

    if (card.category === "object") {
      const objectType = card.id.replace("object_", "");
      io.to(player.id).emit("enter_placement_mode", { objectType });
    }
  }

  startNextWave(io, roomPlayerIds) {
    this.wave += 1;
    this.waveState = "active";
    const activeCount = Math.max(1, [...roomPlayerIds].filter(id => players.get(id)?.active).length);
    this.enemiesSpawnedThisWave = 0;
    this.enemiesToSpawnThisWave = this.getWaveEnemyCount(this.wave, activeCount);
    this.spawnInterval = this.getSpawnInterval(this.wave, activeCount);
    this.lastSpawnAt = Date.now() + 1500;
    io.to(this.room).emit("wave_started", {
      wave: this.wave,
      totalEnemies: this.enemiesToSpawnThisWave,
    });
  }

  update(dt, wallNow, roomPlayerIds, bullets, io) {
    const activePlayerCount = Math.max(1, [...roomPlayerIds].filter(id => players.get(id)?.active).length);

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

    // When upgrading, gameplay is paused!
    if (this.waveState === "upgrade_selection") {
      return;
    }

    // 1. Granny Core Cannon firing
    if (this.grannyTurretLevel > 0 && this.waveState === "active") {
      const cooldown = Math.max(1000, 5000 - (this.grannyTurretLevel - 1) * 900);
      if (wallNow - (this.lastGrannyShotAt || 0) >= cooldown) {
        let closestEnemy = null;
        let closestDist = 580;
        for (const enemy of this.enemies) {
          const d = Math.hypot(enemy.x - ARENA_CENTER.x, enemy.y - ARENA_CENTER.y);
          if (d < closestDist) {
            closestDist = d;
            closestEnemy = enemy;
          }
        }
        if (closestEnemy) {
          this.lastGrannyShotAt = wallNow;
          const angle = Math.atan2(closestEnemy.y - ARENA_CENTER.y, closestEnemy.x - ARENA_CENTER.x);
          const damage = 2.5 + this.wave * 0.7;
          bullets.push({
            id: nextBulletId++,
            room: this.room,
            ownerId: "granny_statue",
            x: ARENA_CENTER.x + Math.cos(angle) * 45,
            y: ARENA_CENTER.y + Math.sin(angle) * 45,
            vx: Math.cos(angle) * 620,
            vy: Math.sin(angle) * 620,
            damage,
            radius: 8,
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
            const maxHp = getMaxHealth(p.character);
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
      const cooldown = Math.max(300, (obj.baseCooldown || 750) * (this.turretCooldownMult || 1.0));
      if (wallNow - (obj.lastShotAt || 0) >= cooldown && this.waveState === "active") {
        const range = (obj.baseRange || 240) + (this.turretRangeBoost || 0);
        let closestEnemy = null;
        let closestDist = range;

        for (const enemy of this.enemies) {
          const d = Math.hypot(enemy.x - obj.x, enemy.y - obj.y);
          if (d < closestDist) {
            closestDist = d;
            closestEnemy = enemy;
          }
        }

        if (closestEnemy) {
          obj.lastShotAt = wallNow;
          const angle = Math.atan2(closestEnemy.y - obj.y, closestEnemy.x - obj.x);
          obj.angle = angle;
          const bulletDamage = (obj.baseDamage || 2.2) + (this.turretDamageBoost || 0);
          bullets.push({
            id: nextBulletId++,
            room: this.room,
            ownerId: "turret_" + obj.id,
            x: obj.x + Math.cos(angle) * (obj.radius + 6),
            y: obj.y + Math.sin(angle) * (obj.radius + 6),
            vx: Math.cos(angle) * 680,
            vy: Math.sin(angle) * 680,
            damage: bulletDamage,
            radius: 5,
            character: "turret_plasma",
            bornAt: wallNow,
            expiresAt: wallNow + 1400,
          });
          io.to(this.room).emit("turret_fired", {
            id: obj.id,
            angle,
            x: obj.x,
            y: obj.y,
          });
        }
      }
    }

    // 4. Placed Traps state cycling
    for (const obj of this.placedObjects) {
      if (obj.type !== "trap") continue;
      if (obj.state === "frozen") {
        if (wallNow >= obj.frozenUntil) {
          obj.state = "recovery";
          obj.recoveryUntil = wallNow + (this.trapRecoveryTime || 5000);
          obj.frozenEnemyId = null;
          io.to(this.room).emit("trap_state_changed", { id: obj.id, state: "recovery" });
        }
      } else if (obj.state === "recovery") {
        if (wallNow >= obj.recoveryUntil) {
          obj.state = "ready";
          io.to(this.room).emit("trap_state_changed", { id: obj.id, state: "ready" });
        }
      }
    }

    // 5. Enemy Dodge AI
    for (const enemy of this.enemies) {
      if (!enemy.hasDodge || wallNow < enemy.dodgeReadyAt || wallNow < enemy.dodgeUntil) continue;
      for (const b of bullets) {
        if (b.room !== this.room) continue;
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

      // Frozen check
      if (enemy.frozenUntil && enemy.frozenUntil > wallNow) {
        continue;
      }

      // Check interaction with placed traps
      for (const obj of this.placedObjects) {
        if (obj.type === "trap" && obj.state === "ready") {
          const d = Math.hypot(enemy.x - obj.x, enemy.y - obj.y);
          if (d <= obj.radius + enemy.radius) {
            obj.state = "frozen";
            obj.frozenEnemyId = enemy.id;
            obj.frozenUntil = wallNow + 5000;
            enemy.frozenUntil = wallNow + 5000;
            io.to(this.room).emit("trap_triggered", {
              trapId: obj.id,
              enemyId: enemy.id,
              x: obj.x,
              y: obj.y,
            });
            break;
          }
        }
      }

      if (enemy.frozenUntil && enemy.frozenUntil > wallNow) {
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
          if (!p || !p.active || p.health <= 0) continue;
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
          const minStopDist = closestPlayer ? (enemy.radius + characterRadius(closestPlayer.character) - 4) : (enemy.radius + 38);
          if (dist > minStopDist) {
            enemy.x += nx * enemy.speed * dt;
            enemy.y += ny * enemy.speed * dt;
          }
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
        if (obj.type === "wall" || obj.type === "turret") {
          let cx = obj.x;
          let cy = obj.y;
          let minD = enemy.radius + obj.radius;
          if (obj.type === "wall") {
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
            io.to(this.room).emit("base_destroyed", { wave: this.wave });
          }
        }
      }

      // Melee damage to nearby players (Manual Dodge only, never automatic)
      for (const pid of roomPlayerIds) {
        const p = players.get(pid);
        if (!p || !p.active || p.health <= 0) continue;
        const pDist = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        const pRadius = characterRadius(p.character);

        if (p.protectedUntil > wallNow) continue;

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
    }

    // 7. Wave Cleared -> Trigger Upgrade Selection (Game Pauses!)
    if (this.waveState === "active") {
      if (this.enemiesSpawnedThisWave >= this.enemiesToSpawnThisWave && this.enemies.length === 0) {
        this.waveState = "upgrade_selection";
        this.baseHealth = Math.min(this.maxBaseHealth, this.baseHealth + 25);

        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (p && p.active) {
            p.health = Math.min(getMaxHealth(p.character), p.health + 10);
            awardXp(p, 50 + this.wave * 15);
          }
        }

        this.pendingPlayersToChoose = new Set();
        this.cardOfferings.clear();

        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (p && p.active) {
            this.pendingPlayersToChoose.add(pid);
            const cards = this.generateCardOptions(p);
            this.cardOfferings.set(pid, cards);
            io.to(pid).emit("horde_upgrade_options", {
              wave: this.wave,
              options: cards,
              baseHealth: Math.round(this.baseHealth * 10) / 10,
            });
          }
        }

        io.to(this.room).emit("wave_cleared", {
          wave: this.wave,
          baseHealth: Math.round(this.baseHealth * 10) / 10,
          isUpgrading: true,
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
        for (const pid of roomPlayerIds) {
          const p = players.get(pid);
          if (p && p.active) {
            p.health = 20;
            p.hasDash = false;
            p.hasDodge = false;
            p.pendingPlacements = [];
            p.x = ARENA_CENTER.x + (Math.random() - 0.5) * 180;
            p.y = ARENA_CENTER.y + (Math.random() - 0.5) * 180;
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

function getMaxHealth(character) {
  return CHARACTER_STATS[character]?.maxHealth || MAX_HEALTH;
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

function getLevelForXp(xp) {
  if (xp >= 1000) return 10;
  if (xp >= 800) return 9;
  if (xp >= 600) return 8;
  if (xp >= 450) return 7;
  if (xp >= 320) return 6;
  if (xp >= 220) return 5;
  if (xp >= 140) return 4;
  if (xp >= 75) return 3;
  if (xp >= 30) return 2;
  return 1;
}

function getXpForNextLevel(level) {
  const thresholds = [0, 30, 75, 140, 220, 320, 450, 600, 800, 1000];
  return thresholds[level] || 1000;
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
    victim.health = getMaxHealth(victim.character);
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
  const { accessToken, instanceId, guestName, customName, mode } = socket.handshake.auth || {};
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
      id: "guest-" + validGuest,
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
io.on("connection", (socket) => {
  const { id: discordId, name, instanceId, mode: initialMode } = socket.data.identity;
  const currentMode = initialMode === "horde" ? "horde" : "ffa";
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
    pendingPlacements: [],
    lastSoundwavePulseAt: 0,
  };
  players.set(socket.id, p);
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
        p.health = getMaxHealth(character);
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
    const maxHp = getMaxHealth(character);
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
  socket.on("switch_mode", (targetMode) => {
    const validMode = targetMode === "horde" ? "horde" : "ffa";
    const targetRoom = `activity:${instanceId}:${validMode}`;
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
      p.health = 20;
      p.hasDash = false;
      p.hasDodge = false;
      p.pendingPlacements = [];
      const spawn = getPlayerSpawn("scientist", newRoom);
      p.x = spawn.x;
      p.y = spawn.y;
      initHordeGame(newRoom);
    } else {
      p.character = p.lastFfaCharacter || "granny";
      p.health = getMaxHealth(p.character);
      p.hasDash = true;
      p.hasDodge = false;
      p.pendingPlacements = [];
      const spawn = getPlayerSpawn(p.character, newRoom);
      p.x = spawn.x;
      p.y = spawn.y;
      initRoomObjects(newRoom);
    }
    p.deadSince = 0;
    p.protectedUntil = Date.now() + SPAWN_PROTECTION;
    socket.emit("mode_switched", { mode: validMode, character: p.character });
  });
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

    if (horde.pendingPlayersToChoose.size === 0) {
      clearTimeout(horde.upgradeTimeout);
      horde.startNextWave(io, rooms.get(horde.room) || new Set());
    }
  });
  socket.on("place_horde_object", (payload) => {
    if (p.mode !== "horde") return;
    const horde = hordeGames.get(p.room);
    if (!horde) return;
    const type = payload?.type;
    const x = Number(payload?.x);
    const y = Number(payload?.y);
    const angle = Number(payload?.angle) || 0;
    if (!["wall", "turret", "trap"].includes(type)) return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    const distFromCenter = Math.hypot(x - ARENA_CENTER.x, y - ARENA_CENTER.y);
    if (distFromCenter > ARENA_RADIUS - 50 || distFromCenter < 65) return;

    const idx = (p.pendingPlacements || []).indexOf(type);
    if (idx === -1) return;
    p.pendingPlacements.splice(idx, 1);

    const newObj = {
      id: horde.nextObjectId++,
      type,
      ownerId: p.id,
      x: Math.round(x),
      y: Math.round(y),
      radius: type === "wall" ? 30 : (type === "turret" ? 22 : 25),
      hp: type === "wall" ? 60 : (type === "turret" ? 28 : 100),
      maxHp: type === "wall" ? 60 : (type === "turret" ? 28 : 100),
      angle: Number.isFinite(angle) ? angle : 0,
      state: "ready",
      lastShotAt: 0,
      baseRange: 240,
      baseCooldown: 750,
      baseDamage: 2.2,
      frozenUntil: 0,
      recoveryUntil: 0,
    };
    horde.placedObjects.push(newObj);
    io.to(p.room).emit("horde_object_placed", { object: newObj });
    socket.emit("exit_placement_mode");
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
    if (nextActive && (!p.active || p.health <= 0)) {
      const nextSpawn = getPlayerSpawn(p.character, p.room);
      p.x = nextSpawn.x;
      p.y = nextSpawn.y;
      p.health = getMaxHealth(p.character);
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
        if (!horde.cardOfferings.has(socket.id)) {
          horde.pendingPlayersToChoose.add(socket.id);
          const cards = horde.generateCardOptions(p);
          horde.cardOfferings.set(socket.id, cards);
          socket.emit("horde_upgrade_options", {
            wave: horde.wave,
            options: cards,
            baseHealth: Math.round(horde.baseHealth * 10) / 10,
          });
        }
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
      p.health = getMaxHealth(p.character);
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
    if (
      !p.active ||
      p.health <= 0 ||
      now < p.parryUntil ||
      now - p.lastShotAt < ((p.character === "sigmatom" || p.minigun) ? MINIGUN_COOLDOWN : SHOT_COOLDOWN) ||
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
      damage: stats.damage,
      character: p.character,
      homing: p.character === "sigmatom",
      canSplit: canSplit,
      splitAt: canSplit ? now + 1000 : 0,
      expiresAt: now + (p.character === "sigmatom" ? 2800 : (canSplit ? 1200 : BULLET_LIFETIME)),
    });
  });
  socket.on("disconnect", () => {
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

function awardXp(player, amount) {
  if (!player) return;
  player.xp = (player.xp || 0) + amount;
  const oldLevel = player.level || 1;
  const newLevel = getLevelForXp(player.xp);
  player.level = newLevel;

  io.to(player.id).emit("xp_update", {
    xp: player.xp,
    level: player.level,
    gained: amount,
    nextLevelXp: getXpForNextLevel(player.level),
  });

  if (newLevel > oldLevel) {
    const maxHp = getMaxHealth(player.character);
    player.health = maxHp;
    io.to(player.room).emit("player_leveled_up", {
      playerId: player.id,
      name: player.name,
      level: newLevel,
      health: player.health,
      maxHealth: maxHp,
      unlockedMamaCyborg: newLevel >= 10,
    });
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
        p.health = getMaxHealth(p.character);
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
      }
    }
  }

  // Health Regeneration: All players regenerate health over time!
  for (const p of players.values()) {
    if (!p.active || p.health <= 0) continue;
    const maxHp = getMaxHealth(p.character);
    if (p.health < maxHp) {
      const timeSinceDamage = wallNow - (p.lastDamageAt || 0);
      // Continuous regen: 2.5% max HP / sec. Out-of-combat boost after 3.5s without damage: 8% max HP / sec
      const regenRate = timeSinceDamage > 3500 ? (maxHp * 0.08) : (maxHp * 0.025);
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
            awardXp(p, enemy.xp);
            io.to(p.room).emit("enemy_killed", {
              enemyId: enemy.id,
              type: enemy.type,
              x: enemy.x,
              y: enemy.y,
              killerId: p.id,
              xp: enemy.xp,
            });
            horde.enemies.splice(ei, 1);
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

      if (horde && horde.enemies.length > 0) {
        for (const enemy of horde.enemies) {
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
        let hitEnemy = false;
        for (let ei = horde.enemies.length - 1; ei >= 0; ei--) {
          const enemy = horde.enemies[ei];
          if (sweptBulletTouchesCircle(bullet, previousX, previousY, enemy.x, enemy.y, enemy.radius)) {
            enemy.hp -= bullet.damage;
            const bSpeed = Math.hypot(bullet.vx, bullet.vy) || 1;
            enemy.recoilVx += (bullet.vx / bSpeed) * 140;
            enemy.recoilVy += (bullet.vy / bSpeed) * 140;
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
                awardXp(killer, enemy.xp);
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
            }
            bullets.splice(i, 1);
            hitEnemy = true;
            break;
          }
        }
        if (hitEnemy) continue;
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
        maxHealth: getMaxHealth(p.character),
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
    } : { mode: "ffa" };

    io.to(room).volatile.emit("world", {
      sequence: worldSequence,
      serverTime: snapshotTime,
      leaderId:
        leaderboard.find((entry) => entry.active && entry.kills > 0)?.id || null,
      leaderboard,
      players: state,
      horde: hordePayload,
      enemies: horde ? horde.enemies.map((e) => ({
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
server.listen(PORT, "0.0.0.0", () =>
  console.log(`Discord Activity server ready at http://localhost:${PORT}`),
);
