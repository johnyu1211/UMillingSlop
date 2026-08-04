
let gamemode = 'main' // survive ,main
let W_at = 0;
let WepcurrentFrame = 0;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.webkitImageSmoothingEnabled = false;
ctx.mozImageSmoothingEnabled = false;
ctx.msImageSmoothingEnabled = false;
canvas.focus();
let gameStartTime = Date.now();
let gameTime = 0; // Time in seconds

let totalKills = 0; // Total number of enemies killed by the player


const gameWorld = {
    width: 2000, // Width of the game world
    height: 2000, // Height of the game world
    borderWidth: 10, // Width of the border line
};

const maxRoomWidth = 5200;
const minRoomWidth = 2150;
const maxRoomHeight = 5200;
const minRoomHeight = 1150;

const startingXPosition = 800;
const startingYPosition = 400;
let shakeDuration = 0;
let shakeIntensity = 5;

let particles = [];
let dustParticles = [];
let greyAfterimages = [];
let redAfterimages = [];
let yellowBulletTrails = [];

// High-Performance Bullet Object Pool Engine (Prevents GC Lag)
const MAX_BULLET_POOL = 600;
const bulletPool = [];
for (let i = 0; i < MAX_BULLET_POOL; i++) {
    bulletPool.push({ active: false, x: 0, y: 0, velocityX: 0, velocityY: 0, size: 7 });
}

function getPooledBullet() {
    for (let i = 0; i < MAX_BULLET_POOL; i++) {
        if (!bulletPool[i].active) {
            bulletPool[i].active = true;
            return bulletPool[i];
        }
    }
    // If pool is full, recycle oldest active bullet
    bulletPool[0].active = true;
    return bulletPool[0];
}

function updateAndDrawYellowBulletTrails(ctx) {
    // Long yellow beam trail rendering completely removed as requested!
    return;
}

function updateAndDrawGreyAfterimages(ctx) {
    for (let i = greyAfterimages.length - 1; i >= 0; i--) {
        const img = greyAfterimages[i];
        img.opacity -= 0.06;
        if (img.opacity <= 0) {
            greyAfterimages.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.globalAlpha = img.opacity * 0.65;

        if (img.spritePath) {
            ctx.filter = 'grayscale(100%) brightness(140%)';
            const sprite = getCachedImage(img.spritePath);
            if (sprite && sprite.complete && sprite.naturalWidth !== 0) {
                ctx.drawImage(sprite, img.x, img.y, img.size, img.size);
            }
        } else {
            // Player Afterimage matched EXACTLY to player collision hitbox (28x44 at +31, +23 offset)
            const hitX = img.x + 31;
            const hitY = img.y + 23;
            const hitW = 28;
            const hitH = 44;

            ctx.fillStyle = '#AAAAAA';
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 8;
            ctx.fillRect(hitX, hitY, hitW, hitH);
        }
        ctx.restore();
    }
}

function updateAndDrawRedAfterimages(ctx) {
    for (let i = redAfterimages.length - 1; i >= 0; i--) {
        const img = redAfterimages[i];
        img.opacity -= 0.07;
        if (img.opacity <= 0) {
            redAfterimages.splice(i, 1);
            continue;
        }

        ctx.save();
        ctx.globalAlpha = img.opacity * 0.75;
        ctx.filter = 'hue-rotate(330deg) saturate(320%) brightness(1.2)';
        const sprite = getCachedImage(img.spritePath);
        if (sprite && sprite.complete && sprite.naturalWidth !== 0) {
            ctx.drawImage(sprite, img.x, img.y, img.size, img.size);
        } else {
            ctx.fillStyle = 'rgba(255, 30, 30, 0.5)';
            ctx.fillRect(img.x, img.y, img.size, img.size);
        }
        ctx.restore();
    }
}

let hitStopEndTime = 0;

const camera = {
    get x() { return player.x - canvas.width / 2; },
    get y() { return player.y - canvas.height / 2; }
};

function isCollidingWithWalls(px, py, pWidth = 22, pHeight = 36) {
    // Offset player outer top-left (px, py) to match centered slim hitbox (pHitX, pHitY)!
    const pSize = (player && player.size) ? player.size : 90;
    const boxW = pWidth;
    const boxH = pHeight;
    const boxX = px + (pSize - boxW) / 2; // +34px centered offset!
    const boxY = py + (pSize - boxH) / 2; // +27px centered offset!

    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (boxX < w.x + w.width &&
            boxX + boxW > w.x &&
            boxY < w.y + w.height &&
            boxY + boxH > w.y) {

            // Automatic Pushback: Prevent player from getting trapped in wall seams!
            resolveWallPenetration();
            return true;
        }
    }
    return false;
}

function resolveWallPenetration() {
    if (!player) return;
    const pSize = (player && player.size) ? player.size : 90;
    const boxW = 22;
    const boxH = 36;
    const boxX = player.x + (pSize - boxW) / 2;
    const boxY = player.y + (pSize - boxH) / 2;
    const pCenterX = boxX + boxW / 2;
    const pCenterY = boxY + boxH / 2;

    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (boxX < w.x + w.width &&
            boxX + boxW > w.x &&
            boxY < w.y + w.height &&
            boxY + boxH > w.y) {

            const wCenterX = w.x + w.width / 2;
            const wCenterY = w.y + w.height / 2;

            const overlapX = (boxW / 2 + w.width / 2) - Math.abs(pCenterX - wCenterX);
            const overlapY = (boxH / 2 + w.height / 2) - Math.abs(pCenterY - wCenterY);

            if (overlapX > 0 && overlapY > 0) {
                // Instantly push player out along the shallowest overlap direction to prevent getting stuck in seams!
                if (overlapX < overlapY) {
                    player.x += (pCenterX < wCenterX) ? -(overlapX + 1) : (overlapX + 1);
                } else {
                    player.y += (pCenterY < wCenterY) ? -(overlapY + 1) : (overlapY + 1);
                }
            }
        }
    }
}

function resolveEnemyWallPenetration(enemy) {
    if (!enemy || !walls || walls.length === 0) return;
    if (enemy.bodyType === 'kamikaze_exploder' || enemy.bodyType === 'red_kamikaze_exploder' || enemy.bodyType === 'split_mutant') return; // Ghost wall pass-through!
    const eSize = enemy.size || 60;
    const eCenterX = enemy.x + eSize / 2;
    const eCenterY = enemy.y + eSize / 2;

    for (let i = 0; i < walls.length; i++) {
        const w = walls[i];
        if (enemy.x < w.x + w.width &&
            enemy.x + eSize > w.x &&
            enemy.y < w.y + w.height &&
            enemy.y + eSize > w.y) {

            const wCenterX = w.x + w.width / 2;
            const wCenterY = w.y + w.height / 2;

            const overlapX = (eSize / 2 + w.width / 2) - Math.abs(eCenterX - wCenterX);
            const overlapY = (eSize / 2 + w.height / 2) - Math.abs(eCenterY - wCenterY);

            if (overlapX > 0 && overlapY > 0) {
                // Instantly push enemy out along the shallowest overlap direction to prevent getting trapped in wall seams!
                if (overlapX < overlapY) {
                    enemy.x += (eCenterX < wCenterX) ? -(overlapX + 1) : (overlapX + 1);
                } else {
                    enemy.y += (eCenterY < wCenterY) ? -(overlapY + 1) : (overlapY + 1);
                }
            }
        }
    }
}

function triggerPlayerHit() {
    player.justHit = true;
    player.hitTime = performance.now();
    hitStopEndTime = performance.now() + 70; // 70ms 히트스톱
    triggerScreenShake(8, 6);
}

function triggerScreenShake(duration = 8, intensity = 6) {
    shakeDuration = duration;
    shakeIntensity = intensity;
}

const weapons = {
    pistol: {
      name: "mauser c96",
      sprite: "guns/original_sized/mauser c96.png",
      reloadSprite: "guns/animations/mauser reload sprite sheet.png",
      reloadFrames: 28,
      reloadDeltaSq : 0.001,
      setGUNUIPOsX : 0,
      setGUNUIPOsY : 0,
      gripPixelX: 58,
      gripPixelY: 60,
      bulletSize : 7,
      bulletColor : "#FFF4B8",
      bulletGlowColor : "transparent",
      bulletTailThicc : 5,
      bulletTailcolor1 : "rgba(255, 215, 0, 0.4)",
      bulletTailcolor2 : "rgba(255, 215, 0, 0.2)",
      bulletTailcolor3 : "rgba(255, 215, 0, 0.08)",
      tailExtendLenght : 0,
      bulletSpeed : 7,
      Rank : "C",
      bulletType:"ammo",
      particLocatX : 45,
      particLocatY : -10,
      shotColor : "rgba(255, 215, 0)",
      shotSpread : 5,
      gunHolePositionX : 35,
      gunHolePositionY : 15,
      additionalDamage : 5,
      ammoShotNum : 1,
      knocBack : 0,
      playerKnockBack : 0,
      Gunglow:'rgba(0,0,0,0.0)',
      GunglowRage : 10,

    },
    vector: {
        name: "vector",
        sprite: "guns/original_sized/vector.png",
        reloadSprite: "guns/animations/vector reload sprite sheet.png",
        reloadFrames: 32,
        reloadDeltaSq : 0.01,
        setGUNUIPOsX : 0,
        setGUNUIPOsY : 0,
        gripPixelX: 52,
        gripPixelY: 64,
        maxAmmo : 13,
        bulletSize : 7,
        bulletColor : "#FFF4B8",
        bulletGlowColor : "transparent",
        bulletTailThicc : 5,
        bulletTailcolor1 : "rgba(255, 215, 0, 0.4)",
        bulletTailcolor2 : "rgba(255, 215, 0, 0.2)",
        bulletTailcolor3 : "rgba(255, 215, 0, 0.08)",
        tailExtendLenght : 0,
        bulletSpeed : 9,
        Rank : "B",
        bulletType:"ammo",
        particLocatX : 40,
        particLocatY : -0,
        shotColor : "rgba(255, 215, 0)",
        shotSpread : 2,
        gunHolePositionX : 35,
        gunHolePositionY : 15,
        additionalDamage : 5,        
        ammoShotNum : 1,
        knocBack : 0,
        playerKnockBack : 0,
        Gunglow:'rgba(0,0,0,0.0)',
        GunglowRage : 10,


      },
      winchester: {
        name: "winchester shotgun ww2 version",
        sprite: "guns/original_sized/winchester shotgun ww2 version.png",
        reloadSprite: "guns/animations/winchester charge sprite sheet.png",
        reloadFrames: 11,
        reloadDeltaSq : 0.001,
        setGUNUIPOsX : -30,
        setGUNUIPOsY : 0,
        gripPixelX: 45,
        gripPixelY: 64,
        bulletSize : 7,
        bulletColor : "#FFF4B8",
        bulletGlowColor : "transparent",
        bulletTailThicc : 6,
        bulletTailcolor1 : "rgba(255, 215, 0, 0.4)",
        bulletTailcolor2 : "rgba(255, 215, 0, 0.2)",
        bulletTailcolor3 : "rgba(255, 215, 0, 0.08)",
        tailExtendLenght : 25,
        bulletSpeed : 12,
        Rank : "B",
        bulletType:"ammo",
        particLocatX : 40,
        particLocatY : -0,
        shotColor : "rgba(255,62,0)",
        shotSpread : 22,
        gunHolePositionX : 35,
        gunHolePositionY : 15,
        additionalDamage : 2,
        knocBack : 10,
        playerKnockBack : 25,
        //if shot gun
        ammoShotNum : 3,
        shotgunSpreadRange : 0.7,
        //if shot gun
        Gunglow:'rgba(0,0,0,0.0)',
        GunglowRage : 10,
      },
      _50_bmg_sniper: {
        name: ".50 BMG sniper rifle",
        sprite: "guns/original_sized/50 bmg sniper.png",
        reloadSprite: "guns/animations/50 BMG sniper reload sprite sheet.png",
        reloadFrames: 24,
        reloadDeltaSq : 0.001,
        setGUNUIPOsX : -20,
        setGUNUIPOsY : 10,
        gripPixelX: 42,
        gripPixelY: 64,
        bulletSize : 0,
        bulletColor : "#FF5733",
        bulletGlowColor : "transparent",
        bulletTailThicc : 3,
        bulletTailcolor1 : "rgba(255,255,255, 0.3)",
        bulletTailcolor2 : "rgba(255,255,255, 0.2)",
        bulletTailcolor3 : "rgba(255,255,255, 0.06)",
        tailExtendLenght: 360,
        bulletSpeed : 75,
        Rank : "A",
        bulletType:"ammo",
        particLocatX : 45,
        particLocatY : 10,
        shotColor : "rgba(255,62,0)",
        shotSpread : 50,
        gunHolePositionX : 35,
        gunHolePositionY : 25,
        additionalDamage : 15,
        ammoShotNum : 1,
        knocBack : 0,
        playerKnockBack : 0,
        Gunglow:'rgba(117,0,0,0.7)',
        GunglowRage : 25,


      },
      
  };


const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    speed: 4.5, //moveSpeedOfPlayer for test was 3
    size: 90, //임시로 키워봤음 (이미지문제)
    hp: 30,
    maxHp: 30,
    hitTime: 0,
    justHit: false,
    ammo: 10,
    maxAmmo: 10,
    isReloading: false,
    playerShootCooldown: 0,  // Initialize the cooldown
    maxShootCooldown: 35,     // Example cooldown - adjust as needed
    
   reloadingCooldown: 1500,  // Initialize
   maxReloadingCooldown: 2500, // Example reload time (adjust in milliseconds)


   //dodgeSpeed: 0.03, // The distance the dodge moves the player
    dodgeCooldown: 200, // Cooldown in milliseconds
    isDodging: false, // Is the player currently dodging?
    dodgeSpeed: 12,
    dodgeCharges:5,
    maxDodgeCharges: 5, // Maximum dodge charges
    dodgeRechargeTime: 1500, // Time to recharge one dodge charge in milliseconds


    lastDodgeTime: 0, // When did the last dodge occur
    isWalking: false, 
    lookingLeft: true,
    lookingRight: false,

    isAttacking : false,
    level: 1,
    xp: 0,
    xpToNextLevel: 75, // Reduced for easier progression

    attackDamage : 10,
    currentWeapon : weapons.pistol,

    isReloadingWeapon : false,
    reloadAnimationProgress : 0,

    


  };


/**add tile */
// Define tile types for stage 1
const tileTypes = {
    1: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile1.png' }, // Most common tile
    2: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile2.png' },
    3: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile3.png' },
    4: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile4.png' },
    5: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile5.png' },
    6: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile6.png' },
    7: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile7.png' },
    8: { sprite: '0x72_DungeonTilesetII_v1.7/TilesUsing/stage1_floor/tile8.png' }  // Least common tile
};







  
let SpriteColisionGap=35;

let PlayercollisionX= player.x; // Offset the collision box from the sprite's edges
let PlayercollisionY= player.y ;
let PlayercollisionSize= player.size -SpriteColisionGap; 

let playerSprite = new Image();
playerSprite.onerror = function() {
    if (!this.attemptedFallback) {
        this.attemptedFallback = true;
        this.src = "player.png";
    }
};
playerSprite.src = "./Player.png"; 


let animationTimer = 0; // Explicit initialization is key! 
const frameInterval = 200; // Time in milliseconds between frames
terval = 100; // Time in milliseconds between frames

let PlayercurrentFrame=0;
let currentFrame = 0; 
let spriteFrame = 0; 
let numberOfFrames = 6; // Adjust if you have a different number of frames 
let playerNumberOfframes = 0

let basicenEmySprite = new Image();
basicenEmySprite.src = "./enemyBasic/enemyBasic.png";

let levelUpState = false;
let selectedOptionIndex = 0;
let currentLevelUpOptions = [];
let dodgeBarAlpha = 0;

let isPaused = false;
let blueBoxes = [];
let lastBlueBoxSpawnTime = 0;
let blueBuffTimer = 0; // ms duration for infinite dodge & ammo powerup
let blueAuraParticles = [];

function spawnBlueBox() {
    if (blueBoxes.length >= 2) return;

    const size = 26;
    const margin = 120;
    const x = Math.random() * (gameWorld.width - margin * 2) + margin;
    const y = Math.random() * (gameWorld.height - margin * 2) + margin;

    blueBoxes.push({
        x: x,
        y: y,
        size: size
    });
}

function updateAndDrawBlueBoxes(ctx, deltaTime) {
    const now = performance.now();
    if (now - lastBlueBoxSpawnTime > 20000) { // Spawn blue box every 20 seconds
        lastBlueBoxSpawnTime = now;
        spawnBlueBox();
    }

    for (let i = blueBoxes.length - 1; i >= 0; i--) {
        const bBox = blueBoxes[i];

        // Draw Red Pixel Box
        ctx.save();
        ctx.fillStyle = '#FF2200'; // Crimson Red
        ctx.fillRect(bBox.x, bBox.y, bBox.size, bBox.size);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(bBox.x, bBox.y, bBox.size, bBox.size);

        // Lightning / Power icon inside Box
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('⚡', bBox.x + bBox.size / 2, bBox.y + bBox.size / 2 + 1);
        ctx.restore();

        // Player pickup collision check
        if (player.x < bBox.x + bBox.size &&
            player.x + player.size > bBox.x &&
            player.y < bBox.y + bBox.size &&
            player.y + player.size > bBox.y) {
            
            // Activate Infinite Dodge & Infinite Ammo Power Buff (13s if Red Box Level >= 3, else 8s)
            blueBuffTimer = (player.redBoxLevel >= 3) ? 13000 : 8000;
            
            // Remove picked up red box
            blueBoxes.splice(i, 1);
        }
    }
}

