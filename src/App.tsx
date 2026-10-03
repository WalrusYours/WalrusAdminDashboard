import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AppProvider } from './context/AppProvider'
import { DraftProvider } from './context/DraftProvider'
import { OverviewPage } from './pages/OverviewPage'
import { SchemaPage } from './pages/SchemaPage'
import { TenantsPage } from './pages/TenantsPage'
import { WeightsPage } from './pages/WeightsPage'

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <DraftProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<OverviewPage />} />
              <Route path="schema" element={<SchemaPage />} />
              <Route path="weights" element={<WeightsPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="*" element={<OverviewPage />} />
            </Route>
          </Routes>
        </DraftProvider>
      </AppProvider>
    </BrowserRouter>
  )
}
