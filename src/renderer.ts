import './index.css';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { App } from './renderer/App';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(createElement(App));
}
