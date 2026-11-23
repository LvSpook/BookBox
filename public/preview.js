// Entry point for the standalone preview page (public/index.html).
// MV3 blocks inline <script>, so the markup lives here. The shell is rendered
// into the preview frame rather than <body>, and app.js is imported afterwards
// because it reads its DOM nodes at module scope.
import { renderShell } from './ui.js';

const frame = document.getElementById('preview-frame');
renderShell(frame || document.body);
document.body.dataset.demoReady = '1';
await import('./app.js');
