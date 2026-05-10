document.addEventListener('mousemove', (e) => {
    // Calcula el centro de la pantalla
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;

    // Calcula la desviación del ratón respecto al centro
    const xOffset = (e.clientX - centerX) / 20; // Menor división para movimiento más suave
    const yOffset = (e.clientY - centerY) / 20;

    // Aplica la transformación a las capas parallax
    const layers = document.querySelectorAll('.parallax-layer');

    layers.forEach((layer, index) => {
        // Multiplicador más pequeño para las capas traseras (índice 0 y 1)
        // Esto crea una ligera sensación de "bamboleo" 3D
        let depth = index === 0 ? 0.3 : (index === 1 ? 0.5 : 0.8);

        const x = xOffset * depth;
        const y = yOffset * depth;

        // Utilizamos la propiedad CSS 'transform' para mover la capa
        layer.style.transform = `translateX(${x}px) translateY(${y}px) ${layer.style.transform.split(') ').filter(t => t.includes('translateZ')).join(') ')}`;
        layer.style.transition = 'transform 0.1s ease-out';
    });
});