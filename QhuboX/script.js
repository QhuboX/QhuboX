const canvas = document.getElementById('gridCanvas');
const ctx = canvas.getContext('2d');

// --- CONFIGURACIÓN ---
let width, height;
const gridSize = 50; 
const gridColor = 'rgba(255, 255, 255, 0.05)'; 
const highlightColor = 'rgba(0, 8, 255, 0.2)'; 
const cometColor = '#28466877';
const maxComets = 48; 

// --- FUNCIÓN DE CONVERSIÓN (NUEVA) ---
// Convierte un color Hex (#RRGGBB) a una cadena RGB (R, G, B) para usar con opacidad
function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r}, ${g}, ${b}`;
}

// Almacenamos la versión RGB de la variable para usarla en el gradiente
const cometRgb = hexToRgb(cometColor);

const comets = [];

function resize() {
    width = canvas.width = document.getElementById('hero').offsetWidth;
    height = canvas.height = document.getElementById('hero').offsetHeight;
}
window.addEventListener('resize', resize);
resize();

// --- CLASE COMETA ---
class Comet {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = Math.floor(Math.random() * (width / gridSize)) * gridSize;
        this.y = Math.floor(Math.random() * (height / gridSize)) * gridSize;
        this.direction = Math.floor(Math.random() * 4);
        this.speed = 3; 
        this.life = 100 + Math.random() * 100; 
        this.opacity = 0;
    }

    update() {
        if (this.opacity < 1) this.opacity += 0.05;
        
        if (this.direction === 0) this.x += this.speed;
        if (this.direction === 1) this.y += this.speed;
        if (this.direction === 2) this.x -= this.speed;
        if (this.direction === 3) this.y -= this.speed;

        this.life--;

        if (this.x > width || this.x < 0 || this.y > height || this.y < 0 || this.life <= 0) {
            this.reset();
        }
    }

    draw() {
        const tailLength = 0; 
        let grad;

        ctx.beginPath();

        // 1. DIBUJAR LA COLA (utilizando cometRgb)
        if (this.direction === 0) {
            grad = ctx.createLinearGradient(this.x - tailLength, this.y, this.x, this.y);
            ctx.moveTo(this.x - tailLength, this.y);
            ctx.lineTo(this.x, this.y);
        } 
        else if (this.direction === 1) {
            grad = ctx.createLinearGradient(this.x, this.y - tailLength, this.x, this.y);
            ctx.moveTo(this.x, this.y - tailLength);
            ctx.lineTo(this.x, this.y);
        } 
        else if (this.direction === 2) {
            grad = ctx.createLinearGradient(this.x + tailLength, this.y, this.x, this.y);
            ctx.moveTo(this.x + tailLength, this.y);
            ctx.lineTo(this.x, this.y);
        } 
        else {
            grad = ctx.createLinearGradient(this.x, this.y + tailLength, this.x, this.y);
            ctx.moveTo(this.x, this.y + tailLength);
            ctx.lineTo(this.x, this.y);
        }

        // --- CORRECCIÓN CLAVE AQUÍ: Usamos cometRgb ---
        grad.addColorStop(0, `rgba(${cometRgb}, 0)`); // Cola: Transparente
        grad.addColorStop(1, `rgba(${cometRgb}, ${this.opacity})`); // Cabeza: Color variable + opacidad

        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.stroke();

        // 2. DIBUJAR LA CABEZA (PUNTO BLANCO)
        ctx.fillStyle = '#2258f90c';
        ctx.beginPath();

        const offset = 3; 
        let tipX = this.x;
        let tipY = this.y;

        if (this.direction === 0) tipX += offset;
        else if (this.direction === 1) tipY += offset;
        else if (this.direction === 2) tipX -= offset;
        else if (this.direction === 3) tipY -= offset;

        ctx.arc(tipX, tipY, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

for (let i = 0; i < maxComets; i++) {
    comets.push(new Comet());
}

function drawRandomSquare() {
    if (Math.random() > 0.95) {
        const x = Math.floor(Math.random() * (width / gridSize)) * gridSize;
        const y = Math.floor(Math.random() * (height / gridSize)) * gridSize;
        
        ctx.fillStyle = highlightColor;
        ctx.fillRect(x + 1, y + 1, gridSize - 2, gridSize - 2);
        
        // Esta parte ya usaba cometColor correctamente
        ctx.strokeStyle = cometColor;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(x + 5, y + 5, gridSize - 10, gridSize - 10);
    }
}

function animate() {
    ctx.clearRect(0, 0, width, height);

    // Grilla
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    
    for (let x = 0; x <= width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();

    drawRandomSquare(); 

    comets.forEach(comet => {
        comet.update();
        comet.draw();
    });

    requestAnimationFrame(animate);
}

animate();