function updateAndDrawBlueAuraParticles(ctx, deltaTime) {
    if (blueBuffTimer <= 0) {
        blueAuraParticles.length = 0;
        return;
    }

    const now = performance.now();

    // Check if buffer is about to expire (< 2500ms left) for flickering effect
    let isFlickering = false;
    if (blueBuffTimer < 2500) {
        // Fast flicker frequency when near expiration
        const speed = (2500 - blueBuffTimer) * 0.015 + 10;
        isFlickering = (Math.sin(now * 0.02 * speed) < 0);
    }

    // Spawn real red/orange burning fire particles around player
    if (!isFlickering && Math.random() < 0.8) {
        const randColor = Math.random();
        const fireColor = (randColor > 0.6) ? '#FF4500' : ((randColor > 0.2) ? '#FF8C00' : '#FFD700');

        blueAuraParticles.push({
            x: player.x + Math.random() * player.size,
            y: player.y + player.size - Math.random() * 15,
            velocityX: (Math.random() - 0.5) * 1.5,
            velocityY: -(Math.random() * 2.5 + 1.5), // Rising fire effect
            size: Math.random() * 5 + 2,
            lifeSpan: Math.random() * 15 + 10,
            maxLife: 25,
            color: fireColor // Real Red/Orange/Gold Fire
        });
    }

    ctx.save();
    for (let i = blueAuraParticles.length - 1; i >= 0; i--) {
        const p = blueAuraParticles[i];
        p.x += p.velocityX;
        p.y += p.velocityY;
        p.lifeSpan--;

        if (p.lifeSpan <= 0) {
            blueAuraParticles.splice(i, 1);
            continue;
        }

        if (isFlickering) continue; // Skip rendering during flicker off frames

        const alpha = Math.max(0, p.lifeSpan / p.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.color;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

let blueShieldBoxes = [];
let lastBlueShieldBoxSpawnTime = 0;
let playerShieldHp = 0;
let maxShieldHp = 2; // 2-hit shell protection state (increases to 3 at Level 3)
let shieldTimer = 0;
let maxShieldTimer = 12000; // 12 seconds duration
let isOvertimeShield = false; // 1-hit semi-transparent shield state after 12s timer expires
let shieldRechargeTimer = 8000; // 8s auto-recharge timer for Level 3 Cyan Shield (Shorter than 12s duration)
const maxShieldRechargeTimer = 8000;
let grabHitFreezeTimer = 0; // 0.5s screen-wide entity hit-freeze timer upon grab hit

function applyPlayerDamage(amount, reason = "Monster Attack") {
    if (gameState === 'startingRoom' || player.isDodging || player.hp <= 0) return; // 100% Infinite HP / Godmode inside Lobby startingRoom!

    shieldRechargeTimer = maxShieldRechargeTimer; // Reset 20s auto-recharge timer on damage!

    if (playerShieldHp > 0) {
        playerShieldHp -= 1;
        triggerPlayerHit();

        // When cyan shield breaks completely -> Fully refill dodge charges!
        if (playerShieldHp <= 0) {
            isOvertimeShield = false;
            player.dodgeCharges = player.maxDodgeCharges;
            dodgeBarAlpha = 1.0;
        }
        return;
    }

    player.hp = Math.max(0, player.hp - amount);
    triggerPlayerHit();

    if (player.hp <= 0) {
        player.hp = 0;
        if (typeof gameOver === 'function') {
            gameOver(reason); // Trigger Immediate Game Over upon 0 HP with cause!
        }
    }
}

let blueAfterimages = [];

function updateAndDrawBlueAfterimages(ctx) {
    if (playerShieldHp <= 0 || !player.hasCyanTrail) {
        blueAfterimages.length = 0;
        return;
    }

    // Spawn cyan blue afterimage trail behind player during shield movement
    if (player.isWalking || player.isDodging) {
        if (Math.random() < 0.6) {
            blueAfterimages.push({
                x: player.x,
                y: player.y,
                alpha: 0.45,
                lookingRight: player.lookingRight,
                frame: PlayercurrentFrame
            });
        }
    }

    ctx.save();
    for (let i = blueAfterimages.length - 1; i >= 0; i--) {
        const img = blueAfterimages[i];
        img.alpha -= 0.04;

        if (img.alpha <= 0) {
            blueAfterimages.splice(i, 1);
            continue;
        }

        ctx.globalAlpha = img.alpha;
        const hitX = img.x + 31;
        const hitY = img.y + 23;
        const hitW = 28;
        const hitH = 44;

        ctx.fillStyle = '#00E5FF';
        ctx.shadowColor = '#00E5FF';
        ctx.shadowBlur = 10;
        ctx.fillRect(hitX, hitY, hitW, hitH);
    }
    ctx.restore();
}

function spawnBlueShieldBox() {
    if (blueShieldBoxes.length >= 2) return;

    const size = 26;
    const margin = 120;
    const x = Math.random() * (gameWorld.width - margin * 2) + margin;
    const y = Math.random() * (gameWorld.height - margin * 2) + margin;

    blueShieldBoxes.push({
        x: x,
        y: y,
        size: size
    });
}

function updateAndDrawBlueShieldBoxes(ctx, deltaTime) {
    const now = performance.now();
    if (now - lastBlueShieldBoxSpawnTime > 18000) { // Spawn Blue Shield box every 18 seconds
        lastBlueShieldBoxSpawnTime = now;
        spawnBlueShieldBox();
    }

    for (let i = blueShieldBoxes.length - 1; i >= 0; i--) {
        const sBox = blueShieldBoxes[i];

        // Draw Blue Shield Pixel Box
        ctx.save();
        ctx.fillStyle = '#00BFFF'; // Deep Cyan Blue
        ctx.fillRect(sBox.x, sBox.y, sBox.size, sBox.size);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(sBox.x, sBox.y, sBox.size, sBox.size);

        // Shield Icon inside Box
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 14px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🛡️', sBox.x + sBox.size / 2, sBox.y + sBox.size / 2 + 1);
        ctx.restore();

        // Player pickup collision check
        if (player.x < sBox.x + sBox.size &&
            player.x + player.size > sBox.x &&
            player.y < sBox.y + sBox.size &&
            player.y + player.size > sBox.y) {
            
            // Grant Full Cyan Shield (3 Hit HP + 12s Duration)
            playerShieldHp = maxShieldHp;
            shieldTimer = maxShieldTimer;
            isOvertimeShield = false;
            
            // Remove picked up blue shield box
            blueShieldBoxes.splice(i, 1);
        }
    }
}

function drawPlayerShield(ctx) {
    if (playerShieldHp <= 0) return;

    const centerX = player.x + player.size / 2;
    const centerY = player.y + player.size / 2;
    const radius = player.size * 0.75;
    const gaugeRadius = radius + 6;

    ctx.save();

    // 1-Hit Overtime Shield (Semi-transparent state after timer expires)
    if (isOvertimeShield || shieldTimer <= 0) {
        ctx.globalAlpha = 0.22; // Semi-transparent
        ctx.strokeStyle = '#00E5FF';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#00E5FF';
        ctx.shadowBlur = 6;
        ctx.setLineDash([5, 4]); // Dashed circle pattern

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]); // Reset line dash

        // Outer Gray Circular Arc Timer Gauge Bar (Level 3 Cyan Shield Auto-Recharge Timer)
        if (((player.cyanShieldLevel || 0) >= 3 || maxShieldHp >= 3)) {
            const outerGaugeRadius = gaugeRadius + 6;
            const rechargeFraction = Math.max(0, Math.min(1, 1 - (shieldRechargeTimer / maxShieldRechargeTimer)));
            const rStartAngle = -Math.PI / 2;
            const rEndAngle = rStartAngle + (Math.PI * 2 * rechargeFraction);

            ctx.globalAlpha = 0.85;
            ctx.strokeStyle = '#AAAAAA'; // Gray Ring Timer
            ctx.lineWidth = 3.5;
            ctx.shadowColor = '#FFFFFF';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(centerX, centerY, outerGaugeRadius, rStartAngle, rEndAngle, false);
            ctx.stroke();
        }

        ctx.restore();
        return;
    }

    // Normal Shield with Arc Gauge Bar
    const hitOpacity = Math.max(0.3, playerShieldHp / maxShieldHp);
    const timeFraction = Math.max(0, Math.min(1, shieldTimer / maxShieldTimer));

    ctx.globalAlpha = hitOpacity;

    // Glowing shield inner aura circle
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00E5FF';
    ctx.shadowBlur = 10;

    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Outer Circular Arc Timer Gauge Bar (12 o'clock start, clockwise decrease)
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * timeFraction);

    // Track background ring
    ctx.globalAlpha = hitOpacity * 0.3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(centerX, centerY, gaugeRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Active Cyan Circular Arc Gauge Bar
    ctx.globalAlpha = hitOpacity;
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#00FFFF';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(centerX, centerY, gaugeRadius, startAngle, endAngle, false);
    ctx.stroke();

    // Outer Gray Circular Arc Timer Gauge Bar (Level 3 Cyan Shield Auto-Recharge Timer)
    if (((player.cyanShieldLevel || 0) >= 3 || maxShieldHp >= 3) && (playerShieldHp < maxShieldHp || isOvertimeShield)) {
        const outerGaugeRadius = gaugeRadius + 6;
        const rechargeFraction = Math.max(0, Math.min(1, 1 - (shieldRechargeTimer / maxShieldRechargeTimer)));
        const rStartAngle = -Math.PI / 2;
        const rEndAngle = rStartAngle + (Math.PI * 2 * rechargeFraction);

        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = '#888888'; // Gray Ring Timer
        ctx.lineWidth = 3.5;
        ctx.shadowColor = '#AAAAAA';
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(centerX, centerY, outerGaugeRadius, rStartAngle, rEndAngle, false);
        ctx.stroke();
    }

    ctx.restore();
}

let healthPacks = [];
let lastHealthPackSpawnTime = 0;

function spawnHealthPack() {
    if (healthPacks.length >= 3) return; // Maximum 3 health packs on map simultaneously

    const size = 26;
    const margin = 120;
    const x = Math.random() * (gameWorld.width - margin * 2) + margin;
    const y = Math.random() * (gameWorld.height - margin * 2) + margin;

    healthPacks.push({
        x: x,
        y: y,
        size: size,
        healAmount: 15
    });
}

function updateAndDrawHealthPacks(ctx, deltaTime) {
    const now = performance.now();
    if (now - lastHealthPackSpawnTime > 12000) { // Spawn new health pack every 12 seconds
        lastHealthPackSpawnTime = now;
        spawnHealthPack();
    }

    for (let i = healthPacks.length - 1; i >= 0; i--) {
        const hpPack = healthPacks[i];

        // Render Green Pixel Health Box
        ctx.save();
        ctx.fillStyle = '#00FF66';
        ctx.fillRect(hpPack.x, hpPack.y, hpPack.size, hpPack.size);
        
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(hpPack.x, hpPack.y, hpPack.size, hpPack.size);

        // White '+' Cross Icon inside Box
        ctx.fillStyle = '#FFFFFF';
        const cx = hpPack.x + hpPack.size / 2;
        const cy = hpPack.y + hpPack.size / 2;
        ctx.fillRect(cx - 2, cy - 6, 4, 12);
        ctx.fillRect(cx - 6, cy - 2, 12, 4);
        ctx.restore();

        // Player collision & heal pickup check
        if (player.x < hpPack.x + hpPack.size &&
            player.x + player.size > hpPack.x &&
            player.y < hpPack.y + hpPack.size &&
            player.y + player.size > hpPack.y) {
            
            // Heal player proportionally (35% of player max HP)
            const healValue = player.maxHp * 0.35;
            player.hp = Math.min(player.maxHp, player.hp + healValue);
            
            // Remove picked up pack
            healthPacks.splice(i, 1);
        }
    }
}

const allLevelUpOptions = [
    { title: '❤️ Max HP (+20)', desc: 'Increases Max HP by 20 and restores 20 HP', effect: () => { player.maxHp += 20; player.hp = Math.min(player.hp + 20, player.maxHp); } },
    { title: '⚔️ Damage (+5)', desc: 'Increases bullet damage by 5', effect: () => { player.bonusDamage = (player.bonusDamage || 0) + 5; player.attackDamage += 5; } },
    { title: '🔄 Reload Speed', desc: 'Speeds up weapon reloading time', effect: () => { player.maxReloadingCooldown = Math.max(400, player.maxReloadingCooldown * 0.82); } },
    { title: '👟 Move Speed (+0.5)', desc: 'Increases player movement speed', effect: () => { player.speed += 0.5; } },
    { title: '📦 Max Ammo (+5)', desc: 'Increases magazine size & refills ammo', effect: () => { player.maxAmmo += 5; player.ammo = player.maxAmmo; } },
    { 
        title: '💥 Shot Roll I', 
        desc: 'Shotgun Pellets +3 & Massive Recoil Shot-Roll with WASD Movement & Afterimages', 
        condition: () => (!player.shotRollSelected),
        effect: () => { 
            player.shotRollSelected = true;
            player.shotgunPelletBonus = (player.shotgunPelletBonus || 0) + 3; 
            player.shotgunRecoilBonus = (player.shotgunRecoilBonus || 0) + 8; 
        } 
    },
    { 
        title: '💥 Shot Roll II', 
        desc: 'Mag size 1, Super Fast Reload, No Back-Recoil. +0.4 Speed when moving away from aim (0.8s) + Grey Afterimages', 
        condition: () => (player.shotRollSelected && !player.shotRoll2Selected),
        effect: () => { 
            player.shotRoll2Selected = true;
            player.maxAmmo = 1;
            player.ammo = 1;
            player.maxReloadingCooldown = Math.max(300, player.maxReloadingCooldown * 0.45);
        } 
    },
    { 
        title: '💥 Straight Shot', 
        desc: 'Shotgun Pellets fire parallel in a side-by-side wall alignment instead of angular spread', 
        condition: () => (!player.straightShotSelected),
        effect: () => { 
            player.straightShotSelected = true;
        } 
    },
    { 
        title: '💥 RainbowShot', 
        desc: 'Rainbow Chromatic Pellets oscillating in rotating DNA double-helix spiral wave patterns!', 
        condition: () => (player.straightShotSelected && !player.rainbowShotSelected),
        effect: () => { 
            player.rainbowShotSelected = true;
        } 
    },
    { 
        title: '💥 Double Tap', 
        desc: 'Shotgun fires an automatic 2nd burst 0.6s after shooting! (Consumes 0 extra ammo)', 
        condition: () => (!player.doubleTapSelected),
        effect: () => { 
            player.doubleTapSelected = true;
        } 
    },
    { 
        title: '💥 Stationary Fire', 
        desc: 'Vector SMG: Standing still while firing gradually ramps up extra bullet counts per shot! (Resets on move)', 
        condition: () => (!player.stationaryFireSelected),
        effect: () => { 
            player.stationaryFireSelected = true;
        } 
    },
    { 
        title: '💥 Mobile Fire', 
        desc: 'Vector SMG: Firing build-up no longer resets while moving! Keeps extra bullet count as long as attack is held!', 
        condition: () => (player.stationaryFireSelected && !player.mobileFireSelected),
        effect: () => { 
            player.mobileFireSelected = true;
        } 
    },
    { 
        title: '💥 Extra Shot I', 
        desc: 'All Weapons: Fires a fast 2nd follow-up bullet 0.1s after every shot! (Consumes 0 extra ammo)', 
        condition: () => ((player.twinTriggerLevel || 0) === 0),
        effect: () => { 
            player.twinTriggerLevel = 1;
        } 
    },
    { 
        title: '💥 Extra Shot II', 
        desc: 'All Weapons: Fires 2nd & 3rd follow-up bullets 0.1s & 0.2s after every shot! (Consumes 0 extra ammo)', 
        condition: () => ((player.twinTriggerLevel || 0) === 1),
        effect: () => { 
            player.twinTriggerLevel = 2;
        } 
    },
    { 
        title: '🔥 Crimson Flame I', 
        desc: 'Red Box: Crimson Bullets + Flower Sparks + Enemy Burn DoT', 
        condition: () => (player.redBoxLevel || 0) === 0,
        effect: () => { player.redBoxLevel = 1; } 
    },
    { 
        title: '🔥 Crimson Burst II', 
        desc: 'Red Box: Fires +2 extra spread bullets during Red Buff', 
        condition: () => (player.redBoxLevel || 0) === 1,
        effect: () => { player.redBoxLevel = 2; } 
    },
    { 
        title: '🔥 Crimson Overlord III', 
        desc: 'Red Box: +5s Duration (13s) + 2x Regen (5%/s) + 2x Burn DoT (16%/s)', 
        condition: () => (player.redBoxLevel || 0) === 2,
        effect: () => { player.redBoxLevel = 3; } 
    },
    { 
        title: '🔫 Pistol Specialist I', 
        desc: 'Converts all weapon slots to Pistol with bonus speed & rate of fire', 
        condition: () => (!player.pistolFirstChoiceChecked && (player.pistolSpecLevel || 0) === 0),
        effect: () => { 
            player.pistolSpecLevel = 1; 
            player.isPistolOnly = true; 
            weapons.vector = weapons.pistol;
            weapons.winchester = weapons.pistol;
            weapons._50_bmg_sniper = weapons.pistol;
            getWeaponFunck('pistol'); 
        } 
    },
    { 
        title: '🔫 Crossfire Pistol II', 
        desc: 'Pistol Shots: Fires in 4-Way Cross directions (Up/Down/Left/Right)', 
        condition: () => (player.pistolSpecLevel || 0) === 1,
        effect: () => { player.pistolSpecLevel = 2; } 
    },
    { 
        title: '🔫 Octo-Burst Pistol III', 
        desc: 'Pistol Shots: Fires in 8-Way Radial directions (Full 360 Burst)', 
        condition: () => (player.pistolSpecLevel || 0) === 2,
        effect: () => { player.pistolSpecLevel = 3; } 
    },
    { 
        title: '🛡️ Cyan Comet Trail I', 
        desc: 'Cyan Shield I: Grants bonus move speed & leaves blue afterimages', 
        condition: () => !player.hasCyanTrail,
        effect: () => { player.hasCyanTrail = true; player.cyanShieldLevel = 1; player.speed += 0.6; } 
    },
    { 
        title: '🛡️ Kinetic Shield II', 
        desc: 'Cyan Shield II: Increases move speed further & boosts fire rate', 
        condition: () => (player.cyanShieldLevel || 0) === 1,
        effect: () => { 
            player.cyanShieldLevel = 2; 
            player.speed += 0.8; 
            player.fireRateMultiplier = (player.fireRateMultiplier || 1) * 1.35; 
        } 
    },
    { 
        title: '🛡️ Auto-Recharge Aegis III', 
        desc: 'Cyan Shield III: Max Shield +1 (Total 3) & Outer Gray Auto-Recharge Timer', 
        condition: () => (player.cyanShieldLevel || 0) === 2,
        effect: () => { 
            player.cyanShieldLevel = 3; 
            maxShieldHp = 3; 
            playerShieldHp = Math.min(3, playerShieldHp + 1); 
            shieldTimer = maxShieldTimer; 
        } 
    }
];

function openLevelUpOptions() {
    for (let k in keys) { keys[k] = false; }
    levelUpState = true;
    selectedOptionIndex = 0;

    let finalOptions = [];
    const pLvl = player.pistolSpecLevel || 0;

    // Rule 1: If pistol level 1 or 2 is active, GUARANTEE next pistol upgrade in slot 1 until Level 3!
    if (pLvl === 1 || pLvl === 2) {
        const pistolNextCard = allLevelUpOptions.find(opt => opt.title.includes(pLvl === 1 ? 'Crossfire Pistol II' : 'Octo-Burst Pistol III'));
        if (pistolNextCard) {
            finalOptions.push(pistolNextCard);
        }
    }

    // Rule 2: First level-up choice check for Pistol Spec I (50% random chance on first level up only)
    if (!player.pistolFirstChoiceChecked && pLvl === 0) {
        player.pistolFirstChoiceChecked = true;
        const pistolCard1 = allLevelUpOptions.find(opt => opt.title.includes('Pistol Specialist I'));
        if (Math.random() < 0.5 && pistolCard1) {
            finalOptions.push(pistolCard1);
        }
    }

    // Fill remaining card slots up to 3 from other valid available options
    const remainingValid = allLevelUpOptions.filter(opt => {
        if (finalOptions.includes(opt)) return false;
        if (opt.condition && !opt.condition()) return false;
        return true;
    });

    const shuffled = [...remainingValid].sort(() => 0.5 - Math.random());
    while (finalOptions.length < 3 && shuffled.length > 0) {
        finalOptions.push(shuffled.shift());
    }

    currentLevelUpOptions = finalOptions.slice(0, 3);
}

function openAllUpgradesMenu() {
    for (let k in keys) { keys[k] = false; }
    levelUpState = true;
    selectedOptionIndex = 0;

    // Filter ALL available upgrades across the entire pool!
    currentLevelUpOptions = allLevelUpOptions.filter(opt => !opt.condition || opt.condition());
}




const weaponSelectSlots = [
    { key: 'pistol' },
    { key: 'vector' },
    { key: 'winchester' },
    { key: '_50_bmg_sniper' }
];

function isClickInsideWeaponPanel(clickX, clickY) {
    const startX = 0;
    const slotW = 85;
    const slotH = 45;
    const gap = 5;
    const startY = canvas.height - (weaponSelectSlots.length * (slotH + gap) + 10);
    const totalW = slotW;
    const totalH = weaponSelectSlots.length * (slotH + gap);

    return (clickX >= startX && clickX <= startX + totalW &&
            clickY >= startY && clickY <= startY + totalH);
}

function drawWeaponSelectPanelLeftBottom() {
    ctx.save();
    ctx.imageSmoothingEnabled = false; // Pixel-sharp rendering

    const startX = 0;
    const slotW = 85;
    const slotH = 45;
    const gap = 5;
    const startY = canvas.height - (weaponSelectSlots.length * (slotH + gap) + 10);

    weaponSelectSlots.forEach((slot, index) => {
        const slotX = startX + 10;
        const slotY = startY + index * (slotH + gap);
        const weaponObj = weapons[slot.key];
        const isSelected = (player.currentWeapon === weaponObj);
        const boxW = slotW - 8;
        const boxH = slotH - 6;

        // Render Background Box & White Border when selected (No Glow)
        ctx.save();
        ctx.fillStyle = isSelected ? 'rgba(0, 0, 0, 0.85)' : 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(slotX, slotY, boxW, boxH);

        // Pure White border ONLY when selected, NO border & NO glow when unselected
        if (isSelected) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 2.5;
            ctx.strokeRect(slotX, slotY, boxW, boxH);
        }
        ctx.restore();

        // Weapon Thumbnail Sprite ONLY (Fill inside Border Box, OVERSIZED to crop transparent padding)
        if (weaponObj && weaponObj.sprite) {
            const img = getCachedImage(weaponObj.sprite);
            if (img && img.complete && img.naturalWidth !== 0) {
                ctx.save();
                // Clip inside the box rect to prevent spillover
                ctx.beginPath();
                ctx.rect(slotX + 1, slotY + 1, boxW - 2, boxH - 2);
                ctx.clip();

                if (isSelected) {
                    ctx.filter = 'brightness(145%)';
                } else {
                    ctx.filter = 'brightness(65%) opacity(0.65)';
                }
                // Super-oversized drawImage with 50% increased vertical height scale
                ctx.drawImage(img, slotX - 35, slotY - 40, boxW + 70, boxH + 80);
                ctx.restore();
            }
        }
    });

    ctx.restore();
}

canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return; // Left click only

    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    if (isClickInsideWeaponPanel(clickX, clickY)) {
        const startX = 0;
        const slotW = 85;
        const slotH = 45;
        const gap = 5;
        const startY = canvas.height - (weaponSelectSlots.length * (slotH + gap) + 10);

        weaponSelectSlots.forEach((slot, index) => {
            const slotX = startX + 10;
            const slotY = startY + index * (slotH + gap);

            if (clickX >= slotX && clickX <= slotX + slotW &&
                clickY >= slotY && clickY <= slotY + slotH) {
                getWeaponFunck(slot.key);
            }
        });

        // Block firing bullets when clicking on weapon UI panel
        event.stopImmediatePropagation();
        mouse.isDown = false;
        return;
    }
});

const keys = {};
const mouse = {
    x: 0,
    y: 0,
    isDown: false
};

let zoomLevel = 0.92; // Balanced camera view (0.92x)
let lastTime = performance.now(); // Initialize before the game loop

const enemySpeed = 1.5; //enemyMoveSpeed for test it was 0.5
const enemySize = 90;
const enemyHp = 30;

const playerBullets = [];
const enemyBullets = [];
const bulletSize = 7;


const enemyBulletSpeed = 6.5;  // Adjust to your desired speed

let targetImage = new Image(); 
targetImage.src = "empty.png"

let targetImageReload = new Image(); 
targetImageReload.src = "targetImageReload.png"

let targetImageReloadTEXT = new Image(); 
targetImageReloadTEXT.src = "targetImageReloadTEXT.png"


let gameState = 'startingRoom'; // Possible states: 'startingRoom', 'gameStarted'
const door = {
    x: canvas.width / 2 - 25,
    y: 350,
    width: 50,
    height: 10,
    isOpen: true
};

const enemies = [
    {
        sprite: basicenEmySprite, 
        isDead:false,
        speed: enemySpeed,
        size: enemySize,
        hp: enemyHp,
        maxHp: enemyHp,
        attackCooldown: 2000, // Time between attacks in milliseconds
        timeUntilNextAttack: 1000, // Enemy can attack immediately
        sprite: basicenEmySprite
    
    }, 
];

document.documentElement.style.cursor = 'none';




function applyLevelUpOption(index) {
    if (currentLevelUpOptions && currentLevelUpOptions[index]) {
        currentLevelUpOptions[index].effect();
    }
    levelUpState = false; // Close the level-up menu after selection
}

document.addEventListener('keydown', function(event) {
    if (levelUpState && currentLevelUpOptions.length > 0) {
        if(event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
            selectedOptionIndex = (selectedOptionIndex - 1 + currentLevelUpOptions.length) % currentLevelUpOptions.length;
        } else if(event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
            selectedOptionIndex = (selectedOptionIndex + 1) % currentLevelUpOptions.length;
        } else if(event.key === 'Enter' || event.key === ' ') {
            applyLevelUpOption(selectedOptionIndex);
        }
    }
});

window.addEventListener('wheel', (event) => {
    if (levelUpState && currentLevelUpOptions.length > 0) {
        event.preventDefault();
        if (event.deltaY > 0) {
            selectedOptionIndex = (selectedOptionIndex + 1) % currentLevelUpOptions.length;
        } else if (event.deltaY < 0) {
            selectedOptionIndex = (selectedOptionIndex - 1 + currentLevelUpOptions.length) % currentLevelUpOptions.length;
        }
    }
}, { passive: false });






window.addEventListener('blur', () => {
    isPaused = true;
    for (let k in keys) { keys[k] = false; }
});

window.addEventListener('focus', () => {
    for (let k in keys) { keys[k] = false; }
});

document.addEventListener('keydown', (event) => {
    // Debug Test Shortcuts: Ctrl + 1 (Flame Red Buff), Ctrl + 2 (Cyan Shield)
    if (event.ctrlKey && (event.key === '1' || event.code === 'Digit1')) {
        blueBuffTimer = (player.redBoxLevel >= 3) ? 13000 : 8000;
        return;
    }
    if (event.ctrlKey && (event.key === '2' || event.code === 'Digit2')) {
        playerShieldHp = maxShieldHp;
        shieldTimer = maxShieldTimer;
        return;
    }

    // Debug All Upgrades Menu Shortcut: Ctrl + L (Opens ALL upgrade options list)
    if (event.ctrlKey && (event.key === 'l' || event.key === 'L' || event.code === 'KeyL')) {
        event.preventDefault(); // Prevent browser URL bar focus!
        openAllUpgradesMenu();  // Open ALL available upgrade options menu!
        return;
    }

    if (event.key === 'p' || event.key === 'P' || event.key === 'Escape' || (isPaused && (event.key === ' ' || event.code === 'Space'))) {
        isPaused = !isPaused;
        return;
    }

    if (event.key === 'r' || event.key === 'R') {
        if (player.isDead) {
            resetGame();
        } else {
            startReloading();
        }
    } else {
        keys[event.key] = true;
    }

    
window.addEventListener('wheel', (event) => {
    const availableWeapons = Object.keys(weapons);
    if (!availableWeapons.length) return;

    let currentIdx = availableWeapons.findIndex(k => weapons[k] === player.currentWeapon);
    if (currentIdx === -1) currentIdx = 0;

    if (event.deltaY > 0) {
        // Scroll Down -> Next Weapon
        currentIdx = (currentIdx + 1) % availableWeapons.length;
    } else if (event.deltaY < 0) {
        // Scroll Up -> Previous Weapon
        currentIdx = (currentIdx - 1 + availableWeapons.length) % availableWeapons.length;
    }
    getWeaponFunck(availableWeapons[currentIdx]);
}, { passive: true });

/** 무기전환 테스트
 */
if (event.key === '1' || event.code === 'Digit1') {
    getWeaponFunck("pistol");
} else if (event.key === '2' || event.code === 'Digit2') {
    getWeaponFunck("vector");
} else if (event.key === '3' || event.code === 'Digit3') {
    getWeaponFunck("winchester");
} else if (event.key === '4' || event.code === 'Digit4' || event.key === '0' || event.code === 'Digit0') {
    getWeaponFunck("_50_bmg_sniper");
}



});

document.addEventListener('keyup', (event) => {
    keys[event.key] = false;
});

document.addEventListener('keydown', (event) => {
    if (event.key === ' ') {
        const currentTime = performance.now();
        performDodge(currentTime);
        
    
    }
    // Handle other keys
});

window.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    // Clamp mouse position strictly inside canvas viewport (Prevent mouse from escaping screen!)
    const rawX = (event.clientX - rect.left) * scaleX;
    const rawY = (event.clientY - rect.top) * scaleY;

    mouse.x = Math.max(0, Math.min(canvas.width, rawX));
    mouse.y = Math.max(0, Math.min(canvas.height, rawY));

    // Hover effect: Display hand pointer cursor over weapon selection panel
    if (isClickInsideWeaponPanel(mouse.x, mouse.y)) {
        canvas.style.cursor = 'pointer';
    } else {
        canvas.style.cursor = 'none';
    }

    if(mouse.x > canvas.width/2){
        player.lookingRight = true;
    }else{
        player.lookingRight = false;
    }
});

canvas.addEventListener('mousedown', (event) => {
    if (levelUpState) {
        return; // Disable shooting & mouse clicks during level up selection
    }

    if (event.button === 0) {
        mouse.isDown = true;
        startAttacking();
    }
});

canvas.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
        mouse.isDown = false;
        stopAttacking();
    }
});

canvas.addEventListener('mouseleave', () => {
    mouse.isDown = false;
    stopAttacking();
});



//무기먹
function getWeaponFunck(getWeapon){
    if (player.isPistolOnly) {
        getWeapon = 'pistol'; // All weapon selections resolve to Pistol
    }
    //weapons?
    player.ammo = 0
    if(player.isReloading){return}
    if(player.playerShootCooldown != 0){
        player.playerShootCooldown = 0;
    }

    let baseDamage = 10;
    if(getWeapon == "_50_bmg_sniper"){
        player.currentWeapon = weapons._50_bmg_sniper
        player.speed = 3
        player.maxAmmo = 7
        player.ammo = 7
        player.maxShootCooldown = 120
        player.maxReloadingCooldown = 2700
        baseDamage = 90;
        zoomLevel = 0.7; // Wide view for sniper!
    }else if(getWeapon == "pistol"){
        player.currentWeapon = weapons.pistol
        player.speed = 5.5
        player.maxAmmo = 10
        player.ammo = 10
        player.maxShootCooldown = 35
        player.maxReloadingCooldown = 2500
        baseDamage = 12;
        zoomLevel = 0.92; // Balanced view!
    }else if(getWeapon == "vector"){
        player.currentWeapon = weapons.vector
        player.speed = 5
        player.maxAmmo = 13
        player.ammo = 13
        player.maxShootCooldown = 10
        player.maxReloadingCooldown = 1200
        baseDamage = 7;
        zoomLevel = 0.92;
    }else if(getWeapon == "winchester"){
        player.currentWeapon = weapons.winchester
        player.speed = 4.9
        player.maxAmmo = 6
        player.ammo = 6
        player.maxShootCooldown = 75
        player.maxReloadingCooldown = 1800
        baseDamage = 10;
        zoomLevel = 0.92;
    }

    // Preserve player upgrade damage bonus across weapon switches!
    const bDmg = player.bonusDamage || 0;
    const multDmg = player.damageMultiplier || 1.0;
    player.attackDamage = Math.floor((baseDamage + bDmg) * multDmg);
}

//add Tiles
// Function to load tile images
function loadTileImages(tileTypes) {
    for (const type in tileTypes) {
        const tile = tileTypes[type];
        tile.image = new Image();
        tile.image.src = tile.sprite;
    }
}
loadTileImages(tileTypes);

function selectTileType() {
    if (Math.random() < 0.8) { // 80% chance to pick tile 1
        return 1;
    } else {
        // Randomly select one of the other tiles
        return Math.floor(Math.random() * 7) + 2; 
    }
}
const imageCache = {};
function getCachedImage(src) {
    if (!src) return null;
    if (!imageCache[src]) {
        const img = new Image();
        img.src = src;
        imageCache[src] = img;
    }
    return imageCache[src];
}

function drawTiles(ctx) {
    if (typeof tileMap === 'undefined' || !tileMap || !tileMap.length) return;
    const tileSize = 64;
    ctx.save();

    // Viewport Culling: Only draw tiles visible inside screen viewport
    const startX = Math.max(0, Math.floor((player.x - canvas.width / (2 * zoomLevel)) / tileSize));
    const endX = Math.min(tileMap.length, Math.ceil((player.x + canvas.width / (2 * zoomLevel)) / tileSize) + 1);
    const startY = Math.max(0, Math.floor((player.y - canvas.height / (2 * zoomLevel)) / tileSize));
    const endY = Math.min(tileMap[0] ? tileMap[0].length : 0, Math.ceil((player.y + canvas.height / (2 * zoomLevel)) / tileSize) + 1);

    for (let x = startX; x < endX; x++) {
        if (!tileMap[x]) continue;
        for (let y = startY; y < endY; y++) {
            const tileType = tileMap[x][y];
            const tile = tileTypes[tileType];
            if (tile) {
                const img = tile.image || getCachedImage(tile.sprite);
                if (img) {
                    ctx.drawImage(img, x * tileSize, y * tileSize, tileSize, tileSize);
                }
            }
        }
    }
    ctx.restore();
}

// --- BULLET HOLE DECALS SYSTEM ON WALL FRONT ---
let bulletDecals = [];

function createBulletDecal(x, y, wall) {
    if (!wall) return;

    // Tight X precision around actual bullet impact (±4px) + Random Y height inside Wall Front 1 & 2
    let decalX = x + (Math.random() - 0.5) * 8; // Precise X scatter (±4px)
    const decalY = wall.y + 14 + Math.random() * 34; // Random Y height inside Wall Front 1 & 2

    // Clamp X strictly within wall bounds
    const minX = wall.x + 4;
    const maxX = wall.x + wall.width - 4;
    decalX = Math.max(minX, Math.min(maxX, decalX));

    const randomSize = 1.1 + Math.random() * 0.9; // Small crisp bullet hole 1.1 ~ 2.0px
    bulletDecals.push({
        x: decalX,
        y: decalY,
        size: randomSize
    });

    if (bulletDecals.length > 300) {
        bulletDecals.shift(); // Memory optimization: Keep max 300 decals
    }
}

