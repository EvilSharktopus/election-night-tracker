import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { BoardView } from './pages/BoardView';
import { StudentPortal } from './pages/StudentPortal';
import { SetupHub } from './pages/SetupHub';
import { Toaster } from 'react-hot-toast';

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-neutral-900 text-neutral-100 font-sans">
        <Toaster position="top-center" />
        <Routes>
          <Route path="/" element={<Navigate to="/setup" replace />} />
          <Route path="/setup" element={<SetupHub />} />
          <Route path="/board" element={<BoardView />} />
          <Route path="/teacher" element={<TeacherDashboard />} />
          <Route path="/party/:id" element={<StudentPortal />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
