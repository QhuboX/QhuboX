document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('blockchainCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width, height;
    let floatingCubes = [];
    let circuits = [];
    let flares = [];

    const COLORS = {
        cyan: '#00e5ff',
        blue: '#2979ff',
        white: '#ffffff',
        pinkGlow: '#ff00aa',
        gold: '#FFD700',   // Oro metálico
        silver: '#E0E0E0', // Plata
        titanium: '#a5abb6' // Titanio
    };

    let liveData = {
        address: "0xCAFEFEED",
        blockHash: "a9f8...3b2c",
        ping: 12,
        uptime: 0,
        binary: "10110010"
    };

    function randomHex(length) {
        let result = '';
        const chars = '01';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    setInterval(() => {
        liveData.blockHash = randomHex(4).toLowerCase() + '...' + randomHex(4).toLowerCase();
        liveData.binary = Math.random().toString(2).substr(2, 8);
        liveData.ping = Math.floor(Math.random() * 40) + 10;
        if (Math.random() > 0.9) liveData.address = '0x' + randomHex(8);
    }, 150);

    setInterval(() => liveData.uptime++, 1000);

    // --- CLASE CUBO 3D CON FÍSICA DE REBOTE ---
    class FloatingCube {
        constructor() {
            this.size = Math.random() * 2 + 2;
            this.x = Math.random() * (window.innerWidth - this.size * 2) + this.size;
            this.y = Math.random() * (window.innerHeight - this.size * 2) + this.size;
            this.z = Math.random() * 400;
            this.vx = (Math.random() - 0.5) * 2;
            this.vy = (Math.random() - 0.5) * 2;
            this.rotationX = Math.random() * Math.PI;
            this.rotationY = Math.random() * Math.PI;
            this.rotSpeed = Math.random() * 0.02;
            this.opacity = Math.random() * 0.2 + 0.1;
        }

        project(x, y, z) {
            const perspective = 500 / (500 + z);
            return { x: x * perspective + this.x, y: y * perspective + this.y };
        }

        update() {
            // Rebotar en bordes (sin esconderse)
            if (this.x - this.size < 0 || this.x + this.size > width) this.vx *= -1;
            if (this.y - this.size < 0 || this.y + this.size > height) this.vy *= -1;

            this.x += this.vx;
            this.y += this.vy;
            this.rotationX += this.rotSpeed;
            this.rotationY += this.rotSpeed;
        }

        draw() {
            const s = this.size;
            const vertices = [
                {x:-s, y:-s, z:-s}, {x:s, y:-s, z:-s}, {x:s, y:s, z:-s}, {x:-s, y:s, z:-s},
                {x:-s, y:-s, z:s}, {x:s, y:-s, z:s}, {x:s, y:s, z:s}, {x:-s, y:s, z:s}
            ];

            const rotated = vertices.map(v => {
                let x = v.x, y = v.y, z = v.z;
                let tx = x * Math.cos(this.rotationY) - z * Math.sin(this.rotationY);
                let tz = x * Math.sin(this.rotationY) + z * Math.cos(this.rotationY);
                x = tx; z = tz;
                let ty = y * Math.cos(this.rotationX) - z * Math.sin(this.rotationX);
                tz = y * Math.sin(this.rotationX) + z * Math.cos(this.rotationX);
                y = ty; z = tz;
                return this.project(x, y, z);
            });

            const lines = [[0,1,2,3,0], [4,5,6,7,4], [0,4], [1,5], [2,6], [3,7]];
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0, 229, 255, ${this.opacity})`;
            ctx.lineWidth = 1;
            lines.forEach(line => {
                ctx.moveTo(rotated[line[0]].x, rotated[line[0]].y);
                line.slice(1).forEach(i => ctx.lineTo(rotated[i].x, rotated[i].y));
            });
            ctx.stroke();
        }
    }

    // --- MANEJADOR DE COLISIONES ENTRE CUBOS ---
    function resolveCubeCollisions() {
        for (let i = 0; i < floatingCubes.length; i++) {
            for (let j = i + 1; j < floatingCubes.length; j++) {
                let c1 = floatingCubes[i];
                let c2 = floatingCubes[j];
                let dx = c2.x - c1.x;
                let dy = c2.y - c1.y;
                let distance = Math.sqrt(dx * dx + dy * dy);
                let minDistance = c1.size + c2.size;

                if (distance < minDistance) {
                    // Intercambio simple de velocidades (rebote)
                    [c1.vx, c2.vx] = [c2.vx, c1.vx];
                    [c1.vy, c2.vy] = [c2.vy, c1.vy];
                }
            }
        }
    }

    // --- CIRCUITOS CON COLORES METÁLICOS Y PUNTAS FIJAS ---
    class CircuitBorder {
        constructor(isLeft) {
            this.isLeft = isLeft;
            this.paths = [];
            this.generatePaths();
        }

        generatePaths() {
            const numLines = 14;
            const metalColors = [COLORS.cyan, COLORS.gold, COLORS.silver, COLORS.titanium];
            for (let i = 0; i < numLines; i++) {
                const startY = (height / numLines) * i + (Math.random() * 40 - 20);
                const startX = this.isLeft ? 0 : width;
                const dir = this.isLeft ? 1 : -1;
                let path = [{x: startX, y: startY}];
                let currentX = startX;
                let currentY = startY;

                currentX += (40 + Math.random() * 120) * dir;
                path.push({x: currentX, y: currentY});
                const diagSize = 40 + Math.random() * 60;
                currentX += diagSize * dir;
                currentY += diagSize * (Math.random() > 0.5 ? 1 : -1);
                path.push({x: currentX, y: currentY});
                currentX += (60 + Math.random() * 150) * dir;
                path.push({x: currentX, y: currentY});

                this.paths.push({ 
                    nodes: path, 
                    thickness: Math.random() > 0.7 ? 2 : 0.8,
                    color: metalColors[Math.floor(Math.random() * metalColors.length)]
                });
            }
        }

        draw() {
            this.paths.forEach(p => {
                ctx.beginPath();
                ctx.strokeStyle = p.color + "44"; // Opacidad baja para el cable
                ctx.lineWidth = p.thickness;
                ctx.moveTo(p.nodes[0].x, p.nodes[0].y);
                p.nodes.slice(1).forEach(n => ctx.lineTo(n.x, n.y));
                ctx.stroke();

                // --- PUNTOS DE LUZ FIJOS EN CADA EXTREMO ---
                const lastNode = p.nodes[p.nodes.length - 1];
                ctx.shadowBlur = 15;
                ctx.shadowColor = p.color;
                ctx.fillStyle = COLORS.white;
                ctx.beginPath();
                ctx.arc(lastNode.x, lastNode.y, p.thickness + 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            });
        }
    }

    // --- REUTILIZACIÓN DE LIGHTFLARE ---
    class LightFlare {
        constructor() {
            this.x = Math.random() * width;
            this.y = Math.random() * height;
            this.size = 1 + Math.random() * 1;
            this.pulseSpeed = 0.01 + Math.random() * 0.02;
            this.time = Math.random() * 100;
            this.color = Math.random() > 0.8 ? COLORS.pinkGlow : COLORS.cyan;
        }
        draw() {
            this.time += this.pulseSpeed;
            const currentSize = this.size + Math.sin(this.time) * (this.size * 0.5);
            const opacity = 0.5 + Math.sin(this.time) * 0.5;

            ctx.save();
            ctx.translate(this.x, this.y);
            
            const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, currentSize * 5);
            grad.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
            grad.addColorStop(0.2, this.color === COLORS.cyan ? `rgba(0, 229, 255, ${opacity * 0.8})` : `rgba(255, 0, 170, ${opacity * 0.8})`);
            grad.addColorStop(1, 'transparent');
            
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(0, 0, currentSize * 5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
            ctx.fillRect(-currentSize * 8, -0.5, currentSize * 16, 1);
            ctx.fillRect(-0.5, -currentSize * 2, 1, currentSize * 4);
            
            ctx.restore();
        }
    }
    function init() {
        const parent = canvas.parentElement;
        width = canvas.width = parent.offsetWidth || window.innerWidth;
        height = canvas.height = parent.offsetHeight || window.innerHeight;
        floatingCubes = Array.from({ length: 4 }, () => new FloatingCube());
        circuits = [new CircuitBorder(true), new CircuitBorder(false)];
        flares = Array.from({ length: 10 }, () => new LightFlare());
    }

   function drawTechText() {
    ctx.font = "10px monospace"; // Un poco más pequeño para que quepa más detalle
    ctx.fillStyle = "rgba(0, 229, 255, 0.6)";
    const margin = 50;

    // --- BLOQUE SUPERIOR IZQUIERDO (SISTEMA) ---
    ctx.fillText(`SYSTEM.RUNTIME // ${liveData.uptime}s`, margin, 60);
    ctx.fillText(`PROTOCOL: TLS_v1.3_AES_256`, margin, 75);
    ctx.fillText(`CPU_LOAD: [${"|".repeat(Math.floor(liveData.ping/5))}${" ".repeat(10 - Math.floor(liveData.ping/5))}]`, margin, 90);

    // --- BLOQUE INFERIOR IZQUIERDO (BLOCKCHAIN) ---
    ctx.fillStyle = COLORS.cyan + "AA";
    ctx.fillText(`> BLOCK_HASH: ${liveData.blockHash}`, margin, height - 120);
    ctx.fillText(`> NODE_STATUS: SYNCED`, margin, height - 105);
    ctx.fillText(`> MEM_POOL: ${ (Math.random() * 500).toFixed(2) } MB`, margin, height - 90);

    // --- BLOQUE SUPERIOR DERECHO (RED) ---
    ctx.textAlign = "right";
    ctx.fillText(`NETWORK: CONNECTED [${liveData.ping}Live]`, width - margin, 60);
    ctx.fillText(`B_WIDTH: ${ (liveData.ping * 1.5).toFixed(1) } Gbps`, width - margin, 75);
    ctx.fillText(`CODING: ${liveData.binary}`, width - margin, 90);

    // --- BLOQUE INFERIOR DERECHO (WALLET / CAFEFEED) ---
    ctx.fillStyle = COLORS.white + "88";
    ctx.fillText(`ADDR: ${liveData.address}`, width - margin, height - 105);
    ctx.fillText(`TX_ID: ${randomHex(16)}`, width - margin, height - 90);
    
    // Mini barra de carga estética en la esquina
    ctx.strokeStyle = "rgba(0, 229, 255, 0.3)";
    ctx.strokeRect(width - margin - 100, height - 80, 100, 4);
    ctx.fillStyle = COLORS.cyan;
    ctx.fillRect(width - margin - 100, height - 80, (liveData.uptime % 10) * 10, 4);

    // --- CENTRO LATERAL (COORDENADAS) ---
    // Esto se ve muy "pro" porque cambia según el movimiento sutil de los datos
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(0, 229, 255, 0.3)";
    ctx.save();
    ctx.translate(width - 20, height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(`COORD_Z: ${ (Math.sin(liveData.uptime) * 100).toFixed(4) }`, 0, 0);
    ctx.restore();

    ctx.textAlign = "left"; // Reset para no afectar otros dibujos
}

    function animate() {
        ctx.clearRect(0, 0, width, height);
        
        resolveCubeCollisions(); // Procesar rebotes entre cubos
        
        floatingCubes.forEach(c => {
            c.update();
            c.draw();
        });
        
        circuits.forEach(c => c.draw());
        drawTechText();
        flares.forEach(f => f.draw());
        requestAnimationFrame(animate);
    }

    window.addEventListener('resize', init);
    init();
    animate();
});