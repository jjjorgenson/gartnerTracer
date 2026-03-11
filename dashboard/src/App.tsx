import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { DashboardDataProvider } from './context/DashboardDataContext'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Timeline } from './pages/Timeline'
import { CommitDrillDown } from './pages/CommitDrillDown'
import { AgentLog } from './pages/AgentLog'
import { Docs } from './pages/Docs'
import { Settings } from './pages/Settings'

const basename = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

function App() {
  return (
    <BrowserRouter basename={basename}>
      <DashboardDataProvider>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="timeline/commit/:commitHash" element={<CommitDrillDown />} />
            <Route path="agent-log" element={<AgentLog />} />
            <Route path="docs" element={<Docs />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </DashboardDataProvider>
    </BrowserRouter>
  )
}

export default App
