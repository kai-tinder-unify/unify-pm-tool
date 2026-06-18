import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import { Spinner } from './components/ui';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import NewTask from './pages/NewTask';
import TaskBoard from './pages/TaskBoard';
import TaskDetail from './pages/TaskDetail';
import MyWork from './pages/MyWork';
import Capacity from './pages/Capacity';
import Analytics from './pages/Analytics';
import Proposals from './pages/Proposals';
import Briefings from './pages/Briefings';
import Settings from './pages/Settings';
import Profile from './pages/Profile';

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function RequireAdmin({ children }: { children: JSX.Element }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/pulse" element={<Navigate to="/tasks" replace />} />
        <Route path="/intake" element={<NewTask />} />
        <Route path="/tasks" element={<TaskBoard />} />
        <Route path="/tasks/:id" element={<TaskDetail />} />
        <Route path="/requests" element={<Navigate to="/tasks" replace />} />
        <Route path="/my-work" element={<MyWork />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route
          path="/proposals"
          element={
            <RequireAdmin>
              <Proposals />
            </RequireAdmin>
          }
        />
        <Route path="/briefings" element={<Briefings />} />
        <Route
          path="/capacity"
          element={
            <RequireAdmin>
              <Capacity />
            </RequireAdmin>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAdmin>
              <Settings />
            </RequireAdmin>
          }
        />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
