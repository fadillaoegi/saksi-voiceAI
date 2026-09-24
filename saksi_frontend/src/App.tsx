import { Navigate, Route, Routes } from 'react-router-dom'
import { OfficerPage } from './presentation/pages/officer/OfficerPage'
import { SupervisorPage } from './presentation/pages/supervisor/SupervisorPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/officer" replace />} />
      <Route path="/officer" element={<OfficerPage />} />
      <Route path="/supervisor" element={<SupervisorPage />} />
    </Routes>
  )
}
