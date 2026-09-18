import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { Navbar } from '@/components/common/Navbar';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { CatchUpView } from '@/components/catchup/CatchUpView';
import { UploadView } from '@/components/upload/UploadView';

export const App: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-zinc-100 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans antialiased">
      <Navbar />
      <main className="flex-1 p-4 sm:p-6">
        <Routes>
          <Route path="/" element={<ChatWindow />} />
          <Route path="/catch-up" element={<CatchUpView />} />
          <Route path="/upload" element={<UploadView />} />
        </Routes>
      </main>
    </div>
  );
};

export default App;