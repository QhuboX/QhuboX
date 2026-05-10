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
                mouseInfluence: 0.055,
                baseSpeed: 0.08,
                parallaxStrength: 0.018
            };

            function resize() {
                width = canvas.width = window.innerWidth;
                height = canvas.height = window.innerHeight;
                cx = width / 2;
                cy = height / 2;
                mouseX = targetMouseX = cx;
                mouseY = targetMouseY = cy;
                initParticles();
                comets = []; // reinicia cometas al cambiar tamaño
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

                    const colorType = Math.random();
                    if (colorType < 0.55) {
                        this.r = 220 + Math.random() * 35;
                        this.g = 235 + Math.random() * 20;
                        this.b = 255;
                    } else if (colorType < 0.85) {
                        this.r = 160 + Math.random() * 60;
                        this.g = 210 + Math.random() * 45;
                        this.b = 255;
                    } else {
                        this.r = 180 + Math.random() * 50;
                        this.g = 160 + Math.random() * 40;
                        this.b = 255;
                    }

                    this.baseAlpha = (Math.random() * 0.7 + 0.4) * this.depth;
                    this.alpha = this.baseAlpha;
                    
                    this.pulseSpeed = 0.0008 + Math.random() * 0.0015;
                    this.pulseOffset = Math.random() * Math.PI * 2;
                }

                update(time) {
                    const parallaxX = (mouseX - cx) * config.parallaxStrength * this.depth;
                    const parallaxY = (mouseY - cy) * config.parallaxStrength * this.depth;

                    this.vx = this.baseVx + parallaxX * 0.012;
                    this.vy = this.baseVy + parallaxY * 0.012;

                    this.x += this.vx;
                    this.y += this.vy;

                    const pulse = Math.sin(time * this.pulseSpeed + this.pulseOffset) * 0.5 + 0.5;
                    this.alpha = this.baseAlpha * (0.75 + pulse * 0.25);

                    if (this.x < -30 || this.x > width + 30 || this.y < -30 || this.y > height + 30) {
                        this.reset();
                    }
                }

                draw() {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha})`;
                    ctx.fill();

                    if (this.size > 0.6) {
                        const gradient = ctx.createRadialGradient(
                            this.x, this.y, 0,
                            this.x, this.y, this.size * 5
                        );
                        gradient.addColorStop(0, `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha * 0.35})`);
                        gradient.addColorStop(0.6, `rgba(${this.r}, ${this.g}, ${this.b}, ${this.alpha * 0.08})`);
                        gradient.addColorStop(1, 'rgba(0,0,0,0)');
                        
                        ctx.fillStyle = gradient;
                        ctx.beginPath();
                        ctx.arc(this.x, this.y, this.size * 5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            }

            class Comet {
                constructor() {
                    this.reset();
                }
                reset() {
                    // Dirección aleatoria (cometas rápidos)
                    this.angle = Math.random() * Math.PI * 2;
                    this.speed = 4 + Math.random() * 5;
                    this.vx = Math.cos(this.angle) * this.speed;
                    this.vy = Math.sin(this.angle) * this.speed;
                    this.length = 90 + Math.random() * 110; // longitud de la cola
                    
                    // Aparece desde fuera de la pantalla (en dirección opuesta)
                    const dist = Math.max(width, height) * 0.6;
                    this.x = cx + Math.cos(this.angle + Math.PI) * dist;
                    this.y = cy + Math.sin(this.angle + Math.PI) * dist;
                    
                    this.life = 1.0;
                    this.tailAlpha = 0.9;
                }
                update() {
                    this.x += this.vx;
                    this.y += this.vy;
                    this.life -= 0.012; // se desvanece rápido
                    return this.life > 0;
                }
                draw() {
                    const alpha = this.life * this.tailAlpha;
                    
                    // Cola (gradiente verde tech brillante)
                    const tailX = this.x - this.vx * (this.length / this.speed);
                    const tailY = this.y - this.vy * (this.length / this.speed);
                    
                    const tailGradient = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
                    tailGradient.addColorStop(0, `rgba(180, 255, 140, ${alpha})`);      // cabeza de la cola
                    tailGradient.addColorStop(0.3, `rgba(80, 255, 100, ${alpha * 0.6})`);
                    tailGradient.addColorStop(1, `rgba(0, 180, 60, 0)`);               // fin de la cola
                    
                    ctx.save();
                    ctx.globalAlpha = alpha * 0.9;
                    ctx.strokeStyle = tailGradient;
                    ctx.lineWidth = 3.5;
                    ctx.lineCap = 'round';
                    ctx.shadowBlur = 18;
                    ctx.shadowColor = '#8aff9f';
                    ctx.beginPath();
                    ctx.moveTo(this.x, this.y);
                    ctx.lineTo(tailX, tailY);
                    ctx.stroke();
                    ctx.restore();
                    
                    // Cabeza brillante (punto blanco-verde)
                    ctx.save();
                    ctx.globalAlpha = alpha;
                    ctx.shadowBlur = 25;
                    ctx.shadowColor = '#c0ff9f';
                    ctx.fillStyle = 'rgba(240, 255, 200, 1)';
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, 2.8, 0, Math.PI * 2);
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
                // Limpiamos completamente el lienzo en cada frame para evitar rastros
                ctx.clearRect(0, 0, width, height);

                // === FONDO ABISAL TECH (MÁXIMA OSCURIDAD) ===
                // Base negra absoluta para eliminar cualquier residuo de luz
                ctx.fillStyle = '#000000'; // <- CORREGIDO: antes era '#0000101'
                ctx.fillRect(0, 0, width, height);

                // 1. Destello central casi invisible (solo para dar volumen)
                const gradient1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.5);
                gradient1.addColorStop(0, 'rgba(0, 40, 15, 0.06)'); 
                gradient1.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = gradient1;
                ctx.fillRect(0, 0, width, height);

                // 2. Nebulosa de profundidad (Verde muy frío y oscuro)
                const nebula = ctx.createRadialGradient(
                    cx + Math.sin(time * 0.0001) * 150, 
                    cy + Math.cos(time * 0.0001) * 100, 
                    0, 
                    cx, 
                    cy, 
                    height * 1.5
                );
                nebula.addColorStop(0, 'rgba(0, 120, 70, 0.015)'); 
                nebula.addColorStop(0.5, 'rgba(0, 40, 20, 0.005)');
                nebula.addColorStop(1, 'rgba(0, 0, 0, 0)');
                ctx.fillStyle = nebula;
                ctx.fillRect(0, 0, width, height);

                // 3. Viñeta Agresiva (Túnel de oscuridad)
                const vignette = ctx.createRadialGradient(cx, cy, height * 0.05, cx, cy, Math.max(width, height) * 0.8);
                vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
                vignette.addColorStop(0.4, 'rgba(0, 0, 0, 0.6)'); 
                vignette.addColorStop(0.8, 'rgba(0, 0, 0, 0.95)');
                vignette.addColorStop(1, '#000000'); 
                ctx.fillStyle = vignette;
                ctx.fillRect(0, 0, width, height);
                
                // Incremento del tiempo para animaciones
                time++;

                // Partículas (estrellas)
                particles.forEach(particle => particle.update(time));
                particles.forEach(particle => particle.draw());

                  // === COMETAS QUE APARECEN CASUALMENTE ===

                // Probabilidad baja para que sean ocasionales

                if (Math.random() < 0.0048 && comets.length < 4) {

                    comets.push(new Comet());

                }

                // Actualizar y dibujar cometas

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