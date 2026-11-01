import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { installLiquidPress } from './liquid';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');
installLiquidPress();
createRoot(container).render(<App />);
