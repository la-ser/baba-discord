// Baby Cyborg Configuration (CommonJS for server)
const BABY_CYBORG_CONFIG = {
  id: "boss_baby_cyborg",
  name: "BABY CYBORG",

  // Dimensions (increased 3x)
  textureSize: 1254,
  renderSize: 480,          // Visual width and height (3x 160)
  radius: 150,              // Collision radius for main boss (3x 50)
  cloneRenderSize: 336,     // 70% of 480 (3x 112)
  cloneRadius: 105,         // 70% of 150 (3x 35)

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

  // Health (decreased to 2/3: 6667 HP base, 2333 per extra player)
  baseHp: 6667,
  hpPerExtraPlayer: 2333,

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
    range: 950,
  },

  stomp: {
    cooldown: 9000,
    warningDuration: 1500,
    radius: 420,
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
