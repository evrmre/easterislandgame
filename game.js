(() => {
    // Canvas and context
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    const width = canvas.width;
    const height = canvas.height;
    const hudHeight = 80;
    const screenHeight = height - hudHeight;

    // HUD elements
    // HUD info elements. We no longer track waves because the objective
    // is simply to reach a total kill count. Kills and reload indicators
    // are updated via these references.
    const waveInfo = document.getElementById('wave-info');
    const killsInfo = document.getElementById('kills-info');
    const reloadInfo = document.getElementById('reload-info');
    // References to HUD elements for dynamic updating
    // Health and armour bars are updated by adjusting their width
    // Weapon name and ammo values are updated directly via their IDs
    const overlay = document.getElementById('overlay');

    // Colour palette for bright, colourful island environment
    const COLORS = {
        // Base wall colour. Use a warmer brown so distant walls blend into
        // the environment instead of appearing as stark white barriers.
        wallBase: { r: 200, g: 180, b: 140 },
        // Bright sky typical of a sunny island day
        sky: '#b3e5ff',
        // Warm sandy beach floor – used as fallback
        floor: '#fdf0d0'
    };

    // --- Gameplay constants ---
    // New objective: reach a total number of kills instead of surviving waves.
    const TARGET_KILLS = 100;
    // Maintain this many active enemies in the world at once. As enemies die
    // new ones will spawn until the target kill count is reached.
    const ACTIVE_ENEMY_COUNT = 5;

    // Ambient and atmospheric timers. Ambient audio will play intermittently
    // and the sky will drift slowly independent of the player's rotation.
    let ambientTimer = 0;
    let skyDrift = 0;

    // --- Texture and sprite loading ---
    // Load sand and grass textures. They will be converted into repeating patterns
    const sandImg = new Image();
    // Use the PNG sand texture for warmer colours. The JPG version tended
    // to render too grey on some browsers.
    sandImg.src = 'texture_sand.png';
    const grassImg = new Image();
    grassImg.src = 'texture_grass.png';
    // Load water texture for ocean
    const waterImg = new Image();
    waterImg.src = 'texture_water.jpg';
    let sandPattern = null;
    let grassPattern = null;
    let waterPattern = null;
    // Pixel buffers for textures used in floor-casting. These will be
    // populated when their respective images load. Storing the pixel
    // data ahead of time lets us sample colours quickly during the
    // floor rendering without repeatedly drawing to a temporary
    // canvas.
    let grassData = null, grassWidth = 0, grassHeight = 0;
    let sandData = null, sandWidth = 0, sandHeight = 0;
    let waterData = null, waterWidth = 0, waterHeight = 0;

    sandImg.onload = () => {
        sandPattern = ctx.createPattern(sandImg, 'repeat');
        // Extract pixel data for the sand texture. This will be used for
        // floor perspective casting. If the image fails to load, the
        // pattern will be null and solid colours will be used instead.
        const sCanvas = document.createElement('canvas');
        sCanvas.width = sandImg.width;
        sCanvas.height = sandImg.height;
        const sCtx = sCanvas.getContext('2d');
        sCtx.drawImage(sandImg, 0, 0);
        const sImageData = sCtx.getImageData(0, 0, sandImg.width, sandImg.height);
        sandData = sImageData.data;
        sandWidth = sandImg.width;
        sandHeight = sandImg.height;
    };
    grassImg.onload = () => {
        grassPattern = ctx.createPattern(grassImg, 'repeat');
        // Prepare pixel data for perspective floor casting. Draw the
        // grass texture onto an offscreen canvas and extract its pixel
        // data once. This allows us to quickly sample colours during
        // the floor rendering without repeatedly reading from the
        // main canvas.
        const gCanvas = document.createElement('canvas');
        gCanvas.width = grassImg.width;
        gCanvas.height = grassImg.height;
        const gCtx = gCanvas.getContext('2d');
        gCtx.drawImage(grassImg, 0, 0);
        const gImageData = gCtx.getImageData(0, 0, grassImg.width, grassImg.height);
        grassData = gImageData.data;
        grassWidth = grassImg.width;
        grassHeight = grassImg.height;
    };
    waterImg.onload = () => {
        waterPattern = ctx.createPattern(waterImg, 'repeat');
        // Extract pixel data for the water texture as well for
        // perspective floor casting. If the texture fails to load, the
        // pixel buffer remains null and a fallback colour will be used.
        const wCanvas = document.createElement('canvas');
        wCanvas.width = waterImg.width;
        wCanvas.height = waterImg.height;
        const wCtx = wCanvas.getContext('2d');
        wCtx.drawImage(waterImg, 0, 0);
        const wImageData = wCtx.getImageData(0, 0, waterImg.width, waterImg.height);
        waterData = wImageData.data;
        waterWidth = waterImg.width;
        waterHeight = waterImg.height;
    };

    // Load bamboo texture for walls. This will replace the plain wall colour
    // with a stylised bamboo pattern. When the image loads, a repeating
    // pattern is created which can be used to fill wall slices during
    // raycasting. If it fails to load, the wall colour fallback is used.
    const bambooImg = new Image();
    bambooImg.src = 'texture_bamboo.png';
    let bambooPattern = null;
    bambooImg.onload = () => {
        bambooPattern = ctx.createPattern(bambooImg, 'repeat');
    };

    // Load sky texture. This is a pixel art image with stylised clouds and blue
    // sky. We'll tile it across the top half of the screen and scroll it
    // horizontally over time to give the appearance of drifting clouds. The
    // scroll speed will be tied to the player's rotation so the sky appears
    // to move realistically when turning.
    const skyImg = new Image();
    skyImg.src = 'sky.png';
    let skyOffset = 0;
    // Load decorative sprites. Replace the simple placeholder tree and bush
    // with a suite of retro-styled sprites. All of these assets have
    // transparent backgrounds so no white boxes appear when rendered.
    const tree1Img = new Image(); tree1Img.src = 'tree1.png';
    const tree2Img = new Image(); tree2Img.src = 'tree2.png';
    const bush1Img = new Image(); bush1Img.src = 'bush1.png';
    const bush2Img = new Image(); bush2Img.src = 'bush2.png';
    const rock1Img = new Image(); rock1Img.src = 'rock1.png';
    const rock2Img = new Image(); rock2Img.src = 'rock2.png';
    // Additional decorative variants to enrich the environment
    const tree3Img = new Image(); tree3Img.src = 'tree3.png';
    const bush3Img = new Image(); bush3Img.src = 'bush3.png';
    const rock3Img = new Image(); rock3Img.src = 'rock3.png';
    // New, more stylised foliage and rocks inspired by real pixel art
    // Replace decorative sprites with the provided pixel‑art palm tree,
    // rock and bush. These images reside in the project folder as
    // decor_tree.png, decor_rock.png and decor_bush.png. Each is a
    // stylised 8‑bit/16‑bit sprite with a transparent background that
    // matches the attached images.  We will randomly choose between
    // these three sprites for decoration.
    const decorTreeImg = new Image(); decorTreeImg.src = 'decor_tree.png';
    const decorRockImg = new Image(); decorRockImg.src = 'decor_rock.png';
    const decorBushImg = new Image(); decorBushImg.src = 'decor_bush.png';
    // Decorative moai statue remains as environmental dressing.
    const decorMoaiImg = new Image(); decorMoaiImg.src = 'decor_moai_trans.png';
    // List of decoration sprites. Trees are considered tall, whereas
    // rocks and bushes are small. The moai statue adds variety. All
    // sprites face the player (billboarding).
    // Only use trees, rocks and bushes as environmental decorations.  The
    // Moai statues are reserved for enemies and are not spawned
    // randomly around the map.
    const decorSprites = [decorTreeImg, decorRockImg, decorBushImg];

    // Load a bamboo sign for the start menu. This image will be displayed
    // behind the controls description and start prompt while the game
    // is in the 'menu' state. The image file is provided in the game
    // folder as start_sign.png.
    const startSignImg = new Image();
    startSignImg.src = 'start_sign.png';

    // Load gun sprites. A small idle sprite shows the weapon at rest and a
    // firing sprite contains an integrated muzzle flash. Both sprites are
    // scaled down when drawn so they occupy only a quarter of the screen
    // width and do not obscure the view.
    const idleGunImage = new Image(); idleGunImage.src = 'gun_idle.png';
    const fireGunImage = new Image(); fireGunImage.src = 'gun_fire_small.png';

    // We retain these legacy variables for backward compatibility but they
    // reference our idle gun image so other parts of the code continue
    // functioning without modification. The separate muzzle sprite is no
    // longer used because the firing sprite already includes a flash.
    const gunImage = idleGunImage;
    const muzzleImage = fireGunImage;


    // Map definition: a small island-like layout with simple corridors and rooms.
    // This map has a border of walls and some interior walls to give a DOOM-like feel.
    const map = [
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,1],
        [1,0,0,0,0,1,0,1,0,0,1,0,1,0,0,1],
        [1,0,0,0,0,1,0,1,0,0,1,0,1,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,1,1,1,0,0,0,0,0,1,1,1,0,1],
        [1,0,0,1,0,1,0,0,0,0,0,1,0,1,0,1],
        [1,0,0,1,1,1,0,0,0,0,0,1,1,1,0,1],
        [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,1],
        [1,0,0,0,0,1,0,1,0,0,1,0,1,0,0,1],
        [1,0,0,0,0,1,0,1,0,0,1,0,1,0,0,1],
        [1,0,0,0,0,1,1,1,0,0,1,1,1,0,0,1],
        [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];
    const mapWidth = map[0].length;
    const mapHeight = map.length;

    // Player state: start roughly in the middle of the new map at a free cell
    const player = {
        // Start near the top-left of the map in a roomy area for a better initial view
        x: 2.5,
        y: 2.5,
        angle: 0,
        moveForward: false,
        moveBackward: false,
        turnLeft: false,
        turnRight: false,
        // New movement flags for strafing left and right
        strafeLeft: false,
        strafeRight: false
    };

    // Camera parameters
    // Field of view widened to 90 degrees to provide a stronger perspective and
    // ensure objects remain visible at wider angles. Increasing the number of
    // rays improves the horizontal resolution of the walls.
    // Set a wider field of view to 100 degrees so that objects remain
    // visible at wider angles, reducing the popping effect when strafing.
    const FOV = Math.PI * 100 / 180;
    // Increase the number of rays cast to improve horizontal resolution. A
    // higher ray count reduces the appearance of gaps between columns and
    // provides a smoother perspective.
    const numRays = 480;
    const stripWidth = width / numRays;
    // Projection plane determines wall height calculation based on new FOV
    const projectionPlane = (screenHeight / 2) / Math.tan(FOV / 2);
    const maxRenderDist = 20;

    // Game state
    let kills = 0;
    // Top-level game state. Before pressing Enter the player is in the start
    // menu ('menu'). Once Enter is pressed, the game switches to
    // 'playing'.  Remaining states such as 'gameOver' continue to be
    // represented by the existing gameOver boolean.
    let gameState = 'menu';
    // Waves have been removed. We simply track the number of kills. The
    // number of active enemies is controlled by ACTIVE_ENEMY_COUNT and
    // TARGET_KILLS. When an enemy dies, a new one spawns until the target
    // number of kills is reached.
    let enemies = [];
    // Decorative objects placed throughout the map. These are static and
    // randomly chosen from decorSprites when spawned.
    const decorations = [];
    let reloading = false;
    let reloadTimer = null;
    let gameOver = false;

    // Cache the player's initial position and angle so we can reset the
    // game when the player starts a new run from the menu.  We make a
    // shallow copy of the starting coordinates and orientation here.
    const initialPlayerState = {
        x: player.x,
        y: player.y,
        angle: player.angle
    };

    /**
     * Start a fresh game session.  This function is invoked when the
     * player presses Enter on the start menu.  It resets all gameplay
     * variables, spawns new decorations and enemies, and clears any
     * overlay state from previous runs.  After initialisation, the
     * game state switches to 'playing' and the HUD is updated.
     */
    function startGame() {
        // Reset core game variables
        kills = 0;
        health = 100;
        armor = 100;
        selectedWeapon = 'shotgun';
        reloading = false;
        clearTimeout(reloadTimer);
        reloadTimer = null;
        gameOver = false;
        // Reset player position and orientation to the starting state
        player.x = initialPlayerState.x;
        player.y = initialPlayerState.y;
        player.angle = initialPlayerState.angle;
        player.moveForward = false;
        player.moveBackward = false;
        player.turnLeft = false;
        player.turnRight = false;
        player.strafeLeft = false;
        player.strafeRight = false;
        // Clear all existing enemies and decorations
        enemies = [];
        decorations.length = 0;
        // Spawn a fresh set of decorations and populate the map
        spawnDecorations();
        // Spawn initial enemies up to the desired active count
        for (let i = 0; i < ACTIVE_ENEMY_COUNT; i++) {
            spawnEnemy();
        }
        // Remove overlay classes and hide it.  Also clear any
        // previously inserted content.  Without clearing the inner
        // contents, a leftover image tag or message can persist
        // invisibly and interfere with subsequent games.
        overlay.classList.add('hidden');
        overlay.classList.remove('victory');
        overlay.classList.remove('win-screen');
        overlay.style.animation = '';
        overlay.style.opacity = '';
        overlay.textContent = '';
        overlay.innerHTML = '';
        // Clear any background styling that could darken the scene during
        // gameplay.  Setting the background to transparent ensures no
        // residual dimming from the overlay persists across runs.
        overlay.style.background = 'transparent';
        // Switch into gameplay state
        gameState = 'playing';
        // Update the HUD with fresh values
        updateUI();
    }

    /**
     * Draw the start menu.  A bamboo sign sprite is displayed at the
     * centre of the screen with a description of the controls.  At the
     * bottom of the sign a red '> START' prompt invites the player to
     * press Enter to begin.  This function is called every frame when
     * gameState === 'menu'.
     */
    function drawMenu() {
        // Draw semi-transparent dark overlay so the menu stands out
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(0, 0, width, height);
        // Determine sign size.  Fit within 80% of canvas width/height
        const signAspect = startSignImg.width / startSignImg.height;
        const maxSignWidth = width * 0.7;
        const maxSignHeight = screenHeight * 0.7;
        let signWidth = maxSignWidth;
        let signHeight = signWidth / signAspect;
        if (signHeight > maxSignHeight) {
            signHeight = maxSignHeight;
            signWidth = signHeight * signAspect;
        }
        const signX = (width - signWidth) / 2;
        const signY = (screenHeight - signHeight) / 2;
        // Draw the sign
        if (startSignImg.complete) {
            ctx.drawImage(startSignImg, signX, signY, signWidth, signHeight);
        }
        // Draw controls text.  Use a pixel‑style monospace font.  The
        // coordinates are relative to the sign region.  We choose a
        // modest font size that fits several lines comfortably on the
        // sign.  Colours are chosen to stand out against the brown
        // background of the sign.
        const paddingX = signWidth * 0.08;
        const paddingY = signHeight * 0.15;
        const textX = signX + paddingX;
        let textY = signY + paddingY;
        const lineHeight = 22;
        ctx.fillStyle = '#fff4c4';
        ctx.font = '18px monospace';
        ctx.textBaseline = 'top';
        ctx.fillText('CONTROLS', textX, textY);
        textY += lineHeight;
        ctx.fillText('W/S: Move forward/back', textX, textY);
        textY += lineHeight;
        ctx.fillText('A/D: Turn left/right', textX, textY);
        textY += lineHeight;
        ctx.fillText('Q/E: Strafe left/right', textX, textY);
        textY += lineHeight;
        ctx.fillText('SPACE/Click: Shoot', textX, textY);
        textY += lineHeight;
        ctx.fillText('R: Reload', textX, textY);
        textY += lineHeight;
        ctx.fillText('1/2: Select weapon', textX, textY);
        textY += lineHeight;
        ctx.fillText(`${TARGET_KILLS} Kills to win`, textX, textY);
        // Draw the start prompt at the bottom of the sign
        const startY = signY + signHeight - paddingY - lineHeight;
        const startX = signX + paddingX;
        ctx.fillStyle = '#ff4444';
        ctx.font = '20px monospace';
        ctx.fillText('> START', startX, startY);
    }

    // Muzzle flash timer (when >0, draw a muzzle sprite)
    let muzzleTimer = 0;
    // Damage flash variable (0 to 1)
    let damageFlash = 0;

    // Gun bob timer. This is used to create a side-to-side swaying
    // animation for the weapon when the player moves. It accumulates
    // elapsed time so that the bobbing speed is consistent across
    // frames.
    let gunBobTimer = 0;

    // Bullet animation timer. When >0 a tracer will be drawn from the gun
    // muzzle toward the centre of the screen. This provides visual feedback
    // when the player fires, resembling a bullet streak.
    let bulletTimer = 0;

    // Player stats
    let health = 100;
    let armor = 50;

    // Audio context used for playing occasional ambient drum-like sounds.
    // It is created lazily on the first user interaction to comply with
    // browser autoplay restrictions.
    let audioCtx = null;

    // Dust particles for atmospheric depth. Each particle floats slowly
    // upward or downward, creating the impression of dust motes caught in
    // the sunlight. See initParticles() for initialization.
    const particles = [];

    // Weapons definition
    const weapons = {
        shotgun: {
            // Rename the shotgun to Rifle. We retain the key name
            // "shotgun" to avoid changing other code paths but
            // update the display name in the HUD.
            name: 'Rifle',
            ammoCapacity: 8,
            magazine: 8,
            totalAmmo: Infinity,
            reloadTime: 2000,
            damage: 60
        },
        laser: {
            name: 'Laser Gun',
            ammoCapacity: 20,
            magazine: 20,
            totalAmmo: Infinity,
            reloadTime: 1500,
            damage: 40
        }
    };
    let selectedWeapon = 'shotgun';

    // Load enemy walking frames.  Two separate sprites depict the
    // Moai statue from the front in different poses to simulate
    // walking.  Frames are loaded individually so that they can be
    // swapped directly without horizontal flipping.  When both
    // images have finished loading, they are stored in enemyFrames.
    const enemyFrames = [];
    const enemyImage = new Image(); // reference to first frame used for dying state
    // Set an initial source so width/height are valid even before both frames load
    enemyImage.src = 'moai_walk1.png';
    const _enemyFrame1 = new Image();
    const _enemyFrame2 = new Image();
    _enemyFrame1.src = 'moai_walk1.png';
    _enemyFrame2.src = 'moai_walk2.png';
    let _enemyLoadedCount = 0;
    function _checkEnemyLoaded() {
        if (_enemyLoadedCount >= 2) {
            enemyFrames[0] = _enemyFrame1;
            enemyFrames[1] = _enemyFrame2;
            // use the first frame as the base enemy image for death
            enemyImage.src = _enemyFrame1.src;
        }
    }
    _enemyFrame1.onload = () => {
        _enemyLoadedCount++;
        _checkEnemyLoaded();
    };
    _enemyFrame2.onload = () => {
        _enemyLoadedCount++;
        _checkEnemyLoaded();
    };
    // Animation timer and speed (cycles per second).  The timer will be
    // incremented each frame and used to select the current frame.  A
    // value of 3 cycles per second yields a moderately paced walk.
    let enemyAnimTimer = 0;
    const enemyAnimSpeed = 3;

    // Load end game screen image. This full‑screen artwork will be
    // displayed when the player reaches the target number of kills.
    const endGameImg = new Image();
    endGameImg.src = 'end_game_screen.png';

    // Enemy class
    class Enemy {
        constructor(position) {
            this.x = position.x;
            this.y = position.y;
            this.health = 60;
            this.alive = true;
            this.dying = false;
            this.deathTimer = 0;
            this.scale = 1; // used for death animation
        }
        hit(damage) {
            if (!this.alive) return;
            this.health -= damage;
            if (this.health <= 0) {
                // Start death animation
                this.dying = true;
                this.deathTimer = 0.6; // half a second fade out
                this.scale = 1;
                kills++;
            }
        }
    }

    // Spawn a single enemy at a random walkable location. Enemies are
    // positioned away from the player to avoid immediate collisions. This
    // function tries up to 200 times to find a free tile. If successful it
    // pushes the new enemy into the enemies array.
    function spawnEnemy() {
        let attempts = 0;
        // Minimum distance between enemies when spawning to prevent stacking
        const minEnemyDist = 1.5;
        while (attempts < 300) {
            attempts++;
            const x = 1 + Math.random() * (mapWidth - 2);
            const y = 1 + Math.random() * (mapHeight - 2);
            if (map[Math.floor(y)][Math.floor(x)] === 0) {
                const dx = x - player.x;
                const dy = y - player.y;
                // ensure spawn is far enough from player
                if (Math.sqrt(dx * dx + dy * dy) > 4) {
                    // ensure spawn is far enough from other enemies
                    let tooClose = false;
                    for (const e of enemies) {
                        const ddx = x - e.x;
                        const ddy = y - e.y;
                        if (Math.sqrt(ddx * ddx + ddy * ddy) < minEnemyDist) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (!tooClose) {
                        enemies.push(new Enemy({ x, y }));
                        break;
                    }
                }
            }
        }
    }

    // Spawn decorative objects around the island. This routine clears any
    // existing decorations and populates the map with a variety of
    // sprites from decorSprites. Decorations are placed at random
    // non-wall positions far enough from the player. Each sprite type is
    // chosen uniformly at random, providing visual variety on the island.
    function spawnDecorations() {
        decorations.length = 0;
        // Increase the number of decorations to make the island feel more
        // populated.  A larger value means more trees, rocks and bushes
        // will be scattered around the map.  Adjust as desired.
        const totalDecor = 80;
    // Minimum distance between individual decorations.  Ensuring a
    // separation prevents sprites from clustering in one spot and
    // distributes them more evenly across the island.  Feel free to
    // adjust this value to achieve the desired density (smaller
    // values pack decorations closer together).
    const minDecorSeparation = 1.0;
        let placed = 0;
        let attempts = 0;
        while (placed < totalDecor && attempts < 1000) {
            attempts++;
            const x = 1 + Math.random() * (mapWidth - 2);
            const y = 1 + Math.random() * (mapHeight - 2);
            if (map[Math.floor(y)][Math.floor(x)] === 0) {
                const dx = x - player.x;
                const dy = y - player.y;
                if (Math.sqrt(dx * dx + dy * dy) > 5) {
                    // Ensure the new decoration is not too close to existing ones
                    let tooClose = false;
                    for (const dec of decorations) {
                        const ddx = x - dec.x;
                        const ddy = y - dec.y;
                        if (Math.sqrt(ddx * ddx + ddy * ddy) < minDecorSeparation) {
                            tooClose = true;
                            break;
                        }
                    }
                    if (!tooClose) {
                        const sprite = decorSprites[Math.floor(Math.random() * decorSprites.length)];
                        decorations.push({ x, y, sprite });
                        placed++;
                    }
                }
            }
        }
    }

    // Cast rays and draw the 3D walls
    function castRays() {
        // Reset composite properties to ensure wall textures render
        // consistently regardless of previous drawing state (e.g. damage
        // flashes). Use a save/restore pair to limit scope.
        ctx.save();
        // Reset all drawing parameters for wall rendering. Without this
        // reset, previous blending modes or filters can cause the
        // bamboo texture to appear washed out or only visible under
        // certain conditions (e.g. when taking damage).  Clearing
        // filter, alpha and composite mode ensures the texture is
        // always drawn at full opacity.
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.filter = 'none';
        const zBuffer = new Array(numRays);
        for (let i = 0; i < numRays; i++) {
            // Calculate angle for this ray
            const rayAngle = player.angle - FOV / 2 + (FOV * i) / numRays;
            const rayDirX = Math.cos(rayAngle);
            const rayDirY = Math.sin(rayAngle);
            // Current grid position
            let mapX = Math.floor(player.x);
            let mapY = Math.floor(player.y);
            // Length of ray to next x or y side
            const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
            const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
            let stepX, stepY;
            let sideDistX, sideDistY;
            // Calculate step and initial sideDist
            if (rayDirX < 0) {
                stepX = -1;
                sideDistX = (player.x - mapX) * deltaDistX;
            } else {
                stepX = 1;
                sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
            }
            if (rayDirY < 0) {
                stepY = -1;
                sideDistY = (player.y - mapY) * deltaDistY;
            } else {
                stepY = 1;
                sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
            }
            let hit = false;
            let side = 0;
            while (!hit) {
                // Walk to next grid cell
                if (sideDistX < sideDistY) {
                    sideDistX += deltaDistX;
                    mapX += stepX;
                    side = 0;
                } else {
                    sideDistY += deltaDistY;
                    mapY += stepY;
                    side = 1;
                }
                // Check if ray has hit a wall
                if (mapY < 0 || mapY >= mapHeight || mapX < 0 || mapX >= mapWidth) {
                    hit = true;
                    break;
                }
                if (map[mapY][mapX] > 0) {
                    hit = true;
                }
            }
            // Calculate distance to wall
            let perpWallDist;
            if (hit) {
                if (side === 0) {
                    perpWallDist = (sideDistX - deltaDistX);
                } else {
                    perpWallDist = (sideDistY - deltaDistY);
                }
            } else {
                perpWallDist = maxRenderDist;
            }
            zBuffer[i] = perpWallDist;
     // PATCH: Fix for "floating walls"—wall bottom now aligns with the ground/floor (horizon).

// --- find the wall rendering block, replace the vertical position calculation ---
// BEFORE (likely near line 670-700):
const wallHeight = projectionPlane / (perpWallDist || 0.0001);
const startY = Math.floor((screenHeight / 2) - (wallHeight / 2));
const endY = startY + wallHeight;

// AFTER:
const horizon = Math.floor(screenHeight / 2);
// Draw wall slice so its bottom edge is flush with the horizon (floor)
// Clamp startY so it doesn't go negative
const wallHeight = projectionPlane / (perpWallDist || 0.0001);
const startY = Math.max(0, horizon - wallHeight);
const endY = horizon;

// When drawing the wall slice, ensure it ends at the horizon:
if (bambooImg && bambooImg.complete) {
    // ... unchanged texture calculations ...
    ctx.drawImage(
        bambooImg, texX, 0, 1, bambooImg.height,
        i * stripWidth, startY, stripWidth, endY - startY
    );
} else if (bambooPattern) {
    ctx.fillStyle = bambooPattern;
    ctx.fillRect(i * stripWidth, startY, stripWidth, endY - startY);
} else {
    const baseR = COLORS.wallBase.r;
    const baseG = COLORS.wallBase.g;
    const baseB = COLORS.wallBase.b;
    ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
    ctx.fillRect(i * stripWidth, startY, stripWidth, endY - startY);
}

// No change to sky/floor logic; those are drawn separately.
// This patch ensures the wall slices go right down to the ground (the horizon),
// eliminating any "floating" appearance.
            // Draw wall slice. If a bamboo texture is loaded, sample the
            // appropriate column from the image so that the pattern maps
            // correctly to the wall based on the ray intersection. This
            // produces proper perspective and distance scaling similar to
            // classic Doom/Wolfenstein rendering. If the texture isn't
            // loaded yet, fall back to the repeating pattern; if even that
            // fails, use a solid colour.
            if (bambooImg && bambooImg.complete) {
                // Compute where on the wall we hit to determine the
                // horizontal texture coordinate. For vertical walls (side=0),
                // use y-coordinate; for horizontal walls (side=1), use x.
                let wallX;
                if (side === 0) {
                    wallX = player.y + perpWallDist * rayDirY;
                } else {
                    wallX = player.x + perpWallDist * rayDirX;
                }
                wallX -= Math.floor(wallX);
                const texX = Math.floor(wallX * bambooImg.width);
                // Draw a 1px wide vertical slice of the texture stretched to
                // the height of the wall. The destination width equals the
                // strip width so the slice fills the column. Using a height
                // equal to the texture height ensures vertical tiling.
                ctx.drawImage(bambooImg, texX, 0, 1, bambooImg.height,
                             i * stripWidth, startY, stripWidth, wallHeight);
            } else if (bambooPattern) {
                // Fallback: use repeating pattern if texture hasn't
                // loaded but pattern exists
                ctx.fillStyle = bambooPattern;
                ctx.fillRect(i * stripWidth, startY, stripWidth, wallHeight);
            } else {
                // Last resort: draw a solid coloured wall slice using
                // the defined base colour
                const baseR = COLORS.wallBase.r;
                const baseG = COLORS.wallBase.g;
                const baseB = COLORS.wallBase.b;
                ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
                ctx.fillRect(i * stripWidth, startY, stripWidth, wallHeight);
            }
            // Sky is drawn separately before raycasting; do not draw here.
            // Floor is drawn after raycasting in a separate function. Do not
            // draw floor here.
        }
        ctx.restore();
        return zBuffer;
    }

    // Draw layered ground textures (unused). The floor is now rendered
    // using drawFloorPerspective() to achieve proper perspective. This
    // placeholder remains for backward compatibility but performs no
    // rendering.
    function drawFloorLayers() {
        // Intentionally left empty
    }

    /**
     * Render the ground plane with proper 3D perspective. This function
     * performs a floor‑casting algorithm similar to classic raycasters
     * (Wolfenstein/Doom). Each horizontal scanline of the lower half of
     * the viewport is projected into world space and textured based on
     * the computed world coordinates. An optional zBuffer is used to
     * ensure that floor pixels do not overwrite walls that are closer
     * to the camera. The floor is subdivided into patches of grass,
     * sand and water using a simple procedural noise function. If a
     * texture is unavailable, solid fallback colours are used instead.
     * @param {number[]} zBuffer array of perpendicular wall distances for occlusion
     */
    function drawFloorPerspective(zBuffer) {
        const horizon = Math.floor(screenHeight / 2);
        const floorHeight = screenHeight - horizon;
        // Create a buffer for the floor pixels. This will hold RGBA values
        // for each pixel row in the bottom half of the screen.
        const img = ctx.createImageData(width, floorHeight);
        const data = img.data;
        // Precompute squared wall distances for occlusion testing. Squaring
        // avoids the need to compute square roots for each floor pixel.
        const zBufSq = new Array(zBuffer.length);
        for (let i = 0; i < zBuffer.length; i++) {
            const d = zBuffer[i];
            zBufSq[i] = d * d;
        }
        // Precompute ray directions for the left and right edge of the
        // field of view. These values are used to interpolate the world
        // coordinates across each scanline.
        const leftDirX = Math.cos(player.angle - FOV / 2);
        const leftDirY = Math.sin(player.angle - FOV / 2);
        const rightDirX = Math.cos(player.angle + FOV / 2);
        const rightDirY = Math.sin(player.angle + FOV / 2);
        // Iterate over each row in the bottom half of the screen. yRow
        // represents the current scanline relative to the top of the
        // floor image (0 = just below the horizon).
        for (let yRow = 0; yRow < floorHeight; yRow++) {
            // Screen y coordinate (0 at top of full screen). Add 0.5
            // offset to sample in the middle of the pixel.
            const screenY = horizon + yRow + 0.5;
            // Position relative to the centre of the screen (vertical axis).
            const p = screenY - screenHeight / 2;
            // Distance from the player to the current row on the ground.
            // Using screenHeight/2 (half the viewport height) approximates
            // the distance to the projection plane. Dividing by p yields
            // the projected distance on the ground.
            const rowDistance = (screenHeight / 2) / p;
            // Interpolate the world coordinate for the leftmost pixel
            // on this row.
            let floorX = player.x + rowDistance * leftDirX;
            let floorY = player.y + rowDistance * leftDirY;
            // Determine the incremental step across the row. By dividing
            // the difference between right and left ray directions by the
            // screen width and multiplying by rowDistance, we move one
            // pixel in world space for each screen pixel.
            const stepX = rowDistance * (rightDirX - leftDirX) / width;
            const stepY = rowDistance * (rightDirY - leftDirY) / width;
            // Compute shading factor once per row to save operations. The
            // further the row, the smaller the shade. Avoid division by
            // zero by clamping rowDistance.
            // Apply a gentle distance shade. A smaller coefficient reduces
            // darkening so the sand remains bright and sunlit even when
            // stretching to the horizon. Tweaking this value tunes how
            // quickly the floor darkens with distance. Use a coefficient
            // lower than before to keep the scene brighter.
            const shade = Math.min(1, 1 / (rowDistance * 0.04));
            // For each pixel in the row, sample the appropriate texture or
            // fallback colour based on a procedural noise function. Skip
            // drawing when occluded by a wall (floor behind a wall).
            for (let x = 0; x < width; x++) {
                // Current world coordinates for this pixel
                const wx = floorX;
                const wy = floorY;
                floorX += stepX;
                floorY += stepY;
                // Compute column index for occlusion check. Each
                // numRays ray covers stripWidth screen pixels. If out of
                // range, default to no occlusion (draw floor).
                const col = Math.floor(x / stripWidth);
                let visible = true;
                if (col >= 0 && col < zBufSq.length) {
                    const dx = wx - player.x;
                    const dy = wy - player.y;
                    const distSq = dx * dx + dy * dy;
                    if (distSq > zBufSq[col]) {
                        visible = false;
                    }
                }
                if (!visible) continue;
                // Always sample the sand texture for the floor. The island
                // environment is now entirely sandy beach, so grass and
                // water are no longer used. Sample the repeating sand
                // pattern using world coordinates. If the texture fails
                // to load, fall back to a pale sand colour. This ensures
                // the floor looks warm and beach‑like across the entire
                // island.
                let r, g, b;
                if (sandData) {
                    let tx = ((wx % 1) + 1) % 1;
                    let ty = ((wy % 1) + 1) % 1;
                    const px = Math.floor(tx * sandWidth);
                    const py = Math.floor(ty * sandHeight);
                    const idx = (py * sandWidth + px) * 4;
                    r = sandData[idx];
                    g = sandData[idx + 1];
                    b = sandData[idx + 2];
                } else {
                    // Fallback to solid warm sand colour
                    r = 230; g = 220; b = 180;
                }
                // Apply distance shading. Multiply colours by the shading
                // factor to darken far rows. Clamp to [0,255].
                r = Math.max(0, Math.min(255, Math.floor(r * shade)));
                g = Math.max(0, Math.min(255, Math.floor(g * shade)));
                b = Math.max(0, Math.min(255, Math.floor(b * shade)));
                // Write pixel into image buffer. The index within the
                // buffer corresponds to (row * width + x) * 4.
                const di = (yRow * width + x) * 4;
                data[di] = r;
                data[di + 1] = g;
                data[di + 2] = b;
                data[di + 3] = 255;
            }
        }
        // Draw the composed floor image onto the canvas at the horizon.
        ctx.putImageData(img, 0, horizon);
    }

    // Draw a simple sun in the sky to brighten the scene. The sun is placed
    // near the top-right of the canvas and rendered as a yellow circle.
function drawSun() {
        // Sun drawing disabled. In this Doom‑like game the sky itself conveys
        // the time of day, and removing the sun declutters the field of view.
        // Should you wish to restore it, uncomment the code below.
        /*
        const sunX = width - 120;
        const sunY = 80;
        const sunRadius = 50;
        ctx.save();
        ctx.fillStyle = 'rgba(255, 244, 150, 0.9)';
        ctx.beginPath();
        ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        */
    }

    // Draw the sky texture across the top portion of the screen. The sky
    // image scrolls horizontally based on the player's rotation to provide
    // parallax. If the image isn't yet loaded, fall back to a solid blue.
    function drawSky() {
        const skyHeight = screenHeight / 2;
        if (skyImg.complete && skyImg.width > 0) {
            // Compute an offset proportional to the player's angle. This
            // makes the sky move left/right as the player turns. We scale the
            // angle to the width of the image to tile seamlessly.
            // Horizontal offset from player rotation plus a drifting offset for
            // subtle cloud movement
            const offset = (player.angle / (2 * Math.PI)) * skyImg.width + skyDrift;
            skyOffset = offset;
            // Draw two copies of the sky image side-by-side so the tiling
            // appears continuous.
            const imgWidth = skyImg.width;
            const imgHeight = skyImg.height;
            // Vertical scaling to fit half the screen
            const scaleY = skyHeight / imgHeight;
            const drawWidth = imgWidth * scaleY;
            // Determine starting x so the offset appears relative to the canvas
            const startX = - (skyOffset % drawWidth);
            for (let i = -1; i <= Math.ceil(width / drawWidth) + 1; i++) {
                ctx.drawImage(skyImg, 0, 0, imgWidth, imgHeight,
                    startX + i * drawWidth, 0, drawWidth, skyHeight);
            }
        } else {
            // fallback blue sky
            ctx.fillStyle = '#a3dfff';
            ctx.fillRect(0, 0, width, screenHeight / 2);
        }
    }

    // Draw enemies as billboards after casting walls
    function drawEnemies(zBuffer) {
        // Sort enemies by distance descending (farther first) for painter's algorithm
        const visible = enemies.filter(e => e.alive || e.dying);
        visible.sort((a, b) => {
            const da = (a.x - player.x) * (a.x - player.x) + (a.y - player.y) * (a.y - player.y);
            const db = (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y);
            return db - da;
        });
        for (const enemy of visible) {
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angleToEnemy = Math.atan2(dy, dx) - player.angle;
            // Normalize angle to [-PI, PI]
            let angle = angleToEnemy;
            while (angle < -Math.PI) angle += 2 * Math.PI;
            while (angle > Math.PI) angle -= 2 * Math.PI;
            if (Math.abs(angle) > FOV / 2) continue; // not in view
            // Determine the screen position
            const screenX = (angle + FOV / 2) / FOV * width;
            const sizeBase = projectionPlane / (dist * Math.cos(angle));
            // When dying, shrink according to remaining deathTimer
            const scale = (enemy.dying && enemy.deathTimer > 0) ? enemy.scale : 1;
            const spriteHeight = sizeBase * 2 * scale;
            const spriteWidth = sizeBase * scale;
            const top = (screenHeight / 2) - spriteHeight / 2;
            const left = screenX - spriteWidth / 2;
            // Simple occlusion: only draw if closer than wall at that horizontal band
            const rayIndex = Math.floor(screenX / stripWidth);
            if (rayIndex >= 0 && rayIndex < zBuffer.length && dist < zBuffer[rayIndex]) {
                if (enemy.dying) {
                    ctx.save();
                    // Fade out based on remaining death time
                    ctx.globalAlpha = enemy.deathTimer / 0.6;
                    ctx.drawImage(enemyImage, 0, 0, enemyImage.width, enemyImage.height, left, top, spriteWidth, spriteHeight);
                    ctx.restore();
                } else {
                    // Choose animation frame based on global timer.  If frames
                    // are not yet ready, fall back to the original image.  The
                    // frame index cycles at enemyAnimSpeed Hz.  Use
                    // Math.floor so the image changes in discrete steps.
                    let frame = enemyImage;
                    if (enemyFrames.length >= 2) {
                        const index = Math.floor(enemyAnimTimer * enemyAnimSpeed) % enemyFrames.length;
                        frame = enemyFrames[index] || enemyImage;
                    }
                    ctx.drawImage(frame, 0, 0, frame.width, frame.height, left, top, spriteWidth, spriteHeight);
                }
            }
        }
    }

    // Draw decorative trees and bushes as billboards. Decorations are static and
    // sorted by distance for painter's algorithm to ensure proper occlusion.
    function drawDecorations(zBuffer) {
        // Draw decorative sprites (trees, bushes, rocks, moai statues).  Each
        // decoration is billboarded so that it always faces the camera.  To
        // keep sprites grounded rather than hovering above the floor, we
        // anchor the bottom of each sprite at the horizon line (midpoint
        // of the 3D view) instead of centering vertically.  This makes
        // rocks and bushes sit flush with the ground and prevents them from
        // appearing to float.  Taller sprites (trees and moai statues) are
        // drawn with increased height relative to their width for a more
        // imposing silhouette.
        const visible = decorations.slice();
        // Sort by distance (farther objects first) so that closer sprites
        // naturally occlude those behind them.  We compare squared
        // distances for efficiency.
        visible.sort((a, b) => {
            const da = (a.x - player.x) * (a.x - player.x) + (a.y - player.y) * (a.y - player.y);
            const db = (b.x - player.x) * (b.x - player.x) + (b.y - player.y) * (b.y - player.y);
            return db - da;
        });
        for (const decor of visible) {
            const dx = decor.x - player.x;
            const dy = decor.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            // Determine the relative angle of the decoration to the player
            const angleTo = Math.atan2(dy, dx) - player.angle;
            let angle = angleTo;
            // Wrap the angle into [-π, π]
            while (angle < -Math.PI) angle += 2 * Math.PI;
            while (angle > Math.PI) angle -= 2 * Math.PI;
            // Skip if the sprite is outside of the horizontal FOV
            if (Math.abs(angle) > FOV / 2) continue;
            // Convert the angle to a horizontal screen coordinate
            const screenX = (angle + FOV / 2) / FOV * width;
            // Perspective scale factor for this distance
            const baseSize = projectionPlane / (dist * Math.cos(angle));
            let spriteWidth = baseSize;
            let spriteHeight = baseSize;
            // Trees and moai statues should appear taller than rocks/bushes
            if (decor.sprite === decorTreeImg || decor.sprite === decorMoaiImg) {
                spriteHeight = baseSize * 2;
            }
            // Determine vertical position.  To make decorations appear
            // anchored to the ground without sinking below the floor
            // or floating too high, we offset their base slightly below
            // the horizon line.  The bottom of each sprite is placed
            // at a constant fraction of its height below the horizon.
            // A bottom factor of 0.6 means the bottom sits at
            // horizon + 60% of the sprite's height.  This causes
            // closer sprites (which have larger spriteHeight values)
            // to shift further down the screen, approximating how
            // objects on the ground appear lower as you approach.
            // Choose different anchoring factors for tall and short
            // decorations.  Tall sprites like trees and moai statues
            // should be anchored higher (smaller bottom factor) so
            // their bases don’t sink below the ground plane.  Shorter
            // decorations like rocks and bushes use a larger bottom
            // factor so they sit lower and don’t appear to hover.  The
            // bottomFactor determines how far below the horizon the
            // base of the sprite appears: bottom-of-sprite =
            // horizon + (bottomFactor * spriteHeight).
            const isTallDecor = (decor.sprite === decorTreeImg || decor.sprite === decorMoaiImg);
            // Adjust anchoring: lower all decorations slightly so they
            // sit more firmly on the ground.  A larger bottomFactor
            // pushes the sprite lower relative to the horizon.  Trees
            // and other tall decor use 0.5, while rocks and bushes
            // (short decor) use 0.95.
            const bottomFactor = isTallDecor ? 0.5 : 0.95;
            const groundY = screenHeight / 2;
            const top = groundY - spriteHeight * (1 - bottomFactor);
            const left = screenX - spriteWidth / 2;
            // Determine which vertical ray index this sprite occupies.  Use
            // the Z buffer to ensure the decoration is in front of the wall
            // slice at that horizontal position.
            const rayIndex = Math.floor(screenX / stripWidth);
            if (rayIndex >= 0 && rayIndex < zBuffer.length && dist < zBuffer[rayIndex]) {
                ctx.drawImage(
                    decor.sprite,
                    0, 0,
                    decor.sprite.width, decor.sprite.height,
                    left, top,
                    spriteWidth, spriteHeight
                );
            }
        }
    }

    // Update player movement and rotation
    function updatePlayer(dt) {
        const moveSpeed = 3; // units per second
        const rotSpeed = 2; // radians per second
        if (player.turnLeft) {
            player.angle -= rotSpeed * dt;
        }
        if (player.turnRight) {
            player.angle += rotSpeed * dt;
        }
        // Normalize angle
        while (player.angle < -Math.PI) player.angle += 2 * Math.PI;
        while (player.angle > Math.PI) player.angle -= 2 * Math.PI;
        // Movement forward/backward and strafing
        let moveX = 0;
        let moveY = 0;
        if (player.moveForward) {
            moveX += Math.cos(player.angle) * moveSpeed * dt;
            moveY += Math.sin(player.angle) * moveSpeed * dt;
        }
        if (player.moveBackward) {
            moveX -= Math.cos(player.angle) * moveSpeed * dt;
            moveY -= Math.sin(player.angle) * moveSpeed * dt;
        }
        // Strafe left/right moves perpendicular to the facing direction.
        // In our 2D coordinate system (x to the right, y downward), the
        // forward vector is (cos(angle), sin(angle)).  A 90° clockwise
        // rotation of this yields the right-hand vector (sin(angle),
        // -cos(angle)).  This ensures that when facing east (angle=0),
        // strafing right moves south (positive y) and strafing left
        // moves north (negative y).  Likewise, when facing south
        // (angle=π/2), strafing right moves west (negative x) and
        // strafing left moves east (positive x).  Using this vector
        // prevents the strafing directions from feeling inverted.
        if (player.strafeLeft) {
            moveX += -Math.sin(player.angle) * moveSpeed * dt;
            moveY +=  Math.cos(player.angle) * moveSpeed * dt;
        }
        if (player.strafeRight) {
            moveX +=  Math.sin(player.angle) * moveSpeed * dt;
            moveY += -Math.cos(player.angle) * moveSpeed * dt;
        }
        // Collision detection
        const newX = player.x + moveX;
        const newY = player.y + moveY;
        if (map[Math.floor(player.y)][Math.floor(newX)] === 0) {
            player.x = newX;
        }
        if (map[Math.floor(newY)][Math.floor(player.x)] === 0) {
            player.y = newY;
        }
    }

    // Shoot weapon from centre of screen
    function shootWeapon() {
        if (gameOver || reloading) return;
        const weapon = weapons[selectedWeapon];
        if (weapon.magazine <= 0) {
            if (weapon.totalAmmo > 0) reloadWeapon();
            return;
        }
        weapon.magazine--;
        // Find the closest enemy within a small angle threshold
        let target = null;
        let minDist = Infinity;
        const threshold = FOV * 0.05; // 5% of FOV
        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const dx = enemy.x - player.x;
            const dy = enemy.y - player.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angleTo = Math.atan2(dy, dx) - player.angle;
            let ang = angleTo;
            while (ang < -Math.PI) ang += 2 * Math.PI;
            while (ang > Math.PI) ang -= 2 * Math.PI;
            if (Math.abs(ang) < threshold && dist < minDist) {
                minDist = dist;
                target = enemy;
            }
        }
        if (target) {
            target.hit(weapon.damage);
        }
        // Trigger muzzle flash
        muzzleTimer = 0.15;
        // Trigger bullet tracer
        bulletTimer = 0.1;
        updateUI();
        if (weapon.magazine <= 0 && weapon.totalAmmo > 0) reloadWeapon();
    }

    // Reload current weapon
    function reloadWeapon() {
        if (reloading) return;
        const weapon = weapons[selectedWeapon];
        if (weapon.magazine >= weapon.ammoCapacity || weapon.totalAmmo <= 0) return;
        reloading = true;
        // Show the reloading indicator with blinking animation
        reloadInfo.classList.remove('hidden');
        reloadInfo.classList.add('reload-blink');
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => {
            const needed = weapon.ammoCapacity - weapon.magazine;
            const load = Math.min(needed, weapon.totalAmmo);
            weapon.magazine += load;
            weapon.totalAmmo -= load;
            reloading = false;
            // Hide the reloading indicator and stop blinking
            reloadInfo.classList.add('hidden');
            reloadInfo.classList.remove('reload-blink');
            updateUI();
        }, weapon.reloadTime);
    }

    // Keyboard controls
    window.addEventListener('keydown', e => {
        // When on the start menu, only Enter (Return) triggers the game start.
        // Accept multiple representations of the Enter key across keyboards:
        // the KeyboardEvent.code 'Enter' and 'NumpadEnter' as well as the
        // key value 'Enter'.  If detected, call startGame() and exit.
        if (gameState === 'menu') {
            const isEnter = (e.code === 'Enter' || e.code === 'NumpadEnter' || e.key === 'Enter');
            if (isEnter) {
                startGame();
            }
            return;
        }
        if (gameOver) return;
        switch (e.code) {
            case 'KeyW': player.moveForward = true; break;
            case 'KeyS': player.moveBackward = true; break;
            case 'KeyA': player.turnLeft = true; break;
            case 'KeyD': player.turnRight = true; break;
            case 'KeyQ': player.strafeLeft = true; break;
            case 'KeyE': player.strafeRight = true; break;
            case 'Digit1': selectedWeapon = 'shotgun'; updateUI(); break;
            case 'Digit2': selectedWeapon = 'laser'; updateUI(); break;
            case 'KeyR': reloadWeapon(); break;
            case 'Space': shootWeapon(); break;
        }
    });
    window.addEventListener('keyup', e => {
        switch (e.code) {
            case 'KeyW': player.moveForward = false; break;
            case 'KeyS': player.moveBackward = false; break;
            case 'KeyA': player.turnLeft = false; break;
            case 'KeyD': player.turnRight = false; break;
            case 'KeyQ': player.strafeLeft = false; break;
            case 'KeyE': player.strafeRight = false; break;
        }
    });
    // Mouse click to shoot
    canvas.addEventListener('click', () => {
        // Lazy initialise the AudioContext when the user first interacts.
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        shootWeapon();
    });

    // Update HUD values
    function updateUI() {
        // With waves removed, we clear the wave label and show only the kill count.
        if (waveInfo) waveInfo.textContent = '';
        killsInfo.textContent = `Kills: ${kills}/${TARGET_KILLS}`;
        // Update health and armour bars: width is percentage of max (100). Clamp to [0,100].
        const healthBar = document.getElementById('health-bar');
        const armorBar = document.getElementById('armor-bar');
        const hPerc = Math.max(0, Math.min(1, health / 100));
        const aPerc = Math.max(0, Math.min(1, armor / 100));
        healthBar.style.width = `${hPerc * 100}%`;
        armorBar.style.width = `${aPerc * 100}%`;

        // Update the HUD face tint based on current health. When health is
        // high, the face is normal. As health decreases, apply a red tint to
        // indicate damage. We map health 100->0 to hue rotation from 0 to 30
        // degrees and saturation increase to emphasise the red tone.
        const faceImg = document.getElementById('hud-face');
        const damageRatio = 1 - hPerc;
        const hue = damageRatio * 30;
        const sat = 1 + damageRatio * 1.0;
        faceImg.style.filter = `hue-rotate(${hue}deg) saturate(${sat})`;
        // Update weapon name and ammo count on the right. Show infinity symbol for unlimited ammo
        const weapon = weapons[selectedWeapon];
        document.getElementById('weapon-value').textContent = weapon.name;
        // Set the weapon icon to the idle gun sprite. We no longer switch
        // icons by weapon type because only a single gun is present.
        const weaponIcon = document.getElementById('weapon-icon');
        weaponIcon.src = 'gun_idle.png';
        const totalAmmoText = weapon.totalAmmo === Infinity ? '∞' : weapon.totalAmmo;
        document.getElementById('ammo-value').textContent = `${weapon.magazine}/${totalAmmoText}`;
    }

    // We no longer generate a flipped frame because the two walking
    // frames are provided directly.  The first frame is used as
    // enemyImage when both frames have loaded.  See the loading
    // logic above.

    // Start the game after all DOM content is loaded. This guarantees the game
    // starts even if the enemy image hasn't finished loading yet.
    window.addEventListener('load', () => {
        // Initialise only the overlay and start the render loop. The game
        // will spawn decorations, enemies and particles when the player
        // begins playing from the start menu. This prevents the gameplay
        // from running underneath the menu.
        overlay.classList.add('hidden');
        overlay.classList.remove('victory');
        // Set initial lastFrame and begin the animation loop.
        lastFrame = performance.now();
        requestAnimationFrame(gameLoop);
    });

    let lastFrame = 0;
    function gameLoop(now) {
        const dt = (now - lastFrame) / 1000;
        lastFrame = now;

        // Increment global enemy animation timer.  The timer controls the
        // walking animation for enemies.  A simple accumulating timer is
        // used so the frame selection is independent of the render loop
        // count.  When the timer grows large, the modulo operation in
        // drawEnemies ensures it wraps around properly.  This update
        // occurs regardless of game state.
        enemyAnimTimer += dt;
        // When in the start menu, draw a static backdrop and overlay the menu UI.
        // Do not update entities or handle gameplay logic.  We simply
        // render the environment once and return early.  The static
        // environment provides ambience behind the sign.
        if (gameState === 'menu') {
            // Clear the entire drawing area. Use the full canvas height
            // instead of only the game view height to erase any residual
            // menu overlay drawn across the HUD area.
            ctx.clearRect(0, 0, width, height);
            // Draw sky and ground
            drawSky();
            drawFloorPerspective([]);
            // Cast rays and draw walls
            const zBufMenu = castRays();
            // Draw sun (if enabled) and decorations for backdrop
            drawSun();
            drawDecorations(zBufMenu);
            // Draw mini map for situational awareness
            drawMiniMap();
            // Draw the menu overlay with controls and start prompt
            drawMenu();
            requestAnimationFrame(gameLoop);
            return;
        }
        if (!gameOver) {
            // Ensure overlay stays hidden during gameplay until triggered.
            // Clear any victory/win classes and reset inline styles from
            // previous runs.  Without removing these classes, opacity,
            // background and fade animations from the menu or win
            // screens can persist and cause the scene to appear dim.
            overlay.classList.add('hidden');
            overlay.classList.remove('win-screen');
            overlay.classList.remove('victory');
            overlay.style.animation = '';
            overlay.style.opacity = '';
            // Remove any dark background on the overlay.  A fully
            // transparent background ensures no dimming effect carries
            // over from menu or end screens.
            overlay.style.background = 'transparent';
            // Update player
            updatePlayer(dt);
            // Update enemies: movement, death animations and check damage to player
            for (const enemy of enemies) {
                // Death animation update
                if (enemy.dying) {
                    enemy.deathTimer -= dt;
                    enemy.scale = Math.max(0, enemy.deathTimer / 0.6);
                    if (enemy.deathTimer <= 0) {
                        enemy.alive = false;
                        enemy.dying = false;
                    }
                    continue;
                }
                if (!enemy.alive) continue;
                // Movement: move slowly towards player if path is free
                const ex = enemy.x;
                const ey = enemy.y;
                let vx = player.x - ex;
                let vy = player.y - ey;
                const dist = Math.sqrt(vx * vx + vy * vy);
                if (dist > 0.001) {
                    vx /= dist;
                    vy /= dist;
                }
                const speed = 1.0; // units per second
                const stepX = vx * speed * dt;
                const stepY = vy * speed * dt;
                // Move if new position not inside a wall
                if (map[Math.floor(ey)][Math.floor(ex + stepX)] === 0) {
                    enemy.x += stepX;
                }
                if (map[Math.floor(ey + stepY)][Math.floor(ex)] === 0) {
                    enemy.y += stepY;
                }
                // Check collision damage to player
                const dx = enemy.x - player.x;
                const dy = enemy.y - player.y;
                const pdist = Math.sqrt(dx * dx + dy * dy);
                if (pdist < 0.5) {
                    // Enemy damages player; cause red flash
                    let damage = 10 * dt;
                    const armorHit = Math.min(armor, damage * 0.6);
                    armor -= armorHit;
                    damage -= armorHit;
                    if (damage > 0) {
                        health -= damage;
                        damageFlash = 1; // trigger red flash
                    }
                    if (health <= 0) {
                        gameOver = true;
                        overlay.textContent = 'Game Over! You were crushed by the statues.';
                        // Remove any victory styling in case this was a prior win
                        overlay.classList.remove('victory');
                        overlay.classList.remove('hidden');
                        // Restore overlay background so the default
                        // semi‑transparent dark overlay is applied.
                        overlay.style.background = '';
                    }
                }
            }
            // Decrease muzzle and damage flash timers
            if (muzzleTimer > 0) {
                muzzleTimer -= dt;
                if (muzzleTimer < 0) muzzleTimer = 0;
            }
            if (damageFlash > 0) {
                damageFlash -= dt * 4;
                if (damageFlash < 0) damageFlash = 0;
            }
            if (bulletTimer > 0) {
                bulletTimer -= dt;
                if (bulletTimer < 0) bulletTimer = 0;
            }
            // Update gun bob timer based on movement. When the player is
            // moving forward or backward, bob faster. When turning, bob
            // slower, and when idle, bob very slowly. This creates a
            // classic side-to-side swaying effect reminiscent of old
            // shooters.
            if (player.moveForward || player.moveBackward) {
                gunBobTimer += dt * 6;
            } else if (player.turnLeft || player.turnRight) {
                gunBobTimer += dt * 3;
            } else {
                gunBobTimer += dt * 1.5;
            }
            // Update atmospheric particles
            updateParticles(dt);
            // Clear the canvas before rendering the new frame. Clear the
            // entire canvas (including HUD area) to remove any dim
            // overlays or artefacts from previous frames.
            ctx.clearRect(0, 0, width, height);
            // Draw the sky first
            drawSky();
            // Draw the ground plane with proper 3D perspective. Drawing
            // the floor before the walls ensures that wall slices
            // naturally occlude the ground without requiring per‑pixel
            // z‑buffer checks. Pass an empty array to indicate no
            // occlusion for the floor.
            drawFloorPerspective([]);
            // Cast rays and render walls. The returned zBuffer is used
            // for sorting sprites and decorations but not for floor
            // rendering.
            const zBuf = castRays();
            // Draw the sun on top of the sky
            drawSun();
            // Draw decorations first so enemies appear on top
            drawDecorations(zBuf);
            // Draw enemies
            drawEnemies(zBuf);
            // Draw gun (idle or firing)
            drawGun();
            // Draw bullet tracer
            drawBullet();
            // Draw atmospheric particles before the crosshair so that the
            // crosshair remains visible on top of all effects.
            drawParticles();
            // Draw crosshair
            drawCrosshair();
            // Draw a mini‑map in the corner to help the player navigate.
            drawMiniMap();
            // Draw damage flash overlay if taking damage
            drawDamageFlash();
            // Spawn new enemies if there are fewer than the desired active
            // amount and the kill target has not been reached. This keeps
            // pressure on the player without the need for wave mechanics.
            const aliveCount = enemies.filter(e => e.alive).length;
            if (aliveCount < ACTIVE_ENEMY_COUNT && kills < TARGET_KILLS) {
                spawnEnemy();
            }
            // When the player reaches the target kills, trigger a win. Display
            // a dramatic victory message and show it on the overlay. Apply
            // a special CSS class so the text is styled differently from
            // the regular game over screen. The message references a
            // lyric hinting at California beaches, matching the playful
            // theme of the game.
            if (kills >= TARGET_KILLS) {
                gameOver = true;
                // Replace the default victory message with a custom
                // end‑game screen. Remove any existing text or
                // classes and insert an <img> tag using the loaded
                // artwork. Apply the win‑screen CSS class to fade
                // the overlay in gracefully.
                overlay.innerHTML = '';
                overlay.classList.remove('victory');
                overlay.classList.add('win-screen');
                overlay.classList.remove('hidden');
                // Restore overlay background so the CSS for .win-screen
                // applies its dark fade. Without this, the inline
                // transparent background set during gameplay would
                // override the win‑screen styling.
                overlay.style.background = '';
                const winImg = document.createElement('img');
                winImg.src = 'end_game_screen.png';
                winImg.classList.add('win-img');
                overlay.appendChild(winImg);
            }
            // Gradually increment sky drift to add subtle cloud movement
            skyDrift += dt * 10;
            // Update ambient sound timer. Every few seconds a subtle drum
            // sound will play. The sound is generated via the WebAudio API.
            ambientTimer += dt;
            if (ambientTimer > 8 + Math.random() * 4) {
                playDrum();
                ambientTimer = 0;
            }
            updateUI();
            requestAnimationFrame(gameLoop);
        }
    }

    // Draw crosshair on screen
    function drawCrosshair() {
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        const cx = width / 2;
        const cy = screenHeight / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 8, cy);
        ctx.lineTo(cx + 8, cy);
        ctx.moveTo(cx, cy - 8);
        ctx.lineTo(cx, cy + 8);
        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draw a top‑down mini‑map showing the island layout and the player's
     * current position. The mini‑map is drawn in the top‑left corner of
     * the viewport and scales each map tile down to a small square. Walls
     * are shown as opaque cells and the player is drawn as a red dot.
     * This provides the player with situational awareness similar to
     * classic DOOM automaps without obscuring the main view.
     */
    function drawMiniMap() {
        // Size of each map tile in pixels on the mini‑map
        const tileSize = 8;
        const mapPxWidth = mapWidth * tileSize;
        const mapPxHeight = mapHeight * tileSize;
        // Offsets from the top‑left corner of the screen
        const xOffset = 10;
        const yOffset = 10;
        ctx.save();
        // Semi‑transparent background for the mini‑map
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(xOffset - 2, yOffset - 2, mapPxWidth + 4, mapPxHeight + 4);
        // Draw map cells
        for (let y = 0; y < mapHeight; y++) {
            for (let x = 0; x < mapWidth; x++) {
                if (map[y][x] > 0) {
                    ctx.fillStyle = '#777';
                    ctx.fillRect(xOffset + x * tileSize, yOffset + y * tileSize, tileSize, tileSize);
                } else {
                    // draw floor cells lightly for reference
                    ctx.fillStyle = 'rgba(200, 200, 200, 0.1)';
                    ctx.fillRect(xOffset + x * tileSize, yOffset + y * tileSize, tileSize, tileSize);
                }
            }
        }
        // Draw player position as a red dot
        const px = xOffset + player.x * tileSize;
        const py = yOffset + player.y * tileSize;
        ctx.fillStyle = '#ff4444';
        ctx.beginPath();
        ctx.arc(px, py, tileSize / 3, 0, Math.PI * 2);
        ctx.fill();
        // Indicate player direction with a small line
        const dx = Math.cos(player.angle);
        const dy = Math.sin(player.angle);
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + dx * tileSize, py + dy * tileSize);
        ctx.stroke();
        ctx.restore();
    }

    // Draw the gun held by the player at the bottom of the screen
    function drawGun() {
        // Draw the player's gun. Choose between idle and firing sprites based
        // on the muzzle timer. Both sprites are scaled down to occupy only
        // 25% of the screen width so they don't block the view. Maintain
        // aspect ratio using the intrinsic dimensions of the loaded image.
        const sprite = (muzzleTimer > 0 && fireGunImage.complete) ? fireGunImage : idleGunImage;
        if (!sprite.complete) return;
        const desiredWidth = width * 0.25;
        const aspect = sprite.height / sprite.width;
        const desiredHeight = desiredWidth * aspect;
        // Side-to-side sway based on gunBobTimer. The amplitude scales with
        // screen width so the sway remains proportional on different
        // resolutions. Using a sine function produces smooth oscillation.
        const bobAmp = width * 0.02;
        const bobX = Math.sin(gunBobTimer) * bobAmp;
        // Compute position so the gun sits just above the HUD and is centred,
        // then apply the horizontal bobbing offset.
        const x = (width - desiredWidth) / 2 + bobX;
        const y = screenHeight - desiredHeight + 10;
        ctx.drawImage(sprite, 0, 0, sprite.width, sprite.height, x, y, desiredWidth, desiredHeight);
    }

    // Draw muzzle flash when shooting
    function drawMuzzle() {
        if (muzzleTimer <= 0 || !muzzleImage.complete) return;
        const size = width * 0.2;
        const x = (width - size) / 2;
        // raise muzzle to just above gun
        const y = screenHeight - size - 90;
        ctx.save();
        ctx.globalAlpha = muzzleTimer / 0.15;
        ctx.drawImage(muzzleImage, 0, 0, muzzleImage.width, muzzleImage.height, x, y, size, size);
        ctx.restore();
    }

    // Draw bullet tracer when firing. This draws a simple vertical line from
    // the muzzle of the gun towards the centre of the screen. The opacity
    // fades out as the timer approaches zero. This is not a physical
    // simulation of a bullet but provides a satisfying shooting effect.
    function drawBullet() {
        if (bulletTimer <= 0) return;
        ctx.save();
        // Fade the tracer based on remaining time
        const alpha = bulletTimer / 0.1;
        // Yellow-white colour to stand out on the scene
        ctx.strokeStyle = `rgba(255, 255, 128, ${alpha})`;
        ctx.lineWidth = 4;
        const startX = width / 2;
        // Starting y coordinate: just above the gun barrel
        const startY = screenHeight - (screenHeight * 0.2);
        // Ending y coordinate: slightly above the center of view
        const endY = screenHeight / 2;
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, endY);
        ctx.stroke();
        ctx.restore();
    }

    // Draw red overlay when taking damage
    function drawDamageFlash() {
        if (damageFlash <= 0) return;
        ctx.save();
        // Ensure the damage overlay does not interfere with subsequent
        // rendering. Use the default composite operation so the red
        // flash simply blends over what has already been drawn.
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgba(255, 0, 0, ${0.4 * damageFlash})`;
        ctx.fillRect(0, 0, width, screenHeight);
        ctx.restore();
    }

    // Play a short low-frequency drum sound using the Web Audio API. The
    // AudioContext is created lazily to comply with browser autoplay
    // restrictions. The oscillator frequency and gain envelope are chosen
    // to resemble a distant tribal drum.
    function playDrum() {
        if (!audioCtx) return; // audio context not started yet
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        // Quick attack and exponential decay to simulate a drum beat
        gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    }

    // Initialise atmospheric particles. Creates a number of small dust
    // motes with random positions, speeds and sizes. These particles
    // gently drift upward and reset once they leave the visible area.
    function initParticles(count) {
        particles.length = 0;
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * screenHeight,
                speed: 20 + Math.random() * 40,
                size: 1 + Math.random() * 2,
                opacity: 0.2 + Math.random() * 0.3
            });
        }
    }

    // Update particle positions. Particles move upward at their own speed.
    function updateParticles(dt) {
        for (const p of particles) {
            p.y -= p.speed * dt;
            // When a particle moves past the top of the screen, wrap it
            if (p.y < -20) {
                p.y = screenHeight + Math.random() * 20;
                p.x = Math.random() * width;
            }
        }
    }

    // Draw atmospheric particles. Small semi-transparent squares give
    // the impression of dust and pollen illuminated by the sun.
    function drawParticles() {
        ctx.save();
        for (const p of particles) {
            ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.restore();
    }
})();
