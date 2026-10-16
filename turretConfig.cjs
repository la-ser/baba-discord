/**
 * Centralized Turret Configuration
 * Defines stats, abilities, drop rates, and rarities for all 7 turret types.
 */

const TURRET_TYPES = {
  default: {
    id: "default",
    name: "Default Turret",
    rarity: "starter",
    rarityName: "Starter",
    rarityColor: "#94a3b8",
    description: "Standard automated defense turret. Reliable, balanced baseline performance.",
    abilityName: "Standard Plasma",
    abilityDesc: "Fires single high-velocity plasma bolts at nearby hostiles with steady cadence.",
    texture: "default.png",
    dropRate: 0, // Starter: never appears in cases
    damageMultiplier: 1.0,   // Base damage: 2.2
    healthMultiplier: 1.0,   // Base HP: 28
    cooldownMultiplier: 1.0, // Base cooldown: 750ms
    rangeMultiplier: 1.0,    // Base range: 240px
    sizeMultiplier: 1.0,     // Base radius: 22px
    burstCount: 1,
    burstDelay: 0,
    bulletType: "turret_plasma",
  },
  fire: {
    id: "fire",
    name: "Fire Turret",
    rarity: "common",
    rarityName: "Common",
    rarityColor: "#3b82f6",
    description: "Incendiary defense turret. Ignites normal hostiles with lingering burn damage.",
    abilityName: "Flame Ignition",
    abilityDesc: "Bullets ignite normal enemies, dealing 8% DPS over 2.5s. Repeated hits refresh duration. Bosses immune to burn.",
    texture: "fire.png",
    dropRate: 0.295, // 29.5%
    damageMultiplier: 1.0,   // 100% direct damage (2.2)
    healthMultiplier: 1.0,   // 28 HP
    cooldownMultiplier: 1.0, // 750ms
    rangeMultiplier: 1.0,    // 240px
    sizeMultiplier: 1.0,     // 22px
    burstCount: 1,
    burstDelay: 0,
    burnDpsPercent: 0.08,    // 8% bullet damage per second
    burnDuration: 2500,      // 2.5 seconds
    bulletType: "turret_fire",
  },
  ice: {
    id: "ice",
    name: "Ice Turret",
    rarity: "common",
    rarityName: "Common",
    rarityColor: "#3b82f6",
    description: "Cryogenic defense turret. Chills and slows down advancing enemy swarms.",
    abilityName: "Frostbite Slow",
    abilityDesc: "Applies 25% movement slow to normal enemies for 1.75s. Hits refresh duration. Bosses immune to slow.",
    texture: "ice.png",
    dropRate: 0.295, // 29.5%
    damageMultiplier: 0.95,  // 95% direct damage (~2.09)
    healthMultiplier: 1.0,   // 28 HP
    cooldownMultiplier: 1.0, // 750ms
    rangeMultiplier: 1.0,    // 240px
    sizeMultiplier: 1.0,     // 22px
    burstCount: 1,
    burstDelay: 0,
    slowPercent: 0.25,       // 25% movement speed reduction
    slowDuration: 1750,      // 1.75 seconds
    bulletType: "turret_ice",
  },
  double_barrel: {
    id: "double_barrel",
    name: "Double Barrel Turret",
    rarity: "common",
    rarityName: "Common",
    rarityColor: "#3b82f6",
    description: "Twin-cannon defense turret. Fires rapid alternating 2-round bursts.",
    abilityName: "Twin Burst",
    abilityDesc: "Fires a rapid 2-round burst (0.12s delay) per cycle with alternating barrels.",
    texture: "double_barrel.png",
    dropRate: 0.295, // 29.5%
    damageMultiplier: 0.65,  // 65% per projectile (~1.43)
    healthMultiplier: 1.0,   // 28 HP
    cooldownMultiplier: 1.5, // 1.5x interval (1125ms)
    rangeMultiplier: 1.0,    // 240px
    sizeMultiplier: 1.0,     // 22px
    burstCount: 2,           // 2 bullets per burst
    burstDelay: 120,         // 0.12s between shots
    barrelOffsets: [-14, 14], // Visual left and right barrel offsets (pixels, 2x scaled)
    bulletType: "turret_double",
  },
  alien: {
    id: "alien",
    name: "Alien Turret",
    rarity: "rare",
    rarityName: "Rare",
    rarityColor: "#a855f7",
    description: "Extraterrestrial pulse turret. Repels incoming hostiles with graviton pulses.",
    abilityName: "Graviton Repulsor",
    abilityDesc: "Fires alien energy bolts that push normal enemies back ~20px. 0.8s knockback immunity window. Bosses immune.",
    texture: "alien.png",
    dropRate: 0.05, // 5.0%
    damageMultiplier: 0.90,  // 90% direct damage (~1.98)
    healthMultiplier: 1.0,   // 28 HP
    cooldownMultiplier: 1.0, // 750ms
    rangeMultiplier: 1.0,    // 240px
    sizeMultiplier: 1.0,     // 22px
    burstCount: 1,
    burstDelay: 0,
    knockbackDistance: 22,   // pixels
    knockbackImmunity: 800,  // 0.8s immunity window
    bulletType: "turret_alien",
  },
  tripple_barrel: {
    id: "tripple_barrel",
    name: "Triple Barrel Turret",
    rarity: "rare",
    rarityName: "Rare",
    rarityColor: "#a855f7",
    description: "Heavy three-barrel assault turret. Fires high-tempo 3-round sequential volleys.",
    abilityName: "Trident Volley",
    abilityDesc: "Fires 3 sequential rounds across its V-barrel array with tight burst timing (0.09s delay).",
    texture: "tripple_barrel.png", // Intentionally 3 P's
    dropRate: 0.05, // 5.0%
    damageMultiplier: 0.65,  // 65% per projectile (~1.43)
    healthMultiplier: 1.0,   // 28 HP
    cooldownMultiplier: 1.45,// 1.45x interval (~1088ms)
    rangeMultiplier: 1.0,    // 240px
    sizeMultiplier: 1.0,     // 22px
    burstCount: 3,           // 3 bullets per burst
    burstDelay: 90,          // 0.09s between shots
    barrelOffsets: [-16, 0, 16], // Visual offsets: Left, Center, Right (2x scaled)
    bulletType: "turret_tripple",
  },
  gold: {
    id: "gold",
    name: "Golden Turret",
    rarity: "legendary",
    rarityName: "Legendary",
    rarityColor: "#ffbe1a",
    description: "Prestige automated fortress. Immensely increased damage, reinforced armor, and extended range.",
    abilityName: "Radiant Overclock",
    abilityDesc: "200% bullet damage, 250% chassis health, +10% range, golden projectile trails, and radiant aura.",
    texture: "gold.png",
    dropRate: 0.015, // 1.5%
    damageMultiplier: 2.0,   // 200% damage (4.4)
    healthMultiplier: 2.5,   // 250% health (70 HP)
    cooldownMultiplier: 1.0, // 750ms
    rangeMultiplier: 1.1,    // 110% range (264px)
    sizeMultiplier: 1.15,    // 115% size (~25.3px radius)
    burstCount: 1,
    burstDelay: 0,
    bulletType: "turret_gold",
  },
};

const COLLECTIBLE_TURRET_IDS = [
  "fire",
  "ice",
  "double_barrel",
  "alien",
  "tripple_barrel",
  "gold",
];

const DUPLICATE_FRAGMENTS = {
  common: 10,
  rare: 25,
  legendary: 100,
};

const FRAGMENTS_PER_KEY = 100;
const ADMIN_DISCORD_ID = "831164553442230273";

module.exports = {
  TURRET_TYPES,
  COLLECTIBLE_TURRET_IDS,
  DUPLICATE_FRAGMENTS,
  FRAGMENTS_PER_KEY,
  ADMIN_DISCORD_ID,
};