function drawBulletDecals(ctx) {
    if (bulletDecals.length === 0) return;
    ctx.save();
    for (let i = 0; i < bulletDecals.length; i++) {
        const decal = bulletDecals[i];

        // Pure Small Black Hole (No Border!)
        ctx.fillStyle = '#111111';
        ctx.beginPath();
        ctx.arc(decal.x, decal.y, decal.size, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

// --- DYNAMIC FALLING WALL SYSTEM (8s Reorganize Cycle) ---
let walls = []; // Active land walls [{x, y, width: 64, height: 64, gridX, gridY}]
let wallEvents = []; // Pending/falling wall events [{x, y, gridX, gridY, state: 'warning'|'falling'|'landed', warningTimer: 0, fallY: -350}]
let lastClusterCenters = []; // Track previous cycle wall positions
let currentEmptyQuadrant = 0; // Rotates 0 -> 1 -> 2 -> 3 -> 0 (1사분면, 2사분면, 3사분면, 4사분면 순환)
let wallReorganizeTimer = 8000;
const maxWallReorganizeTimer = 8000;

function triggerWallReorganization() {
    wallReorganizeTimer = maxWallReorganizeTimer;

    // Clear bullet decals when walls lift up and disappear!
    bulletDecals.length = 0;

    // Transition existing landed walls to 'disappearing' animation state (Lift upwards + Fade)!
    const oldWalls = wallEvents.filter(w => w.state === 'landed' || w.state === 'disappearing');
    for (let w of oldWalls) {
        if (w.state === 'landed') {
            w.state = 'disappearing';
            w.disappearTimer = 0;
        }
    }
    wallEvents = [...oldWalls];

    const wallTileSize = 64; // Standard 64px Grid Cell
    const numTilesX = Math.ceil(gameWorld.width / wallTileSize);
    const numTilesY = Math.ceil(gameWorld.height / wallTileSize);
    const midX = Math.floor(numTilesX / 2);
    const midY = Math.floor(numTilesY / 2);

    // Pick 1 empty quadrant for this 8s cycle (Rotates 1 -> 2 -> 3 -> 4)
    const emptyQuad = currentEmptyQuadrant;
    currentEmptyQuadrant = (currentEmptyQuadrant + 1) % 4; // Rotate for next cycle!

    // Helper: Check if tile position falls inside designated empty quadrant
    // 0: Q1 (Top-Right: gx >= midX && gy < midY)
    // 1: Q2 (Top-Left: gx < midX && gy < midY)
    // 2: Q3 (Bottom-Left: gx < midX && gy >= midY)
    // 3: Q4 (Bottom-Right: gx >= midX && gy >= midY)
    const isInsideEmptyQuadrant = (gx, gy) => {
        if (emptyQuad === 0 && gx >= midX && gy < midY) return true;
        if (emptyQuad === 1 && gx < midX && gy < midY) return true;
        if (emptyQuad === 2 && gx < midX && gy >= midY) return true;
        if (emptyQuad === 3 && gx >= midX && gy >= midY) return true;
        return false;
    };

    // Generate random 3D wall formations across 3 ACTIVE quadrants!
    const clusterCount = Math.max(8, Math.floor((numTilesX * numTilesY) / 180));
    const occupied = new Set();
    const clusterCenters = [];
    const minClusterDist = 5;

    for (let c = 0; c < clusterCount; c++) {
        let gx, gy, validPos = false, attempts = 0;
        while (!validPos && attempts < 140) {
            gx = Math.floor(Math.random() * Math.max(1, numTilesX - 4)) + 2;
            gy = Math.floor(Math.random() * Math.max(1, numTilesY - 4)) + 2;
            attempts++;

            // 1. REJECT POSITIONS INSIDE THE ROTATING EMPTY QUADRANT!
            if (isInsideEmptyQuadrant(gx, gy)) {
                continue;
            }

            validPos = true;
            // 2. Check spacing against current cycle clusters
            for (let [cx, cy] of clusterCenters) {
                const dist = Math.hypot(gx - cx, gy - cy);
                if (dist < minClusterDist) {
                    validPos = false;
                    break;
                }
            }
        }
        clusterCenters.push([gx, gy]);
    }
    lastClusterCenters = [...clusterCenters]; // Save for next cycle comparison

    for (let [gx, gy] of clusterCenters) {
        const shapeType = Math.floor(Math.random() * 5); 

        // 1. Define RPGXP Wall Roof Path (지붕 타일 셀들)
        const roofOffsets = [];
        if (shapeType === 0) {
            // L-Shape ('ㄴ'자형 RPGXP 지붕)
            roofOffsets.push([0,0], [0,1], [0,2], [0,3], [1,3], [2,3], [3,3]);
        } else if (shapeType === 1) {
            // Tall Vertical Column (세로 1x4 RPGXP 지붕 기둥)
            roofOffsets.push([0,0], [0,1], [0,2], [0,3]);
        } else if (shapeType === 2) {
            // U-Shape (ㄷ자/U자형 RPGXP 지붕)
            roofOffsets.push([0,0], [0,1], [0,2], [1,2], [2,2], [2,1], [2,0]);
        } else if (shapeType === 3) {
            // 3x3 Block Room (3x3 RPGXP 지붕 방)
            roofOffsets.push(
                [0,0], [1,0], [2,0],
                [0,1], [1,1], [2,1],
                [0,2], [1,2], [2,2]
            );
        } else {
            // Gamma-Shape ('ㄱ'자형 RPGXP 지붕)
            roofOffsets.push([0,0], [1,0], [2,0], [3,0], [3,1], [3,2], [3,3]);
        }

        const roofSet = new Set(roofOffsets.map(([ox, oy]) => `${ox},${oy}`));
        const allCells = [];

        // Add all Roof Cells (RPGXP 윗면 지붕 - 모두 자유 통과 가능 ◯)
        for (let [ox, oy] of roofOffsets) {
            allCells.push({ ox, oy, isFront: false });
        }

        // Add 2-Row Front Wall Face Cells (수직 벽 앞면 2단: y+1, y+2 생성!)
        for (let [ox, oy] of roofOffsets) {
            const belowKey1 = `${ox},${oy + 1}`;
            if (!roofSet.has(belowKey1)) {
                allCells.push({ ox, oy: oy + 1, isFront: true });
                allCells.push({ ox, oy: oy + 2, isFront: true });
            }
        }

        // Calculate colMinY to identify top-most roof tile in each vertical column
        const colMinY = {};
        for (let [ox, oy] of roofOffsets) {
            if (colMinY[ox] === undefined || oy < colMinY[ox]) {
                colMinY[ox] = oy;
            }
        }

        for (let cell of allCells) {
            const tx = gx + cell.ox;
            const ty = gy + cell.oy;
            const key = `${tx},${ty}`;
            if (!occupied.has(key)) {
                occupied.add(key);

                // ONLY top-most roof cell in each vertical column is passable (isBottom = false)!
                const isTopMostRoof = (!cell.isFront && cell.oy === colMinY[cell.ox]);

                wallEvents.push({
                    gridX: tx,
                    gridY: ty,
                    x: tx * wallTileSize,
                    y: ty * wallTileSize,
                    isFront: cell.isFront,
                    isTop: !cell.isFront,
                    isBottom: !isTopMostRoof,                    // Top-most roof tile = Passable! Lower roof & 2-row front = Impassable!
                    state: 'warning',
                    warningTimer: 0,
                    fallY: -350,
                    fallVelocity: 0
                });
            }
        }
    }
}

let isWallTimerPaused = false;

function updateAndDrawWalls(ctx, deltaTime) {
    if (gameState !== 'gameStarted') return;

    // Pause all wall reorganization timers and falling/disappearing wall movement during Pause or Level-Up selection!
    const isPausedMode = isPaused || levelUpState;
    const dt = isPausedMode ? 0 : (deltaTime || 16);

    if (!isWallTimerPaused && !isPausedMode) {
        wallReorganizeTimer -= dt;
    }
    if (wallReorganizeTimer <= 0 || wallEvents.length === 0) {
        if (!isPausedMode) {
            triggerWallReorganization();
        }
    }

    const tileSize = 64;
    const activeWalls = [];

    const baseTile = tileTypes['grass'] || tileTypes['path1'] || Object.values(tileTypes)[0];
    const tileImg = baseTile ? (baseTile.image || getCachedImage(baseTile.sprite)) : null;

    const playerBounds = {
        x: player.x,
        y: player.y,
        width: player.size,
        height: player.size
    };

    const wallGridSet = new Set(wallEvents.map(w => `${w.gridX},${w.gridY}`));

    // PASS 1: Dynamic 2D Point-Light Raycast Shadow System (Outer boundary edges only to prevent inner seam gaps!)
    const landedWalls = wallEvents.filter(w => w.state === 'landed');
    const landedGridSet = new Set(landedWalls.map(w => `${w.gridX},${w.gridY}`));
    const lightX = player.x + (player.size || 90) / 2;
    const lightY = player.y + (player.size || 90) / 2;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';

    const shadowDist = 500;
    for (let i = 0; i < landedWalls.length; i++) {
        const w = landedWalls[i];
        const tileSize = 64;

        // ONLY extract outer boundary edges of building clusters (Skip inner shared edges!)
        const segments = [];
        if (!landedGridSet.has(`${w.gridX},${w.gridY - 1}`)) {
            segments.push([{ x: w.x, y: w.y }, { x: w.x + tileSize, y: w.y }]);                        // Top outer edge
        }
        if (!landedGridSet.has(`${w.gridX + 1},${w.gridY}`)) {
            segments.push([{ x: w.x + tileSize, y: w.y }, { x: w.x + tileSize, y: w.y + tileSize }]); // Right outer edge
        }
        if (!landedGridSet.has(`${w.gridX},${w.gridY + 1}`)) {
            segments.push([{ x: w.x + tileSize, y: w.y + tileSize }, { x: w.x, y: w.y + tileSize }]); // Bottom outer edge
        }
        if (!landedGridSet.has(`${w.gridX - 1},${w.gridY}`)) {
            segments.push([{ x: w.x, y: w.y + tileSize }, { x: w.x, y: w.y }]);                         // Left outer edge
        }

        for (let s = 0; s < segments.length; s++) {
            const p1 = segments[s][0];
            const p2 = segments[s][1];

            // Calculate edge normal to check if edge faces away from light source
            const edgeDX = p2.x - p1.x;
            const edgeDY = p2.y - p1.y;
            const normalX = -edgeDY;
            const normalY = edgeDX;

            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const lightDirX = midX - lightX;
            const lightDirY = midY - lightY;

            // Cast raycasted shadow volume polygon for edges facing away from light
            if (normalX * lightDirX + normalY * lightDirY > 0) {
                let d1x = p1.x - lightX;
                let d1y = p1.y - lightY;
                let len1 = Math.hypot(d1x, d1y) || 1;
                let proj1x = p1.x + (d1x / len1) * shadowDist;
                let proj1y = p1.y + (d1y / len1) * shadowDist;

                let d2x = p2.x - lightX;
                let d2y = p2.y - lightY;
                let len2 = Math.hypot(d2x, d2y) || 1;
                let proj2x = p2.x + (d2x / len2) * shadowDist;
                let proj2y = p2.y + (d2y / len2) * shadowDist;

                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.lineTo(proj2x, proj2y);
                ctx.lineTo(proj1x, proj1y);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // Cast Dynamic Raycast Directional Shadows for Enemies/Robots pinned directly to feet on the ground
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        const feetX = e.x + e.size / 2;
        const feetY = e.y + e.size * 0.95; // Exact feet contact line on floor tile!
        const eDirX = feetX - lightX;
        const eDirY = feetY - lightY;
        const eLen = Math.hypot(eDirX, eDirY) || 1;
        const sDist = Math.min(35, eLen * 0.15); // Close grounded offset

        ctx.save();
        ctx.beginPath();
        ctx.ellipse(feetX + (eDirX / eLen) * sDist, feetY + (eDirY / eLen) * sDist, e.size * 0.4, e.size * 0.18, Math.atan2(eDirY, eDirX), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
        ctx.fill();
        ctx.restore();
    }

    // Perspective Directional Shadow for Player (Slightly higher Y offset!)
    const pCenterX = player.x + (player.size || 90) / 2;
    const pCenterY = player.y + (player.size || 90) / 2;
    const pFeetY = player.y + (player.size || 90) * 0.85; // Move shadow slightly higher!

    const mouseWorld = getMousePosInWorld(canvas, mouse);
    const aimAngle = Math.atan2(mouseWorld.y - pCenterY, mouseWorld.x - pCenterX);
    const shadowAngle = aimAngle + Math.PI; // Opposite direction of facing aim

    // Directional shadow offset only (No spinning ellipse rotation!)
    const shadowOffX = Math.cos(shadowAngle) * 14;
    const shadowOffY = Math.sin(shadowAngle) * 6;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
        pCenterX + shadowOffX,
        pFeetY + shadowOffY,
        24,
        10,
        0,  // Keep ellipse rotation fixed at 0 to prevent unnatural spinning!
        0,
        Math.PI * 2
    );
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fill();
    ctx.restore();

    ctx.restore();

    // PASS 1.5: Draw All Ground Black Tiles and Warning Shadows FIRST (Lowest Z-Index Layer!)
    for (let i = 0; i < wallEvents.length; i++) {
        const w = wallEvents[i];
        if (w.state === 'warning') {
            w.warningTimer += dt;
            const progress = Math.min(1.0, w.warningTimer / 1200);
            const warningAlpha = progress * 0.75;
            if (w.isBottom) {
                ctx.save();
                ctx.fillStyle = `rgba(0, 0, 0, ${warningAlpha})`;
                ctx.fillRect(w.x, w.y, tileSize, tileSize);
                ctx.restore();
            }
            if (w.warningTimer >= 1200) {
                w.state = 'falling';
                w.fallY = -380;
                w.fallVelocity = 0;
            }
        } else if (w.state === 'falling' || w.state === 'landed') {
            // Draw solid pitch black ground floor cell (#050505) ON THE BOTTOM FLOOR LAYER!
            ctx.save();
            ctx.fillStyle = '#050505';
            ctx.fillRect(w.x, w.y, tileSize, tileSize);
            ctx.restore();
        }
    }

    // PASS 2: Draw Wall Block Sprites & Falling Wall Sprites OVER the black ground layer
    for (let i = wallEvents.length - 1; i >= 0; i--) {
        const w = wallEvents[i];

        if (w.state === 'falling') {
            w.fallVelocity += 0.85;
            w.fallY += w.fallVelocity;

            if (w.fallY >= 0) {
                w.fallY = 0;
                w.state = 'landed';

                triggerScreenShake(8, 6);
                for (let p = 0; p < 4; p++) {
                    particles.push({
                        x: w.x + 32,
                        y: w.y + 32,
                        velocityX: (Math.random() - 0.5) * 4,
                        velocityY: (Math.random() - 0.5) * 4,
                        size: Math.random() * 5 + 3,
                        lifeSpan: 12,
                        color: '#DD8833'
                    });
                }

                // --- INSTANT CRUSH DEATH ON WALL LANDING (Player & Enemies) ---
                const pHitX = player.x + (90 - 22) / 2;
                const pHitY = player.y + (90 - 36) / 2;
                if (!player.isDead && pHitX < w.x + tileSize && pHitX + 22 > w.x &&
                    pHitY < w.y + tileSize && pHitY + 36 > w.y) {
                    player.hp = 0;
                    gameOver();
                }

                for (let e = enemies.length - 1; e >= 0; e--) {
                    const enemy = enemies[e];
                    if (enemy.x < w.x + tileSize && enemy.x + enemy.size > w.x &&
                        enemy.y < w.y + tileSize && enemy.y + enemy.size > w.y) {
                        for (let p = 0; p < 5; p++) {
                            particles.push({
                                x: enemy.x + enemy.size / 2,
                                y: enemy.y + enemy.size / 2,
                                velocityX: (Math.random() - 0.5) * 6,
                                velocityY: (Math.random() - 0.5) * 6,
                                size: Math.random() * 5 + 3,
                                lifeSpan: 12,
                                color: '#FF2200'
                            });
                        }
                        enemies.splice(e, 1);
                    }
                }
            }

            drawSingleWall(ctx, w, tileImg, w.fallY, false);
        } else if (w.state === 'landed') {
            if (w.isBottom) {
                activeWalls.push({
                    x: w.x,
                    y: w.y,
                    width: tileSize,
                    height: tileSize,
                    gridX: w.gridX,
                    gridY: w.gridY
                });
            }

            const isPlayerBehind = (
                playerBounds.x + playerBounds.width > w.x &&
                playerBounds.x < w.x + tileSize &&
                playerBounds.y + playerBounds.height > w.y - 12 &&
                playerBounds.y < w.y + tileSize + 10
            );

            drawSingleWall(ctx, w, tileImg, 0, isPlayerBehind);
        } else if (w.state === 'disappearing') {
            w.disappearTimer += dt;
            const progress = Math.min(1.0, w.disappearTimer / 650);
            const liftY = -progress * 380;   // Lift upwards into sky!
            const alpha = 1.0 - progress;     // Smoothly fade to transparent!

            ctx.save();
            ctx.globalAlpha = Math.max(0, alpha);
            drawSingleWall(ctx, w, tileImg, liftY, false);
            ctx.restore();

            if (w.disappearTimer >= 650) {
                const idx = wallEvents.indexOf(w);
                if (idx !== -1) wallEvents.splice(idx, 1);
            }
        }
    }

    walls = activeWalls;

    // Check Bullet-Wall Collisions for ALL landed wall cells (Both Player bullets & Enemy bullets disappear on wall impact)
    for (let b = playerBullets.length - 1; b >= 0; b--) {
        const bullet = playerBullets[b];
        const bSize = bullet.size || 6;
        for (let w = 0; w < landedWalls.length; w++) {
            const wall = landedWalls[w];
            if (bullet.x < wall.x + tileSize &&
                bullet.x + bSize > wall.x &&
                bullet.y < wall.y + tileSize &&
                bullet.y + bSize > wall.y) {
                for (let sp = 0; sp < 3; sp++) {
                    particles.push({
                        x: bullet.x,
                        y: bullet.y,
                        velocityX: (Math.random() - 0.5) * 3,
                        velocityY: (Math.random() - 0.5) * 3,
                        size: Math.random() * 3 + 2,
                        lifeSpan: 8,
                        color: '#FFD700'
                    });
                }
                playerBullets.splice(b, 1);
                break;
            }
        }
    }

    for (let eb = enemyBullets.length - 1; eb >= 0; eb--) {
        const eBullet = enemyBullets[eb];
        const ebSize = eBullet.size || 6;
        for (let w = 0; w < landedWalls.length; w++) {
            const wall = landedWalls[w];
            if (eBullet.x < wall.x + tileSize &&
                eBullet.x + ebSize > wall.x &&
                eBullet.y < wall.y + tileSize &&
                eBullet.y + ebSize > wall.y) {
                for (let sp = 0; sp < 2; sp++) {
                    particles.push({
                        x: eBullet.x,
                        y: eBullet.y,
                        velocityX: (Math.random() - 0.5) * 3,
                        velocityY: (Math.random() - 0.5) * 3,
                        size: Math.random() * 3 + 2,
                        lifeSpan: 8,
                        color: '#FF4444'
                    });
                }
                enemyBullets.splice(eb, 1);
                break;
            }
        }
    }
}

function drawSingleWall(ctx, w, tileImg, yOffset, isOccluded) {
    const tileSize = 64; // Standard 64px Grid Cell
    const drawY = w.y + yOffset;

    ctx.save();
    if (isOccluded) {
        ctx.globalAlpha = 0.35;
    } else {
        ctx.globalAlpha = 1.0;
    }

    if (w.isFront) {
        // [Independent 64x64 Front Wall Face Tile Cell - Pure Solid Muted Dark Orange-Gray Color (#543126)]
        ctx.fillStyle = '#543126';
        ctx.fillRect(w.x, drawY, tileSize, tileSize);
    } else {
        // [Independent 64x64 Top Roof Tile Cell - Pure Solid Dark Black (#1A1A1A)]
        ctx.fillStyle = '#1A1A1A';
        ctx.fillRect(w.x, drawY, tileSize, tileSize);
    }

    ctx.restore();
}

function generateTileMap() {
    const numTilesX = Math.ceil(gameWorld.width / 64);
    const numTilesY = Math.ceil(gameWorld.height / 64);
    tileMap = [];

    for (let x = 0; x < numTilesX; x++) {
        tileMap[x] = [];
        for (let y = 0; y < numTilesY; y++) {
            tileMap[x][y] = selectTileType();
        }
    }
}






function updateGameTime() {
    if (gameState !== 'gameStarted') {
        gameTime = 0;
        return;
    }
    const currentTime = Date.now();
    gameTime = Math.floor((currentTime - gameStartTime) / 1000);
}


// Function to draw game stats like the timer, enemy count, and total kills
function drawGameStats() {
    const timerX = canvas.width / 2 - 50; // Center X position of the timer
    const timerY = 20; // Y position of the timer
    
    // Example timer display
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
   

    const minutes = Math.floor(gameTime / 60);
    const seconds = gameTime % 60;
    const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.textAlign = 'center'; // Center the text horizontally
    ctx.textBaseline = 'top'; // Align the text to the top
    ctx.fillText(formattedTime, canvas.width / 2, 10); // Draw the text at the top center of the canvas
    // Display total kills below the timer
    const statsY = timerY + 30; // Position below the timer
    ctx.fillText(`                Total Kills: ${totalKills}`, timerX, statsY);
}


function startAttacking() {
    player.isAttacking = true;
}

function stopAttacking() {
    player.isAttacking = false;
}


// Function to draw level-up options
function drawLevelUpOptions() {
    const isAllMode = (currentLevelUpOptions.length > 3);
    const boxWidth = isAllMode ? 520 : 480;
    const maxVisible = isAllMode ? 6 : 3;
    const boxHeight = isAllMode ? 580 : 360;
    const boxX = (canvas.width - boxWidth) / 2;
    const boxY = (canvas.height - boxHeight) / 2;

    ctx.save();
    // Solid Black Panel
    ctx.fillStyle = '#000000';
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

    // Header Title (Without lightning emoji)
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 20px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    const headerTitle = isAllMode ? `ALL UPGRADES CHEAT MENU (${currentLevelUpOptions.length} TOTAL)` : `LEVEL UP! (LEVEL ${player.level})`;
    ctx.fillText(headerTitle, canvas.width / 2, boxY + 34);

    ctx.fillStyle = '#999999';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.fillText('Press [W/S], [Arrow Keys], or [Mouse Wheel] to scroll, [Enter/Space] to confirm', canvas.width / 2, boxY + 54);

    // Render Cards
    const startY = boxY + 74;
    const itemHeight = isAllMode ? 68 : 72;
    const itemSpacing = isAllMode ? 78 : 82;

    // Calculate scroll window range for all upgrades mode
    let startIdx = 0;
    if (currentLevelUpOptions.length > maxVisible) {
        startIdx = Math.max(0, Math.min(selectedOptionIndex - 2, currentLevelUpOptions.length - maxVisible));
    }
    const visibleOptions = currentLevelUpOptions.slice(startIdx, startIdx + maxVisible);

    visibleOptions.forEach((option, idx) => {
        const actualIndex = startIdx + idx;
        const itemY = startY + idx * itemSpacing;
        const isSelected = (actualIndex === selectedOptionIndex);

        if (isSelected) {
            // Highlight Card
            ctx.fillStyle = 'rgba(255, 215, 0, 0.22)';
            ctx.fillRect(boxX + 20, itemY, boxWidth - 40, itemHeight);
            ctx.strokeStyle = '#FFD700';
            ctx.lineWidth = 2;
            ctx.strokeRect(boxX + 20, itemY, boxWidth - 40, itemHeight);
        } else {
            // Normal Card
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fillRect(boxX + 20, itemY, boxWidth - 40, itemHeight);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.lineWidth = 1;
            ctx.strokeRect(boxX + 20, itemY, boxWidth - 40, itemHeight);
        }

        // Title text (Vertical center aligned inside card)
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = isSelected ? '#FFFFFF' : '#DCDCDC';
        ctx.font = isSelected ? 'bold 15px "Segoe UI", Arial, sans-serif' : '14px "Segoe UI", Arial, sans-serif';
        ctx.fillText(option.title, boxX + 35, itemY + 28);

        // Description text
        ctx.fillStyle = isSelected ? '#FFE4B5' : '#888888';
        ctx.font = '12px "Segoe UI", Arial, sans-serif';
        ctx.fillText(option.desc, boxX + 35, itemY + 50);
    });

    ctx.restore();
}





function stopAttacking() {
    
    player.isAttacking=false;
    clearInterval(player.attackInterval);
    player.attackInterval = null; // Reset the attackInterval variable
}

function getMousePosInWorld(canvas, input) {
    let screenX = 0;
    let screenY = 0;

    if (input && typeof input.clientX === 'number') {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        screenX = (input.clientX - rect.left) * scaleX;
        screenY = (input.clientY - rect.top) * scaleY;
    } else if (input && typeof input.x === 'number') {
        screenX = input.x;
        screenY = input.y;
    }

    // Reverse camera transform and zoom
    const worldX = (screenX - canvas.width / 2) / zoomLevel + player.x;
    const worldY = (screenY - canvas.height / 2) / zoomLevel + player.y;

    return { x: worldX, y: worldY };
}

function startReloading() {

    if(player.maxAmmo == player.ammo){
        return
    }
    
    player.isReloadingWeapon = true;
    player.reloadAnimationProgress = 0;
    player.isReloadingWeapon = true; // Mark as reloading


    if (!player.isReloading && player.ammo < player.maxAmmo) {
        player.isReloading = true;
        player.reloadingCooldown = player.maxReloadingCooldown; // Start the cooldown
        setTimeout(() => {
            player.ammo = player.maxAmmo;
            player.isReloading = false;
            
            player.isReloadingWeapon = false;
        }, player.maxReloadingCooldown); 
    }
     if (!player.isReloading && player.ammo < player.maxAmmo) {
        player.isReloading = true;
        player.playerShootCooldown = player.maxShootCooldown; // Reuse for reloading 
        setTimeout(() => {
            player.ammo = player.maxAmmo;
            player.isReloading = false;
            
            player.isReloadingWeapon = false;
        }, player.maxShootCooldown); 
    }
}

function spawnEnemyAtPosition(presetPos, forcedBodyType = null) {
    return spawnEnemy(presetPos, forcedBodyType);
}

function spawnLobbyHumanoids() {
    enemies.length = 0; // Clear all enemies in lobby startingRoom
}

function spawnEnemy(presetPos = null, forcedBodyType = null) {
    if (!player) return;
    if (gameState !== 'gameStarted' && !presetPos) return; // 100% STRICT GUARD: Block all random enemy spawns in lobby startingRoom!

    let tier = 1; 
    const pLvl = player.level || 1;
    const rand = Math.random();

    if (pLvl >= 6 && rand < 0.2) {
        tier = 4; // Boss (Red, Large)
    } else if (pLvl >= 4 && rand < 0.35) {
        tier = 3; // Elite (Purple/Blue)
    } else if (pLvl >= 2 && rand < 0.5) {
        tier = 2; // Veteran (Green)
    }

    // Balanced Enemy Pool Unlocking with LaserEye & Low Grabber/Suicide Bomber Spawn Rate!
    const basicBodyTypes = ['normal', 'normal', 'giant_head', 'floating_hands', 'double_torso', 'split_mutant', 'three_head', 'laser_eye', 'cannon_laser_head', 'green_laser_eye'];
    let bodyType = forcedBodyType || basicBodyTypes[Math.floor(Math.random() * basicBodyTypes.length)];

    // Rare Spawn Logic: 10% Rare Chance to spawn Machinegun Humanoid!
    if (!forcedBodyType && Math.random() < 0.10) {
        bodyType = 'machinegun_humanoid';
    }

    // 15% Rare Chance to spawn Kamikaze Exploders if player level unlocked!
    if (!forcedBodyType && bodyType !== 'machinegun_humanoid' && Math.random() < 0.15) {
        if (pLvl >= 5 && Math.random() < 0.5) {
            bodyType = 'red_kamikaze_exploder';
        } else if (pLvl >= 3) {
            bodyType = 'kamikaze_exploder';
        }
    }

    // Calculate Spawn Location: Kamikaze MUST spawn strictly OFF-SCREEN (720px ~ 950px)!
    const isKamikaze = (bodyType === 'kamikaze_exploder' || bodyType === 'red_kamikaze_exploder');
    const minSpawnDist = isKamikaze ? 720 : 260; // Off-screen for Kamikaze!
    const maxSpawnDist = isKamikaze ? 950 : 420;

    const margin = 80;
    let position = presetPos ? { ...presetPos } : { x: 0, y: 0 };
    let validPos = !!presetPos;
    let attempts = 0;

    const pCenterX = player.x + (player.size ? player.size / 2 : 45);
    const pCenterY = player.y + (player.size ? player.size / 2 : 45);

    while (!validPos && attempts < 40) {
        attempts++;
        const angle = Math.random() * Math.PI * 2;
        const dist = minSpawnDist + Math.random() * (maxSpawnDist - minSpawnDist);
        const rx = pCenterX + Math.cos(angle) * dist;
        const ry = pCenterY + Math.sin(angle) * dist;

        if (rx >= margin && rx <= gameWorld.width - margin &&
            ry >= margin && ry <= gameWorld.height - margin) {
            position = { x: rx, y: ry };
            validPos = true;
        }
    }

    if (!validPos) {
        const angle = Math.random() * Math.PI * 2;
        const dist = isKamikaze ? 750 : 320;
        position = {
            x: Math.min(gameWorld.width - margin, Math.max(margin, pCenterX + Math.cos(angle) * dist)),
            y: Math.min(gameWorld.height - margin, Math.max(margin, pCenterY + Math.sin(angle) * dist))
        };
    }

    let sizeMult = 1.0;
    let hpMult = 1.0;
    let speedMult = 1.0;
    let colorFilter = 'none';

    let shotCount = 1;
    let bulletSize = 6;
    let bulletSpeed = 5.5;
    let bulletColor = '#FFC9C9';
    let spreadAngle = 0;

    if (tier === 2) {
        sizeMult = 1.25;
        hpMult = 2.2;
        speedMult = 1.15;
        colorFilter = 'hue-rotate(120deg)'; // Green
        shotCount = 2;
        bulletSize = 8;
        bulletSpeed = 6.5;
        bulletColor = '#99FF99';
        spreadAngle = 0.22;
    } else if (tier === 3) {
        sizeMult = 1.5;
        hpMult = 4.5;
        speedMult = 1.3;
        colorFilter = 'hue-rotate(240deg) saturate(160%)'; // Purple/Blue
        shotCount = 3;
        bulletSize = 10;
        bulletSpeed = 7.5;
        bulletColor = '#E0B0FF';
        spreadAngle = 0.38;
    } else if (tier === 4) {
        sizeMult = 1.85;
        hpMult = 9.0;
        speedMult = 1.45;
        colorFilter = 'hue-rotate(330deg) brightness(1.3) saturate(220%)'; // Crimson Red
        shotCount = 5;
        bulletSize = 14;
        bulletSpeed = 8.5;
        bulletColor = '#FF0044';
        spreadAngle = 0.55;
    }

    let customSprite = null;
    if (bodyType === 'giant_head') {
        speedMult *= 1.2;
        hpMult *= 1.25;
        shotCount = Math.max(shotCount, 2);
    } else if (bodyType === 'three_head') {
        speedMult *= 1.25;
        shotCount = Math.max(shotCount, 3);
        spreadAngle = 0.35;
    } else if (bodyType === 'floating_hands') {
        speedMult *= 1.35;
    } else if (bodyType === 'double_torso') {
        sizeMult *= 1.35;
        hpMult *= 2.2;
        speedMult *= 0.8;
        shotCount = Math.max(shotCount, 4);
        spreadAngle = 0.5;
    } else if (bodyType === 'split_mutant') {
        speedMult *= 1.25;
    } else if (bodyType === 'kamikaze_exploder') {
        speedMult *= 3.2; // Ultra fast lighting speed sprint approach!
        hpMult *= 0.35;   // Very low HP (Glass cannon / One-shot killable!)
        shotCount = 0;
        customSprite = 'enemyBasic/_Type2_Archive/00341-663612114.png';
        colorFilter = 'hue-rotate(20deg) saturate(220%)';
    } else if (bodyType === 'red_kamikaze_exploder') {
        speedMult *= 3.8;  // Extreme fast sprint + Dash!
        hpMult *= 0.12;    // 1~2 bullets killable (Instant Glass Cannon Exploder!)
        shotCount = 0;
        customSprite = 'enemyBasic/_Type2_Archive/00341-663612114.png';
        colorFilter = 'hue-rotate(330deg) saturate(320%) brightness(1.25)'; // Deep Crimson Red
    } else if (bodyType === 'laser_eye') {
        sizeMult *= 0.7;   // Small compact size!
        hpMult *= 2.8;     // Takes exactly 3 hits to kill!
        speedMult *= 1.35;
        shotCount = 0;
        customSprite = 'enemyBasic/_Type2_Archive/00341-663612114.png';
        colorFilter = 'hue-rotate(180deg) saturate(280%) brightness(1.2)';
    } else if (bodyType === 'cannon_laser_head') {
        sizeMult *= 0.9;
        hpMult *= 3.4;     // Heavy HP Tank Cannon!
        speedMult *= 1.1;
        shotCount = 0;
        customSprite = 'enemyBasic/_Type2_Archive/00341-663612114.png';
        colorFilter = 'hue-rotate(290deg) saturate(220%) contrast(1.1)'; // Hot Magenta / Pink Filter!
    } else if (bodyType === 'green_laser_eye') {
        sizeMult *= 0.75;
        hpMult = 0.01;     // Glass Cannon (1 Hit Killable)!
        speedMult *= 1.25;
        shotCount = 0;
        customSprite = 'enemyBasic/_Type2_Archive/00341-663612114.png';
        colorFilter = 'hue-rotate(100deg) saturate(220%) contrast(1.1)'; // Electric Lime Green Filter!
    } else if (bodyType === 'machinegun_humanoid') {
        sizeMult *= 1.15;
        hpMult *= 1.4;     // Softened HP (1.4x instead of 2.2x)
        speedMult *= 0.95;  // Slightly softer walking speed
        shotCount = 3;     // Rapid burst shooter
        customSprite = 'OLD/RoBChar.png';
        colorFilter = 'hue-rotate(180deg) saturate(154%) brightness(86%)'; // Exact User Parameters: Hue 180, Saturation 154%, Brightness -14% (86%)!
    } else if (bodyType === 'assault_humanoid') {
        sizeMult *= 1.25;
        hpMult *= 2.5;
        speedMult *= 1.35; // Fast Charger
        shotCount = 3;     // Rush 3-burst shooter
        customSprite = 'OLD/RoBChar.png';
        colorFilter = 'none'; // Pure original sprite colors without any color filter!
    }

    // 45% chance for Melee Charger/Berserker enemy (attackType: 'dash') for Tier 1 & 2
    let isMeleeDashType = (tier <= 2) && (Math.random() < 0.45);
    if (bodyType === 'split_mutant' || bodyType === 'kamikaze_exploder' || bodyType === 'red_kamikaze_exploder') {
        isMeleeDashType = true;
    }
    const attackType = (bodyType === 'kamikaze_exploder' || bodyType === 'red_kamikaze_exploder') ? 'suicide_explode' : (isMeleeDashType ? 'dash' : 'ranged');
    const headPattern = (bodyType === 'three_head') ? (Math.random() < 0.5 ? 0 : 1) : 0;

    if (isMeleeDashType && bodyType !== 'kamikaze_exploder' && bodyType !== 'red_kamikaze_exploder' && bodyType !== 'machinegun_humanoid' && bodyType !== 'assault_humanoid') {
        speedMult *= 1.35; // Melee chargers move 35% faster
        shotCount = 0;    // Does not shoot bullets
        colorFilter = 'hue-rotate(40deg) saturate(280%) brightness(1.2)'; // Fiery Amber Orange
    }

    let dedicatedCooldown = isMeleeDashType ? 2400 : Math.max(800, 2000 - (tier * 250));
    let initialCooldown = Math.random() * 1000 + 500;

    if (bodyType === 'laser_eye') {
        dedicatedCooldown = 3000; // 3.0s Cooldown for LaserEye!
        initialCooldown = 350;
    } else if (bodyType === 'cannon_laser_head') {
        dedicatedCooldown = 3800; // 3.8s Cooldown for Cannon Laser Head!
        initialCooldown = 400;
    } else if (bodyType === 'green_laser_eye') {
        dedicatedCooldown = 5500; // 5.5s Long Cooldown for Green Laser Eye!
        initialCooldown = 300;
    } else if (bodyType === 'machinegun_humanoid') {
        dedicatedCooldown = 2200;
        initialCooldown = 400;
    } else if (bodyType === 'assault_humanoid') {
        dedicatedCooldown = 2600;
        initialCooldown = 300;
    }

    // 100% PURE Isolated State Guard: Force clear customSprite & strictly lock colorFilter for custom bodyTypes!
    const hasCustomSprite = ['kamikaze_exploder', 'red_kamikaze_exploder', 'laser_eye', 'cannon_laser_head', 'green_laser_eye', 'machinegun_humanoid', 'assault_humanoid'].includes(bodyType);
    if (!hasCustomSprite) {
        customSprite = null;
    }
    if (bodyType === 'machinegun_humanoid') {
        colorFilter = 'hue-rotate(180deg) saturate(154%) brightness(86%)';
    } else if (bodyType === 'assault_humanoid') {
        colorFilter = 'none';
    }

    const baseEnemyHp = 30 + (pLvl - 1) * 8;
    const finalSize = Math.floor((enemySize || 45) * sizeMult);
    const finalHp = (bodyType === 'green_laser_eye') ? 1 : Math.max(1, Math.floor(baseEnemyHp * hpMult));

    const newEnemy = {
        x: position.x,
        y: position.y,
        size: finalSize,
        hp: finalHp,
        maxHp: finalHp,
        speed: (enemySpeed || 2.5) * speedMult,
        attackCooldown: dedicatedCooldown,
        timeUntilNextAttack: initialCooldown,
        tier: tier,
        colorFilter: colorFilter,
        xpReward: 32 * tier,
        shotCount: shotCount,
        bulletSize: bulletSize,
        bulletSpeed: bulletSpeed,
        bulletColor: bulletColor,
        spreadAngle: spreadAngle,
        attackType: attackType,
        bodyType: bodyType,
        headPattern: headPattern,
        customSprite: customSprite,
        isDashing: false,
        dashTimer: 0,
        dashVectorX: 0,
        dashVectorY: 0,
        isThrowing: false,
        throwTimer: 0,
        throwProgress: 0,
        isDead: false
    };
    enemies.push(newEnemy);
}





function createBullet(array, x, y, targetX, targetY, isSecondBurst = false, isTwinBurst = false) {
    if (array === playerBullets) {
        if (!isSecondBurst && !isTwinBurst && (player.isReloading || (player.ammo <= 0 && blueBuffTimer <= 0))) return;

        const baseWeaponDamage = (player.currentWeapon && player.currentWeapon.additionalDamage) ? player.currentWeapon.additionalDamage : 5;
        const recoilIntensity = Math.min(8, Math.max(1, baseWeaponDamage - 3));
        startShake(10, recoilIntensity);

        // Clean Exact Pivot Position matching drawWeapons
        const handX = player.lookingRight ? (player.x + 54) : (player.x + 32);
        const handY = player.y + 58;
        const shootAngle = Math.atan2(targetY - handY, targetX - handX);

        // Calculate gun tip muzzle coordinates exactly along shootAngle (Pulled slightly inward)
        const barrelLength = (player.currentWeapon.gunHolePositionX || 25) - 3;
        const muzzleX = handX + Math.cos(shootAngle) * barrelLength;
        const muzzleY = handY + Math.sin(shootAngle) * barrelLength;

        // Player Knockback
        if (player.lookingRight) {
            player.x -= player.currentWeapon.playerKnockBack || 0;
        } else {
            player.x += player.currentWeapon.playerKnockBack || 0;
        }

        // Spawn Muzzle Spark Particles at exact muzzle tip
        createParticles(muzzleX, muzzleY, shootAngle);

        const isRedBuff = blueBuffTimer > 0;
        const redLvl = player.redBoxLevel || 0;

        // Match exact pure clean lobby bullet color (0 glow)
        const finalColor = (isRedBuff && redLvl >= 1) ? '#FF3D00' : (player.currentWeapon.bulletColor || "#FFF4B8");
        const flameGlowColor = null; // 100% Completely remove in-game bullet glow!
        const isBurnBullet = isRedBuff && redLvl >= 1;

        let shotCount = player.currentWeapon.ammoShotNum || 1;
        const isShotgun = (player.currentWeapon && (player.currentWeapon.name === "winchester shotgun ww2 version" || player.currentWeapon.ammoShotNum > 1));
        const isVector = (player.currentWeapon && (player.currentWeapon.name === "vector smg 9mm" || player.currentWeapon.name.includes("vector")));

        // Stationary Fire: Add extra bullets for Vector SMG when standing still!
        if ((isVector || !isShotgun) && player.stationaryFireSelected) {
            shotCount += (player.stationaryBonusBullets || 0);
        }
        
        if (isShotgun) {
            shotCount += (player.shotgunPelletBonus || 0);

            if (player.shotRoll2Selected) {
                // Shot Roll II: No back-recoil! Instead trigger 0.8s Non-Aim direction 2x Speed boost!
                player.nonAimBoostTimer = 800; // 800ms
                player.shotRollTimer = 0;
                player.shotRollVx = 0;
                player.shotRollVy = 0;
            } else {
                // Shot Roll I: Recoil Shot-Roll & Motion Afterimages!
                const recoilForce = 13 + (player.shotgunRecoilBonus || 0);
                player.shotRollVx = -Math.cos(shootAngle) * recoilForce;
                player.shotRollVy = -Math.sin(shootAngle) * recoilForce;
                player.shotRollTimer = 380; // 380ms Shot-Roll duration
            }
        }

        if (isRedBuff && redLvl >= 2) {
            shotCount += 2;
        }

        const bSize = player.currentWeapon.bulletSize || 7;
        const speed = player.currentWeapon.bulletSpeed || 9;

        const isPistol = (player.currentWeapon && player.currentWeapon.name === "mauser c96");
        const pistolLvl = player.pistolSpecLevel || 0;

        if (isPistol && pistolLvl >= 2) {
            const angles = [];
            if (pistolLvl === 2) {
                // Level 2: 4-Way Crossfire angles (Up/Down/Left/Right relative to aim)
                angles.push(shootAngle, shootAngle + Math.PI / 2, shootAngle + Math.PI, shootAngle - Math.PI / 2);
            } else if (pistolLvl >= 3) {
                // Level 3: 8-Way Radial Octo-Burst angles (Full 360 degrees)
                for (let i = 0; i < 8; i++) {
                    angles.push(shootAngle + i * (Math.PI / 4));
                }
            }

            angles.forEach(ang => {
                array.push({ 
                    x: muzzleX,
                    y: muzzleY,
                    velocityX: Math.cos(ang) * speed,
                    velocityY: Math.sin(ang) * speed,
                    size: bSize,
                    color: finalColor,
                    glowColor: flameGlowColor,
                    isBurnBullet: isBurnBullet
                });
            });
        } else if (shotCount === 1) {
            array.push({ 
                x: muzzleX,
                y: muzzleY,
                velocityX: Math.cos(shootAngle) * speed, 
                velocityY: Math.sin(shootAngle) * speed,
                size: bSize,
                color: finalColor,
                glowColor: flameGlowColor,
                isBurnBullet: isBurnBullet
            });
        } else if (player.straightShotSelected && (isShotgun || isVector)) {
            // Straight Shot: All bullets fire parallel in a side-by-side wall alignment with spacing!
            const perpAngle = shootAngle + Math.PI / 2;
            const spacing = 11; // 11px spacing between parallel side-by-side pellets
            const totalWidth = (shotCount - 1) * spacing;
            const startOffset = -totalWidth / 2;

            for (let i = 0; i < shotCount; i++) {
                const offset = startOffset + i * spacing;
                const pX = muzzleX + Math.cos(perpAngle) * offset;
                const pY = muzzleY + Math.sin(perpAngle) * offset;

                array.push({ 
                    x: pX,
                    y: pY,
                    originX: pX,
                    originY: pY,
                    velocityX: Math.cos(shootAngle) * speed,
                    velocityY: Math.sin(shootAngle) * speed,
                    shootAngle: shootAngle,
                    perpAngle: perpAngle,
                    size: bSize,
                    color: finalColor,
                    glowColor: flameGlowColor,
                    isBurnBullet: isBurnBullet,
                    isRainbowShot: player.rainbowShotSelected,
                    dnaIndex: i,
                    dnaPhase: (i % 2 === 0 ? 0 : Math.PI), // Opposite DNA phase for double-helix!
                    traveledDist: 0
                });
            }
        } else {
            const spread = (player.currentWeapon.ammoShotNum > 1) ? (player.currentWeapon.shotgunSpreadRange || 0.4) : 0.25;
            const startAngle = shootAngle - (spread / 2);
            const step = spread / (shotCount - 1);

            for (let i = 0; i < shotCount; i++) {
                const curAngle = startAngle + step * i;
                array.push({ 
                    x: muzzleX,
                    y: muzzleY,
                    velocityX: Math.cos(curAngle) * speed,
                    velocityY: Math.sin(curAngle) * speed,
                    size: bSize,
                    color: finalColor,
                    isBurnBullet: isBurnBullet
                });
            }
        }

        if (!isSecondBurst && !isTwinBurst && blueBuffTimer <= 0) {
            player.ammo -= 1;
        }

        // Double Tap Synergy: Automatic 2nd burst 0.6s after primary shotgun firing!
        if (isShotgun && player.doubleTapSelected && !isSecondBurst && !isTwinBurst) {
            setTimeout(() => {
                if (gameState === 'gameStarted' && !isPaused && !levelUpState && player.hp > 0) {
                    const curMouseWorld = getMousePosInWorld(canvas, mouse);
                    createBullet(array, player.x + player.size / 2, player.y + player.size / 2, curMouseWorld.x, curMouseWorld.y, true, false);
                }
            }, 600); // 0.6s delay!
        }

        // Universal Twin Trigger I & II: Fast 0.10s / 0.20s automated follow-up bursts for ALL weapons!
        const twinLvl = player.twinTriggerLevel || 0;
        if (twinLvl >= 1 && !isTwinBurst) {
            // 2nd Burst after 100ms
            setTimeout(() => {
                if (gameState === 'gameStarted' && !isPaused && !levelUpState && player.hp > 0) {
                    const curMouseWorld = getMousePosInWorld(canvas, mouse);
                    createBullet(array, player.x + player.size / 2, player.y + player.size / 2, curMouseWorld.x, curMouseWorld.y, isSecondBurst, true);
                }
            }, 100);

            // 3rd Burst after 200ms (Level 2)
            if (twinLvl >= 2) {
                setTimeout(() => {
                    if (gameState === 'gameStarted' && !isPaused && !levelUpState && player.hp > 0) {
                        const curMouseWorld = getMousePosInWorld(canvas, mouse);
                        createBullet(array, player.x + player.size / 2, player.y + player.size / 2, curMouseWorld.x, curMouseWorld.y, isSecondBurst, true);
                    }
                }, 200);
            }
        }
    }
}

function createParticles(x, y, angle) {
    const shotColor = player.currentWeapon.shotColor || 'rgba(255, 166, 0)';

    for (let i = 0; i < 10; i++) {
        const spreadCone = (Math.random() - 0.5) * 0.3;
        const speed = Math.random() * 6 + 3;
        const pAngle = angle + spreadCone;

        particles.push({
            x: x,
            y: y,
            velocityX: Math.cos(pAngle) * speed,
            velocityY: Math.sin(pAngle) * speed,
            size: Math.random() * 3 + 1.5,
            lifeSpan: Math.random() * 5 + 2,
            color: shotColor
        });
    }
}

function updateParticles() {
    // Cap max particles at 250 to guarantee smooth 60 FPS performance
    if (particles.length > 250) {
        particles.splice(0, particles.length - 250);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.velocityX;
        p.y += p.velocityY;
        p.lifeSpan--;

        if (p.lifeSpan <= 0) {
            particles.splice(i, 1);
        }
    }
}

function drawParticles(ctx) {
    if (particles.length === 0) return;
    ctx.save();
    ctx.shadowBlur = 4;
    for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (p.isRedFadingRectTrail) {
            // Linear Fading Red Rectangular Afterimage (Behind enemy layer, slender width, long extended tail!)
            const maxLife = p.maxLifeSpan || 20;
            const progressAlpha = Math.max(0, Math.min(1.0, p.lifeSpan / maxLife));
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.angle || 0);

            const w = p.width || 72;   // Moderately shortened trail length behind
            const h = p.height || 16;  // Compact slender width (smaller size)

            // Gradient: Left (-w, tail far behind) is transparent, Right (0, near enemy center) is bright crimson red!
            const grad = ctx.createLinearGradient(-w, 0, 0, 0);
            grad.addColorStop(0, `rgba(255, 17, 51, 0)`);                      // Far tail side: Completely Transparent
            grad.addColorStop(1.0, `rgba(255, 17, 51, ${progressAlpha * 0.85})`); // Front side (at enemy center): Hot Crimson Red!

            ctx.fillStyle = grad;
            ctx.fillRect(-w, -h / 2, w, h);
            ctx.restore();
        } else {
            const baseAlpha = (p.maxAlpha !== undefined) ? p.maxAlpha : 0.6;
            const alpha = Math.max(0, Math.min(baseAlpha, (p.lifeSpan / 8) * baseAlpha));
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
    }
    ctx.restore();
}







function gainXP(amount) {
    const xpAmt = amount || 0;
    if (player.xp !== undefined) {
        player.xp += xpAmt;
        if (player.xp >= (player.xpToNextLevel || 100)) {
            player.xp -= (player.xpToNextLevel || 100);
            player.level = (player.level || 1) + 1;
            player.xpToNextLevel = Math.floor((player.xpToNextLevel || 75) * 1.18);
            openLevelUpOptions(); // Call level up ONLY when threshold reached!
        }
    }
    if (player.exp !== undefined) {
        player.exp += xpAmt;
        if (player.exp >= (player.expToNextLevel || 75)) {
            player.exp -= (player.expToNextLevel || 75);
            player.level = (player.level || 1) + 1;
            player.expToNextLevel = Math.floor((player.expToNextLevel || 75) * 1.18);
            openLevelUpOptions(); // Call level up ONLY when threshold reached!
        }
    }
}




function update(deltaTime) {
    if (isPaused || levelUpState) return; // Pause game during pause menu or level-up selection

    // 0.5s Screen-wide Entity Hit Freeze on Grab Hit
    if (grabHitFreezeTimer > 0) {
        grabHitFreezeTimer = Math.max(0, grabHitFreezeTimer - (deltaTime || 16));
        return; // Freeze all entity movement and logic during 0.5s grab hit freeze
    }

    if (blueBuffTimer > 0) {
        blueBuffTimer = Math.max(0, blueBuffTimer - (deltaTime || 16));
        const maxBuffTime = (player.redBoxLevel >= 3) ? 13000 : 8000;
        const buffRatio = Math.max(0.15, Math.min(1, blueBuffTimer / maxBuffTime));

        // Spawn dense & large fiery magma flame particles around player's body (Fades out smoothly with remaining buff time)
        for (let fp = 0; fp < 2; fp++) {
            const pX = player.x + (Math.random() - 0.2) * player.size;
            const pY = player.y + (Math.random() - 0.2) * player.size;
            particles.push({
                x: pX,
                y: pY,
                velocityX: (Math.random() - 0.5) * 2.2,
                velocityY: -Math.random() * 3.5 - 1.2, // Rising up flame surge
                size: (Math.random() * 6.5 + 4.5) * (0.35 + buffRatio * 0.65), // Gently scales down
                lifeSpan: Math.random() * 12 + 6,
                maxAlpha: buffRatio * 0.65, // Alpha smoothly fades out with remaining cooldown time!
                color: (Math.random() > 0.4) ? '#FF2200' : (Math.random() > 0.5 ? '#FF6600' : '#FFD700')
            });
        }

        // Passive regen: 5% of max HP per sec (Level 3) or 2.5% per sec while red buff active
        if (player.hp < player.maxHp) {
            const regenRate = (player.redBoxLevel >= 3) ? 0.05 : 0.025;
            const regenAmount = (player.maxHp * regenRate) * ((deltaTime || 16) / 1000);
            player.hp = Math.min(player.maxHp, player.hp + regenAmount);
        }
    }

    if (shieldTimer > 0) {
        shieldTimer = Math.max(0, shieldTimer - (deltaTime || 16));
        if (shieldTimer <= 0 && playerShieldHp > 0 && !isOvertimeShield) {
            // Timer expired: Transition into 1-hit semi-transparent overtime shield
            isOvertimeShield = true;
            playerShieldHp = 1;
        }
    }

    // Level 3 Cyan Shield: Outer Gray Ring 20s Auto-Recharge Logic (Works during Overtime Dotted Shield as well)
    if (((player.cyanShieldLevel || 0) >= 3 || maxShieldHp >= 3) && (playerShieldHp < maxShieldHp || isOvertimeShield)) {
        shieldRechargeTimer -= (deltaTime || 16);
        if (shieldRechargeTimer <= 0) {
            // 20 seconds without taking damage -> Auto-recharge Full Shield HP & Restore 12s Timer!
            playerShieldHp = maxShieldHp;
            shieldTimer = maxShieldTimer;
            isOvertimeShield = false;
            shieldRechargeTimer = maxShieldRechargeTimer;

            // Cyan Recharge Pulse Particles
            for (let i = 0; i < 18; i++) {
                const pAngle = (i / 18) * Math.PI * 2;
                particles.push({
                    x: player.x + player.size / 2,
                    y: player.y + player.size / 2,
                    velocityX: Math.cos(pAngle) * 3.8,
                    velocityY: Math.sin(pAngle) * 3.8,
                    size: Math.random() * 5 + 3,
                    lifeSpan: Math.random() * 15 + 10,
                    color: '#00FFFF'
                });
            }
        }
    } else {
        shieldRechargeTimer = maxShieldRechargeTimer;
    }

    
    W_at += deltaTime * (player.currentWeapon.reloadDeltaSq*player.reloadingCooldown);
    if (W_at >= frameInterval) {
        W_at = 0; // Subtract excess for smooth animation
        WepcurrentFrame++;
        player.reloadAnimationProgress++;
        
    }
    if(player.reloadAnimationProgress >= player.currentWeapon.reloadFrames){
        player.reloadAnimationProgress = 0
    }
    
    
    let moveSpeed = player.isDodging ? player.dodgeSpeed : player.speed;

    // --- SHOT ROLL II: Hard Lock Max Ammo = 1 ONLY when Shotgun is equipped! ---
    const isShotgunEquipped = (player.currentWeapon && (player.currentWeapon.name === "winchester shotgun ww2 version" || player.currentWeapon.ammoShotNum > 1));

    if (player.shotRoll2Selected && isShotgunEquipped) {
        player.maxAmmo = 1;
        if (player.ammo > 1) player.ammo = 1;
    }

    if (player.shotRoll2Selected && player.nonAimBoostTimer > 0) {
        player.nonAimBoostTimer -= (deltaTime || 16);

        // Check if movement direction is away from facing direction
        let isNonAimMoving = false;
        if (player.lookingRight && (keys['a'] || keys['A'] || keys['w'] || keys['W'] || keys['s'] || keys['S'])) {
            isNonAimMoving = true;
        } else if (!player.lookingRight && (keys['d'] || keys['D'] || keys['w'] || keys['W'] || keys['s'] || keys['S'])) {
            isNonAimMoving = true;
        }

        if (isNonAimMoving) {
            moveSpeed += 0.4; // Fixed +0.4 Speed Boost!

            // Spawn Grey Afterimages!
            if (Math.random() < 0.7) {
                greyAfterimages.push({
                    x: player.x,
                    y: player.y,
                    size: player.size,
                    opacity: 0.75
                });
            }
        }
    }

    let nextX = player.x;
    let nextY = player.y;

    if (keys['w'] || keys['W']) nextY -= moveSpeed;
    if (keys['s'] || keys['S']) nextY += moveSpeed;
    if (keys['a'] || keys['A']) nextX -= moveSpeed;
    if (keys['d'] || keys['D']) nextX += moveSpeed;

    if (!isCollidingWithWalls(nextX, player.y, 28, 44)) {
        player.x = nextX;
    }
    if (!isCollidingWithWalls(player.x, nextY, 28, 44)) {
        player.y = nextY;
    }
    
    // --- SHOT ROLL RECOIL MOTION WITH WASD FREEDOM & AFTERIMAGES ---
    if (player.shotRollTimer > 0) {
        player.shotRollTimer -= (deltaTime || 16);
        
        player.shotRollVx *= 0.88;
        player.shotRollVy *= 0.88;

        const rollNextX = player.x + player.shotRollVx;
        const rollNextY = player.y + player.shotRollVy;

        if (!isCollidingWithWalls(rollNextX, player.y, 28, 44)) {
            player.x = rollNextX;
        }
        if (!isCollidingWithWalls(player.x, rollNextY, 28, 44)) {
            player.y = rollNextY;
        }

        // Spawn Cyan Motion Afterimages for Shot Roll!
        if (Math.random() < 0.7) {
            blueAfterimages.push({
                x: player.x,
                y: player.y,
                alpha: 0.7,
                size: player.size
            });
        }
    }

    if (keys['w'] || keys['W'] || keys['a'] || keys['A'] || keys['s'] || keys['S']|| keys['d'] || keys['D']) {
        player.isWalking = true; 
        if (!player.mobileFireSelected) {
            player.stationaryTimer = 0;
            player.stationaryBonusBullets = 0;
        }
    } else {
        player.isWalking = false;
    }

    // Accumulate extra bullet count stack while firing (Mobile Fire keeps stack while walking)
    if (player.stationaryFireSelected && player.isAttacking) {
        player.stationaryTimer = (player.stationaryTimer || 0) + (deltaTime || 16);
        // Every 550ms firing maintained adds +1 extra bullet! (Up to +5 extra bullets)
        player.stationaryBonusBullets = Math.min(5, Math.floor(player.stationaryTimer / 550));
    } else {
        player.stationaryTimer = 0;
        player.stationaryBonusBullets = 0;
    }

    player.x = Math.max(0, Math.min(gameWorld.width - player.size, player.x));
    player.y = Math.max(0, Math.min(gameWorld.height - player.size, player.y));


    if (player.playerShootCooldown > 0) {
        player.playerShootCooldown = Math.max(0, player.playerShootCooldown - deltaTime * 0.06);
    }

    if (mouse.isDown && !levelUpState && !isClickInsideWeaponPanel(mouse.x, mouse.y)) {
        player.isAttacking = true;
        if (!player.isReloading && !player.isReloadingWeapon && player.ammo > 0 && player.playerShootCooldown <= 0) {
            const currentMouseWorld = getMousePosInWorld(canvas, mouse);
            createBullet(playerBullets, player.x + player.size / 2, player.y + player.size / 2, currentMouseWorld.x, currentMouseWorld.y);
            player.playerShootCooldown = player.maxShootCooldown;

            if (player.ammo <= 0) {
                startReloading();
            }
        }
    } else if (!mouse.isDown) {
        player.isAttacking = false;
    }

    if (gameState === 'startingRoom') {
        checkDoorEntry();
        updateEnemies(deltaTime);
        handleCollisions();
    } else if (gameState === 'gameStarted') {
        handleGameStartedState();
    }


    if (player.reloadingCooldown > 0) { // Decrease reloading cooldown
        player.reloadingCooldown--;
    }

    if (player.ammo <= 0 && !player.isReloading) {
        startReloading();
    }

    

    if (player.playerShootCooldown > 0) {
        player.playerShootCooldown--; 
    } 




    updateEntities(playerBullets);
    updateEntities(enemyBullets);
    updateEnemies(deltaTime);
    //enemyShoot();
    handleCollisions();

}

function drawLeveL(text, x, y, color = 'white', font = '16px Arial'){
    ctx.fillStyle = color;
    ctx.font = font;
    ctx.fillText(text, x, y);
}

function drawXPBar(infoBoxMargin, infoBoxWidth) {
    const xpBarX = infoBoxMargin + 5;
    const xpBarY = infoBoxMargin +55; // Adjust as needed
    const xpBarWidth = infoBoxWidth - 10;
    const xpBarHeight = 10;

    // Background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(xpBarX, xpBarY, xpBarWidth, xpBarHeight);

    // Foreground (progress)
    const filledXpBarWidth = (player.xp / player.xpToNextLevel) * xpBarWidth;
    ctx.fillStyle = '#FFD700'; // Gold color for XP bar
    ctx.fillRect(xpBarX, xpBarY, filledXpBarWidth, xpBarHeight);

    const levelDisplayX = infoBoxMargin + 30;
    const levelDisplayY = infoBoxMargin + 10; 

    drawLeveL(`Level: ${player.level}`, levelDisplayX, levelDisplayY, 'white', '14px Arial');


}

function updateSidebarUI() {
    const hpFill = document.getElementById('hp-bar-fill');
    const ammoFill = document.getElementById('ammo-bar-fill');
    const dodgeContainer = document.getElementById('dodge-box-container');

    if (hpFill) {
        const hpPct = Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100));
        hpFill.style.width = `${hpPct}%`;
    }
    if (ammoFill) {
        const ammoPct = Math.max(0, Math.min(100, (player.ammo / player.maxAmmo) * 100));
        ammoFill.style.width = `${ammoPct}%`;
    }
    if (dodgeContainer) {
        const boxes = dodgeContainer.children;
        for (let i = 0; i < boxes.length; i++) {
            if (i < player.dodgeCharges) {
                boxes[i].classList.remove('used');
            } else {
                boxes[i].classList.add('used');
            }
        }
    }

    const setTxt = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setTxt('stat-maxhp', player.maxHp);
    setTxt('stat-maxammo', player.maxAmmo);
    setTxt('stat-reload', player.maxReloadingCooldown);
    setTxt('stat-firerate', player.maxShootCooldown);
    setTxt('stat-damage', player.attackDamage);
    setTxt('stat-speed', player.speed);
}

function drawInfoBox(){
    updateSidebarUI();
}






function startShake(duration, intensity) {
    shakeDuration = duration;
    shakeIntensity = intensity;
}







function createDustParticles() {
    for (let i = 0; i < 20; i++) { // Create 100 dust particles
        dustParticles.push({
            x: Math.random() * gameWorld.width,
            y: Math.random() * gameWorld.height,
            velocityX: (Math.random() - 0.5) * 5, // Random velocity
            velocityY: (Math.random() - 0.5) * 5,
            size: Math.random() * 22 + 1, // Random size between 1 and 3
            opacity: Math.random() * 0.05 + 0.01 // Semi-transparent

            
        });
    }

    for (let i = 0; i < 50; i++) { // Create 100 dust particles
        dustParticles.push({
            x: Math.random() * gameWorld.width,
            y: Math.random() * gameWorld.height,
            velocityX: (Math.random() - 5) * 0.7, // Random velocity
            velocityY: (Math.random() - 5) * 0.7,
            size: Math.random() * 1.5 + 1, // Random size between 1 and 3
            opacity: Math.random() * 5 + 1 // Semi-transparent

            
        });
    }

}



function updateAndDrawDustParticles(ctx) {
    dustParticles.forEach(particle => {
        particle.x += particle.velocityX ;
        particle.y += particle.velocityY ;

        // Reset particle position if it goes off-screen
        if (particle.x < 0 || particle.x > gameWorld.width || particle.y < 0 || particle.y > gameWorld.height) {
            particle.x = Math.random() * gameWorld.width;
            particle.y = Math.random() * gameWorld.height;
        }

        // Draw particle
        ctx.fillStyle = `rgba(255, 70, 0, ${particle.opacity})`; // White color with variable opacity
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2, true);
        ctx.fill();

        
    });
}





function drawAmbientLighting(ctx) {
    const lightX = player.x + (player.size || 90) / 2;
    const lightY = player.y + (player.size || 90) / 2;

    ctx.save();

    // 1. Soft dark vignette ambient mask centered on player (Zero sprite erasing, 100% visible graphics!)
    const radGrad = ctx.createRadialGradient(lightX, lightY, 200, lightX, lightY, 650);
    radGrad.addColorStop(0, 'rgba(0, 0, 0, 0.0)');        // Completely 100% clear around player & center!
    radGrad.addColorStop(0.5, 'rgba(4, 6, 12, 0.22)');
    radGrad.addColorStop(1, 'rgba(4, 6, 12, 0.52)');      // Soft dark ambient at outer screen edges

    ctx.fillStyle = radGrad;
    ctx.fillRect(camera.x - 300, camera.y - 300, canvas.width + 600, canvas.height + 600);

    // 2. Additive Emissive Glows for Monster Cores
    ctx.globalCompositeOperation = 'lighter';

    ctx.restore();
}

function draw(currentFrame, deltaTime) {
    ctx.imageSmoothingEnabled = false;
    ctx.webkitImageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
    ctx.msImageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
   
    ctx.save(); 

    let shakeX = 0;
    let shakeY = 0;
    if (shakeDuration > 0) {
        shakeX = Math.random() * shakeIntensity - shakeIntensity / 2;
        shakeY = Math.random() * shakeIntensity - shakeIntensity / 2;
        shakeDuration -= 1; // Reduce duration each frame
    }

    ctx.translate(canvas.width / 2 + shakeX, canvas.height / 2 + shakeY);
    ctx.scale(zoomLevel, zoomLevel); 
    ctx.translate(-player.x, -player.y); 

    const circleRadius = 20;
    const circleCenterX = mouse.x;
    const circleCenterY = mouse.y;

    const imageRadius = 20; 
    const imageCenterX = mouse.x; 
    const imageCenterY = mouse.y;


    // 월드 영역 바깥으로 스프라이트가 삐져나가지 않도록 clip 처리
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, gameWorld.width, gameWorld.height);
    ctx.clip();

    if (gameState === 'startingRoom') {
        drawTiles(ctx);
        drawDoor();
        drawPlayer(PlayercurrentFrame, deltaTime);
        drawEntities(enemyBullets, '#FFC9C9', 'red', 8, 'rgba(246,13,13,0.3)','rgba(246,13,13,0.1)','rgba(246,13,13,0.05)');
        drawEnemies();
        drawWeapons(PlayercurrentFrame);
        drawEntities(playerBullets, player.currentWeapon.bulletColor, 
            "transparent", player.currentWeapon.bulletTailThicc, 
            player.currentWeapon.bulletTailcolor1,
            player.currentWeapon.bulletTailcolor2,
            player.currentWeapon.bulletTailcolor3,
            player.dodgeCooldown);
    } else if (gameState === 'gameStarted') {
        drawTiles(ctx);
        updateAndDrawWalls(ctx, deltaTime);
        drawBulletDecals(ctx);
        updateAndDrawDustParticles(ctx);
        updateAndDrawYellowBulletTrails(ctx);
        updateAndDrawBlueAfterimages(ctx);
        updateAndDrawGreyAfterimages(ctx);
        updateAndDrawRedAfterimages(ctx);
        drawPlayer(PlayercurrentFrame, deltaTime);
        drawEntities(enemyBullets, '#FFC9C9', 'red', 8, 'rgba(246,13,13,0.3)','rgba(246,13,13,0.1)','rgba(246,13,13,0.05)');
        drawParticles(ctx); // Render particles & fading red trails BEHIND enemies!
        drawEnemies();

        updateAndDrawHealthPacks(ctx, deltaTime);
        updateAndDrawBlueBoxes(ctx, deltaTime);
        updateAndDrawBlueShieldBoxes(ctx, deltaTime);
        updateAndDrawBlueAuraParticles(ctx, deltaTime);
        drawPlayerShield(ctx);
        drawWeapons(PlayercurrentFrame);   

        drawEntities(playerBullets, player.currentWeapon.bulletColor, 
            "transparent", player.currentWeapon.bulletTailThicc, 
            player.currentWeapon.bulletTailcolor1,
            player.currentWeapon.bulletTailcolor2,
            player.currentWeapon.bulletTailcolor3,
            player.dodgeCooldown);

        // --- AMBIENT DARKNESS & PLAYER LANTERN LIGHT OVERLAY ---
        drawAmbientLighting(ctx);
    }

    ctx.restore(); // clip 해제

    ctx.strokeStyle = 'black';
    ctx.lineWidth = gameWorld.borderWidth;
    ctx.strokeRect(0, 0, gameWorld.width, gameWorld.height);

    ctx.restore(); // Restore the canvas state after camera offset


     // Cooldown/Reloading Circle
    const rawPercentage = player.isReloading ? 
                        (player.maxShootCooldown - player.playerShootCooldown) / player.maxShootCooldown : // Reloading progress
                        player.playerShootCooldown / player.maxShootCooldown;  // Cooldown progress
    const percentage = Math.max(0, Math.min(1, rawPercentage));

   
    /*
    ctx.beginPath();
    ctx.arc(imageCenterX, imageCenterY, imageRadius * percentage, 0, 2 * Math.PI);
    ctx.fillStyle = 'gray'; 
    ctx.fill();*/

    
    const targetSX = currentFrame * 16

    const targetSWidth = 16;
    const targetSheight = 16;
    //mouse.x - imageRadius3as 
    //mouse.y - imageRadius
   
    // Render crosshair target cursor ONLY when not hovering over weapon UI panel
    if (!isClickInsideWeaponPanel(mouse.x, mouse.y)) {
        if(player.isAttacking && !player.isReloading){
            ctx.drawImage(
                targetImage, 
                targetSX, 0,
                targetSWidth,  
                targetSheight,  
                mouse.x - imageRadius ,
                mouse.y - imageRadius,
                imageRadius * 2, 
                imageRadius * 2,
            ); 
        }else if(player.isReloading){
            ctx.drawImage(
                targetImageReload , 
                targetSX, 0,
                targetSWidth,  
                targetSheight,  
                mouse.x - imageRadius,
                mouse.y - imageRadius,
                imageRadius * 2, 
                imageRadius * 2,
            ); 
            ctx.drawImage(
                targetImageReloadTEXT, 
                mouse.x - imageRadius - 20,
                mouse.y - imageRadius + 50,
                86, 
                16,
            ); 
        }else{
            ctx.drawImage(
                targetImage, 
                0, 0,
                targetSWidth,  
                targetSheight,  
                mouse.x - imageRadius,
                mouse.y - imageRadius,
                imageRadius * 2, 
                imageRadius * 2,
            ); 
        }
    }

    ctx.beginPath();
    ctx.fillStyle = 'rgba(255, 0, 0, 1)'; // Progress section is red
    
    /*when using Rect
    ctx.fillRect(circleCenterX, circleCenterY, -circleRadius * percentage, -circleRadius * percentage)
    ctx.fillRect(circleCenterX, circleCenterY, circleRadius * percentage, -circleRadius * percentage)
    ctx.fillRect(circleCenterX, circleCenterY, circleRadius * percentage, circleRadius * percentage)
    ctx.fillRect(circleCenterX, circleCenterY, -circleRadius * percentage, circleRadius * percentage)    
    */
    //when useing arc
    if(!player.isReloading && percentage > 0){
        ctx.arc(circleCenterX, circleCenterY, Math.max(0, 14 * percentage), 0, 2 * Math.PI);
        ctx.fill();
    }
   

    if (levelUpState) {
        drawLevelUpOptions();
    }

    drawGameStats();
    drawInfoBox();

    // Draw remaining ammo as a yellow gauge bar or Red Flame Timer bar under mouse cursor (ONLY when not on weapon UI)
    if (!isClickInsideWeaponPanel(mouse.x, mouse.y)) {
        const ammoBarWidth = 36;
        const ammoBarHeight = 5;
        const ammoBarX = mouse.x - ammoBarWidth / 2;
        const ammoBarY = mouse.y + 25;

        if (blueBuffTimer > 0) {
            const maxBuffTime = (player.redBoxLevel >= 3) ? 13000 : 8000;
            const buffFraction = Math.max(0, Math.min(1, blueBuffTimer / maxBuffTime));
            // Flame Red Timer Bar when Red Box Buff is Active
            drawHpBar(ammoBarX, ammoBarY, ammoBarWidth, ammoBarHeight, buffFraction, '#FF2200');
        } else {
            const ammoFraction = Math.max(0, Math.min(1, player.ammo / player.maxAmmo));
            drawHpBar(ammoBarX, ammoBarY, ammoBarWidth, ammoBarHeight, ammoFraction, '#FFFF00');
        }
    }

    drawWeaponSelectPanelLeftBottom(); // Draw left-bottom weapon selection panel
    drawWeaponUIRightBottom(); // Draw right-bottom large weapon animation at screen space top layer

    if (isPaused) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 20);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 16px "Segoe UI", Arial, sans-serif';
        ctx.fillText('Press [P] or [ESC] to Resume', canvas.width / 2, canvas.height / 2 + 30);
        ctx.restore();
    }

    if (player.isDead || player.hp <= 0) {
        ctx.save();
        ctx.shadowBlur = 0; // 100% No Glow!

        // Dark background overlay
        ctx.fillStyle = 'rgba(10, 10, 10, 0.90)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const cardW = 500;
        const cardH = 320;
        const cardX = (canvas.width - cardW) / 2;
        const cardY = (canvas.height - cardH) / 2;

        // Simple Sharp Rectangle Box (No border radius, No stroke border, No glow!)
        ctx.fillStyle = '#141414';
        ctx.fillRect(cardX, cardY, cardW, cardH);

        // Title Header (Simple Bold Text)
        ctx.fillStyle = '#FF3344';
        ctx.font = 'bold 30px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Press R to Restart', canvas.width / 2, cardY + 45);

        // Fixed Survived Time (Stopped exact at deathTime!)
        const exactDeathTime = player.deathTime || Date.now();
        const survivedSec = Math.floor((exactDeathTime - (gameStartTime || exactDeathTime)) / 1000);
        const minStr = String(Math.floor(survivedSec / 60)).padStart(2, '0');
        const secStr = String(survivedSec % 60).padStart(2, '0');

        // Simple Crisp Stats List
        ctx.textAlign = 'left';
        ctx.font = '15px Arial, sans-serif';

        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('Killed By:', cardX + 45, cardY + 95);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(player.killedBy || "Slain in Battle", cardX + 165, cardY + 95);

        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('Total Kills:', cardX + 45, cardY + 130);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${totalKills} Kills`, cardX + 165, cardY + 130);

        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('Time Survived:', cardX + 45, cardY + 165);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`${minStr}m ${secStr}s`, cardX + 165, cardY + 165);

        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('Final Level:', cardX + 45, cardY + 200);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(`Level ${player.level || 1}`, cardX + 165, cardY + 200);

        // Simple Thin Line
        ctx.fillStyle = '#333333';
        ctx.fillRect(cardX + 30, cardY + 230, cardW - 60, 1);

        // Personal Best High Score Badge
        const pbTimeM = String(Math.floor((personalBest.highSurvivedTime || 0) / 60)).padStart(2, '0');
        const pbTimeS = String((personalBest.highSurvivedTime || 0) % 60).padStart(2, '0');
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFCC00';
        ctx.font = 'bold 14px Arial, sans-serif';
        ctx.fillText(`BEST:  ${personalBest.highKills || 0} Kills  |  ${pbTimeM}m ${pbTimeS}s  |  Lv.${personalBest.highLevel || 1}`, canvas.width / 2, cardY + 272);

        ctx.restore();
    }

    ctx.restore(); // Restore the context state


}

function drawDoor() {
    if (door.isOpen) {
        ctx.fillStyle = 'brown';
        ctx.fillRect(door.x, door.y, door.width, door.height);
    }
}

function checkDoorEntry() {
    if (player.x < door.x + door.width &&
        player.x + player.size > door.x &&
        player.y < door.y + door.height &&
        player.y + player.size > door.y) {
        generateRandomRoom(); // Generate a new room
        console.log("Entered a new room."); gameState = 'gameStarted';
        initializeGameStartedState(); // Now spawns enemies and starts game logic
        
    }
}

function handleGameStartedState() {

    if (player.ammo <= 0 && !player.isReloading) {
        startReloading();
    }

}

function initializeGameStartedState() {
    // Reset timer to 0 when player enters the door to start the game
    gameStartTime = Date.now();
    gameTime = 0;

    // Spawn initial enemies for the 'gameStarted' state
    for (let i = 0; i < 5; i++) {
        spawnEnemy();
    }
}




function getAngleToMouse(playerX, playerY, mouseX, mouseY) {
    const dx = mouseX - playerX;
    const dy = mouseY - playerY;
    return Math.atan2(dy, dx);
  }









function drawPlayer(playercurrentFrame, deltaTime) {    
    if (!playerSprite || !playerSprite.complete || playerSprite.naturalWidth === 0) return;

    let sourceX =0;

    const spriteWidth = 32//playerSprite.width / numberOfFrames; 
    const spriteHeight = 32 //playerSprite.height / numberOfFrames; 

    sourceX = playercurrentFrame * spriteWidth


    drawHpBar(player.x+25, player.y+12 - 10, 30, 5, player.hp / player.maxHp, 'lime');

    // Draw XP Bar right below HP Bar
    const xpFraction = Math.max(0, Math.min(1, player.xp / player.xpToNextLevel));
    drawHpBar(player.x + 25, player.y + 12 - 3, 30, 3, xpFraction, '#FFD700');

    // Draw Dodge Charge Bar below player feet (Darker empty track + Extra long visibility hold)
    if (dodgeBarAlpha > 0) {
        let totalDodgeFraction = 1.0;
        if (player.dodgeCharges < player.maxDodgeCharges) {
            const timeSinceLastDodge = performance.now() - player.lastDodgeTime;
            const rechargeProgress = Math.min(1, timeSinceLastDodge / player.dodgeRechargeTime);
            totalDodgeFraction = Math.min(1, (player.dodgeCharges + rechargeProgress) / player.maxDodgeCharges);
        }

        ctx.save();
        ctx.globalAlpha = dodgeBarAlpha;
        // Pure pitch black empty background track bar
        drawHpBar(player.x + 25, player.y + player.size + 4, 30, 4, 1.0, '#000000');
        // Filled silver charge bar
        drawHpBar(player.x + 25, player.y + player.size + 4, 30, 4, totalDodgeFraction, '#CCCCCC');
        ctx.restore();

        // Extra slow smooth fade-out (Holds visibility significantly longer)
        dodgeBarAlpha = Math.max(0, dodgeBarAlpha - (deltaTime || 16) * 0.0003);
    }
   
    const isHitFlash = (performance.now() - player.hitTime < 120);
    if (isHitFlash) {
        ctx.save();
        ctx.filter = 'brightness(1000%)';
    }


    if (player.isDodging) {
        ctx.save()
        playerNumberOfframes = 9
            ctx.drawImage(
                playerSprite, 
                sourceX , 96, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x , player.y, 
                player.size, player.size
            ); 
        ctx.restore(); 

}else if(player.isWalking){    
    playerNumberOfframes = 8;
  //걷고있는 상태
    if(player.lookingRight){
        ctx.save(); 
        ctx.scale(1, 1); 

        if(player.isAttacking){
            ctx.drawImage(
                playerSprite, 
                sourceX, 32, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x * 1, player.y, 
                player.size, player.size
            ); 

        }else{
            ctx.drawImage(
                playerSprite, 
                sourceX, 32, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x * 1, player.y, 
                player.size, player.size
            );  
            
        }

        ctx.restore(); 
    }else{
        ctx.save(); 
        ctx.scale(-1, 1); 
        if(player.isAttacking){
            ctx.drawImage(
                playerSprite, 
                sourceX, 32, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x * -1 - player.size, player.y, 
                player.size, player.size      ); 
        }else{
            ctx.drawImage(
                playerSprite, 
                sourceX, 32, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x * -1 - player.size, player.y, 
                player.size, player.size
            ); 
        }
        ctx.restore(); 
    }

}else {//idel상태

    playerNumberOfframes = 6;
    if(player.lookingRight){
        ctx.save(); 
        ctx.scale(1, 1); 
        if(player.isAttacking){
            ctx.drawImage(
                playerSprite, 
                sourceX, 0, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x * 1, player.y, 
                player.size, player.size
            );
        }else{
                    ctx.drawImage(
                        playerSprite, 
                        sourceX, 0, // Source X, Y 
                        spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                        player.x * 1, player.y, 
                        player.size, player.size
                    ); 
        }
        ctx.restore();

    }else{
        ctx.save(); 
        ctx.scale(-1, 1); 
                
                
        if(player.isAttacking){
            ctx.drawImage(
                playerSprite, 
                sourceX, 0, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x * -1 - player.size, player.y, 
                player.size, player.size
            ); 

        }else{
            ctx.drawImage(
                playerSprite, 
                sourceX, 0, // Source X, Y 
                spriteWidth, spriteHeight,     // Source width, height (assuming 32x32 frames)
                player.x * -1 - player.size, player.y, 
                player.size, player.size
            ); 
        }

        ctx.restore(); 
    }
}

    if (isHitFlash) {
        ctx.restore();
    }
}
/*
ctx.shadowOffsetX = 0;
ctx.shadowOffsetY = 0;
*/

function drawWeaponUIRightBottom() {
    let reloadSprite = getCachedImage(player.currentWeapon.reloadSprite);
    if (!reloadSprite || !reloadSprite.complete || reloadSprite.naturalWidth === 0) return;

    ctx.save();
    let sourceX = player.isReloadingWeapon ? player.reloadAnimationProgress * 512 : 0;
    
    // Larger size: 600x600 fixed top-layer UI at bottom-right corner (Shifted further right & down)
    const drawSize = 600;
    let uiX = canvas.width - 460 + (player.currentWeapon.setGUNUIPOsX || 0);
    let uiY = canvas.height - 440 + (player.currentWeapon.setGUNUIPOsY || 0);

    ctx.drawImage(reloadSprite, sourceX, 0, 512, 512, uiX, uiY, drawSize, drawSize);
    ctx.restore();
}

function drawWeapons(playercurrentFrame){
    let weaponSprite = getCachedImage(player.currentWeapon.sprite);
  
    const currentMouseWorld = getMousePosInWorld(canvas, mouse);
    // Hand position on player body
    const handX = player.lookingRight ? (player.x + 54) : (player.x + 32);
    const handY = player.y + 58;
    const angleToMouse = Math.atan2(currentMouseWorld.y - handY, currentMouseWorld.x - handX);

    ctx.shadowBlur = 0;

    // In-Hand Weapon: Exact alpha grip-pixel-to-hand rotation
    if (weaponSprite && weaponSprite.complete && weaponSprite.naturalWidth !== 0) {
        let recoilX = player.isAttacking ? (playercurrentFrame % 2 === 0 ? -4 : 0) : 0;

        // Exact non-transparent gun grip pixel location inside 128x128 PNG canvas
        let gripPX = player.currentWeapon.gripPixelX || 55;
        let gripPY = player.currentWeapon.gripPixelY || 62;

        ctx.save();
        // Pin rotation pivot directly to player hand
        ctx.translate(handX, handY);

        if (player.lookingRight) {
            ctx.rotate(angleToMouse);
            // Draw original 128x128 sprite aligning (gripPX, gripPY) exactly onto hand position
            ctx.drawImage(weaponSprite, -gripPX + recoilX, -gripPY);
        } else {
            ctx.rotate(angleToMouse);
            ctx.scale(1, -1);
            ctx.drawImage(weaponSprite, -gripPX + recoilX, -gripPY);
        }

        ctx.restore();
    }
}






function updateCollisionBox() {
    PlayercollisionX = player.x + 13;
    PlayercollisionY = player.y + 13;
    PlayercollisionSize = player.size - SpriteColisionGap;
}


function performDodge(currentTime) {
    if (player.dodgeCharges > 0 || blueBuffTimer > 0) {
        // Use a dodge charge only if blue buff is not active
        if (blueBuffTimer <= 0) {
            player.dodgeCharges--;
        }
        player.isDodging = true;
        player.lastDodgeTime = currentTime; // Update the time since last dodge
        dodgeBarAlpha = 1.0; // Trigger full visibility of dodge bar

        setTimeout(() => {
            player.isDodging = false; // End of dodge - vulnerable again
            // You can trigger tail particle generation here if desired
        }, 500); // Dodge duration, adjust as needed

        // Start recharge timer if it's not already running and if not at max charges
        if (player.dodgeCharges < player.maxDodgeCharges && !player.dodgeRechargeTimer) {
            startDodgeRecharge();
        }
    }
}



function startDodgeRecharge() {
    player.dodgeRechargeTimer = setInterval(() => {
        if (player.dodgeCharges < player.maxDodgeCharges) {
            player.dodgeCharges++;
            //console.log(`Dodge Charge Recharged: ${player.dodgeCharges}/${player.maxDodgeCharges}`);
        }
        // Stop the timer if the charges are full
        if (player.dodgeCharges >= player.maxDodgeCharges) {
            clearInterval(player.dodgeRechargeTimer);
            player.dodgeRechargeTimer = null; // Reset the timer
        }
    }, player.dodgeRechargeTime);
}

function updateEntities(array) {
    if (!array || array.length === 0) return;

    // Hard Limit Cap: Cap total active bullets to 100 max to eliminate CPU lag!
    if (array.length > 100) {
        array.splice(0, array.length - 100);
    }

    const camLeft = camera.x - 250;
    const camRight = camera.x + canvas.width + 250;
    const camTop = camera.y - 250;
    const camBottom = camera.y + canvas.height + 250;

    for (let index = array.length - 1; index >= 0; index--) {
        const entity = array[index];
        
        if (entity.isRainbowShot && entity.originX !== undefined) {
            entity.traveledDist = (entity.traveledDist || 0) + Math.hypot(entity.velocityX, entity.velocityY);
            const wave = Math.sin(entity.traveledDist * 0.075 + entity.dnaPhase) * 15; // Rotating DNA Double-Helix Spiral Wave!

            // Advance along velocity angle + oscillate perpendicularly along perpAngle!
            entity.x = entity.originX + Math.cos(entity.shootAngle) * entity.traveledDist + Math.cos(entity.perpAngle) * wave;
            entity.y = entity.originY + Math.sin(entity.shootAngle) * entity.traveledDist + Math.sin(entity.perpAngle) * wave;
        } else {
            entity.x += entity.velocityX;
            entity.y += entity.velocityY;
        }

        // Viewport Culling & Out-of-bounds Removal
        if (entity.x < camLeft || entity.x > camRight || entity.y < camTop || entity.y > camBottom ||
            entity.x < 0 || entity.x > gameWorld.width || entity.y < 0 || entity.y > gameWorld.height) {
            array.splice(index, 1);
        }
    }
}

function drawEntities(array, color, glowcolor, bulletTailThicc, tailColor1, tailColor2, tailColor3, checkPlayerByDodge) {
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    array.forEach(bullet => {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0; // Force clear canvas shadow glow!

        // Spawn fiery magma flame sparks behind burn bullets
        if (bullet.isBurnBullet && Math.random() < 0.7) {
            particles.push({
                x: bullet.x + (Math.random() - 0.5) * 6,
                y: bullet.y + (Math.random() - 0.5) * 6,
                velocityX: (Math.random() - 0.5) * 1.5 - bullet.velocityX * 0.15,
                velocityY: (Math.random() - 0.5) * 1.5 - bullet.velocityY * 0.15,
                size: Math.random() * 4 + 1.5,
                lifeSpan: Math.random() * 8 + 4,
                color: (Math.random() > 0.4) ? '#FF3D00' : '#FF9900'
            });
        }

        if (checkPlayerByDodge == 200) {
            const tailColors = [tailColor1, tailColor2, tailColor3]; 
            const tailLength = 35 + (player.currentWeapon ? player.currentWeapon.tailExtendLenght : 0); 
            const partLength = tailLength / 3; 
            const tailWidth = bulletTailThicc; 
            
            const angle = Math.atan2(bullet.velocityY, bullet.velocityX);
            let tailStartX = bullet.x - Math.cos(angle) * (bullet.size / 2);
            let tailStartY = bullet.y - Math.sin(angle) * (bullet.size / 2);
            
            ctx.lineWidth = tailWidth;

            for (let i = 0; i < 3; i++) {
                ctx.strokeStyle = tailColors[i];
                const partStartX = tailStartX - Math.cos(angle) * partLength * i;
                const partStartY = tailStartY - Math.sin(angle) * partLength * i;
                const partEndX = partStartX - Math.cos(angle) * partLength;
                const partEndY = partStartY - Math.sin(angle) * partLength;

                ctx.beginPath();
                ctx.moveTo(partStartX, partStartY);
                ctx.lineTo(partEndX, partEndY);
                ctx.stroke();
            }
        } else {
            const tailColors = [tailColor1, tailColor2, tailColor3]; 
            const tailLength = 35; 
            const partLength = tailLength / 3; 
            const tailWidth = bulletTailThicc; 
            
            const angle = Math.atan2(bullet.velocityY, bullet.velocityX);
            let tailStartX = bullet.x - Math.cos(angle) * (bullet.size / 2);
            let tailStartY = bullet.y - Math.sin(angle) * (bullet.size / 2);
            
            ctx.lineWidth = tailWidth;

            for (let i = 0; i < 3; i++) {
                ctx.strokeStyle = tailColors[i];
                const partStartX = tailStartX - Math.cos(angle) * partLength * i;
                const partStartY = tailStartY - Math.sin(angle) * partLength * i;
                const partEndX = partStartX - Math.cos(angle) * partLength;
                const partEndY = partStartY - Math.sin(angle) * partLength;

                ctx.beginPath();
                ctx.moveTo(partStartX, partStartY);
                ctx.lineTo(partEndX, partEndY);
                ctx.stroke();
            }
        }

        // Draw individual special bullets (e.g. RainbowShot)
        if (bullet.isRainbowShot) {
            const rainbowHue = (performance.now() * 0.45 + (bullet.dnaIndex || 0) * 45) % 360;
            const rainbowColor = `hsl(${rainbowHue}, 100%, 65%)`;
            ctx.fillStyle = rainbowColor;
            ctx.shadowBlur = 0; // Completely remove glow blur!
            ctx.beginPath();
            ctx.arc(bullet.x, bullet.y, (bullet.size || 7) / 2, 0, Math.PI * 2, false);
            ctx.fill();
        }
    });

    // Single-Pass Draw Call respecting individual bullet.color and rectangular shape
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    for (let i = 0; i < array.length; i++) {
        const bullet = array[i];
        if (!bullet.isRainbowShot) {
            if (bullet.isRectBullet) {
                // Elongated Rotated Rectangular Energy Bullet for Humanoids!
                const bAngle = Math.atan2(bullet.velocityY || 0, bullet.velocityX || 0);
                const rectLength = 18;
                const rectWidth = 5;
                ctx.save();
                ctx.translate(bullet.x, bullet.y);
                ctx.rotate(bAngle);
                ctx.fillStyle = bullet.color || '#52CBBC';
                ctx.fillRect(-rectLength / 2, -rectWidth / 2, rectLength, rectWidth);
                ctx.restore();
            } else {
                const r = (bullet.size || 7) / 2;
                ctx.fillStyle = bullet.color || color;
                ctx.beginPath();
                ctx.arc(bullet.x, bullet.y, r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
    ctx.shadowBlur = 0;

    // Render Hitbox Debug Outlines inside world camera transform context
    renderHitboxes(ctx);
}

function triggerExplosion(x, y) {
    triggerScreenShake(14, 10);
    for (let p = 0; p < 35; p++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * 8 + 2;
        particles.push({
            x: x,
            y: y,
            velocityX: Math.cos(angle) * spd,
            velocityY: Math.sin(angle) * spd,
            size: Math.random() * 8 + 3,
            lifeSpan: Math.random() * 16 + 8,
            color: (Math.random() < 0.5) ? '#FF4500' : (Math.random() < 0.8 ? '#FF8C00' : '#FFD700')
        });
    }
}

function getEnemyEnglishName(bodyType) {
    switch(bodyType) {
        case 'giant_head': return "Giant Head Mutant";
        case 'three_head': return "Three-Headed Yo-Yo";
        case 'floating_hands': return "Floating Hands Mutant";
        case 'double_torso': return "Double Torso Mutant";
        case 'split_mutant': return "Split Mutant";
        case 'kamikaze_exploder': return "Grey Exploder";
        case 'red_kamikaze_exploder': return "Red Exploder";
        default: return "Basic Mutant";
    }
}

function updateEnemies(deltaTime) {
    const camCenterX = camera.x + canvas.width / 2;
    const camCenterY = camera.y + canvas.height / 2;

    for (let index = enemies.length - 1; index >= 0; index--) {
        const enemy = enemies[index];

        // Automatic Pushback: Prevent enemy monsters from getting trapped inside wall seams!
        resolveEnemyWallPenetration(enemy);

        // Keep full clear visibility without flickering fade-outs
        enemy.fadeAlpha = 1.0;

        // Decrement attack cooldown & protective shield guard timer
        if (enemy.timeUntilNextAttack > 0) {
            enemy.timeUntilNextAttack -= (deltaTime || 16);
        }
        if (enemy.shieldTimer > 0) {
            enemy.shieldTimer -= (deltaTime || 16);
            if (enemy.shieldTimer <= 0) {
                enemy.isShieldActive = false;
            }
        }

        // Humanoid Dodge Reaction Counter-Rush Trigger: When player rolls/dodges, rush in a straight line ignoring walls!
        if (player.isDodging) {
            if (!enemy.hasDodgeReacted && (enemy.bodyType === 'machinegun_humanoid' || enemy.bodyType === 'assault_humanoid')) {
                enemy.hasDodgeReacted = true;
                enemy.dodgeRushTimer = 650; // 650ms Ultra High-Speed Ghost Counter-Rush!
                const pCenterX = player.x + 45;
                const pCenterY = player.y + 45;
                const eCenterX = enemy.x + enemy.size / 2;
                const eCenterY = enemy.y + enemy.size / 2;
                const rushAngle = Math.atan2(pCenterY - eCenterY, pCenterX - eCenterX);
                const rushSpeed = enemy.speed * 2.067; // Exactly 59% faster than 1.3x speed!
                enemy.dodgeRushVecX = Math.cos(rushAngle) * rushSpeed;
                enemy.dodgeRushVecY = Math.sin(rushAngle) * rushSpeed;
                enemy.dodgeRushAngle = rushAngle;
            }
        } else {
            enemy.hasDodgeReacted = false; // Reset trigger state when player finishes dodging
        }

        // Check if the enemy is ready to attack or initiate Melee Dash
        if (enemy.attackType === 'dash') {
            const distToPlayer = Math.hypot(player.x - (enemy.x + enemy.size / 2), player.y - (enemy.y + enemy.size / 2));
            if (!enemy.isDashing && enemy.timeUntilNextAttack <= 0 && distToPlayer < 320) {
                // Initiate Melee Dash Surge!
                enemy.isDashing = true;
                enemy.dashTimer = 550; // 550ms Burst Dash
                const dashAngle = Math.atan2(player.y - (enemy.y + enemy.size / 2), player.x - (enemy.x + enemy.size / 2));
                const dashSpeed = enemy.speed * 2.8;
                enemy.dashVectorX = Math.cos(dashAngle) * dashSpeed;
                enemy.dashVectorY = Math.sin(dashAngle) * dashSpeed;
            }
        } else if (enemy.timeUntilNextAttack <= 0 && enemy.bodyType !== 'laser_eye' && enemy.bodyType !== 'cannon_laser_head' && enemy.bodyType !== 'green_laser_eye' && (enemy.shotCount || 0) > 0) {
            if (enemy.bodyType === 'three_head' && enemy.headPattern === 1) {
                // Head Throw Attack (Yo-Yo Head Surge)
                enemy.isThrowing = true;
                enemy.throwTimer = 0;
                enemy.throwAngle = Math.atan2(player.y - (enemy.y + enemy.size / 2), player.x - (enemy.x + enemy.size / 2));
                enemy.timeUntilNextAttack = 2200;
            } else {
                // Ranged Attack Shooting (Bullet color matched to Monster Tier!)
                const baseAngle = Math.atan2(player.y - (enemy.y + enemy.size / 2), player.x - (enemy.x + enemy.size / 2));
                const count = enemy.shotCount || 1;
                const bSize = enemy.bulletSize || 6;
                const bSpeed = enemy.bulletSpeed || 5.5;
                const spread = enemy.spreadAngle || 0;

                // Match Bullet Color to Monster Tier Color (Softened with White Pastel Tints per user request!)
                const bColor = (enemy.tier === 4) ? '#FF88CC' : (enemy.tier === 3) ? '#D088FF' : (enemy.tier === 2) ? '#77FFB0' : '#FF7777';

                if (enemy.bodyType === 'machinegun_humanoid' || enemy.bodyType === 'assault_humanoid') {
                    enemy.lastAttackAnimTime = Date.now(); // Record attack animation start timestamp!
                    const burstCount = 16; // Balanced 16-burst sequence for fair gameplay difficulty!
                    enemy.lastBurstCount = burstCount; // Store total burst shot count for dynamic animation sync!
                    for (let burstIndex = 0; burstIndex < burstCount; burstIndex++) {
                        setTimeout(() => {
                            if (enemy && enemy.hp > 0) {
                                const curAngle = Math.atan2(player.y - (enemy.y + enemy.size / 2), player.x - (enemy.x + enemy.size / 2));
                                enemyBullets.push({
                                    x: enemy.x + enemy.size / 2,
                                    y: enemy.y + enemy.size / 2,
                                    velocityX: Math.cos(curAngle) * 7.2,
                                    velocityY: Math.sin(curAngle) * 7.2,
                                    size: 7,
                                    color: '#52CBBC',
                                    isRectBullet: true,
                                    tier: enemy.tier || 1
                                });
                            }
                        }, burstIndex * 80);
                    }
                } else if (count === 1) {
                    enemyBullets.push({
                        x: enemy.x + enemy.size / 2,
                        y: enemy.y + enemy.size / 2,
                        velocityX: Math.cos(baseAngle) * bSpeed,
                        velocityY: Math.sin(baseAngle) * bSpeed,
                        size: bSize,
                        color: bColor,
                        tier: enemy.tier || 1
                    });
                } else {
                    const startOffset = -spread / 2;
                    const step = spread / (count - 1);
                    for (let i = 0; i < count; i++) {
                        const finalAngle = baseAngle + (startOffset + step * i);
                        enemyBullets.push({
                            x: enemy.x + enemy.size / 2,
                            y: enemy.y + enemy.size / 2,
                            velocityX: Math.cos(finalAngle) * bSpeed,
                            velocityY: Math.sin(finalAngle) * bSpeed,
                            size: bSize,
                            color: bColor,
                            tier: enemy.tier || 1
                        });
                    }
                }

                // Reset the attack cooldown (Humanoids get 2x extended reload cooldown 6.4s!)
                if (enemy.bodyType === 'machinegun_humanoid' || enemy.bodyType === 'assault_humanoid') {
                    const totalBurstDuration = (enemy.lastBurstCount || 30) * 65;
                    enemy.timeUntilNextAttack = totalBurstDuration + 6400; // Exactly 2x extended reload duration (6.4s)!
                } else {
                    enemy.timeUntilNextAttack = enemy.attackCooldown;
                }
            }
        }

        // Apply Burn DoT continuous damage and red flower spark particles (2x Burn Rate at Level 3)
        if (enemy.burnDoTTimer > 0) {
            enemy.burnDoTTimer = Math.max(0, enemy.burnDoTTimer - (deltaTime || 16));
            const burnRate = ((player.redBoxLevel || 0) >= 3) ? 0.16 : 0.08;
            const burnDmg = (enemy.maxHp * burnRate) * ((deltaTime || 16) / 1000);
            enemy.hp -= burnDmg;

            if (Math.random() < 0.35) {
                particles.push({
                    x: enemy.x + Math.random() * enemy.size,
                    y: enemy.y + Math.random() * enemy.size,
                    velocityX: (Math.random() - 0.5) * 2,
                    velocityY: -(Math.random() * 2 + 1),
                    size: Math.random() * 4 + 2,
                    lifeSpan: Math.random() * 10 + 5,
                    color: '#FF0033'
                });
            }
        }

        // Kamikaze Exploders ('kamikaze_exploder' & 'red_kamikaze_exploder') Afterimages, Trail & Instant Suicide Explosion
        if (enemy.bodyType === 'kamikaze_exploder' || enemy.bodyType === 'red_kamikaze_exploder') {
            const isRed = (enemy.bodyType === 'red_kamikaze_exploder');
            if (isRed) {
                if (Math.random() < 0.75) {
                    redAfterimages.push({
                        x: enemy.x,
                        y: enemy.y,
                        size: enemy.size,
                        opacity: 0.75,
                        spritePath: enemy.customSprite
                    });
                }
                if (Math.random() < 0.7) {
                    particles.push({
                        x: enemy.x + Math.random() * enemy.size,
                        y: enemy.y + Math.random() * enemy.size,
                        velocityX: (Math.random() - 0.5) * 3,
                        velocityY: (Math.random() - 0.5) * 3,
                        size: Math.random() * 5 + 2,
                        lifeSpan: Math.random() * 8 + 4,
                        color: '#FF0033'
                    });
                }
            } else {
                if (Math.random() < 0.55) {
                    greyAfterimages.push({
                        x: enemy.x,
                        y: enemy.y,
                        size: enemy.size,
                        opacity: 0.65,
                        spritePath: enemy.customSprite
                    });
                }
                if (Math.random() < 0.65) {
                    particles.push({
                        x: enemy.x + Math.random() * enemy.size,
                        y: enemy.y + Math.random() * enemy.size,
                        velocityX: (Math.random() - 0.5) * 2,
                        velocityY: (Math.random() - 0.5) * 2,
                        size: Math.random() * 4 + 2,
                        lifeSpan: Math.random() * 9 + 4,
                        color: 'rgba(255, 140, 0, 0.6)'
                    });
                }
            }

            // Accurate Center-to-Center Distance Calculation (Player Center vs Enemy Center)
            const pCenterX = player.x + 45;
            const pCenterY = player.y + 45;
            const eCenterX = enemy.x + enemy.size / 2;
            const eCenterY = enemy.y + enemy.size / 2;
            const distToPlayer = Math.hypot(pCenterX - eCenterX, pCenterY - eCenterY);

            // Explode immediately when approaching within 80px!
            if (distToPlayer < 80) {
                triggerExplosion(eCenterX, eCenterY);
                applyPlayerDamage(isRed ? 28 : 24, isRed ? "Red Exploder (Exploded)" : "Grey Exploder (Exploded)");
                enemy.hp = 0;
            }
        }

        if (enemy.hp <= 0) {
            if (enemy.bodyType === 'kamikaze_exploder' || enemy.bodyType === 'red_kamikaze_exploder') {
                triggerExplosion(enemy.x + enemy.size / 2, enemy.y + enemy.size / 2);
            }
            if (enemy.killedByPlayer) {
                const reward = enemy.xpReward || 20;
                totalKills++;
                gainXP(reward);
            }
            enemies.splice(index, 1);
            spawnEnemy();
        } else {
            if (enemy.isDashing) {
                // Execute Burst Dash Surge Movement & Collision
                enemy.dashTimer -= (deltaTime || 16);
                enemy.x += enemy.dashVectorX;
                enemy.y += enemy.dashVectorY;

                // Spawn Dash Spark Trail Particles
                if (Math.random() < 0.6) {
                    particles.push({
                        x: enemy.x + Math.random() * enemy.size,
                        y: enemy.y + Math.random() * enemy.size,
                        velocityX: (Math.random() - 0.5) * 3,
                        velocityY: (Math.random() - 0.5) * 3,
                        size: Math.random() * 5 + 3,
                        lifeSpan: Math.random() * 8 + 4,
                        color: '#FF3300'
                    });
                }

                // Check Melee Attack Hitbox Collision with Player
                const distToPlayer = Math.hypot(player.x - (enemy.x + enemy.size / 2), player.y - (enemy.y + enemy.size / 2));
                if (distToPlayer < (enemy.size / 2 + player.size / 2)) {
                    const eName = getEnemyEnglishName(enemy.bodyType);
                    applyPlayerDamage(12, `${eName} (Melee Strike)`); // Melee Smash Damage
                    enemy.isDashing = false;
                    enemy.timeUntilNextAttack = enemy.attackCooldown;
                }

                if (enemy.dashTimer <= 0) {
                    enemy.isDashing = false;
                    enemy.timeUntilNextAttack = enemy.attackCooldown;
                }
            } else {
                // Intelligent Lead Pursuit & Surrounding Flank AI (Intercept & Surround Player)
                let pVelX = 0;
                let pVelY = 0;
                if (keys['w'] || keys['W']) pVelY -= player.speed;
                if (keys['s'] || keys['S']) pVelY += player.speed;
                if (keys['a'] || keys['A']) pVelX -= player.speed;
                if (keys['d'] || keys['D']) pVelX += player.speed;

                // Predictive Lead Position (Intercept player's moving path)
                const leadFactor = 16;
                const targetX = player.x + pVelX * leadFactor;
                const targetY = player.y + pVelY * leadFactor;

                // Assign unique flanking offset per enemy to surround player from sides
                if (enemy.flankAngle === undefined) {
                    enemy.flankAngle = (Math.random() - 0.5) * 0.85; // Flanking angle offset
                }

                const baseAngle = Math.atan2(targetY - enemy.y, targetX - enemy.x);
                const finalAngle = baseAngle + enemy.flankAngle;

                let curSpeed = enemy.speed;

                // Humanoid Reload Phase: 2x Extended Reload + Crimson Red Afterimage Rush Sprint!
                const isHumanoidReloading = (enemy.bodyType === 'machinegun_humanoid' || enemy.bodyType === 'assault_humanoid') && (enemy.timeUntilNextAttack > 0);
                if (isHumanoidReloading) {
                    curSpeed *= 1.85; // 1.85x High Speed Rush Sprint!
                    if (Math.random() < 0.65) {
                        particles.push({
                            x: enemy.x + enemy.size / 2 + (Math.random() - 0.5) * enemy.size * 0.4,
                            y: enemy.y + enemy.size / 2 + (Math.random() - 0.5) * enemy.size * 0.4,
                            velocityX: (Math.random() - 0.5) * 1.5,
                            velocityY: (Math.random() - 0.5) * 1.5,
                            size: Math.random() * 6 + 3.5,
                            lifeSpan: 16,
                            color: '#FF1133' // Crimson Red Afterimage!
                        });
                    }
                }

                if (enemy.yellowSlowTimer > 0) {
                    enemy.yellowSlowTimer -= (deltaTime || 16);
                    curSpeed *= 0.5; // 50% Slow Down when touched by Yellow Trail!
                }

                let moveX = Math.cos(finalAngle) * curSpeed;
                let moveY = Math.sin(finalAngle) * curSpeed;

                // LaserEye Movement Logic: Rush towards player when NOT firing, Freeze position during firing!
                if (enemy.bodyType === 'laser_eye') {
                    if (enemy.timeUntilNextAttack <= 0) {
                        enemy.isFiringLaser = true;
                        enemy.laserTimer = 3200; // 1.2s charge + 2.0s continuous beam fire!
                        enemy.timeUntilNextAttack = enemy.attackCooldown || 3000;
                    }

                    if (enemy.isFiringLaser) {
                        enemy.laserTimer -= (deltaTime || 16);
                        if (enemy.laserTimer <= 0) {
                            enemy.isFiringLaser = false;
                        }

                        const eCenterX = enemy.x + enemy.size / 2;
                        const eCenterY = enemy.y + enemy.size / 2;
                        const pCenterX = player.x + 45;
                        const pCenterY = player.y + 45;
                        const distToPlayer = Math.hypot(pCenterX - eCenterX, pCenterY - eCenterY);
                        const rushAngle = Math.atan2(pCenterY - eCenterY, pCenterX - eCenterX);

                        const isWarningPhase = enemy.laserTimer > 2000; // First 1.2s is warning/charge phase

                        if (isWarningPhase) {
                            // Warning phase: Approach player center ONLY IF distance > 220px with speed 2.0 (200 speed!)
                            if (distToPlayer > 220) {
                                moveX = Math.cos(rushAngle) * 2.0;
                                moveY = Math.sin(rushAngle) * 2.0;
                            } else {
                                moveX = 0;
                                moveY = 0;
                            }
                        } else {
                            // Actual Beam Firing phase (2.0s): Freeze position completely!
                            moveX = 0;
                            moveY = 0;
                        }
                    } else {
                        // When NOT firing/warning: Rush directly towards player center!
                        const eCenterX = enemy.x + enemy.size / 2;
                        const eCenterY = enemy.y + enemy.size / 2;
                        const pCenterX = player.x + 45;
                        const pCenterY = player.y + 45;
                        const rushAngle = Math.atan2(pCenterY - eCenterY, pCenterX - eCenterX);

                        moveX = Math.cos(rushAngle) * (enemy.speed * 1.25);
                        moveY = Math.sin(rushAngle) * (enemy.speed * 1.25);
                    }
                }

                // Cannon Laser Head AI: Target alignment + 0.6s HOLD before firing straight Hot Pink pulse beam!
                if (enemy.bodyType === 'cannon_laser_head') {
                    if (enemy.timeUntilNextAttack <= 0) {
                        enemy.isFiringCannonLaser = true;
                        enemy.cannonLaserTimer = 2600; // 1.2s track + 0.6s hold + 0.8s burst beam!
                        enemy.timeUntilNextAttack = enemy.attackCooldown || 3800;
                    }

                    if (enemy.isFiringCannonLaser) {
                        enemy.cannonLaserTimer -= (deltaTime || 16);
                        if (enemy.cannonLaserTimer <= 0) {
                            enemy.isFiringCannonLaser = false;
                        }

                        const eCenterX = enemy.x + enemy.size / 2;
                        const eCenterY = enemy.y + enemy.size / 2;
                        const pCenterX = player.x + 45;
                        const pCenterY = player.y + 45;
                        const angleToPlayer = Math.atan2(pCenterY - eCenterY, pCenterX - eCenterX);

                        const elapsed = 2600 - enemy.cannonLaserTimer;
                        if (elapsed < 1200) {
                            // Phase 1 (0 ~ 1.2s): Track aim angle towards player!
                            enemy.cannonAimAngle = angleToPlayer;
                            moveX = Math.cos(angleToPlayer) * curSpeed * 0.4;
                            moveY = Math.sin(angleToPlayer) * curSpeed * 0.4;
                        } else if (elapsed < 1800) {
                            // Phase 2 (1.2s ~ 1.8s, 0.6s Thin Pink Line): Soft tracking towards player!
                            let diff = angleToPlayer - enemy.cannonAimAngle;
                            while (diff < -Math.PI) diff += Math.PI * 2;
                            while (diff > Math.PI) diff -= Math.PI * 2;
                            enemy.cannonAimAngle += diff * 0.025; // Smooth soft tracking during thin pink line!

                            moveX = 0;
                            moveY = 0;
                        } else {
                            // Phase 3 (1.8s ~ 2.6s, 0.8s Burst Fire): Freeze position while firing straight beam!
                            moveX = 0;
                            moveY = 0;
                        }
                    }
                }

                // Green Laser Eye AI: 1.0s warning + 4.5s Long Duration Continuous Low Damage Beam!
                if (enemy.bodyType === 'green_laser_eye') {
                    if (enemy.timeUntilNextAttack <= 0) {
                        enemy.isFiringGreenLaser = true;
                        enemy.greenLaserTimer = 5500; // 1.0s warning + 4.5s long continuous beam!
                        enemy.timeUntilNextAttack = enemy.attackCooldown || 5500;
                    }

                    if (enemy.isFiringGreenLaser) {
                        enemy.greenLaserTimer -= (deltaTime || 16);
                        if (enemy.greenLaserTimer <= 0) {
                            enemy.isFiringGreenLaser = false;
                        }

                        const eCenterX = enemy.x + enemy.size / 2;
                        const eCenterY = enemy.y + enemy.size / 2;
                        const pCenterX = player.x + 45;
                        const pCenterY = player.y + 45;
                        const distToPlayer = Math.hypot(pCenterX - eCenterX, pCenterY - eCenterY);
                        const rushAngle = Math.atan2(pCenterY - eCenterY, pCenterX - eCenterX);

                        const isWarningPhase = enemy.greenLaserTimer > 4500; // First 1.0s warning phase

                        if (isWarningPhase) {
                            if (distToPlayer > 200) {
                                moveX = Math.cos(rushAngle) * 1.8;
                                moveY = Math.sin(rushAngle) * 1.8;
                            } else {
                                moveX = 0;
                                moveY = 0;
                            }
                        } else {
                            // Long 4.5s Firing Phase: Slow movement while sweeping beam!
                            moveX = Math.cos(rushAngle) * 0.5;
                            moveY = Math.sin(rushAngle) * 0.5;
                        }
                    }
                }

                // Separation Steering Force: Push away nearby enemies to prevent central clustering
                for (let j = 0; j < enemies.length; j++) {
                    if (index === j) continue;
                    const other = enemies[j];
                    const dx = enemy.x - other.x;
                    const dy = enemy.y - other.y;
                    const dist = Math.hypot(dx, dy);
                    const minDist = (enemy.size + other.size) * 0.45;

                    if (dist < minDist && dist > 0) {
                        const push = (minDist - dist) * 0.12;
                        moveX += (dx / dist) * push;
                        moveY += (dy / dist) * push;
                    }
                }

                // Humanoid Dodge Reaction Counter-Rush Movement Override: High Speed Straight Rush Ignoring Walls!
                if (enemy.dodgeRushTimer > 0) {
                    enemy.dodgeRushTimer -= (deltaTime || 16);
                    moveX = enemy.dodgeRushVecX || 0;
                    moveY = enemy.dodgeRushVecY || 0;

                    // Spawn Linear Fading Red Rectangular Trail Particles along straight dash line!
                    if (Math.random() < 0.85) {
                        particles.push({
                            x: enemy.x + enemy.size / 2,
                            y: enemy.y + enemy.size / 2,
                            width: enemy.size * 1.6,  // Moderately shortened trail length (70-75px)
                            height: enemy.size * 0.35, // Slender compact width (smaller size)
                            angle: enemy.dodgeRushAngle || 0,
                            lifeSpan: 18,
                            maxLifeSpan: 18,
                            isRedFadingRectTrail: true,
                            color: '#FF1133'
                        });
                    }
                }

                // Check ghost passability: Kamikaze exploders, split mutants, & dodge rushing humanoids can pass walls freely!
                const isGhostPassable = (enemy.type === 'split_mutant' || enemy.bodyType === 'split_mutant' || enemy.bodyType === 'kamikaze_exploder' || enemy.bodyType === 'red_kamikaze_exploder' || (enemy.dodgeRushTimer > 0));
                if (!isGhostPassable) {
                    const nextEx = enemy.x + moveX;
                    const nextEy = enemy.y + moveY;
                    if (!isCollidingWithWalls(nextEx, enemy.y, enemy.size)) {
                        enemy.x = nextEx;
                    }
                    if (!isCollidingWithWalls(enemy.x, nextEy, enemy.size)) {
                        enemy.y = nextEy;
                    }
                } else {
                    enemy.x += moveX;
                    enemy.y += moveY;
                }
            }
        }
    }

    // Safety Auto-Respawn: Ensure field active enemies count safely refilled frame-by-frame (Only during active gameStarted phase!)
    const targetMonsterCount = 6;
    if (gameState === 'gameStarted' && enemies.length < targetMonsterCount) {
        spawnEnemy();
    }
}


function distToSegment(p, v, w) {
    const l2 = (w.x - v.x) ** 2 + (w.y - v.y) ** 2;
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

function renderMutantEnemySprite(enemy, sourceX, sy, spriteWidth, spriteHeight) {
    const eX = enemy.x;
    const eY = enemy.y;
    const eSize = enemy.size;
    const pCenterX = player ? player.x + 45 : 0;
    const pCenterY = player ? player.y + 45 : 0;

    if (enemy.bodyType === 'red_kamikaze_exploder' && enemy.customSprite) {
        const cImg = getCachedImage(enemy.customSprite);
        if (cImg && cImg.complete && cImg.naturalWidth !== 0) {
            const halfW = cImg.naturalWidth / 2;
            const halfH = cImg.naturalHeight / 2;
            const drawHalf = eSize / 2;

            // Jitter shake vibration offset per frame
            const jx = (Math.random() - 0.5) * 4.5;
            const jy = (Math.random() - 0.5) * 4.5;
            // Overlapping inset offset (12% overlapping inward!)
            const overlap = drawHalf * 0.15;

            // Quadrant 1: Top-Left (Shifted slightly inward right-down)
            ctx.drawImage(cImg, 0, 0, halfW, halfH, eX + jx + overlap * 0.5, eY + jy + overlap * 0.5, drawHalf, drawHalf);
            // Quadrant 2: Top-Right (Shifted slightly inward left-down)
            ctx.drawImage(cImg, halfW, 0, halfW, halfH, eX + drawHalf + jx - overlap * 0.5, eY + jy + overlap * 0.5, drawHalf, drawHalf);
            // Quadrant 3: Bottom-Left (Shifted slightly inward right-up)
            ctx.drawImage(cImg, 0, halfH, halfW, halfH, eX + jx + overlap * 0.5, eY + drawHalf + jy - overlap * 0.5, drawHalf, drawHalf);
            // Quadrant 4: Bottom-Right (Shifted slightly inward left-up)
            ctx.drawImage(cImg, halfW, halfH, halfW, halfH, eX + drawHalf + jx - overlap * 0.5, eY + drawHalf + jy - overlap * 0.5, drawHalf, drawHalf);
            return;
        }
    }



    if ((enemy.bodyType === 'laser_eye' || enemy.bodyType === 'cannon_laser_head' || enemy.bodyType === 'green_laser_eye') && enemy.customSprite) {
        const cImg = getCachedImage(enemy.customSprite);
        if (cImg && cImg.complete && cImg.naturalWidth !== 0) {
            const eCenterX = eX + eSize / 2;
            const eCenterY = eY + eSize / 2;
            const pCenterX = player.x + 45;
            const pCenterY = player.y + 45;

            // Angle towards player center
            const angleToPlayer = Math.atan2(pCenterY - eCenterY, pCenterX - eCenterX);
            // Rotate so that the BOTTOM side of the sprite image ALWAYS faces the player! (+90 deg = +Math.PI/2)
            const drawAngle = angleToPlayer - Math.PI / 2;

            ctx.save();
            ctx.translate(eCenterX, eCenterY);
            ctx.rotate(drawAngle);
            ctx.drawImage(cImg, -eSize / 2, -eSize / 2, eSize, eSize);
            ctx.restore();

            // Render Continuous Laser Beam if active
            if (enemy.isFiringLaser) {
                const laserProgress = (3200 - enemy.laserTimer);
                ctx.save();
                ctx.filter = 'none'; // Clear monster colorFilter so beam & warning line render in 100% PURE un-distorted colors!

                if (laserProgress < 1200) {
                    // Charge phase (1.2s): Track for first 0.8s, then HOLD aim angle fixed for last 0.4s right before firing!
                    if (laserProgress < 800) {
                        enemy.currentBeamAngle = angleToPlayer; // Continuous track for 0.8s!
                    }
                    // 800ms ~ 1200ms (0.4s hold): Aim angle fixed so player can evade!

                    const progressRatio = Math.min(1, laserProgress / 1200); // 0.0 -> 1.0 fade in
                    const warningAngle = enemy.currentBeamAngle || angleToPlayer;

                    ctx.shadowBlur = 0; // 100% NO GLOW!
                    ctx.shadowColor = 'transparent';
                    ctx.strokeStyle = `rgba(0, 229, 255, ${progressRatio * 0.95})`; // Pure Electric Cyan Blue!
                    ctx.lineWidth = 3;
                    ctx.setLineDash([10, 5]);
                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(eCenterX + Math.cos(warningAngle) * 5000, eCenterY + Math.sin(warningAngle) * 5000); // Infinite Range!
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset line dash!
                } else {
                    // Firing phase (2.0s): Electric Blue Glowing Beam (#00E5FF)
                    if (!isPaused && !levelUpState) {
                        let diff = angleToPlayer - enemy.currentBeamAngle;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        enemy.currentBeamAngle += diff * 0.03; // 0.03 tracking speed!
                    }

                    const fireAngle = enemy.currentBeamAngle;
                    const beamEndX = eCenterX + Math.cos(fireAngle) * 5000; // Infinite Range!
                    const beamEndY = eCenterY + Math.sin(fireAngle) * 5000;

                    const remainingMs = enemy.laserTimer; // 0 ~ 2000ms
                    const fadeRatio = Math.min(1, Math.max(0, remainingMs / 420)); // Fade out in last 420ms

                    // Electric Blue Color (#00E5FF)
                    const beamColor = `rgba(0, 229, 255, ${fadeRatio * 0.95})`;
                    const glowColor = '#00BFFF';

                    // Slim Crisp Electric Blue Glowing Beam Line
                    ctx.shadowColor = glowColor;
                    ctx.shadowBlur = 16 * fadeRatio;
                    ctx.strokeStyle = beamColor;
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(beamEndX, beamEndY);
                    ctx.stroke();

                    // Non-Instant Kill: Continuous Tick Damage (4 DMG per tick)
                    const pRadius = 24;
                    const distToBeam = distToSegment({ x: pCenterX, y: pCenterY }, { x: eCenterX, y: eCenterY }, { x: beamEndX, y: beamEndY });
                    if (distToBeam < pRadius) {
                        applyPlayerDamage(4, "Laser Eye (Beam Sweep)");
                    }
                }
                ctx.restore();
            }

            // Render Continuous Cannon Laser Beam if active for cannon_laser_head
            if (enemy.bodyType === 'cannon_laser_head' && enemy.isFiringCannonLaser) {
                const elapsed = (2600 - enemy.cannonLaserTimer);
                const fireAngle = enemy.cannonAimAngle || angleToPlayer;
                ctx.save();
                ctx.filter = 'none'; // Ensure 100% PURE un-distorted Pink Laser colors!

                if (elapsed < 1800) {
                    // Phase 1 & 2 (0 ~ 1.8s): Warning Target Alignment (1.2s) & 0.6s Fixed Hold!
                    const isHoldPhase = (elapsed >= 1200);
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'transparent';
                    ctx.strokeStyle = isHoldPhase ? 'rgba(255, 20, 147, 0.95)' : 'rgba(255, 105, 180, 0.7)';
                    ctx.lineWidth = isHoldPhase ? 5 : 2;
                    if (!isHoldPhase) ctx.setLineDash([8, 4]);

                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(eCenterX + Math.cos(fireAngle) * 5000, eCenterY + Math.sin(fireAngle) * 5000);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else {
                    // Phase 3 (1.8s ~ 2.6s): Hot Pink Cannon Pulse Beam (Thin -> Super Massive 110px -> Fade Dissolve)!
                    const beamProgress = (elapsed - 1800) / 800; // 0.0 -> 1.0
                    
                    // Ultra Fast Expansion: 3px -> 110px within first 10% progress!
                    let beamWidth = 3;
                    if (beamProgress < 0.10) {
                        beamWidth = 3 + (110 - 3) * (beamProgress / 0.10); // Instant 110px Boom!
                    } else {
                        beamWidth = 110 * (1 - (beamProgress - 0.10) / 0.90); // Smooth dissolve
                    }

                    const alpha = Math.max(0, 1.0 - beamProgress); // Smooth dissolve alpha
                    const beamEndX = eCenterX + Math.cos(fireAngle) * 5000;
                    const beamEndY = eCenterY + Math.sin(fireAngle) * 5000;

                    // Hot Pink Outer Glow & Beam Body
                    ctx.shadowColor = '#FF1493';
                    ctx.shadowBlur = 24 * alpha;

                    // Outer Hot Pink Glow Line
                    ctx.strokeStyle = `rgba(255, 20, 147, ${alpha * 0.9})`;
                    ctx.lineWidth = Math.max(1, beamWidth);
                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(beamEndX, beamEndY);
                    ctx.stroke();

                    // Inner Light Pink Core Line (Pure Pink Core!)
                    ctx.strokeStyle = `rgba(255, 228, 225, ${alpha * 0.95})`;
                    ctx.lineWidth = Math.max(1, beamWidth * 0.45);
                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(beamEndX, beamEndY);
                    ctx.stroke();

                    // Beam Hit Check on Player
                    const distToBeam = distToSegment({ x: pCenterX, y: pCenterY }, { x: eCenterX, y: eCenterY }, { x: beamEndX, y: beamEndY });
                    if (distToBeam < (beamWidth / 2 + 20)) {
                        applyPlayerDamage(10, "Cannon Laser Head (Pink Beam Blast)");
                    }
                }
                ctx.restore();
            }

            // Render Long Duration Continuous Green Laser Beam for green_laser_eye (4.5s long continuous fire, low tick damage)
            if (enemy.bodyType === 'green_laser_eye' && enemy.isFiringGreenLaser) {
                const laserProgress = (5500 - enemy.greenLaserTimer);
                ctx.save();
                ctx.filter = 'none'; // Ensure 100% PURE Lime Green colors!

                if (laserProgress < 1000) {
                    // Warning phase (1.0s): Track aim angle with sharp bright lime warning line!
                    enemy.currentBeamAngle = angleToPlayer;
                    enemy.hasOffsetStartAngle = false; // Reset flag for new attack
                    const progressRatio = Math.max(0.4, Math.min(1, laserProgress / 1000));

                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'transparent';
                    ctx.strokeStyle = `rgba(0, 255, 102, ${progressRatio * 0.95})`; // Electric Lime Green Warning Line
                    ctx.lineWidth = 4;
                    ctx.setLineDash([10, 5]);
                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(eCenterX + Math.cos(angleToPlayer) * 5000, eCenterY + Math.sin(angleToPlayer) * 5000);
                    ctx.stroke();
                    ctx.setLineDash([]);
                } else {
                    // Long Firing Phase (4.5s): Start beam slightly BEHIND the player angle so player can dodge!
                    if (!enemy.hasOffsetStartAngle) {
                        const offsetSide = (Math.random() < 0.5 ? 1 : -1);
                        enemy.currentBeamAngle = enemy.currentBeamAngle + offsetSide * (Math.PI * 0.35); // Start ~63 deg behind player!
                        enemy.hasOffsetStartAngle = true;
                    }

                    if (!isPaused && !levelUpState) {
                        let diff = angleToPlayer - enemy.currentBeamAngle;
                        while (diff < -Math.PI) diff += Math.PI * 2;
                        while (diff > Math.PI) diff -= Math.PI * 2;
                        enemy.currentBeamAngle += diff * 0.042; // Restored 0.042 tracking speed!
                    }

                    const fireAngle = enemy.currentBeamAngle;
                    const beamEndX = eCenterX + Math.cos(fireAngle) * 5000;
                    const beamEndY = eCenterY + Math.sin(fireAngle) * 5000;

                    const remainingMs = enemy.greenLaserTimer; // 0 ~ 4500ms
                    const fadeRatio = Math.min(1, Math.max(0, remainingMs / 500));

                    ctx.shadowColor = '#00FF66';
                    ctx.shadowBlur = 14 * fadeRatio;

                    // Lime Green Beam Outer Line
                    ctx.strokeStyle = `rgba(0, 255, 102, ${fadeRatio * 0.95})`;
                    ctx.lineWidth = 6;
                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(beamEndX, beamEndY);
                    ctx.stroke();

                    // Soft White-Green Core Line
                    ctx.strokeStyle = `rgba(230, 255, 235, ${fadeRatio * 0.95})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(eCenterX, eCenterY);
                    ctx.lineTo(beamEndX, beamEndY);
                    ctx.stroke();

                    // Continuous Super Low Tick Damage (1 DMG per 300ms - ultra heavily nerfed!)
                    const pRadius = 24;
                    const distToBeam = distToSegment({ x: pCenterX, y: pCenterY }, { x: eCenterX, y: eCenterY }, { x: beamEndX, y: beamEndY });
                    if (distToBeam < pRadius) {
                        const now = Date.now();
                        if (!enemy.lastGreenDamageTime || (now - enemy.lastGreenDamageTime) > 300) {
                            enemy.lastGreenDamageTime = now;
                            applyPlayerDamage(1, "Green Laser Eye (Continuous Beam Sweep)");
                        }
                    }
                }
                ctx.restore();
            }

            return;
        }
    }

    const validCustomSpriteTypes = ['kamikaze_exploder', 'red_kamikaze_exploder', 'laser_eye', 'cannon_laser_head', 'green_laser_eye', 'machinegun_humanoid', 'assault_humanoid'];
    if (enemy.customSprite && validCustomSpriteTypes.includes(enemy.bodyType)) {
        const cImg = getCachedImage(enemy.customSprite);
        if (cImg && cImg.complete && cImg.naturalWidth !== 0) {
            if (enemy.bodyType === 'machinegun_humanoid' || enemy.bodyType === 'assault_humanoid') {
                // RoBChar.png (514x514 per frame, 6 cols, 5 rows)
                const frameW = 514;
                const frameH = 514;
                const totalCols = 6;
                let row = 2; // Row 2 (y=1028): Move/Standard Animation

                if (enemy.dodgeRushTimer > 0) {
                    row = 0; // Row 1 (Index 0, y=0): High-Speed Dodge Counter Dash Motion!
                } else if (enemy.isShieldActive && enemy.shieldTimer > 0) {
                    row = 4; // Row 5 (Index 4, y=2056): Protective Shield Guard Motion on Hit!
                } else if (enemy.bodyType === 'machinegun_humanoid') {
                    // Row 4 (Index 3, y=1542): Attack ONLY during full active burst firing duration!
                    const totalFiringDuration = (enemy.lastBurstCount || 23) * 65 + 250;
                    const isFiringNow = enemy.lastAttackAnimTime && (Date.now() - enemy.lastAttackAnimTime < totalFiringDuration);
                    if (isFiringNow) {
                        row = 3;
                    }
                } else if (enemy.bodyType === 'assault_humanoid') {
                    // Row 5 (Index 4, y=2056): Attack while Moving
                    const isAssaultingRecently = enemy.lastAttackAnimTime && (Date.now() - enemy.lastAttackAnimTime < 1300);
                    if (isAssaultingRecently || enemy.timeUntilNextAttack > (enemy.dedicatedCooldown || 2600) - 1000) {
                        row = 4;
                    }
                }

                // Slower animation tempo for non-attack walking state (360ms per frame vs 110ms for attack)!
                const frameSpeed = (row === 3 || row === 4) ? 110 : 360;
                const animIndex = Math.floor(Date.now() / frameSpeed) % totalCols;

                const srcX = animIndex * frameW;
                const srcY = row * frameH;
                let drawFrameH = frameH;
                if (row === 4) {
                    drawFrameH = Math.floor(frameH * 0.85); // Slightly trim bottom height for Row 5 (Row index 4)!
                }

                ctx.drawImage(cImg, srcX, srcY, frameW, drawFrameH, eX, eY, eSize, eSize);
            } else if (enemy.bodyType === 'cannon_laser_head' || enemy.bodyType === 'laser_eye' || enemy.bodyType === 'green_laser_eye') {
                const pCenterX = player.x + 45;
                const pCenterY = player.y + 45;
                const angleToP = Math.atan2(pCenterY - (eY + eSize / 2), pCenterX - (eX + eSize / 2));
                const aimAngle = (enemy.bodyType === 'cannon_laser_head' && enemy.cannonAimAngle !== undefined) ? enemy.cannonAimAngle : (enemy.currentBeamAngle || angleToP);
                ctx.save();
                ctx.translate(eX + eSize / 2, eY + eSize / 2);
                ctx.rotate(aimAngle - Math.PI / 2); // Rotate sprite bottom side to face player directly!
                ctx.drawImage(cImg, -eSize / 2, -eSize / 2, eSize, eSize);
                ctx.restore();
            } else {
                ctx.drawImage(cImg, eX, eY, eSize, eSize);
            }

            // Protective Shield Guard Aura Circle Effect when hit during Reload Phase!
            if (enemy.isShieldActive && enemy.shieldTimer > 0) {
                const shieldAlpha = Math.max(0, Math.min(1.0, enemy.shieldTimer / 750));
                ctx.save();
                ctx.filter = 'none'; // Cancel monster hue-rotate(180deg) filter so barrier renders in pure true Crimson Red!
                ctx.strokeStyle = `rgba(255, 17, 51, ${shieldAlpha * 0.9})`; // Pure Crimson Red Shield Guard Line
                ctx.fillStyle = `rgba(255, 17, 51, ${shieldAlpha * 0.22})`;  // Semi-transparent Pure Red Barrier
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(eX + eSize / 2, eY + eSize / 2, eSize * 0.55, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                ctx.restore();
            }

            return;
        }
    }

    if (enemy.bodyType === 'giant_head') {
        // Giant Head Hunter (Top Head 1.8x Big, Bottom Body Compact)
        // Top 50% Head Slice (Scaled 1.8x)
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth, spriteHeight * 0.5, eX - eSize * 0.25, eY - eSize * 0.35, eSize * 1.5, eSize * 0.85);
        // Bottom 50% Body Slice (Compact)
        ctx.drawImage(basicenEmySprite, sourceX, sy + spriteHeight * 0.5, spriteWidth, spriteHeight * 0.5, eX + eSize * 0.15, eY + eSize * 0.5, eSize * 0.7, eSize * 0.5);
    } else if (enemy.bodyType === 'three_head') {
        // Main Center Body
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth, spriteHeight, eX, eY, eSize, eSize);

        let throwOffset = 0;
        if (enemy.isThrowing && enemy.throwAngle !== undefined) {
            const throwDuration = 600;
            enemy.throwTimer += 16;
            const progress = Math.sin(Math.min(1, enemy.throwTimer / throwDuration) * Math.PI);
            throwOffset = progress * 220; // 220px yo-yo throw distance

            if (enemy.throwTimer >= throwDuration) {
                enemy.isThrowing = false;
                enemy.throwTimer = 0;
            }
        }

        const headX = eX + Math.cos(enemy.throwAngle || 0) * throwOffset;
        const headY = eY + Math.sin(enemy.throwAngle || 0) * throwOffset;

        // Draw pixel chain tether line between body and thrown heads
        if (throwOffset > 10) {
            ctx.save();
            ctx.strokeStyle = '#FF0044';
            ctx.lineWidth = 3;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(eX + eSize / 2, eY + eSize / 2);
            ctx.lineTo(headX + eSize / 2, headY + eSize / 2);
            ctx.stroke();
            ctx.setLineDash([]); // Reset line dash immediately to prevent canvas state leaks!
            ctx.restore();

            // Melee Head Hit Check on Player
            const headDist = Math.hypot(player.x - (headX + eSize / 2), player.y - (headY + eSize / 2));
            if (headDist < (eSize / 2 + player.size / 2)) {
                if (grabHitFreezeTimer <= 0) {
                    grabHitFreezeTimer = 500; // Trigger 0.5s Screen-wide Entity Hit Freeze!
                }
                applyPlayerDamage(14);
            }
        }

        // Left Angled Extra Head (Yo-Yo Thrown Position)
        ctx.save();
        ctx.translate(headX - eSize * 0.25, headY - eSize * 0.15);
        ctx.rotate(-0.45);
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth, spriteHeight * 0.5, 0, 0, eSize * 0.7, eSize * 0.35);
        ctx.restore();

        // Right Angled Extra Head (Yo-Yo Thrown Position)
        ctx.save();
        ctx.translate(headX + eSize * 0.85, headY - eSize * 0.15);
        ctx.rotate(0.45);
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth, spriteHeight * 0.5, 0, 0, eSize * 0.7, eSize * 0.35);
        ctx.restore();
    } else if (enemy.bodyType === 'floating_hands' || enemy.bodyType === 'long_leg') {
        // Main Body (1:1 Exact Ratio)
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth, spriteHeight, eX, eY, eSize, eSize);
        // Floating Orbiting Side Claw/Hand 1
        const floatOrbit1 = Math.sin(performance.now() * 0.008) * 12;
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth * 0.5, spriteHeight * 0.5, eX - eSize * 0.45, eY + floatOrbit1, eSize * 0.45, eSize * 0.45);
        // Floating Orbiting Side Claw/Hand 2
        ctx.drawImage(basicenEmySprite, sourceX + spriteWidth * 0.5, sy, spriteWidth * 0.5, spriteHeight * 0.5, eX + eSize * 1.0, eY - floatOrbit1, eSize * 0.45, eSize * 0.45);
    } else if (enemy.bodyType === 'double_torso' || enemy.bodyType === 'wide_shoulder' || enemy.bodyType === 'wide_tank') {
        // Refined Heavy Torso Tanker (1:1 Exact Ratio, Wide Heavy Shoulder Armor Stack)
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth, spriteHeight * 0.5, eX - eSize * 0.2, eY - eSize * 0.25, eSize * 1.4, eSize * 0.7);
        ctx.drawImage(basicenEmySprite, sourceX, sy + spriteHeight * 0.5, spriteWidth, spriteHeight * 0.5, eX + eSize * 0.05, eY + eSize * 0.45, eSize * 0.9, eSize * 0.55);
    } else if (enemy.bodyType === 'split_mutant') {
        // Inner Overlap: pulse = -3 when combined (slightly overlapping inside), 36 when dashing
        let pulse = -3;
        if (enemy.isDashing) {
            pulse = 36; // Wide split separation while dashing!
        }

        // Source slice: "Bottom-Left" quadrant slice of original sprite
        const srcX = sourceX;
        const srcY = sy + spriteHeight * 0.5;
        const srcW = spriteWidth * 0.5;
        const srcH = spriteHeight * 0.5;
        const drawS = eSize / 2;

        const x1 = eX - pulse;
        const y1 = eY - pulse;
        const x2 = eX + drawS + pulse;
        const y2 = eY - pulse;
        const x3 = eX - pulse;
        const y3 = eY + drawS + pulse;
        const x4 = eX + drawS + pulse;
        const y4 = eY + drawS + pulse;

        // Post-Attack Glow Effect ONLY (Triggers right after dash strike/combine for 0.8s, colored by enemy tier)
        const isPostAttack = !enemy.isDashing && enemy.dashTimer <= 0 && (enemy.timeUntilNextAttack > (enemy.attackCooldown - 800));
        ctx.save();

        if (isPostAttack) {
            const glowColor = (enemy.tier === 4) ? '#FF0066' : (enemy.tier === 3) ? '#AA00FF' : (enemy.tier === 2) ? '#00FF66' : '#FF1100';
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 14;
        } else {
            ctx.shadowBlur = 0;
        }

        // Swapped Left Column <-> Right Column (Top-Left gets Pos 3, Top-Right gets Pos 4, Bottom-Left gets Pos 1, Bottom-Right gets Pos 2):
        // Top-Left (x1, y1) gets Pos 3 (flipped V)
        ctx.save();
        ctx.translate(x1, y1 + drawS);
        ctx.scale(1, -1);
        ctx.drawImage(basicenEmySprite, srcX, srcY, srcW, srcH, 0, 0, drawS, drawS);
        ctx.restore();

        // Top-Right (x2, y2) gets Pos 4 (flipped H & V)
        ctx.save();
        ctx.translate(x2 + drawS, y2 + drawS);
        ctx.scale(-1, -1);
        ctx.drawImage(basicenEmySprite, srcX, srcY, srcW, srcH, 0, 0, drawS, drawS);
        ctx.restore();

        // Bottom-Left (x3, y3) gets Pos 1 (Original Bottom-Left Slice)
        ctx.drawImage(basicenEmySprite, srcX, srcY, srcW, srcH, x3, y3, drawS, drawS);

        // Bottom-Right (x4, y4) gets Pos 2 (flipped H)
        ctx.save();
        ctx.translate(x4 + drawS, y4);
        ctx.scale(-1, 1);
        ctx.drawImage(basicenEmySprite, srcX, srcY, srcW, srcH, 0, 0, drawS, drawS);
        ctx.restore();

        ctx.restore(); // Restore post-attack glow state
    } else {
        // Standard Enemy Sprite (1:1 Ratio)
        ctx.drawImage(basicenEmySprite, sourceX, sy, spriteWidth, spriteHeight, eX, eY, eSize, eSize);
    }
}

