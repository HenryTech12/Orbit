import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from '@/components/common/Navbar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CatchUpView } from '@/components/catchup/CatchUpView';
import { UploadView } from '@/components/upload/UploadView';
import { AuthProvider } from '@/context/AuthContext';
import { ProtectedRoute } from '@/components/common/ProtectedRoute';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="min-h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased">
        <Navbar />
        <main className="flex-1 p-4 sm:p-6">
          <Routes>
            <Route path="/" element={<ChatWindow />} />
            <Route path="/catch-up" element={<CatchUpView />} />
            
            {/* Protected Admin Route */}
            <Route
              path="/upload"
              element={
                <ProtectedRoute requireAdmin>
                  <UploadView />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </AuthProvider>
  );
};

export default App;