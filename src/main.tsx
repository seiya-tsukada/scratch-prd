import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {GuestGate} from './components/GuestGate.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <GuestGate>
    <App />
  </GuestGate>
);