function drawEnemies() {
    const now = Date.now();
    // Slower enemy animation speed (150ms per frame to eliminate lag)
    const enemyAnimFrame = Math.floor(now / 150) % numberOfFrames;
    const spriteWidth = basicenEmySprite.width / numberOfFrames; 
    const spriteHeight = basicenEmySprite.height / numberOfFrames; 
    const sourceX = enemyAnimFrame * spriteWidth;

    const margin = 150;
    const viewLeft = camera.x - margin;
    const viewRight = camera.x + canvas.width + margin;
    const viewTop = camera.y - margin;
    const viewBottom = camera.y + canvas.height + margin;

    enemies.forEach(enemy => {   
        // Viewport Culling: Skip rendering enemies completely outside screen view for zero lag (EXCEPT Laser enemies like green_laser_eye!)
        if (enemy.bodyType !== 'green_laser_eye' && enemy.bodyType !== 'cannon_laser_head' && enemy.bodyType !== 'laser_eye') {
            if (enemy.x + enemy.size < viewLeft || enemy.x > viewRight ||
                enemy.y + enemy.size < viewTop || enemy.y > viewBottom) {
                return;
            }
        }

        const alpha = (enemy.fadeAlpha !== undefined) ? enemy.fadeAlpha : 1.0;
        if (alpha <= 0.05) return;

        ctx.save();
        ctx.globalAlpha = alpha;

        const hpBarColor = (enemy.tier === 4) ? '#FF1493' : (enemy.tier === 3) ? '#9400D3' : (enemy.tier === 2) ? '#00FF7F' : 'red';
        drawHpBar(enemy.x, enemy.y - 12, enemy.size, 5, enemy.hp / enemy.maxHp, hpBarColor);

        if (enemy.colorFilter && enemy.colorFilter !== 'none') {
            ctx.filter = enemy.colorFilter;
        }

        // Apply Horizontal Facing Flip safely inside isolated drawEnemies loop! (RoBChar sprite default facing is opposite!)
        const pCenterX = player.x + 45;
        const eCenterX = enemy.x + enemy.size / 2;
        const isHumanoid = (enemy.bodyType === 'machinegun_humanoid' || enemy.bodyType === 'assault_humanoid');
        const shouldFlip = isHumanoid ? (pCenterX > eCenterX) : (pCenterX < eCenterX);

        if (shouldFlip && enemy.bodyType !== 'laser_eye' && enemy.bodyType !== 'cannon_laser_head' && enemy.bodyType !== 'green_laser_eye') {
            ctx.translate(eCenterX, enemy.y + enemy.size / 2);
            ctx.scale(-1, 1);
            ctx.translate(-eCenterX, -(enemy.y + enemy.size / 2));
        }

        if (enemy.justHit) {
            const timeSinceHit = performance.now() - enemy.hitTime;
            if (timeSinceHit < 100) {
                ctx.filter = 'brightness(1000%)';
                renderMutantEnemySprite(enemy, sourceX, 1024, spriteWidth, spriteHeight);

                if (enemy.tier < 3) {
                    if (player.lookingRight) {
                        enemy.x += player.currentWeapon.knocBack;
                    } else {
                        enemy.x -= player.currentWeapon.knocBack;
                    }
                }
            } else {
                enemy.justHit = false;
                renderMutantEnemySprite(enemy, sourceX, 0, spriteWidth, spriteHeight);
            }
        } else {
            renderMutantEnemySprite(enemy, sourceX, 0, spriteWidth, spriteHeight);
        }

        ctx.restore(); // 100% SAFE RESTORE FOR EVERY ENEMY!
    });
}

