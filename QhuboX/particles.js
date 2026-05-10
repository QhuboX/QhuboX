// particles.js - Animación de Partículas sin Estela

document.addEventListener('DOMContentLoaded', () => {
    
    /**
     * @description Configura y maneja el redimensionamiento de un elemento canvas.
     * @param {string} id - El ID del elemento canvas.
     * @returns {{canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D, W: () => number, H: () => number} | null} Objeto con canvas, contexto, ancho y alto si se encuentra el canvas.
     */
    const setupCanvas = (id) => {
        const canvas = document.getElementById(id);
        if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
            console.error(`Canvas con ID '${id}' no encontrado o no es un elemento canvas.`);
            return null;
        }
        
        const ctx = canvas.getContext('2d');
        let W, H;

        const resize = () => {
            
            W = window.innerWidth;
            H = window.innerHeight;
            canvas.width = W;
            canvas.height = H;
        };

       
        window.addEventListener('resize', resize);
        resize();

        return { 
            canvas, 
            ctx, 
            W: () => W, 
            H: () => H 
        };
    };

    // --- LÓGICA DEL CANVAS DE PARTÍCULAS (particlesCanvas) ---
    // En tu HTML, el ID de la sección es 'somos-proya' y el canvas es 'particlesCanvas'.
    const canvasData = setupCanvas('particlesCanvas');

    if (canvasData) {
        const { ctx: particlesCtx, W: getParticlesW, H: getParticlesH } = canvasData;
        
        const numParticles = 80;
        const particles = [];
        const maxDist = 150;
        const lineColor = 'rgba(0, 255, 255, 0.08)';

        class Particle {
            constructor(W, H) {
                // Posición inicial aleatoria dentro de los límites del canvas
                this.x = W * Math.random();
                this.y = H * Math.random();
                // Velocidad aleatoria ligera
                this.vx = Math.random() * 0.5 - 0.25;
                this.vy = Math.random() * 0.5 - 0.25;
                this.radius = 1.5 + Math.random(); // Radio ligeramente más grande y variable
                this.opacity = 0.5 + Math.random() * 0.5;
            }

            update(W, H) {
                this.x += this.vx;
                this.y += this.vy;

                // Rebote en los bordes
                if (this.x <= 0 || this.x >= W) this.vx *= -1;
                if (this.y <= 0 || this.y >= H) this.vy *= -1;
            }

            draw(ctx) {
                ctx.fillStyle = `rgba(0, 255, 255, ${this.opacity})`;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Inicializar partículas
        const initialW = getParticlesW();
        const initialH = getParticlesH();
        for (let i = 0; i < numParticles; i++) {
            particles.push(new Particle(initialW, initialH));
        }

        /**
         * @description Bucle principal de animación para el efecto de red neuronal.
         * @param {number} timestamp - Marca de tiempo proporcionada por requestAnimationFrame.
         */
        const drawParticles = (timestamp) => {
            const W = getParticlesW();
            const H = getParticlesH();
            
            // Limpiar el canvas para el nuevo frame.
            particlesCtx.clearRect(0, 0, W, H);
            // 'lighter' hace que el color se sume, creando un efecto de brillo/glow.
            particlesCtx.globalCompositeOperation = 'lighter'; 

            for (let i = 0; i < numParticles; i++) {
                const p1 = particles[i];
                p1.update(W, H);
                p1.draw(particlesCtx);

                // Dibujar líneas de conexión entre partículas cercanas
                for (let j = i + 1; j < numParticles; j++) {
                    const p2 = particles[j];
                    const dx = p1.x - p2.x;
                    const dy = p1.y - p2.y;
                    const distSq = dx * dx + dy * dy; // Distancia al cuadrado (más rápido que Math.sqrt)

                    if (distSq < maxDist * maxDist) { // Comparar con el cuadrado de maxDist
                        // Calcular la opacidad basada en la distancia
                        const dist = Math.sqrt(distSq);
                        // Opacidad decreciente a medida que la distancia aumenta
                        const opacity = (1 - dist / maxDist) * 0.3; // Máx. opacidad de 0.3 para un efecto sutil

                        particlesCtx.strokeStyle = `rgba(0, 255, 255, ${opacity})`;
                        particlesCtx.lineWidth = 0.5;
                        particlesCtx.beginPath();
                        particlesCtx.moveTo(p1.x, p1.y);
                        particlesCtx.lineTo(p2.x, p2.y);
                        particlesCtx.stroke();
                    }
                }
            }
            
            // Restaurar el modo de composición por defecto para otros dibujos
            particlesCtx.globalCompositeOperation = 'source-over'; 
            
            requestAnimationFrame(drawParticles);
        };
        
        requestAnimationFrame(drawParticles);
    }
});