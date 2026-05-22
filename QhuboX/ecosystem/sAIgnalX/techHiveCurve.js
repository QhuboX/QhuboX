document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('techHiveCurve');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height, cx, cy;

    let particles = [];
    let comets = [];
    let mouseX = width / 2;
    let mouseY = height / 2;
    let targetMouseX = width / 2;
    let targetMouseY = height / 2;

    const config = {
        particleCount: 220,
        mouseInfluence: 0.0001,    // Reducido drásticamente
        baseSpeed: 0.00015,        // Movimiento casi estático
        parallaxStrength: 0.00015  // Efecto de cámara muy leve para no marear
    };

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
        cx = width / 2;
        cy = height / 2;
        mouseX = targetMouseX = cx;
        mouseY = targetMouseY = cy;
        initParticles();
        comets = []; 
    }

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', (e) => {
        targetMouseX = e.clientX;
        targetMouseY = e.clientY;
    });

    class Particle {
        constructor() {
            this.reset();
            this.x = Math.random() * width;
            this.y = Math.random() * height;
        }

        reset() {
            this.depth = Math.random() * 0.8 + 0.3;
            this.size = (Math.random() * 1.8 + 0.4) * this.depth;
            
            const side = Math.floor(Math.random() * 4);
            if (side === 0) { 
                this.x = Math.random() * width;
                this.y = -10;
            } else if (side === 1) { 
                this.x = width + 10;
                this.y = Math.random() * height;
            } else if (side === 2) { 
                this.x = Math.random() * width;
                this.y = height + 10;
            } else { 
                this.x = -10;
                this.y = Math.random() * height;
            }

            this.baseVx = (Math.random() - 0.5) * config.baseSpeed * this.depth;
            this.baseVy = (Math.random() - 0.5) * config.baseSpeed * this.depth;
            
            this.vx = this.baseVx;
            this.vy = this.baseVy;

            // Paleta de colores de Solana: Morado (#9945FF) y Verde (#14F195)
            const colorType = Math.random();
            if (colorType < 0.45) {
                // Verde Solana
                this.r = 20;
                this.g = 241;
                this.b = 149;
            } else if (colorType < 0.90) {
                // Morado Solana
                this.r = 153;
                this.g = 69;
                this.b = 255;
            } else {
                // Blanco brillante para estrellas de contraste
                this.r = 255;
                this.g = 255;
                this.b = 255;
            }

            this.baseAlpha = (Math.random() * 0.6 + 0.2) * this.depth;
            this.alpha = this.baseAlpha;
            
            this.pulseSpeed = 0.0005 + Math.random() * 0.001;
            this.pulseOffset = Math.random() * Math.PI * 2;
        }

        update(time) {
            // Suavizado del movimiento del mouse
            mouseX += (targetMouseX - mouseX) * 0.05;
            mouseY += (targetMouseY - mouseY) * 0.05;

            const parallaxX = (mouseX - cx) * config.parallaxStrength * this.depth;
            const parallaxY = (mouseY - cy) * config.parallaxStrength * this.depth;

            this.vx = this.baseVx + parallaxX * 0.01;
            this.vy = this.baseVy + parallaxY * 0.01;

            this.x += this.vx;
            this.y += this.vy;

            // Titileo muy sutil (variación de solo 10% de su opacidad base)
            const pulse = Math.sin(time * this.pulseSpeed + this.pulseOffset);
            this.alpha = this.baseAlpha * (0.9 + pulse * 0.1);

            if (this.x < -30 || this.x > width + 30 || this.y < -30 || this.y > height + 30) {
                this.reset();
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha})`;
            ctx.fill();

            // Resplandor sutil adaptado al color de la partícula
            if (this.size > 0.8) {
                const gradient = ctx.createRadialGradient(
                    this.x, this.y, 0,
                    this.x, this.y, this.size * 4
                );
                gradient.addColorStop(0, `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha * 0.2})`);
                gradient.addColorStop(1, 'rgba(0,0,0,0)');
                
                ctx.fillStyle = gradient;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 4, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    class Comet {
        constructor() {
            this.reset();
        }
        reset() {
            this.angle = Math.random() * Math.PI * 2;
            this.speed = 3 + Math.random() * 3; // Ligeramente más lentos
            this.vx = Math.cos(this.angle) * this.speed;
            this.vy = Math.sin(this.angle) * this.speed;
            this.length = 80 + Math.random() * 80; 
            
            const dist = Math.max(width, height) * 0.6;
            this.x = cx + Math.cos(this.angle + Math.PI) * dist;
            this.y = cy + Math.sin(this.angle + Math.PI) * dist;
            
            this.life = 1.0;
            this.tailAlpha = 0.7;
        }
        update() {
            this.x += this.vx;
            this.y += this.vy;
            this.life -= 0.01; 
            return this.life > 0;
        }
        draw() {
            const alpha = this.life * this.tailAlpha;
            
            const tailX = this.x - this.vx * (this.length / this.speed);
            const tailY = this.y - this.vy * (this.length / this.speed);
            
            // Cola usando el Verde Solana
            const tailGradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
            tailGradient.addColorStop(0, `rgba(20, 241, 149, ${alpha})`);      
            tailGradient.addColorStop(0.4, `rgba(20, 241, 149, ${alpha * 0.4})`);
            tailGradient.addColorStop(1, `rgba(20, 241, 149, 0)`);               
            
            ctx.save();
            ctx.globalAlpha = alpha * 0.8;
            ctx.strokeStyle = tailGradient;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#14F195'; // Brillo verde solana
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();
            ctx.restore();
            
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#ffffff';
            ctx.fillStyle = 'rgba(255, 255, 255, 1)'; // Cabeza blanca
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2.0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    function initParticles() {
        particles = [];
        for (let i = 0; i < config.particleCount; i++) {
            particles.push(new Particle());
        }
    }

    let time = 0;

    function animate() {
        ctx.clearRect(0, 0, width, height);

        ctx.fillStyle = '#000000'; 
        ctx.fillRect(0, 0, width, height);

        const gradient1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.5);
        gradient1.addColorStop(0, 'rgba(153, 69, 255, 0.04)'); // Tono morado muy leve en el centro
        gradient1.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = gradient1;
        ctx.fillRect(0, 0, width, height);

        // Nebulosa estática (se multiplicó por 5 en lugar de 150 para que no maree)
        const nebula = ctx.createRadialGradient(
            cx + Math.sin(time * 0.0001) * 5, 
            cy + Math.cos(time * 0.0001) * 5, 
            0, 
            cx, 
            cy, 
            height * 1.5
        );
        nebula.addColorStop(0, 'rgba(20, 241, 149, 0.015)'); // Verde solana de fondo
        nebula.addColorStop(0.5, 'rgba(153, 69, 255, 0.008)'); // Morado de fondo
        nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, width, height);

        const vignette = ctx.createRadialGradient(cx, cy, height * 0.05, cx, cy, Math.max(width, height) * 0.8);
        vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vignette.addColorStop(0.6, 'rgba(0, 0, 0, 0.6)'); 
        vignette.addColorStop(1, '#000000'); 
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
        
        time++;

        particles.forEach(particle => particle.update(time));
        particles.forEach(particle => particle.draw());

        if (Math.random() < 0.003 && comets.length < 3) {
            comets.push(new Comet());
        }

        comets = comets.filter(comet => {
            const alive = comet.update();
            if (alive) comet.draw();
            return alive;
        });

        requestAnimationFrame(animate);
    }

    resize();
    animate();
});