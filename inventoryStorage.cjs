/**
 * Durable, Atomic Server-Side Inventory & Gift Storage
 * Backed by data/inventories.json and data/gifts.json with atomic writes.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  TURRET_TYPES,
  COLLECTIBLE_TURRET_IDS,
  DUPLICATE_FRAGMENTS,
  FRAGMENTS_PER_KEY,
  ADMIN_DISCORD_ID,
} = require("./turretConfig.cjs");

const DATA_DIR = process.env.INVENTORY_DATA_DIR || path.join(__dirname, "data");
const INVENTORIES_FILE = path.join(DATA_DIR, "inventories.json");
const GIFTS_FILE = path.join(DATA_DIR, "gifts.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory caches
let inventories = new Map();
let gifts = [];

// Atomic write helper
function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.${Date.now()}.${Math.floor(Math.random() * 100000)}.tmp`;
  try {
    const fd = fs.openSync(tmpPath, "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(data, null, 2), "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`[Storage] Failed atomic write to ${filePath}:`, err);
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
    throw err;
  }
}

// Load inventories
function loadInventories() {
  inventories.clear();
  if (fs.existsSync(INVENTORIES_FILE)) {
    try {
      const raw = fs.readFileSync(INVENTORIES_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error("Invalid inventory file structure");
      if (typeof parsed === "object" && parsed !== null) {
        for (const [id, inv] of Object.entries(parsed)) {
          inventories.set(id, sanitizeInventory(id, inv));
        }
      }
    } catch (e) {
      throw new Error("Refusing to overwrite unreadable inventories.json", { cause: e });
    }
  }
}

// Load gifts
function loadGifts() {
  gifts = [];
  if (fs.existsSync(GIFTS_FILE)) {
    try {
      const raw = fs.readFileSync(GIFTS_FILE, "utf8");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid gift file structure");
      if (Array.isArray(parsed)) {
        gifts = parsed;
      }
    } catch (e) {
      throw new Error("Refusing to overwrite unreadable gifts.json", { cause: e });
    }
  }
}

function saveInventories() {
  const obj = {};
  for (const [id, inv] of inventories.entries()) {
    obj[id] = inv;
  }
  atomicWriteJson(INVENTORIES_FILE, obj);
}

function saveGifts() {
  atomicWriteJson(GIFTS_FILE, gifts);
}

function sanitizeInventory(discordId, data = {}) {
  const unlocked = Array.isArray(data.unlockedTurrets) ? [...data.unlockedTurrets] : [];
  if (!unlocked.includes("default")) {
    unlocked.unshift("default");
  }
  // Ensure all unlocked IDs are valid
  const validUnlocked = unlocked.filter((id) => TURRET_TYPES[id]);
  const equipped = validUnlocked.includes(data.equippedTurret) ? data.equippedTurret : "default";

  return {
    discordId: String(discordId),
    keys: Math.max(0, Math.floor(Number(data.keys) || 0)),
    fragments: Math.max(0, Math.floor(Number(data.fragments) || 0)),
    unlockedTurrets: validUnlocked,
    equippedTurret: equipped,
    caseHistory: Array.isArray(data.caseHistory) ? data.caseHistory.slice(-100) : [],
    starterKeyGranted: data.starterKeyGranted === true,
    claimedGiftIds: Array.isArray(data.claimedGiftIds) ? data.claimedGiftIds.filter(id => typeof id === "string") : [],
    updatedAt: data.updatedAt || Date.now(),
  };
}

// Initialize on load
loadInventories();
loadGifts();

/**
 * Get or create inventory for a Discord user
 */
function getInventory(discordId) {
  if (!discordId) return null;
  const idStr = String(discordId);
  if (!inventories.has(idStr)) {
    const newInv = sanitizeInventory(idStr);
    inventories.set(idStr, newInv);
  }
  const inv = inventories.get(idStr);
  if (!inv.starterKeyGranted) {
    // Existing keys or case history count as an earlier starter grant.
    if (inv.keys === 0 && inv.caseHistory.length === 0) inv.keys = 1;
    inv.starterKeyGranted = true;
    inv.updatedAt = Date.now();
    saveInventories();
  }
  return inv;
}

/**
 * Open a Turret Weapon Case for a Discord user
 * Server authoritative, cryptographically secure randomness.
 */
