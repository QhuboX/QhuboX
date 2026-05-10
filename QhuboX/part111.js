// part.js - Animación de Partículas sin Estela
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('partCanvas');
    if (!canvas) {
        console.warn("Canvas 'partCanvas' no encontrado, la animación no se iniciará.");
        return;
    }
    const ctx = canvas.getContext('2d');
    let width, height; // Dimensiones actuales del canvas
    
    // --- Configuración de las Partículas ---
    const numParticles = 120; 
    const particleSize = 1.8; 
    const particleColors = [
        'rgba(103, 217, 255, 1)', 
        'rgba(248, 81, 164, 0.88)', 
        'rgba(73, 3, 211, 0.9)', 
        'rgba(255, 255, 255, 0.8)'
    ];
    
    const baseSpeed = 0.5; 
    const maxConnectionDistance = 150; 
    const connectionOpacityFactor = 0.0581; 

    let particles = [];
    let animationFrameId;

    // --- Clase Partícula ---
    class Particle {
        constructor(x, y) {
            this.x = x !== undefined ? x : Math.random() * width;
            this.y = y !== undefined ? y : Math.random() * height;
            
            this.vx = (Math.random() - 0.5) * baseSpeed * 2;
            this.vy = (Math.random() - 0.5) * baseSpeed * 2;
            
            this.size = Math.random() * particleSize + 0.5;
            this.color = particleColors[Math.floor(Math.random() * particleColors.length)];
            this.opacity = Math.random() * 0.8 + 0.5; 
        }

        update() {
            this.x += this.vx;
            this.y += this.vy;

            // Rebotar en los bordes
            if (this.x < 0 || this.x > width) this.vx *= -1;
            if (this.y < 0 || this.y > height) this.vy *= -1;

            // Movimiento sinodal
            const time = performance.now() * 0.0005;
            this.x += Math.sin(time + this.y * 0.01) * 0.2;
            this.y += Math.cos(time + this.x * 0.01) * 0.2;

            this.opacity = Math.max(0.4, Math.min(0.9, this.opacity + (Math.random() - 0.5) * 0.01));
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = this.color.replace(/, [\d.]+?\)/, `, ${this.opacity})`);
            ctx.fill();
        }
    }

    // --- Funciones de Inicialización y Redimensionamiento ---

    /**
     * Inicializa las partículas (solo se llama al inicio).
     */
    function initParticles() {
        particles = [];
        for (let i = 0; i < numParticles; i++) {
            particles.push(new Particle());
        }
    }

    /**
     * Ajusta el tamaño del canvas (área de dibujo) y reposiciona las partículas.
     */
    function resizeCanvas() {
        const parent = canvas.parentElement;

        // Guardar las dimensiones viejas antes de actualizar
        const oldWidth = width;
        const oldHeight = height;

        // Establecer el nuevo tamaño del canvas (Drawing Buffer)
        width = canvas.width = parent.offsetWidth;
        height = canvas.height = parent.offsetHeight;
        
        // Si es la primera ejecución, inicializa las partículas
        if (particles.length === 0) {
            initParticles();
        } else if (oldWidth > 0 && oldHeight > 0) {
            // Si el canvas ya existía, ajustamos las coordenadas proporcionalmente
            const widthRatio = width / oldWidth;
            const heightRatio = height / oldHeight;

            particles.forEach(p => {
                // Mover las partículas a su nueva posición proporcional
                p.x *= widthRatio;
                p.y *= heightRatio;
                
                // Asegurar que no se salgan del nuevo límite (en caso de que el ratio sea muy grande)
                p.x = Math.min(Math.max(p.x, 0), width);
                p.y = Math.min(Math.max(p.y, 0), height);
            });
        }
    }

    window.addEventListener('resize', resizeCanvas);
    
    // Llamada inicial: Establece el tamaño y llama a initParticles
    resizeCanvas(); 

    // --- Bucle de Animación Principal ---
    function animate() {
        // Borrar completamente el canvas en cada fotograma.
        ctx.clearRect(0, 0, width, height); 

        // Dibujar y actualizar partículas
        particles.forEach(p => {
            p.update();
            p.draw();
        });

        // Dibujar líneas de conexión
        for (let i = 0; i < numParticles; i++) {
            for (let j = i + 1; j < numParticles; j++) {
                const p1 = particles[i];
                const p2 = particles[j];

                const distance = Math.sqrt(
                    Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2)
                );

                if (distance < maxConnectionDistance) {
                    ctx.beginPath();
                    ctx.moveTo(p1.x, p1.y);
                    ctx.lineTo(p2.x, p2.y);
                    
                    const opacity = 1 - (distance / maxConnectionDistance);
                    ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * connectionOpacityFactor})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }

        animationFrameId = requestAnimationFrame(animate);
    }

    animate();
});