import { BrowserRouter, Route, Routes } from 'react-router-dom'

import { HomePage } from './pages/Home/HomePage'
import { LoginPlaceholderPage } from './pages/Login/LoginPlaceholderPage'
import { RegisterPage } from './pages/Register/RegisterPage'
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPlaceholderPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
