import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import NavBar from './components/NavBar'
import TilSalg from './views/TilSalg'
import Solgte from './views/Solgte'
import VoresLejlighed from './views/VoresLejlighed'

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#0F1419]">
        <NavBar />
        <main className="max-w-[1200px] mx-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/til-salg" replace />} />
            <Route path="/til-salg" element={<TilSalg />} />
            <Route path="/solgte" element={<Solgte />} />
            <Route path="/vores-lejlighed" element={<VoresLejlighed />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
