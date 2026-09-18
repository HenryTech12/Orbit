import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from '@/components/common/Navbar';
import { ChatWindow } from '@/components/chat/ChatWindow';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased">
      <Navbar />
      <main className="flex-1 p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<ChatWindow />} />
          <Route
            path="/catch-up"
            element={
              <div className="text-center py-16 text-zinc-500 text-sm">
                Catch Me Up view will be mounted here in the next step.
              </div>
            }
          />
          <Route
            path="/upload"
            element={
              <div className="text-center py-16 text-zinc-500 text-sm">
                Upload & Ingestion view will be mounted here.
              </div>
            }
          />
        </Routes>
      </main>
    </div>
  );
};

export default App;