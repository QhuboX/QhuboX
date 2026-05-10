document.addEventListener('DOMContentLoaded', () => {
    const scene = new THREE.Scene();
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 80; 
    camera.position.y = 0;
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.domElement.id = "flow_effect1"; 

    const heroSection = document.getElementById('hero');
    if (heroSection) {
        heroSection.insertBefore(renderer.domElement, heroSection.firstChild);
    } else {
        document.body.appendChild(renderer.domElement);
    }

    // --- LUCES DINÁMICAS ---
    const ambientLight = new THREE.AmbientLight(0x111111); 
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0x9945FF, 2.5); 
    spotLight.position.set(0, 50, 100);
    scene.add(spotLight);
    
    const blueLight = new THREE.PointLight(0x0055ff, 1.5); 
    blueLight.position.set(-80, 0, 80);
    scene.add(blueLight);

    // --- OBJETO ---
    const geometry = new THREE.PlaneGeometry(350, 350, 100, 100);
    const material = new THREE.MeshStandardMaterial({
        color: 0x050505,    
        metalness: 1,     
        roughness: 0.3,     
        wireframe: false    
    });

    const plane = new THREE.Mesh(geometry, material);
    scene.add(plane);

    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        // Movimiento de luces errático
        spotLight.position.x = Math.sin(t * 0.7) * 120;
        spotLight.position.y = Math.cos(t * 0.4) * 80;

        const pos = plane.geometry.attributes.position;
        
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i);
            const y = pos.getY(i);

            /* MATEMÁTICA CAÓTICA: 
               Mezclamos múltiples frecuencias (octavas) para romper la simetría.
               Esto genera picos y valles desordenados.
            */
            const wave1 = Math.sin(x * 0.04 + t * 1.2) * Math.cos(y * 0.04 + t * 0.8);
            const wave2 = Math.sin(x * 0.1 + t * 2.1) * 2.5; // Micro-turbulencia
            const wave3 = Math.cos((x + y) * 0.02 + t * 0.5) * 8; // Onda base grande
            
            // Resultado final desordenado
            const noise = wave1 * wave2 + wave3;
            
            pos.setZ(i, noise);
        }

        pos.needsUpdate = true; 
        plane.geometry.computeVertexNormals(); 

        renderer.render(scene, camera);
    }

    animate(); 

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
});