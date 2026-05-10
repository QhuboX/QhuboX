import React, { useEffect, useRef } from 'react';

const CyberMatrixBackground = () => {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const modalContainer = containerRef.current?.parentElement;
        
        if (!canvas || !modalContainer) return;

        const ctx = canvas.getContext('2d');
        let width, height;
        let animationFrameId;

        // --- CONFIGURACIÓN REFINADA ---
        const hexRadius = 65;
        const hexWidth = Math.sqrt(3) * hexRadius;
        const hexHeight = 2 * hexRadius;
        const yOffset = hexRadius * 1.5;
        
        // Movimiento ultra-sutil
        const speedX = 0.05; 
        const speedY = 0.02;

        // ===== PALETA DE COLORES APLICADA =====
        // Basada en:
        // radial-gradient(ellipse 70% 55% at 10% 0%, rgb(0, 0, 0) ...),
        // radial-gradient(... rgb(0, 0, 0) ...),
        // radial-gradient(... rgba(232,121,249,0.15) ...),
        // radial-gradient(... rgba(96,165,250,0.25) ...),
        // linear-gradient(160deg, #000000, #470044, #091d00, #290327)
        const PALETTE = {
            bgLight1: '#000000',
            bgLight2: '#000000',
            bgLight3: '#000e13',
            bgLight4: '#000000',
            radialLila: 'rgba(33, 0, 165, 0.23)',
            radialCyan: 'rgba(4, 0, 10, 0.24)',
            radialPink: 'rgba(232,121,249,0.15)',
            radialBlue: 'rgba(127, 4, 165, 0.25)',
            hexTop: (a) => `rgba(30,30,45,${a})`,
            hexBottom: (a) => `rgba(10,10,15,${a})`,
            strokeLila: (a) => `rgba(146,83,175,${a})`,
            binaryColor: (a) => `rgba(160,150,200,${a})`,
            dotColor: (a) => `rgba(96,165,250,${a})`,
            vignetteCenter: 'rgba(45, 0, 85, 0.24)',
            vignetteEdge: 'rgba(10, 0, 12, 0.4)'
        };

        let cols, rows;
        let hexagons = [];
        let time = 0;

        class Hexagon {
            constructor(c, r) {
                this.c = c;
                this.r = r;
                // Calculamos posición base fija
                this.baseX = c * hexWidth + (r % 2 === 1 ? hexWidth / 2 : 0);
                this.baseY = r * yOffset;
                
                const rand = Math.random();
                this.type = rand < 0.2 ? 1 : rand < 0.4 ? 2 : 0; // Menos saturación de elementos

                this.opacity = Math.random() * 0.15 + 0.05; // Más sutil
                this.pulseOffset = Math.random() * Math.PI * 2;
                this.pulseSpeed = Math.random() * 0.01 + 0.005; // Pulso más lento
                
                this.binaryData = [this.genBin(), this.genBin()];
                this.updateTimer = Math.floor(Math.random() * 100);
            }

            genBin() {
                return (Math.random() > 0.5 ? "1 0" : "0 1");
            }

            update() {
                if (this.type === 1) {
                    this.updateTimer--;
                    if (this.updateTimer <= 0) {
                        this.binaryData.shift();
                        this.binaryData.push(this.genBin());
                        this.updateTimer = Math.floor(Math.random() * 100) + 50;
                    }
                }
            }

            drawPath(x, y, radius) {
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const angle_rad = (Math.PI / 180) * (60 * i - 30);
                    const px = x + radius * Math.cos(angle_rad);
                    const py = y + radius * Math.sin(angle_rad);
                    if (i === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.closePath();
            }

            draw(offsetX, offsetY) {
                const totalGridWidth = cols * hexWidth;
                const totalGridHeight = rows * yOffset;

                // CORRECCIÓN DE COLMENA: Wrap-around matemático para evitar amontonamiento
                let x = ((this.baseX - offsetX) % totalGridWidth + totalGridWidth) % totalGridWidth - hexWidth;
                let y = ((this.baseY - offsetY) % totalGridHeight + totalGridHeight) % totalGridHeight - hexHeight;

                // Solo dibujamos si está en pantalla (con margen)
                if (x < -hexWidth || x > width + hexWidth || y < -hexHeight || y > height + hexHeight) return;

                const pulse = (Math.sin(time * this.pulseSpeed + this.pulseOffset) + 1) / 2;

                // 1. Estilo de fondo del hexágono (Degradado elegante) - colores actualizados
                this.drawPath(x, y, hexRadius * 0.95);
                let grad = ctx.createLinearGradient(x, y - hexRadius, x, y + hexRadius);
                grad.addColorStop(0, PALETTE.hexTop(this.opacity + pulse * 0.05));
                grad.addColorStop(1, PALETTE.hexBottom(this.opacity));
                ctx.fillStyle = grad;
                ctx.fill();

                // 2. Borde sutil - tono lila de la paleta
                ctx.lineWidth = 1;
                ctx.strokeStyle = PALETTE.strokeLila(0.05 + pulse * 0.1);
                ctx.stroke();

                // 3. Contenido estilizado (Solo si es tipo especial)
                if (this.type === 1) { // Binario
                    ctx.fillStyle = PALETTE.binaryColor(0.1 + pulse * 0.3);
                    ctx.font = '8px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(this.binaryData[0], x, y);
                } else if (this.type === 2) { // Punto central
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fillStyle = PALETTE.dotColor(0.2 + pulse * 0.4);
                    ctx.fill();
                }
            }
        }

        function initGrid() {
            hexagons = [];
            // Aumentamos el buffer para que el wrap-around sea invisible
            cols = Math.ceil(width / hexWidth) + 4;
            rows = Math.ceil(height / yOffset) + 4;

            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    hexagons.push(new Hexagon(c, r));
                }
            }
        }

        function resize() {
            width = canvas.width = modalContainer.clientWidth;
            height = canvas.height = modalContainer.clientHeight;
            initGrid();
        }

        function animate() {
            // Fondo base actualizado a gradiente suave derivado de la paleta
            let bgGrad = ctx.createLinearGradient(0, 0, width, height);
            bgGrad.addColorStop(0, PALETTE.bgLight1);
            bgGrad.addColorStop(0.35, PALETTE.bgLight2);
            bgGrad.addColorStop(0.65, PALETTE.bgLight3);
            bgGrad.addColorStop(1, PALETTE.bgLight4);
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);

            time += 1;
            const panX = time * speedX;
            const panY = time * speedY;

            hexagons.forEach(hex => {
                hex.update();
                hex.draw(panX, panY);
            });

            
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';

            
            let r1 = ctx.createRadialGradient(width * 0.1, 0, width * 0.02, width * 0.1, height * 0.15, Math.max(width, height) * 0.7);
            r1.addColorStop(0, PALETTE.radialLila);
            r1.addColorStop(0.65, 'rgba(24, 0, 117, 0)');
            ctx.fillStyle = r1;
            ctx.fillRect(0, 0, width, height);

            let r2 = ctx.createRadialGradient(width * 0.9, height, width * 0.02, width * 0.9, height * 0.9, Math.max(width, height) * 0.6);
            r2.addColorStop(0, PALETTE.radialCyan);
            r2.addColorStop(0.65, 'rgba(5, 0, 14, 0)');
            ctx.fillStyle = r2;
            ctx.fillRect(0, 0, width, height);

            
            let r3 = ctx.createRadialGradient(width * 0.5, height * 0.5, width * 0.02, width * 0.5, height * 0.5, Math.max(width, height) * 0.45);
            r3.addColorStop(0, PALETTE.radialPink);
            r3.addColorStop(0.7, 'rgba(232,121,249,0)');
            ctx.fillStyle = r3;
            ctx.fillRect(0, 0, width, height);

            
            let r4 = ctx.createRadialGradient(width * 0.8, height * 0.1, width * 0.02, width * 0.8, height * 0.1, Math.max(width, height) * 0.6);
            r4.addColorStop(0, PALETTE.radialBlue);
            r4.addColorStop(0.6, 'rgba(96,165,250,0)');
            ctx.fillStyle = r4;
            ctx.fillRect(0, 0, width, height);

            ctx.restore();

          
            let overlay = ctx.createRadialGradient(width/2, height/2, width*0.1, width/2, height/2, width*0.8);
            overlay.addColorStop(0, PALETTE.vignetteCenter);
            overlay.addColorStop(1, PALETTE.vignetteEdge);
            ctx.fillStyle = overlay;
            ctx.fillRect(0, 0, width, height);

            animationFrameId = requestAnimationFrame(animate);
        }

        const resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(modalContainer);

        resize();
        animate();

        return () => {
            resizeObserver.disconnect();
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    return (
        <div ref={containerRef} style={{ 
            position: 'absolute', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            zIndex: 0, 
            pointerEvents: 'none',
            background: '#08080c' 
        }}>
            <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />
        </div>
    );
};

export default CyberMatrixBackground;
