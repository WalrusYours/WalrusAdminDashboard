import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthGate } from './components/AuthGate'
import { Layout } from './components/Layout'
import { AppProvider } from './context/AppProvider'
import { DraftProvider } from './context/DraftProvider'
import { I18nProvider } from './i18n/I18nProvider'
import { ThemeProvider } from './theme/ThemeProvider'
import { OverviewPage } from './pages/OverviewPage'
import { SchemaPage } from './pages/SchemaPage'
import { SettingsPage } from './pages/SettingsPage'
import { TenantsPage } from './pages/TenantsPage'
import { WeightsPage } from './pages/WeightsPage'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <I18nProvider>
      <AppProvider>
        <AuthGate>
        <DraftProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<OverviewPage />} />
              <Route path="schema" element={<SchemaPage />} />
              <Route path="weights" element={<WeightsPage />} />
              <Route path="tenants" element={<TenantsPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<OverviewPage />} />
            </Route>
          </Routes>
        </DraftProvider>
        </AuthGate>
      </AppProvider>
      </I18nProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
