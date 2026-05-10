const scrollWrapper = document.getElementById('scrollWrapper');
const pages = document.querySelectorAll('.pagina');
let currentPage = 0; // Se ha cambiado a 0 para que comience en la página 1
const totalPages = pages.length;

// Obtenemos una referencia a las flechas de navegación
const arrowLeft = document.getElementById('arrowLeft');
const arrowRight = document.getElementById('arrowRight');

// Función para mostrar/ocultar las flechas
function toggleNavArrows() {
  // Oculta la flecha izquierda si estás en la primera página
  if (currentPage === 0) {
    arrowLeft.style.display = 'none';
  } else {
    arrowLeft.style.display = 'block';
  }

  // Oculta la flecha derecha si estás en la última página
  if (currentPage === totalPages - 1) {
    arrowRight.style.display = 'none';
  } else {
    arrowRight.style.display = 'block';
  }
}

function scrollToPage(index) {
  if (index < 0 || index >= totalPages) return;
  
  pages.forEach((page, i) => {
    page.style.opacity = i === index ? '1' : '0.3';
  });

  const scrollX = index * window.innerWidth;
  scrollWrapper.scrollTo({ left: scrollX, behavior: 'smooth' });
  currentPage = index;
}

function scrollNext() {
  scrollToPage(currentPage + 1);
}

function scrollPrev() {
  scrollToPage(currentPage - 1);
}

// Scroll con rueda del mouse
scrollWrapper.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY > 0) scrollNext();
  else scrollPrev();
}, { passive: false });

// Actualiza opacidad y la visibilidad de las flechas
scrollWrapper.addEventListener('scroll', () => {
  const index = Math.round(scrollWrapper.scrollLeft / window.innerWidth);
  pages.forEach((page, i) => {
    page.style.opacity = i === index ? '1' : '0.3';
  });
 

  currentPage = index;
  
  // Llama a la función para actualizar la visibilidad de las flechas
  toggleNavArrows();
});

// Este bloque se ejecuta al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  const scrollWrapper = document.getElementById('scrollWrapper');
  const pages = document.querySelectorAll('.pagina');
  
  if (scrollWrapper) {
    // Ya no se establece el scroll a la segunda pantalla.
    // La página comienza en la posición 0 por defecto.
    scrollWrapper.style.visibility = 'visible';
    
    // Se establece la opacidad inicial para la primera página
    pages.forEach((page, i) => {
      page.style.opacity = i === 0 ? '1' : '0.3';
    });

    // Establece el estado inicial de las flechas
    toggleNavArrows();
  }
});

// Cargar íconos desde JSON
fetch('icons.json')
  .then(res => res.json())
  .then(data => {
    const grid = document.getElementById('iconGrid');
    data.forEach(icon => {
      const card = document.createElement('a');
      card.className = 'icon-card';
      card.href = icon.link;
      card.innerHTML = `
        <img src="${icon.imagen}" alt="${icon.nombre}" />
        <span>${icon.nombre}</span>
      `;
      grid.appendChild(card);
    });
  });

  
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    const texts = document.querySelectorAll(".neon-text");
    texts.forEach(text => {
      text.classList.remove("fade-reset");
      void text.offsetWidth; // fuerza reflow
      text.classList.add("fade-reset");
    });
  }
});






document.addEventListener("DOMContentLoaded", () => {
    const openChatBtn = document.getElementById("openPlayerBtn");
    const closeChatBtn = document.getElementById("closeChat");
    const chatWindow = document.getElementById("chatWindow");
    const mobileTrigger = document.getElementById("mobile-trigger");
    const mobileWindow = document.getElementById("mobile-window");

    const allWindows = [chatWindow, mobileWindow];

    function toggleWindow(target) {
        if (!target) return;
        const isHidden = target.classList.contains("hidden");

        // Ocultar todo primero
        allWindows.forEach(win => win?.classList.add("hidden"));

        // Si estaba oculto, lo mostramos
        if (isHidden) {
            target.classList.remove("hidden");
            target.style.opacity = "1";
            target.style.transform = "translateY(0)";
        }
    }

    // Eventos
    openChatBtn?.addEventListener("click", () => toggleWindow(chatWindow));
    closeChatBtn?.addEventListener("click", () => toggleWindow(chatWindow));
    
    mobileTrigger?.addEventListener("click", () => toggleWindow(mobileWindow));

    // Cerrar con la tecla ESC
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            allWindows.forEach(win => win?.classList.add("hidden"));
        }
    });
});







