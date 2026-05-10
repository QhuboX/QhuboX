
 const imageFiles = [
     
    "image2.jpg", 
    "image3.jpg",
    
    "image5.png", 
    "8.png",
    "15.png", "1.png", "image1.jpg",  "6.png", "c8.png",  "image11.png","c82.png", "image11.jpg", "image11.1.png", "image11.2.png", "image11.3.png",  "neuro.png",
      "neuro1.png", "c.png",
      "c11.png", "image4.png",
      "c22.png","image12.png",
      "c33.png",
      "c44.png",
"c55.png",
"c66.png",
"c7.png",
"m.png","mm.png","p.png","a.png","b.png","aa.png","bb.png",
];

const imageContainer = document.querySelector('.img-container');
const imageDirectory = 'images/'; // Asegúrate de que esta sea la ruta correcta a tus imágenes

// Inicializa el índice en 0 (la primera imagen)
let currentIndex = 0; 

function changeImageSequentially() { 
    if (imageFiles.length === 0) return; 

    // 1. Selecciona la imagen actual en el arreglo
    const selectedImage = imageFiles[currentIndex];
    const imageUrl = imageDirectory + selectedImage;

    
    imageContainer.style.backgroundImage = `url('${imageUrl}')`;
    
   
    
    // 3. Mueve al siguiente índice y usa el operador módulo (%) para repetir el ciclo
    currentIndex = (currentIndex + 1) % imageFiles.length; 
}


changeImageSequentially();

// Configura el intervalo para cambiar la imagen cada 5000 milisegundos (5 segundos)
setInterval(changeImageSequentially, 5000);