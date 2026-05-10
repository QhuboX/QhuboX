const canvas = document.getElementById('mentalcanvas'); // <-- ID CORREGIDO
// Verificar si el canvas existe antes de continuar
if (!canvas) {
    console.error("No se encontró el elemento canvas con el ID 'mentalcanvas'.");
} else { 
    const ctx = canvas.getContext('2d');

    // --- CONFIGURACIÓN ---
    let width, height;
    const gridSize = 50; 
    const gridColor = 'rgba(53, 117, 255, 0.02)'; 
    const highlightColor = 'rgba(135, 172, 252, 0.65)'; 
    const cometColor = '#20375177';
    const maxComets = 3; 
    let animationFrameId = null; 

    // --- FUNCIÓN DE CONVERSIÓN ---
    function hexToRgb(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `${r}, ${g}, ${b}`;
    }

    const cometRgb = hexToRgb(cometColor);
    const comets = [];

    // --- OPTIMIZACIÓN DE REDIMENSIÓN (DEBOUNCE) ---
    let resizeTimer;
    function handleResize() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 250);
    }

    function resize() {
        width = canvas.width = window.innerWidth; 
        height = canvas.height = window.innerHeight;
        comets.forEach(comet => comet.reset());
        if (!animationFrameId) {
             animate(); 
        }
    }

    // --- CLASE COMETA y demás lógica (Update, Draw, etc.) ---
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
            const tailLength = 110; 
            let grad;
            ctx.beginPath(); 

            // 1. DIBUJAR LA COLA
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

            grad.addColorStop(0, `rgba(${cometRgb}, 0)`);
            grad.addColorStop(1, `rgba(${cometRgb}, ${this.opacity})`);

            ctx.strokeStyle = grad;
            ctx.lineWidth = 2;
            ctx.stroke();

            // 2. DIBUJAR LA CABEZA 
            ctx.fillStyle = '#203751ff';
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

    // Inicialización
    for (let i = 0; i < maxComets; i++) {
        comets.push(new Comet());
    }

    function drawRandomSquare() {
        if (Math.random() > 0.985) { 
            const x = Math.floor(Math.random() * (width / gridSize)) * gridSize;
            const y = Math.floor(Math.random() * (height / gridSize)) * gridSize;
            
            ctx.fillStyle = highlightColor;
            ctx.fillRect(x + 1, y + 1, gridSize - 2, gridSize - 2);
            
            ctx.strokeStyle = cometColor;
            ctx.lineWidth = 0.5;
            ctx.strokeRect(x + 5, y + 5, gridSize - 10, gridSize - 10);
        }
    }

    function drawGrid() {
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
    }
    
    function animate() {
        // *** CAMBIO CLAVE ***
        // Se aumenta la opacidad a 0.5 para que los cuadrados se "limpien" mucho más rápido.
        // Si se quiere un borrado instantáneo, usar ctx.clearRect(0, 0, width, height); 
        // pero se perdería el rastro de los cometas. Con 0.5 se limpia rápido.
        ctx.fillStyle = 'rgba(8, 8, 8, 0.5)'; // Opacidad aumentada de 0.05 a 0.5
        ctx.fillRect(0, 0, width, height);

        drawGrid();
        drawRandomSquare(); 

        comets.forEach(comet => {
            comet.update();
            comet.draw();
        });

        animationFrameId = requestAnimationFrame(animate);
    }

    // Iniciar
    window.addEventListener('resize', handleResize);
    resize();
    animate();
}