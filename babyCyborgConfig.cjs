// Baby Cyborg Configuration (CommonJS for server)
const BABY_CYBORG_CONFIG = {
  id: "boss_baby_cyborg",
  name: "BABY CYBORG",

  // Dimensions
  textureSize: 1254,
  renderSize: 160,          // Visual width and height
  radius: 50,               // Collision radius for main boss
  cloneRenderSize: 112,     // 70% of 160
  cloneRadius: 35,          // 70% of 50

  // Exact normalized coordinates extracted from pixel analysis of red dots in eye overlays:
  // Left eye center: (564.82, 353.33) / 1254 = (0.45042, 0.28176)
  // Right eye center: (735.64, 330.29) / 1254 = (0.58663, 0.26339)
  leftEye: {
    normX: 0.45042,
    normY: 0.28176,
  },
  rightEye: {
    normX: 0.58663,
    normY: 0.26339,
  },

  // Health
  baseHp: 10000,
  hpPerExtraPlayer: 3500,

  // Phases
  phaseThresholds: {
    phase1: 1.0,
    phase2: 0.60,
    phase3: 0.25,
  },

  // Movement speed
  speed: 65,
  cloneSpeed: 80,

  // Attacks
  laser: {
    cooldown: 7000,
    warningDuration: 1000,
    firingDuration: 2000,
    dpsPerBeam: 80,
    range: 850,
  },

  stomp: {
    cooldown: 9000,
    warningDuration: 1500,
    radius: 140,
    damage: 175,
  },

  transformationDuration: 2200,
};

function getEyeOffsets(width, height) {
  return {
    left: {
      x: (BABY_CYBORG_CONFIG.leftEye.normX - 0.5) * width,
      y: (BABY_CYBORG_CONFIG.leftEye.normY - 0.5) * height,
    },
    right: {
      x: (BABY_CYBORG_CONFIG.rightEye.normX - 0.5) * width,
      y: (BABY_CYBORG_CONFIG.rightEye.normY - 0.5) * height,
    },
  };
}

module.exports = {
  BABY_CYBORG_CONFIG,
  getEyeOffsets,
};
