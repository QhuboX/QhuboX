/**
 * face-matrix.js — Matrix Glitch Effect on Cube Faces
 * Draws randomised katakana/symbol characters on every .face-matrix canvas.
 * Fully responsive: resizes with the parent face via ResizeObserver.
 */

document.addEventListener('DOMContentLoaded', () => {

    const canvases = document.querySelectorAll('.face-matrix');
    if (canvases.length === 0) return;

    /* Character set — Matrix-style katakana + symbols */
    const CHARS = 'ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ{}//()>1234567890ｧｨｩｪｫｬｭｮｯ';

    const FONT_SIZE = 13;   // px — slightly smaller for crisp fit on all sizes
    const COLOR     = 'rgba(3, 221, 255, 0.82)';

    /* Per-canvas state */
    const ctxs = [];
    const dims = [];  // { columns, rows } per canvas

    /* ── Setup each canvas ──────────────────────────────────────── */
    function setupCanvas(canvas, index) {
        const parent = canvas.parentElement;
        // Match physical pixel size to parent — avoids blurry canvas on hi-DPI
        const dpr = window.devicePixelRatio || 1;
        const w   = parent.clientWidth  || 300;
        const h   = parent.clientHeight || 300;

        canvas.width  = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width  = w + 'px';
        canvas.style.height = h + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctxs[index] = ctx;

        dims[index] = {
            columns : Math.ceil(w / FONT_SIZE),
            rows    : Math.ceil(h / FONT_SIZE),
            w, h
        };
    }

    /* ── Initial setup ───────────────────────────────────────── */
    canvases.forEach((canvas, i) => {
        setupCanvas(canvas, i);
    });

    /* ── Resize via ResizeObserver (one per canvas) ─────────── */
    if (window.ResizeObserver) {
        canvases.forEach((canvas, i) => {
            const ro = new ResizeObserver(() => setupCanvas(canvas, i));
            ro.observe(canvas.parentElement);
        });
    } else {
        // Fallback for older browsers
        window.addEventListener('resize', () => {
            canvases.forEach((canvas, i) => setupCanvas(canvas, i));
        });
    }

    /* ── Draw frame ─────────────────────────────────────────── */
    function draw() {
        ctxs.forEach((ctx, i) => {
            if (!ctx) return;
            const { columns, rows, w, h } = dims[i];

            // Clear completely for pure glitch (no trails)
            ctx.clearRect(0, 0, w, h);

            ctx.font      = `300 ${FONT_SIZE}px 'JetBrains Mono', monospace`;
            ctx.fillStyle = COLOR;

            for (let x = 0; x < columns; x++) {
                for (let y = 1; y <= rows; y++) {
                    const char = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
                    ctx.globalAlpha = Math.random() * 0.38 + 0.04; // subtle variation
                    ctx.fillText(char, x * FONT_SIZE, y * FONT_SIZE);
                }
            }

            ctx.globalAlpha = 1; // reset
        });
    }

    /* ── Animation loop — 100 ms gap = glitch cadence ──────── */
    function animate() {
        draw();
        setTimeout(() => requestAnimationFrame(animate), 100);
    }

    animate();
});
