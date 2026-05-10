document.addEventListener('DOMContentLoaded', () => {
    const canvases = document.querySelectorAll('.face-matrix');
    if (canvases.length === 0) return;

    const ctxs = Array.from(canvases).map(canvas => canvas.getContext('2d'));
    const chars = "ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ{}//()>1234567890ｧｨｩｪｫｬｭｮｯ"; // Caracteres estilo "Matrix"
    const fontSize = 14; // Un poco más pequeño para que quepa bien en las caras
    let columns, rows;

    function setup() {
        canvases.forEach(canvas => {
            // Ajustamos el canvas al tamaño real de la cara del cubo
            const parent = canvas.parentElement;
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
        });
        
        // Calculamos columnas y filas basadas en el primer canvas (todas las caras miden igual)
        columns = Math.ceil(canvases[0].width / fontSize);
        rows = Math.ceil(canvases[0].height / fontSize);
    }

    function draw() {
        ctxs.forEach(ctx => {
            // Limpiamos con un rastro leve para efecto estético opcional 
            // o clearRect para el glitch puro que pediste:
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            
            ctx.fillStyle = "rgba(3, 221, 255, 0.8)"; // Tu color Cyan
            ctx.font = fontSize + "px monospace";

            for (let x = 0; x < columns; x++) {
                for (let y = 1; y <= rows; y++) {
                    const text = chars.charAt(Math.floor(Math.random() * chars.length));
                    ctx.globalAlpha = Math.random() * 0.4; // Brillo aleatorio
                    ctx.fillText(text, x * fontSize, y * fontSize);
                }
            }
        });
    }

    setup();
    window.addEventListener('resize', setup);
    
    function animate() {
        draw();
        // El delay de 100ms crea el efecto "glitch" que buscas sin saturar la CPU
        setTimeout(() => {
            requestAnimationFrame(animate);
        }, 100); 
    }
    
    animate();
});