function drawHpBar(x, y, width, height, fraction, colorOfHP) {
    ctx.save();
    ctx.setLineDash([]);
    ctx.shadowBlur = 0;
    ctx.filter = 'none';

    const safeFraction = Math.max(0, Math.min(1, fraction || 0));
    const borderWidth = 2; // Thickness of the border

    // Draw the border
    ctx.fillStyle = 'black';
    ctx.fillRect(x - borderWidth, y - borderWidth, width + borderWidth * 2, height + borderWidth * 2);

    ctx.fillStyle = 'gray';
    ctx.fillRect(x, y, width, height);
    ctx.fillStyle = colorOfHP;
    ctx.fillRect(x, y, width * safeFraction, height);

    ctx.restore();
}



function handleCollisions() {
    // 1. Player Bullets vs Walls -> Create Bullet Hole Decal on Wall Front (Random Y)
    for (let bIndex = playerBullets.length - 1; bIndex >= 0; bIndex--) {
        const bullet = playerBullets[bIndex];
        if (!bullet) continue;
        const bSz = bullet.size || 6;
        for (let wIndex = 0; wIndex < walls.length; wIndex++) {
            const wall = walls[wIndex];
            if (bullet.x - bSz < wall.x + wall.width &&
                bullet.x + bSz > wall.x &&
                bullet.y - bSz < wall.y + wall.height &&
                bullet.y + bSz > wall.y) {
                createBulletDecal(bullet.x, bullet.y, wall);
                playerBullets.splice(bIndex, 1);
                break;
            }
        }
    }

    // 2. Enemy Bullets vs Walls -> Destroy Bullet
    for (let ebIndex = enemyBullets.length - 1; ebIndex >= 0; ebIndex--) {
        const eb = enemyBullets[ebIndex];
        if (!eb) continue;
        const ebSz = eb.size || 6;
        for (let wIndex = 0; wIndex < walls.length; wIndex++) {
            const wall = walls[wIndex];
            if (eb.x - ebSz < wall.x + wall.width &&
                eb.x + ebSz > wall.x &&
                eb.y - ebSz < wall.y + wall.height &&
                eb.y + ebSz > wall.y) {
                enemyBullets.splice(ebIndex, 1);
                break;
            }
        }
    }

    // 3. Fast Cluster-Merged Player Bullets vs Enemies Collision
    // Merges bullets closer than 18px into a single big bounding box collider for fast calculation while keeping individual visual drawing!
    for (let bIndex = playerBullets.length - 1; bIndex >= 0; bIndex--) {
        const bullet = playerBullets[bIndex];
        if (!bullet) continue;
        const bSize = bullet.size || 7;

        // Group sibling bullets closer than 18px into single merged cluster box
        const clusterIndices = [bIndex];
        let minX = bullet.x - bSize, maxX = bullet.x + bSize;
        let minY = bullet.y - bSize, maxY = bullet.y + bSize;

        for (let nextIdx = bIndex - 1; nextIdx >= 0; nextIdx--) {
            const sibling = playerBullets[nextIdx];
            if (!sibling) continue;
            const dist = Math.hypot(bullet.x - sibling.x, bullet.y - sibling.y);
            if (dist < 18) {
                clusterIndices.push(nextIdx);
                const sSz = sibling.size || 7;
                minX = Math.min(minX, sibling.x - sSz);
                maxX = Math.max(maxX, sibling.x + sSz);
                minY = Math.min(minY, sibling.y - sSz);
                maxY = Math.max(maxY, sibling.y + sSz);
            }
        }

        // Test Single Merged Cluster Box against enemies
        for (let eIndex = enemies.length - 1; eIndex >= 0; eIndex--) {
            const enemy = enemies[eIndex];
            if (!enemy) continue;

            if (maxX > enemy.x && minX < enemy.x + enemy.size &&
                maxY > enemy.y && minY < enemy.y + enemy.size) {

                // Apply hits for all bullets in this cluster!
                const count = clusterIndices.length;
                clusterIndices.sort((a, b) => b - a).forEach(idx => {
                    if (playerBullets[idx]) {
                        playerBullets.splice(idx, 1);
                    }
                });

                enemy.justHit = true;
                enemy.killedByPlayer = true;
                let hitDmg = (player.attackDamage + Math.floor(Math.random() * (player.currentWeapon.additionalDamage || 5))) * count;

                // Humanoid Shield Block: Activate Row 2 Shield Guard when hit ONLY during Reload Phase (NOT during Firing!)
                if (enemy.bodyType === 'machinegun_humanoid' || enemy.bodyType === 'assault_humanoid') {
                    const totalFiringDuration = (enemy.lastBurstCount || 23) * 65 + 250;
                    const isFiringNow = enemy.lastAttackAnimTime && (Date.now() - enemy.lastAttackAnimTime < totalFiringDuration);
                    if (enemy.timeUntilNextAttack > 0 && !isFiringNow) {
                        enemy.isShieldActive = true;
                        enemy.shieldTimer = 750; // 750ms Protective Guard Posture!
                        hitDmg *= 0.30; // Softened 70% Damage Reduction Block! (Takes 30% damage)
                    }
                }

                enemy.takenDamage = hitDmg;
                enemy.hp -= hitDmg;
                if (enemy.isShieldActive) {
                    enemy.hitTime = 0; // Completely suppress white hit flash when shield is active!
                } else {
                    enemy.hitTime = performance.now();
                }
                break;
            }
        }
    }

    enemyBullets.forEach((bullet, bulletIndex) => {
        if (bullet.x < PlayercollisionX + PlayercollisionSize &&
            bullet.x + bullet.size > PlayercollisionX &&
            bullet.y < PlayercollisionY + PlayercollisionSize &&
            bullet.y + bullet.size > PlayercollisionY) {
            enemyBullets.splice(bulletIndex, 1);

            if (!player.isDodging) {
                applyPlayerDamage(10, "Laser Mutant (Shot Down)");
            }

            if (player.hp <= 0) {
                gameOver();
            }
        }
 
    });
}


