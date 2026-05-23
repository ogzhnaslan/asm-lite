import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AssetsPage } from './pages/AssetsPage';
import { AssetDetailPage } from './pages/AssetDetailPage';
import { AboutPage } from './pages/knowledge/AboutPage';
import { TechnicalInfoPage } from './pages/knowledge/TechnicalInfoPage';
import { PortGuidePage } from './pages/knowledge/PortGuidePage';
import { DnsSecurityPage } from './pages/knowledge/DnsSecurityPage';
import { TlsGuidePage } from './pages/knowledge/TlsGuidePage';
import { HttpHeadersPage } from './pages/knowledge/HttpHeadersPage';
import { RiskScoringPage } from './pages/knowledge/RiskScoringPage';
import { ThreatIntelligencePage } from './pages/intelligence/ThreatIntelligencePage';
import { ReputationCenterPage } from './pages/intelligence/ReputationCenterPage';
import { PassiveLookupPage } from './pages/intelligence/PassiveLookupPage';

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Monitor */}
        <Route path="/assets" element={<ProtectedLayout><AssetsPage /></ProtectedLayout>} />
        <Route path="/assets/:id" element={<ProtectedLayout><AssetDetailPage /></ProtectedLayout>} />

        {/* Intelligence */}
        <Route path="/intelligence/lookup" element={<ProtectedLayout><PassiveLookupPage /></ProtectedLayout>} />
        <Route path="/intelligence/threat" element={<ProtectedLayout><ThreatIntelligencePage /></ProtectedLayout>} />
        <Route path="/intelligence/reputation" element={<ProtectedLayout><ReputationCenterPage /></ProtectedLayout>} />

        {/* Knowledge Base */}
        <Route path="/about" element={<ProtectedLayout><AboutPage /></ProtectedLayout>} />
        <Route path="/knowledge/technical" element={<ProtectedLayout><TechnicalInfoPage /></ProtectedLayout>} />
        <Route path="/knowledge/ports" element={<ProtectedLayout><PortGuidePage /></ProtectedLayout>} />
        <Route path="/knowledge/dns" element={<ProtectedLayout><DnsSecurityPage /></ProtectedLayout>} />
        <Route path="/knowledge/tls" element={<ProtectedLayout><TlsGuidePage /></ProtectedLayout>} />
        <Route path="/knowledge/http-headers" element={<ProtectedLayout><HttpHeadersPage /></ProtectedLayout>} />
        <Route path="/knowledge/risk-scoring" element={<ProtectedLayout><RiskScoringPage /></ProtectedLayout>} />

        <Route path="*" element={<Navigate to="/assets" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
