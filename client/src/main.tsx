import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyDocumentFavicon } from './services/appFavicon'

applyDocumentFavicon(document)

createRoot(document.getElementById('root')!).render(
  <App />,
)
