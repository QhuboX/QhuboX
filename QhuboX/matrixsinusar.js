document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('matrix');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const section = document.getElementById('final');

    const chars = "ｦｱｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄ1234567890ABCDEF";
    const fontSize = 16;
    let columns, rows;

    function setup() {
        // Usamos clientWidth/Height para obtener el espacio interno exacto
        canvas.width = section.clientWidth;
        canvas.height = section.clientHeight;
        
        // Math.ceil asegura que si sobra un pequeño espacio, se cree una columna/fila extra
        columns = Math.ceil(canvas.width / fontSize);
        rows = Math.ceil(canvas.height / fontSize);
        
        canvas.style.backgroundColor = "transparent";
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';

        ctx.shadowBlur = 0; 
        ctx.shadowColor = "rgba(255, 176, 0, 0.7)"; 
        ctx.fillStyle = "rgba(0, 0, 0, 0.9)";       
        ctx.font = fontSize + "px monospace";

        // Dibujamos la rejilla completa
        for (let x = 0; x < columns; x++) {
            // Empezamos desde y = 1 y llegamos hasta <= rows 
            // Esto compensa que fillText dibuja desde la línea base (baseline)
            for (let y = 1; y <= rows; y++) {
                const text = chars.charAt(Math.floor(Math.random() * chars.length));
                
                ctx.globalAlpha = 0.5;
                // Dibujamos cada carácter en su celda exacta
                ctx.fillText(text, x * fontSize, y * fontSize);
            }
        }
    }

    setup();
    window.addEventListener('resize', setup);
    
    
    function animate() {
        draw();
        requestAnimationFrame(animate);
    }
    animate();
});