//clima

const widget = document.getElementById('widgetClimaHora');
widget.style.position = 'fixed';
widget.style.top = '30px';
widget.style.right = '20px';
widget.style.zIndex = '9999';

localStorage.removeItem('widgetPos');

let zonaHoraria = "UTC";

fetch('https://ipapi.co/json/')
  .then(res => res.json())
  .then(loc => {
    const pais = loc.country_name || "Unknown Location";
    zonaHoraria = loc.timezone || "UTC";
    localStorage.setItem("zonaHoraria", zonaHoraria);
    
    const ubicacionElement = document.getElementById('ubicacionLocal');
    if (ubicacionElement) {
      ubicacionElement.textContent = `${pais}`;
    }

    const updateTimeAndDate = () => {
      const dateOptions = {
        timeZone: zonaHoraria,
        weekday: 'short',
        month: 'short',
        day: 'numeric'
      };
      const timeOptions = {
        timeZone: zonaHoraria,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      };

      const now = new Date();
      const hora = now.toLocaleTimeString('en-US', timeOptions);
      const fecha = now.toLocaleDateString('en-US', dateOptions);

      const horaElement = document.getElementById('horaLocal');
      if (horaElement) {
         horaElement.textContent = `${fecha} | ${hora}`;
      }
    };
    
    updateTimeAndDate(); 
    setInterval(updateTimeAndDate, 1000);

    const lat = loc.latitude;
    const lon = loc.longitude;
    const apiKey = "eb33fd55bee0402dad142135252408"; 
    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${lat},${lon}&lang=en`;

    return fetch(url);
  })
  .then(res => res.json())
  .then(data => {
    const temp = Math.round(data.current.temp_c);
    const description = data.current.condition.text;
    const conditionCode = data.current.condition.code; // Código de condición de WeatherAPI

    // 💥 NUEVO: Función para determinar la clase de clima
    const getWeatherClass = (code, text) => {
        if (code >= 1000 && code < 1003) return 'clear'; // Clear, Sunny
        if (code >= 1003 && code < 1009) return 'clouds'; // Partly cloudy, Cloudy, Overcast
        if (code >= 1063 && code < 1073) return 'rain'; // Patchy rain, light rain
        if (code >= 1087 && code < 1090) return 'thunderstorm'; // Thunderstorm
        if (code >= 1114 && code < 1117) return 'snow'; // Blowing snow
        if (code >= 1135 && code < 1138) return 'fog'; // Fog, Mist
        if (code >= 1150 && code < 1153) return 'drizzle'; // Drizzle
        if (code >= 1168 && code < 1200) return 'rain'; // Light rain, moderate rain, etc.
        if (code >= 1210 && code < 1220) return 'snow'; // Light snow, moderate snow
        // Puedes añadir más códigos de https://www.weatherapi.com/docs/conditions.json
        
        // Si no coincide con un código específico, intentar por texto
        if (text.toLowerCase().includes('clear') || text.toLowerCase().includes('sunny')) return 'clear';
        if (text.toLowerCase().includes('cloud') || text.toLowerCase().includes('overcast')) return 'clouds';
        if (text.toLowerCase().includes('rain') || text.toLowerCase().includes('drizzle')) return 'rain';
        if (text.toLowerCase().includes('snow') || text.toLowerCase().includes('sleet')) return 'snow';
        if (text.toLowerCase().includes('thunder')) return 'thunderstorm';
        if (text.toLowerCase().includes('mist') || text.toLowerCase().includes('fog')) return 'fog';
        
        return 'default'; // Clase por defecto si no se reconoce
    };

    const weatherClass = getWeatherClass(conditionCode, description);
    
    // 💥 Quita todas las clases de clima y añade la nueva
    const widgetElement = document.getElementById('widgetClimaHora');
    widgetElement.className = ''; // Limpia todas las clases
    widgetElement.classList.add(weatherClass);
    widgetElement.classList.add('weather-widget-active'); // Si necesitas una clase base

    // 💥 Muestra la temperatura y descripción en el NUEVO ID
    const climaTempDescriptionElement = document.getElementById('climaTempDescription');
    if (climaTempDescriptionElement) {
      climaTempDescriptionElement.textContent = `${temp}°C, ${description}`;
    } else {
      // Fallback si no existe climaTempDescriptionElement (ej. se usa #climaLocal)
      document.getElementById('climaLocal').textContent = `${temp}°C, ${description}`;
    }
  })
  .catch(err => {
    const ubicacionElement = document.getElementById('ubicacionLocal');
    if (ubicacionElement) ubicacionElement.textContent = '🌎 Location not available';
    
    const horaElement = document.getElementById('horaLocal');
    if (horaElement) horaElement.textContent = '🕑 Time/Date not available';
    
    // 💥 Manejo de error para el nuevo ID
    const climaTempDescriptionElement = document.getElementById('climaTempDescription');
    if (climaTempDescriptionElement) {
      climaTempDescriptionElement.textContent = '☁ Weather not available';
    } else {
      document.getElementById('climaLocal').textContent = '☁ Weather not available';
    }
  });

//hora de mensajes 

document.addEventListener("DOMContentLoaded", () => {
  const trigger = document.getElementById("mobile-trigger");
  const popup = document.getElementById("mobile-window");
  const badge = document.querySelector(".badge");
  const chatButton = document.getElementById("chat-button");
  const holoContent = document.querySelector(".holo-content");
  const hologramStartup = document.querySelector(".hologram-startup");
  const zonaHoraria = localStorage.getItem("zonaHoraria") || Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (!trigger || !popup || !hologramStartup) return;

  // Mostrar ventana y animar mensajes
  trigger.addEventListener("click", () => {
    popup.classList.add("show");
    popup.classList.remove("hidden");
    if (badge) badge.style.display = "none";

    const mensajes = popup.querySelectorAll(".holo-message");
    mensajes.forEach((msg, i) => {
      if (!msg.classList.contains("animated")) {
        const originalText = msg.textContent;

        const icon = document.createElement("span");
        icon.className = "holo-icon";
        icon.textContent = "🗳️";

        const text = document.createElement("div");
        text.className = "holo-text";
        text.textContent = originalText;

        const timestamp = document.createElement("div");
        timestamp.className = "holo-timestamp";

        const ahora = new Date().toLocaleString("es-VE", {
          timeZone: zonaHoraria,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit"
        });

        const fecha = new Date().toLocaleString("en-US", {
          timeZone: zonaHoraria,
          day: "2-digit",
          month: "long",
          year: "numeric"
        });

        timestamp.innerHTML = `
          <div style="font-size: 0.8rem; font-weight: bold;">${ahora}</div>
          <div style="font-size: 0.9rem; color: #ccc;">${fecha}</div>
        `;

        msg.innerHTML = "";
        msg.appendChild(icon);
        msg.appendChild(text);
        msg.appendChild(timestamp);

        msg.style.setProperty("--delay", `${(i + 1) * 2}s`);
        msg.classList.add("animated");
      }
    });
  });

  // Manejar el cierre de la ventana en un solo lugar
  document.addEventListener("click", (e) => {
    const isClickedOnTrigger = trigger.contains(e.target);
    const isClickedInsidePopup = popup.contains(e.target);
    const isClickedInsideStartup = hologramStartup.contains(e.target);

    // Si el popup está visible y el clic no fue en el trigger, dentro del popup o dentro del hologram-startup, lo ocultamos.
    if (popup.classList.contains("show") && !isClickedOnTrigger && !isClickedInsidePopup && !isClickedInsideStartup) {
      popup.classList.remove("show");
      popup.classList.add("hidden");
      if (badge) badge.style.display = "flex";
    }
  });

  // Ocultar holoContent desde botón externo
  if (chatButton && holoContent) {
    chatButton.addEventListener("click", () => {
      holoContent.style.display = "none";
      localStorage.setItem("holoHidden", "true");
    });
  }
});





