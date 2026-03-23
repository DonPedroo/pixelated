import Sketch from './index.js';

// Inject global styles to ensure the canvas fills the screen
const style = document.createElement('style');
style.innerHTML = `
  body, html, #app {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
  }
  canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
`;
document.head.appendChild(style);

// Bootstrap the application
const container = document.getElementById('app');
if (container) {
  const sketch = new Sketch(container);
  sketch.init().catch(err => {
    console.error('Failed to initialize sketch:', err);
  });
} else {
  console.error('Container element #app not found');
}
