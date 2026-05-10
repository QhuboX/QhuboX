document.addEventListener('DOMContentLoaded', () => {
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 80; 
    camera.position.y = 0;
    camera.lookAt(0, 0, 0);


    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.id = "flow_effect"; 

    const finalSection = document.getElementById('final');
    if (finalSection) {
        finalSection.insertBefore(renderer.domElement, finalSection.firstChild);
    } else {
        document.body.appendChild(renderer.domElement);
    }

    // --- LUCES ULTRA INTENSAS (PALETA SOLANA) ---
    const ambientLight = new THREE.AmbientLight(0x050505); // Muy poca luz ambiental
    scene.add(ambientLight);

    // Luz Morada Solana - Muy Intensa
    const purpleSpot = new THREE.SpotLight(0x9945FF, 60); // Intensidad x24 del original
    purpleSpot.position.set(150, 100, 150);
    purpleSpot.angle = Math.PI / 4;
    purpleSpot.penumbra = 0.1;
    purpleSpot.decay = 1; // Decaimiento para un efecto más puntual
    purpleSpot.distance = 400;
    scene.add(purpleSpot);
    
    // Luz Cian/Verde Solana - Muy Intensa
    
    const cyanPoint = new THREE.PointLight(0x14F195, 50); // Intensidad x33 del original
    cyanPoint.position.set(-150, -100, 100);
    cyanPoint.decay = 1;
    cyanPoint.distance = 400;
    scene.add(cyanPoint);
const blueLight = new THREE.PointLight(0x0055ff, 1.5); 
    blueLight.position.set(-80, 0, 80);
    scene.add(blueLight);
    // NUEVA: Luz Central Radiante (NÚCLEO)
    const radiantCore = new THREE.PointLight(0x9945FF, 150); // Intensidad extrema
    radiantCore.position.set(0, 0, 20); // Justo enfrente del centro
    radiantCore.decay = 2; // Decaimiento rápido para que parezca que la energía sale del centro
    scene.add(radiantCore);

    // --- OBJETO: PLANO MUY METALIZADO ---
    // Usamos una geometría más densa para una ondulación más suave
    const geometry = new THREE.PlaneGeometry(350, 350, 100, 100);
    const material = new THREE.MeshStandardMaterial({
        color:0x050505,   // Negro absoluto para que solo refleje la luz
        metalness: 1,     // Metal al máximo
        roughness: 0.092,  // Casi un espejo para el máximo brillo
        envMapIntensity: 1 // Si añades un mapa de entorno, esto controla su fuerza
    });

    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Movimiento de luces (mantenemos tu concepto errático)
        purpleSpot.position.x = Math.sin(t * 0.5) * 180;
        purpleSpot.position.y = Math.cos(t * 0.3) * 120;

        cyanPoint.position.x = Math.cos(t * 0.4) * -180;
        cyanPoint.position.y = Math.sin(t * 0.6) * -120;

        // Pequeña pulsación en el núcleo
        radiantCore.intensity = 150 + Math.sin(t * 5) * 50;

        const pos = plane.geometry.attributes.position;
        
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);

            // Ondas más exageradas para el efecto metalizado
            const wave1 = Math.sin(x * 0.03 + t * 1.5) * Math.cos(y * 0.03 + t * 1.0);
            const wave2 = Math.sin(x * 0.12 + t * 2.5) * 4; 
            const wave3 = Math.cos((x + y) * 0.015 + t * 0.8) * 15; // Mayor amplitud
            
            // Resultado final desordenado y profundo
            const noise = wave1 * wave2 + wave3;
            
            pos.setZ(i, noise);
        }

        pos.needsUpdate = true; 
        plane.geometry.computeVertexNormals(); // Crucial para los reflejos metalizados

        renderer.render(scene, camera);
    }

    animate(); 

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});