function openTurretCase(discordId, requestId) {
  const inv = getInventory(discordId);
  if (!inv) {
    return { success: false, error: "Player inventory not found" };
  }

  if (requestId !== undefined && (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(requestId))) return { success: false, error: "Invalid case request ID." };
  const previous = requestId && inv.caseHistory.find(roll => roll.requestId === requestId);
  if (previous) return { success: true, requestId, winningTurretId: previous.turretId, turret: TURRET_TYPES[previous.turretId], isDuplicate: previous.isDuplicate, fragmentsAwarded: previous.fragmentsAwarded, inventory: inv };
  if (inv.keys < 1) {
    return { success: false, error: "Insufficient keys. Each case opening requires 1 key." };
  }

  // Deduct 1 key
  inv.keys -= 1;

  // Roll winning turret using cryptographically secure random integer in [0, 10000)
  // Drop table:
  // Fire: 29.5% -> 2950 tickets [0, 2950)
  // Ice: 29.5% -> 2950 tickets [2950, 5900)
  // Double Barrel: 29.5% -> 2950 tickets [5900, 8850)
  // Alien: 5.0% -> 500 tickets [8850, 9350)
  // Triple Barrel: 5.0% -> 500 tickets [9350, 9850)
  // Golden: 1.5% -> 150 tickets [9850, 10000)
  const roll = crypto.randomInt(0, 10000);
  let winningTurretId = "fire";

  if (roll < 2950) {
    winningTurretId = "fire";
  } else if (roll < 5900) {
    winningTurretId = "ice";
  } else if (roll < 8850) {
    winningTurretId = "double_barrel";
  } else if (roll < 9350) {
    winningTurretId = "alien";
  } else if (roll < 9850) {
    winningTurretId = "tripple_barrel";
  } else {
    winningTurretId = "gold";
  }

  const isDuplicate = inv.unlockedTurrets.includes(winningTurretId);
  let fragmentsAwarded = 0;

  if (isDuplicate) {
    const rarity = TURRET_TYPES[winningTurretId]?.rarity || "common";
    fragmentsAwarded = DUPLICATE_FRAGMENTS[rarity] || 10;
    inv.fragments += fragmentsAwarded;
  } else {
    inv.unlockedTurrets.push(winningTurretId);
  }

  inv.caseHistory.push({
    id: `roll_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
    requestId,
    turretId: winningTurretId,
    isDuplicate,
    fragmentsAwarded,
    timestamp: Date.now(),
  });

  inv.caseHistory = inv.caseHistory.slice(-100);
  inv.updatedAt = Date.now();
  saveInventories();

  return {
    success: true,
    requestId,
    winningTurretId,
    turret: TURRET_TYPES[winningTurretId],
    isDuplicate,
    fragmentsAwarded,
    inventory: inv,
  };
}

/**
 * Craft 1 key from 100 fragments
 */
function craftKeyFromFragments(discordId) {
  const inv = getInventory(discordId);
  if (!inv) return { success: false, error: "Player inventory not found" };

  if (inv.fragments < FRAGMENTS_PER_KEY) {
    return {
      success: false,
      error: `Need ${FRAGMENTS_PER_KEY} fragments to craft 1 key (you have ${inv.fragments})`,
    };
  }

  inv.fragments -= FRAGMENTS_PER_KEY;
  inv.keys += 1;
  inv.updatedAt = Date.now();
  saveInventories();

  return { success: true, inventory: inv };
}

/**
 * Equip an unlocked turret
 */
function equipTurret(discordId, turretId) {
  const inv = getInventory(discordId);
  if (!inv) return { success: false, error: "Player inventory not found" };

  if (!TURRET_TYPES[turretId]) {
    return { success: false, error: "Unknown turret type" };
  }

  if (!inv.unlockedTurrets.includes(turretId)) {
    return { success: false, error: "You have not unlocked this turret yet" };
  }

  inv.equippedTurret = turretId;
  inv.updatedAt = Date.now();
  saveInventories();

  return { success: true, equippedTurret: turretId, inventory: inv };
}

/**
 * Create a key gift from Admin
 */
function createAdminGift(adminDiscordId, recipientDiscordId, keys, note = "") {
  if (String(adminDiscordId) !== ADMIN_DISCORD_ID) {
    return { success: false, error: "Unauthorized: Admin privileges required." };
  }

  const cleanRecipientId = String(recipientDiscordId || "").trim();
  if (!/^(\d{17,21}|[a-zA-Z0-9_\-\.]{3,32})$/.test(cleanRecipientId)) {
    return {
      success: false,
      error: "Invalid recipient Discord ID or username. Must be a 17-21 digit numeric Snowflake ID or valid handle.",
    };
  }

  const keyAmount = parseInt(keys, 10);
  if (isNaN(keyAmount) || keyAmount <= 0 || keyAmount > 1000) {
    return {
      success: false,
      error: "Invalid key quantity. Must be an integer between 1 and 1000.",
    };
  }

  const gift = {
    id: `gift_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
    fromAdminId: ADMIN_DISCORD_ID,
    recipientDiscordId: cleanRecipientId,
    keys: keyAmount,
    note: String(note || "").slice(0, 80),
    createdAt: Date.now(),
    status: "pending",
  };

  gifts.unshift(gift);
  saveGifts();

  return { success: true, gift };
}

/**
 * Get all pending gifts for a recipient
 */
function getPendingGiftsForUser(recipientDiscordId) {
  const idStr = String(recipientDiscordId);
  return gifts.filter((g) => g.recipientDiscordId === idStr && g.status === "pending");
}

/**
 * Claim a pending gift
 */
function claimGift(recipientDiscordId, giftId) {
  const idStr = String(recipientDiscordId);
  const gift = gifts.find((g) => g.id === giftId);

  if (!gift) {
    return { success: false, error: "Gift not found" };
  }

  if (gift.recipientDiscordId !== idStr) {
    return { success: false, error: "This gift was not addressed to you" };
  }

  if (gift.status !== "pending") {
    return { success: false, error: `Gift is already ${gift.status}` };
  }

  const inv = getInventory(idStr);
  const alreadyGranted = inv.claimedGiftIds.includes(gift.id);
  if (!alreadyGranted) {
    inv.keys += gift.keys;
    inv.claimedGiftIds.push(gift.id);
    inv.updatedAt = Date.now();
    // The balance and claim receipt commit in ONE atomic file operation.
    saveInventories();
  }
  gift.status = "claimed";
  gift.claimedAt = Date.now();
  try { saveGifts(); } catch (error) { console.error('[Storage] Gift metadata deferred; durable claim receipt prevents duplicate grants:', error.message); }

  return {
    success: true,
    gift,
    addedKeys: alreadyGranted ? 0 : gift.keys,
    inventory: inv,
  };
}

/**
 * Decline a pending gift
 */
function declineGift(recipientDiscordId, giftId) {
  const idStr = String(recipientDiscordId);
  const gift = gifts.find((g) => g.id === giftId);

  if (!gift) {
    return { success: false, error: "Gift not found" };
  }

  if (gift.recipientDiscordId !== idStr) {
    return { success: false, error: "This gift was not addressed to you" };
  }

  if (gift.status !== "pending") {
    return { success: false, error: `Gift is already ${gift.status}` };
  }

  gift.status = "declined";
  gift.declinedAt = Date.now();
  saveGifts();

  return { success: true, gift };
}

/**
 * Get all gifts history (Admin only)
 */
function getAllGiftsHistory(adminDiscordId) {
  if (String(adminDiscordId) !== ADMIN_DISCORD_ID) {
    return [];
  }
  return gifts.slice(0, 100);
}

function giftOperation(operation) {
  return (...args) => {
    const before = structuredClone(gifts);
    try { return operation(...args); }
    catch (error) { gifts = before; console.error('[Storage] Gift operation failed:', error.message); return { success: false, error: 'Gift storage unavailable. Please try again.' }; }
  };
}
function durableOperation(operation, resultOnError = true) {
  return (...args) => {
    const id = String(args[0]);
    const before = inventories.has(id) ? structuredClone(inventories.get(id)) : null;
    try { return operation(...args); }
    catch (error) {
      if (before) inventories.set(id, before); else inventories.delete(id);
      console.error('[Storage] Inventory operation failed:', error.message);
      if (!resultOnError) throw error;
      return { success: false, error: 'Inventory storage is temporarily unavailable. Your balance was not changed. Please try again.' };
    }
  };
}
module.exports = {
  getInventory: durableOperation(getInventory, false),
  openTurretCase: durableOperation(openTurretCase),
  craftKeyFromFragments: durableOperation(craftKeyFromFragments),
  equipTurret: durableOperation(equipTurret),
  createAdminGift: giftOperation(createAdminGift),
  getPendingGiftsForUser,
  claimGift: durableOperation(claimGift),
  declineGift: giftOperation(declineGift),
  getAllGiftsHistory,
  ADMIN_DISCORD_ID,
};
