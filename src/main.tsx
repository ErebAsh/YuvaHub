import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import CustomCursor from './components/CustomCursor.tsx';import { AppProvider } from './context/AppContext.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <CustomCursor />
      <App />
    </AppProvider>
  </StrictMode>,
);
