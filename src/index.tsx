import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App'; // Questo dice: "Vai a prendere il codice lungo nel file App.tsx"

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}