let personalBest = {
    highKills: 0,
    highSurvivedTime: 0,
    highLevel: 1,
    lastDeathReason: "None"
};

function loadHighScore() {
    try {
        const saved = localStorage.getItem('game_high_score');
        if (saved) {
            personalBest = JSON.parse(saved);
        }
    } catch (e) {}
}
loadHighScore();

function gameOver(reason = "Slain in Battle") {
    if (player.isDead) return;
    player.isDead = true;
    player.hp = 0;
    player.killedBy = reason;
    player.deathTime = Date.now(); // Freeze exact death time!

    const survivedSec = Math.floor((player.deathTime - gameStartTime) / 1000);

    if (totalKills > (personalBest.highKills || 0)) {
        personalBest.highKills = totalKills;
    }
    if (survivedSec > (personalBest.highSurvivedTime || 0)) {
        personalBest.highSurvivedTime = survivedSec;
    }
    if ((player.level || 1) > (personalBest.highLevel || 1)) {
        personalBest.highLevel = player.level;
    }

    personalBest.lastDeathReason = reason;
    personalBest.updatedAt = new Date().toISOString();

    try {
        localStorage.setItem('game_high_score', JSON.stringify(personalBest));
    } catch (e) {}
}

function resetGame() {
    // Player Stats & Position Full Reset
    player.maxHp = 100;
    player.hp = 100;
    player.level = 1;
    player.xp = 0;
    player.exp = 0;
    player.xpToNextLevel = 75;
    player.expToNextLevel = 75;
    player.speed = 4.2;
    player.attackDamage = 10;
    player.fireRateMultiplier = 1.0;
    player.currentWeapon = weapons.pistol;
    player.isDead = false;
    player.isDodging = false;
    player.dodgeCharges = player.maxDodgeCharges || 2;
    player.lastDodgeTime = 0;
    
    // Upgrades & Buffs Full Reset
    player.bonusDamage = 0;
    player.damageMultiplier = 1.0;
    player.redBoxLevel = 0;
    player.cyanShieldLevel = 0;
    player.blueShieldLevel = 0;
    player.pistolSpecLevel = 0;
    player.pistolFirstChoiceChecked = false;
    player.hasCyanTrail = false;
    player.pistolSpecialist = false;
    blueBuffTimer = 0;
    
    // Shield & Timers Full Reset
    maxShieldHp = 2;
    playerShieldHp = 0;
    shieldTimer = 0;
    isOvertimeShield = false;
    shieldRechargeTimer = maxShieldRechargeTimer;
    grabHitFreezeTimer = 0;
    dodgeBarAlpha = 0;
    
    // Entities & Session States 100% Complete Wipe
    enemies.splice(0, enemies.length);
    enemyBullets.splice(0, enemyBullets.length);
    playerBullets.splice(0, playerBullets.length);
    blueAfterimages.splice(0, blueAfterimages.length);
    particles.splice(0, particles.length);
    blueShieldBoxes.splice(0, blueShieldBoxes.length);
    walls = [];
    wallEvents = [];
    triggerWallReorganization();
    totalKills = 0;
    gameStartTime = Date.now();
    levelUpState = false;
    isPaused = false;
    
    for (let k in keys) { keys[k] = false; }
    
    player.x = gameWorld.width / 2;
    player.y = gameWorld.height / 2;
    
    // Spawn 5 fresh new Tier 1 enemies far outside screen
    for (let i = 0; i < 5; i++) {
        spawnEnemy();
    }
}

