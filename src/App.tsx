import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { NavBar } from '@/components/NavBar';
import { Footer } from '@/components/Footer';
import { ScrollToTop } from '@/components/ScrollToTop';
import { Studio } from '@/pages/Studio';
import { How } from '@/pages/How';
import { About } from '@/pages/About';
import { NotFound } from '@/pages/NotFound';

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <div className="flex min-h-screen flex-col">
        <NavBar />
        <div className="flex-1">
          <Routes>
            <Route path="/" element={<Studio />} />
            <Route path="/studio" element={<Navigate to="/" replace />} />
            <Route path="/calendar" element={<Navigate to="/" replace />} />
            <Route path="/owner" element={<Navigate to="/" replace />} />
            <Route path="/how" element={<How />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </div>
        <Footer />
      </div>
    </BrowserRouter>
  );
}

export default App;
