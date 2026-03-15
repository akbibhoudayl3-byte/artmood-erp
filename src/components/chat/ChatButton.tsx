'use client';

import { MessageCircle } from 'lucide-react';

interface ChatButtonProps {
  unreadCount: number;
  isOpen: boolean;
  onClick: () => void;
}

export default function ChatButton({ unreadCount, isOpen, onClick }: ChatButtonProps) {
  if (isOpen) return null;

  return (
    <button
      onClick={onClick}
      className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-[60] w-14 h-14 bg-gradient-to-br from-[#C9956B] to-[#B8845A] text-white rounded-full shadow-lg shadow-[#C9956B]/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
    >
      <MessageCircle size={24} />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-white">
          {unreadCount > 9 ? '9+' : unreadCount}
        </span>
      )}
    </button>
  );
}