function calculateExpToNextLevel(level) {
    return Math.floor(100 * Math.pow(1.5, level - 1)); // Example formula
}
/*
function increaseStat(stat) {
    switch (stat) {
        case 'maxHP':
            player.maxHp += 20; // Adjust value as needed
            break;
        case 'maxAmmo':
            player.maxAmmo += 5; // Adjust value as needed
            break;
        case 'reloadingCooldown':
            player.maxReloadingCooldown -= 200; // Adjust value as needed, making sure it doesn't become too low
            break;
        case 'playerShootCooldown':
            player.maxShootCooldown -= 5; // Adjust value as needed
            break;
        case 'attackDamage':
            player.attackDamage += 5; // Adjust value as needed
            break;
        case 'speed':
            player.speed += 0.5; // Adjust value as needed
            break;
        default:
            console.log('Invalid stat');
            break;
    }
    // Close the level-up window here, or reset state to continue game
}*/



function gainExp(amount) {
    player.exp += amount;
    if (player.exp >= player.expToNextLevel) {
        player.level++;
        player.exp -= player.expToNextLevel;
        player.expToNextLevel = calculateExpToNextLevel(player.level); // Implement this based on your game's needs
        openLevelUpOptions(); // Function to display level up options
    }
}


function generateRandomRoom() {
    // Generate random dimensions for the room
    const roomWidth = Math.floor(Math.random() * (maxRoomWidth - minRoomWidth + 1)) + minRoomWidth;
    const roomHeight = Math.floor(Math.random() * (maxRoomHeight - minRoomHeight + 1)) + minRoomHeight;

    // Define the new game world size based on the room
    gameWorld.width = roomWidth;
    gameWorld.height = roomHeight;

    // Optionally, generate features like obstacles or enemy spawn points

    // Reset player position to the start of the room
    player.x = startingXPosition;
    player.y = startingYPosition;

    // If needed, clear previous room's entities like bullets and enemies
    playerBullets.length = 0;
    enemyBullets.length = 0;
    enemies.length = 0; // Remember to repopulate enemies as appropriate for the room
    generateTileMap();

    
    createDustParticles();
}



