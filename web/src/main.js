import './app.css';
import App from './App.svelte';

const app = new App({ target: document.getElementById('app') });

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}

export default app;
