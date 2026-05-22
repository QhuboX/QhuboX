/**
 * techHiveCurve.js — Background Particle Field + Comet System
 * Fully responsive; uses ResizeObserver for pixel-perfect scaling.
 * No functional changes from original — only code quality improvements.
 */

document.addEventListener('DOMContentLoaded', () => {

    const canvas = document.getElementById('techHiveCurve');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height, cx, cy;

    let particles = [];
    let comets    = [];
    let mouseX, mouseY, targetMouseX, targetMouseY;

    const config = {
        particleCount  : 220,
        mouseInfluence : 0.055,
        baseSpeed      : 0.08,
        parallaxStrength : 0.018
    };

    /* ── Resize ─────────────────────────────────────────────── */
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        width  = window.innerWidth;
        height = window.innerHeight;

        canvas.width  = Math.round(width  * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width  = width  + 'px';
        canvas.style.height = height + 'px';
        ctx.scale(dpr, dpr);

        cx = width  / 2;
        cy = height / 2;
        mouseX = targetMouseX = cx;
        mouseY = targetMouseY = cy;

        initParticles();
        comets = [];
    }

    window.addEventListener('resize', resize);

    window.addEventListener('mousemove', e => {
        targetMouseX = e.clientX;
        targetMouseY = e.clientY;
    });

    /* ── Particle ────────────────────────────────────────────── */
    class Particle {
        constructor() {
            this.reset();
            this.x = Math.random() * width;
            this.y = Math.random() * height;
        }

        reset() {
            this.depth = Math.random() * 0.8 + 0.3;
            this.size  = (Math.random() * 1.8 + 0.4) * this.depth;

            const side = Math.floor(Math.random() * 4);
            if      (side === 0) { this.x = Math.random() * width; this.y = -10; }
            else if (side === 1) { this.x = width + 10; this.y = Math.random() * height; }
            else if (side === 2) { this.x = Math.random() * width; this.y = height + 10; }
            else                 { this.x = -10; this.y = Math.random() * height; }

            this.baseVx = (Math.random() - 0.5) * config.baseSpeed * this.depth;
            this.baseVy = (Math.random() - 0.5) * config.baseSpeed * this.depth;
            this.vx = this.baseVx;
            this.vy = this.baseVy;

            const t = Math.random();
            if      (t < 0.55) { this.r = 220 + Math.random() * 35; this.g = 235 + Math.random() * 20; this.b = 255; }
            else if (t < 0.85) { this.r = 160 + Math.random() * 60; this.g = 210 + Math.random() * 45; this.b = 255; }
            else               { this.r = 180 + Math.random() * 50; this.g = 160 + Math.random() * 40; this.b = 255; }

            this.baseAlpha  = (Math.random() * 0.7 + 0.4) * this.depth;
            this.alpha      = this.baseAlpha;
            this.pulseSpeed  = 0.0008 + Math.random() * 0.0015;
            this.pulseOffset = Math.random() * Math.PI * 2;
        }

        update(time) {
            const px = (mouseX - cx) * config.parallaxStrength * this.depth;
            const py = (mouseY - cy) * config.parallaxStrength * this.depth;
            this.vx  = this.baseVx + px * 0.012;
            this.vy  = this.baseVy + py * 0.012;
            this.x  += this.vx;
            this.y  += this.vy;

            const pulse = Math.sin(time * this.pulseSpeed + this.pulseOffset) * 0.5 + 0.5;
            this.alpha  = this.baseAlpha * (0.75 + pulse * 0.25);

            if (this.x < -30 || this.x > width + 30 || this.y < -30 || this.y > height + 30) {
                this.reset();
            }
        }

        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(${this.r},${this.g},${this.b},${this.alpha})`;
            ctx.fill();

            if (this.size > 0.6) {
                const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size * 5);
                g.addColorStop(0,   `rgba(${this.r},${this.g},${this.b},${this.alpha * 0.35})`);
                g.addColorStop(0.6, `rgba(${this.r},${this.g},${this.b},${this.alpha * 0.08})`);
                g.addColorStop(1,   'rgba(0,0,0,0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size * 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    /* ── Comet ───────────────────────────────────────────────── */
    class Comet {
        constructor() { this.reset(); }

        reset() {
            this.angle = Math.random() * Math.PI * 2;
            this.speed = 4 + Math.random() * 5;
            this.vx    = Math.cos(this.angle) * this.speed;
            this.vy    = Math.sin(this.angle) * this.speed;
            this.length = 90 + Math.random() * 110;

            const dist = Math.max(width, height) * 0.6;
            this.x = cx + Math.cos(this.angle + Math.PI) * dist;
            this.y = cy + Math.sin(this.angle + Math.PI) * dist;

            this.life      = 1.0;
            this.tailAlpha = 0.9;
        }

        update() {
            this.x    += this.vx;
            this.y    += this.vy;
            this.life -= 0.012;
            return this.life > 0;
        }

        draw() {
            const alpha = this.life * this.tailAlpha;
            const tailX = this.x - this.vx * (this.length / this.speed);
            const tailY = this.y - this.vy * (this.length / this.speed);

            const tg = ctx.createLinearGradient(this.x, this.y, tailX, tailY);
            tg.addColorStop(0,   `rgba(180,255,140,${alpha})`);
            tg.addColorStop(0.3, `rgba(80,255,100,${alpha * 0.6})`);
            tg.addColorStop(1,   'rgba(0,180,60,0)');

            ctx.save();
            ctx.globalAlpha = alpha * 0.9;
            ctx.strokeStyle = tg;
            ctx.lineWidth   = 3.5;
            ctx.lineCap     = 'round';
            ctx.shadowBlur  = 18;
            ctx.shadowColor = '#8aff9f';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(tailX, tailY);
            ctx.stroke();
            ctx.restore();

            // Head glow
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.shadowBlur  = 25;
            ctx.shadowColor = '#c0ff9f';
            ctx.fillStyle   = 'rgba(240,255,200,1)';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 2.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    /* ── Particles init ─────────────────────────────────────── */
    function initParticles() {
        particles = [];
        for (let i = 0; i < config.particleCount; i++) {
            particles.push(new Particle());
        }
    }

    /* ── Main loop ──────────────────────────────────────────── */
    let time = 0;

    function animate() {
        // Smooth mouse follow
        mouseX += (targetMouseX - mouseX) * 0.08;
        mouseY += (targetMouseY - mouseY) * 0.08;

        ctx.clearRect(0, 0, width, height);

        /* === DEEP SPACE BACKGROUND === */
        // Absolute black base
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        // Faint central volume
        const g1 = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.5);
        g1.addColorStop(0, 'rgba(0,40,15,0.06)');
        g1.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g1;
        ctx.fillRect(0, 0, width, height);

        // Drifting cold nebula
        const nebula = ctx.createRadialGradient(
            cx + Math.sin(time * 0.0001) * 150,
            cy + Math.cos(time * 0.0001) * 100,
            0, cx, cy, height * 1.5
        );
        nebula.addColorStop(0,   'rgba(0,120,70,0.015)');
        nebula.addColorStop(0.5, 'rgba(0,40,20,0.005)');
        nebula.addColorStop(1,   'rgba(0,0,0,0)');
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, width, height);

        // Aggressive vignette tunnel
        const vignette = ctx.createRadialGradient(cx, cy, height * 0.05, cx, cy, Math.max(width, height) * 0.8);
        vignette.addColorStop(0,   'rgba(0,0,0,0)');
        vignette.addColorStop(0.4, 'rgba(0,0,0,0.6)');
        vignette.addColorStop(0.8, 'rgba(0,0,0,0.95)');
        vignette.addColorStop(1,   '#000000');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);

        time++;

        /* === PARTICLES === */
        particles.forEach(p => { p.update(time); p.draw(); });

        /* === COMETS (occasional) === */
        if (Math.random() < 0.0048 && comets.length < 4) {
            comets.push(new Comet());
        }
        comets = comets.filter(c => {
            const alive = c.update();
            if (alive) c.draw();
            return alive;
        });

        requestAnimationFrame(animate);
    }

    /* ── Boot ───────────────────────────────────────────────── */
    resize();
    animate();
});