function gameLoop(timestamp) {
    updateGameTime(); // Update the game time each frame

    if (performance.now() < hitStopEndTime) {
        draw(currentFrame, 0);
        requestAnimationFrame(gameLoop);
        return;
    }

    if (!timestamp) {  // Check if lastTime is undefined (first run)
        timestamp = 0; 
    }
    

    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;


    animationTimer += deltaTime * 3;
    if (animationTimer >= frameInterval) {
        animationTimer = 0; // Subtract excess for smooth animation
        currentFrame++; // Increment the frame
        PlayercurrentFrame++;


        if (currentFrame >= numberOfFrames) {
            currentFrame = 0; // Reset for looping
        }

        if(PlayercurrentFrame >= playerNumberOfframes){
            PlayercurrentFrame=0;
        }
        


    }
    

    update(deltaTime);    
    updateCollisionBox();

    draw(currentFrame, deltaTime);
    updateParticles();












    requestAnimationFrame(gameLoop);
}

let showHitboxes = false;

function renderHitboxes(ctx) {
    if (!showHitboxes) return;

    ctx.save();
    ctx.lineWidth = 1.5;

    // 1. Player Hitbox (Green - Centered & Slim 22x36 Fitting)
    const pHitW = 22;
    const pHitH = 36;
    const pHitX = player.x + (player.size - pHitW) / 2;
    const pHitY = player.y + (player.size - pHitH) / 2;
    ctx.strokeStyle = '#00FF00';
    ctx.strokeRect(pHitX, pHitY, pHitW, pHitH);

    // 2. Enemies Hitbox (Red)
    ctx.strokeStyle = '#FF0000';
    for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        ctx.strokeRect(e.x, e.y, e.size, e.size);
    }

    // 3. Solid Walls Hitbox (Orange)
    ctx.strokeStyle = '#FF9900';
    for (let w = 0; w < walls.length; w++) {
        const wall = walls[w];
        ctx.strokeRect(wall.x, wall.y, wall.width, wall.height);
    }

    // 4. Player Bullets Hitbox (Cyan)
    ctx.strokeStyle = '#00FFFF';
    for (let b = 0; b < playerBullets.length; b++) {
        const bullet = playerBullets[b];
        const sz = bullet.size || 6;
        ctx.strokeRect(bullet.x - sz / 2, bullet.y - sz / 2, sz, sz);
    }

    // 5. Enemy Bullets Hitbox (Yellow)
    ctx.strokeStyle = '#FFFF00';
    for (let eb = 0; eb < enemyBullets.length; eb++) {
        const eBullet = enemyBullets[eb];
        const sz = eBullet.size || 6;
        ctx.strokeRect(eBullet.x - sz / 2, eBullet.y - sz / 2, sz, sz);
    }

    ctx.restore();
}

// Spawn initial lobby humanoid guards for starting room!
spawnLobbyHumanoids();

// Despawn All Active Monsters Button Event Listener
const despawnBtn = document.getElementById('despawnEnemiesBtn');
if (despawnBtn) {
    despawnBtn.addEventListener('click', () => {
        if (enemies && enemies.length > 0) {
            for (let i = 0; i < enemies.length; i++) {
                const e = enemies[i];
                for (let p = 0; p < 3; p++) {
                    particles.push({
                        x: e.x + e.size / 2,
                        y: e.y + e.size / 2,
                        velocityX: (Math.random() - 0.5) * 5,
                        velocityY: (Math.random() - 0.5) * 5,
                        size: Math.random() * 5 + 3,
                        lifeSpan: 12,
                        color: '#FF3300'
                    });
                }
            }
            enemies.splice(0, enemies.length); // Clear all active monsters!
        }
    });
}

// Toggle Hitbox Display Button Event Listener
const toggleHitboxBtn = document.getElementById('toggleHitboxBtn');
if (toggleHitboxBtn) {
    toggleHitboxBtn.addEventListener('click', () => {
        showHitboxes = !showHitboxes;
        if (showHitboxes) {
            toggleHitboxBtn.classList.add('active');
        } else {
            toggleHitboxBtn.classList.remove('active');
        }
    });
}

// Toggle Wall Reorganization Timer Pause Button Event Listener
const toggleWallTimerBtn = document.getElementById('toggleWallTimerBtn');
if (toggleWallTimerBtn) {
    toggleWallTimerBtn.addEventListener('click', () => {
        isWallTimerPaused = !isWallTimerPaused;
        if (isWallTimerPaused) {
            toggleWallTimerBtn.classList.add('active');
        } else {
            toggleWallTimerBtn.classList.remove('active');
        }
    });
}

gameLoop();
