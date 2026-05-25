import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
 
// Si la app corre dentro del panel del Ecosystem (iframe con ?embed=1),
// agrega la clase 'embedded' al <html> para que el CSS suprima el fondo
// y el centrado propios, y la app ocupe 100% del panel.
if (new URLSearchParams(window.location.search).get('embed') === '1') {
  document.documentElement.classList.add('embedded');
}
 
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
 