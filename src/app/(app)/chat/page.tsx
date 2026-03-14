'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import {
  MessageCircle, Send, Plus, Search, ArrowLeft, Users, User, Check, CheckCheck, Hash
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url?: string;
  is_active: boolean;
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_at: string;
  updated_at: string;
  participants: { user_id: string; last_read_at: string }[];
  last_message?: Message;
  unread_count: number;
  other_user?: Profile;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_deleted: boolean;
  sender?: Profile;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const ROLE_COLORS: Record<string, string> = {
  ceo: '#C9956B',
  commercial_manager: '#3B82F6',
  designer: '#8B5CF6',
  workshop_manager: '#F59E0B',
  workshop_worker: '#10B981',
  installer: '#EF4444',
  hr_manager: '#EC4899',
  community_manager: '#06B6D4',
  owner_admin: '#C9956B',
  operations_manager: '#6366F1',
  logistics: '#84CC16',
  worker: '#10B981',
};

// ══════════════════════════════════════════════════════════════════════════════
// Main Chat Page
// ══════════════════════════════════════════════════════════════════════════════
export default function ChatPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const { t } = useLocale();

  // State
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [showMobileConv, setShowMobileConv] = useState(true);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [searchUsers, setSearchUsers] = useState('');
  const [searchConv, setSearchConv] = useState('');
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const userId = profile?.id;

  // ── Load all profiles (for name resolution) ───────────────────────────────
  const loadProfiles = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url, is_active')
      .eq('is_active', true);
    if (data) {
      const map: Record<string, Profile> = {};
      data.forEach(p => { map[p.id] = p as Profile; });
      setProfilesMap(map);
      setAllUsers(data as Profile[]);
    }
  }, [supabase]);

  // ── Load conversations ────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!userId) return;

    // Get conversations I'm part of
    const { data: myParticipations } = await supabase
      .from('chat_participants')
      .select('conversation_id, last_read_at')
      .eq('user_id', userId);

    if (!myParticipations?.length) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = myParticipations.map(p => p.conversation_id);

    // Get conversation details
    const { data: convs } = await supabase
      .from('chat_conversations')
      .select('id, type, name, created_at, updated_at')
      .in('id', convIds)
      .order('updated_at', { ascending: false });

    if (!convs) { setLoading(false); return; }

    // Get all participants for these conversations
    const { data: allParticipants } = await supabase
      .from('chat_participants')
      .select('conversation_id, user_id, last_read_at')
      .in('conversation_id', convIds);

    // Get last message for each conversation
    const convList: Conversation[] = [];
    for (const conv of convs) {
      const participants = (allParticipants || []).filter(p => p.conversation_id === conv.id);
      const myParticipation = myParticipations.find(p => p.conversation_id === conv.id);

      // Get last message
      const { data: lastMsgs } = await supabase
        .from('chat_messages')
        .select('id, sender_id, content, created_at, is_deleted')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: false })
        .limit(1);

      // Count unread
      const lastReadAt = myParticipation?.last_read_at || conv.created_at;
      const { count: unread } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id)
        .neq('sender_id', userId)
        .gt('created_at', lastReadAt);

      // For direct chats, find the other user
      let otherUser: Profile | undefined;
      if (conv.type === 'direct') {
        const otherId = participants.find(p => p.user_id !== userId)?.user_id;
        if (otherId) otherUser = profilesMap[otherId];
      }

      convList.push({
        ...conv,
        participants,
        last_message: lastMsgs?.[0] as Message | undefined,
        unread_count: unread || 0,
        other_user: otherUser,
      });
    }

    setConversations(convList);
    setLoading(false);
  }, [userId, supabase, profilesMap]);

  // ── Load messages for active conversation ─────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!activeConvId) return;
    setLoadingMessages(true);

    const { data } = await supabase
      .from('chat_messages')
      .select('id, conversation_id, sender_id, content, created_at, is_deleted')
      .eq('conversation_id', activeConvId)
      .order('created_at', { ascending: true })
      .limit(100);

    setMessages((data as Message[]) || []);
    setLoadingMessages(false);

    // Mark as read
    if (userId) {
      await supabase
        .from('chat_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', activeConvId)
        .eq('user_id', userId);
    }

    // Scroll to bottom
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeConvId, userId, supabase]);

  // ── Send message ──────────────────────────────────────────────────────────
  async function handleSend() {
    if (!newMessage.trim() || !activeConvId || !userId || sending) return;
    setSending(true);

    const { error } = await supabase.from('chat_messages').insert({
      conversation_id: activeConvId,
      sender_id: userId,
      content: newMessage.trim(),
    });

    if (!error) {
      // Update conversation timestamp
      await supabase
        .from('chat_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', activeConvId);

      setNewMessage('');
      inputRef.current?.focus();
    }
    setSending(false);
  }

  // ── Start new direct conversation ─────────────────────────────────────────
  async function startDirectChat(otherUserId: string) {
    if (!userId) return;

    // Check if conversation already exists
    const { data: myConvs } = await supabase
      .from('chat_participants')
      .select('conversation_id')
      .eq('user_id', userId);

    if (myConvs) {
      for (const mc of myConvs) {
        const { data: otherP } = await supabase
          .from('chat_participants')
          .select('user_id')
          .eq('conversation_id', mc.conversation_id)
          .eq('user_id', otherUserId);

        if (otherP?.length) {
          // Check it's a direct chat
          const { data: conv } = await supabase
            .from('chat_conversations')
            .select('id, type')
            .eq('id', mc.conversation_id)
            .eq('type', 'direct')
            .single();

          if (conv) {
            setActiveConvId(conv.id);
            setShowNewChat(false);
            setShowMobileConv(false);
            return;
          }
        }
      }
    }

    // Create new conversation
    const { data: newConv } = await supabase
      .from('chat_conversations')
      .insert({ type: 'direct', created_by: userId })
      .select('id')
      .single();

    if (newConv) {
      await supabase.from('chat_participants').insert([
        { conversation_id: newConv.id, user_id: userId },
        { conversation_id: newConv.id, user_id: otherUserId },
      ]);

      setActiveConvId(newConv.id);
      setShowNewChat(false);
      setShowMobileConv(false);
      await loadConversations();
    }
  }

  // ── Start group conversation ──────────────────────────────────────────────
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  async function createGroupChat() {
    if (!userId || !groupName.trim() || selectedUsers.length < 1) return;

    const { data: newConv } = await supabase
      .from('chat_conversations')
      .insert({ type: 'group', name: groupName.trim(), created_by: userId })
      .select('id')
      .single();

    if (newConv) {
      const participants = [userId, ...selectedUsers].map(uid => ({
        conversation_id: newConv.id,
        user_id: uid,
      }));
      await supabase.from('chat_participants').insert(participants);

      setActiveConvId(newConv.id);
      setShowNewChat(false);
      setShowMobileConv(false);
      setGroupName('');
      setSelectedUsers([]);
      await loadConversations();
    }
  }

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('chat-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const msg = payload.new as Message;
          // If it's in the active conversation, add it
          if (msg.conversation_id === activeConvId) {
            setMessages(prev => [...prev, msg]);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

            // Mark as read
            if (msg.sender_id !== userId) {
              supabase
                .from('chat_participants')
                .update({ last_read_at: new Date().toISOString() })
                .eq('conversation_id', activeConvId)
                .eq('user_id', userId);
            }
          }
          // Refresh conversation list for unread counts
          loadConversations();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, activeConvId, supabase, loadConversations]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => { if (Object.keys(profilesMap).length > 0) loadConversations(); }, [profilesMap, loadConversations]);
  useEffect(() => { loadMessages(); }, [loadMessages]);

  // ── Filter conversations ──────────────────────────────────────────────────
  const filteredConvs = conversations.filter(c => {
    if (!searchConv) return true;
    const q = searchConv.toLowerCase();
    const name = c.type === 'direct'
      ? c.other_user?.full_name || ''
      : c.name || '';
    return name.toLowerCase().includes(q);
  });

  // ── Filter users for new chat ─────────────────────────────────────────────
  const filteredUsers = allUsers.filter(u =>
    u.id !== userId &&
    u.is_active &&
    (searchUsers ? u.full_name.toLowerCase().includes(searchUsers.toLowerCase()) : true)
  );

  const activeConv = conversations.find(c => c.id === activeConvId);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-[calc(100vh-68px)] flex bg-[#F8F9FC]">
      {/* ── Left Panel: Conversations ──────────────────────────────────────── */}
      <div className={`
        w-full lg:w-[360px] lg:min-w-[360px] border-r border-gray-200 bg-white flex flex-col
        ${!showMobileConv ? 'hidden lg:flex' : 'flex'}
      `}>
        {/* Header */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-[#1a1a2e]">
              <MessageCircle className="inline mr-2 text-[#C9956B]" size={22} />
              Chat
            </h1>
            <button
              onClick={() => setShowNewChat(true)}
              className="w-9 h-9 bg-[#C9956B] text-white rounded-xl flex items-center justify-center hover:bg-[#B8845A] transition-colors"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchConv}
              onChange={e => setSearchConv(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <MessageCircle size={40} className="mb-2 opacity-30" />
              <p className="text-sm">No conversations yet</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-2 text-[#C9956B] text-sm font-medium hover:underline"
              >
                Start a new chat
              </button>
            </div>
          ) : (
            filteredConvs.map(conv => {
              const isActive = conv.id === activeConvId;
              const displayName = conv.type === 'direct'
                ? conv.other_user?.full_name || 'Unknown'
                : conv.name || 'Group';
              const lastMsg = conv.last_message;
              const senderName = lastMsg?.sender_id === userId
                ? 'You'
                : profilesMap[lastMsg?.sender_id || '']?.full_name?.split(' ')[0] || '';

              return (
                <button
                  key={conv.id}
                  onClick={() => { setActiveConvId(conv.id); setShowMobileConv(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50
                    ${isActive ? 'bg-[#C9956B]/5 border-l-2 border-l-[#C9956B]' : 'hover:bg-gray-50'}`}
                >
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white font-semibold text-sm
                    ${conv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`}
                    style={conv.type === 'direct' ? {
                      backgroundColor: ROLE_COLORS[conv.other_user?.role || ''] || '#94A3B8'
                    } : {}}
                  >
                    {conv.type === 'group'
                      ? <Users size={18} />
                      : getInitials(conv.other_user?.full_name || '?')}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-[#1a1a2e] truncate">{displayName}</span>
                      {lastMsg && (
                        <span className="text-[11px] text-gray-400 shrink-0 ml-2">
                          {timeAgo(lastMsg.created_at)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate">
                        {lastMsg
                          ? `${senderName ? senderName + ': ' : ''}${lastMsg.is_deleted ? 'Message deleted' : lastMsg.content}`
                          : 'No messages yet'}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="ml-2 shrink-0 w-5 h-5 bg-[#C9956B] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                          {conv.unread_count > 9 ? '9+' : conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Panel: Messages ──────────────────────────────────────────── */}
      <div className={`
        flex-1 flex flex-col bg-[#F8F9FC]
        ${showMobileConv ? 'hidden lg:flex' : 'flex'}
      `}>
        {!activeConvId ? (
          /* No conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <MessageCircle size={36} className="text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-500">Select a conversation</p>
            <p className="text-sm mt-1">or start a new one</p>
          </div>
        ) : (
          <>
            {/* Chat Header */}
            <div className="h-16 px-4 flex items-center gap-3 bg-white border-b border-gray-200 shrink-0">
              <button
                onClick={() => { setShowMobileConv(true); setActiveConvId(null); }}
                className="lg:hidden p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft size={20} />
              </button>

              {activeConv && (
                <>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm
                    ${activeConv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`}
                    style={activeConv.type === 'direct' ? {
                      backgroundColor: ROLE_COLORS[activeConv.other_user?.role || ''] || '#94A3B8'
                    } : {}}
                  >
                    {activeConv.type === 'group'
                      ? <Users size={16} />
                      : getInitials(activeConv.other_user?.full_name || '?')}
                  </div>
                  <div>
                    <p className="font-semibold text-[#1a1a2e] text-sm">
                      {activeConv.type === 'direct'
                        ? activeConv.other_user?.full_name || 'Unknown'
                        : activeConv.name || 'Group'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {activeConv.type === 'direct'
                        ? activeConv.other_user?.role?.replace('_', ' ')
                        : `${activeConv.participants.length} members`}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading messages...</div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  No messages yet. Say hello!
                </div>
              ) : (
                <>
                  {messages.map((msg, i) => {
                    const isMe = msg.sender_id === userId;
                    const sender = profilesMap[msg.sender_id];
                    const showAvatar = !isMe && (i === 0 || messages[i - 1]?.sender_id !== msg.sender_id);
                    const showName = !isMe && activeConv?.type === 'group' && showAvatar;

                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'}`}>
                        {/* Avatar for others */}
                        {!isMe && (
                          <div className="w-8 mr-2 shrink-0">
                            {showAvatar && (
                              <div
                                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                style={{ backgroundColor: ROLE_COLORS[sender?.role || ''] || '#94A3B8' }}
                              >
                                {getInitials(sender?.full_name || '?')}
                              </div>
                            )}
                          </div>
                        )}

                        <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                          {showName && (
                            <p className="text-[10px] font-medium text-gray-400 mb-0.5 ml-1">
                              {sender?.full_name?.split(' ')[0]}
                            </p>
                          )}
                          <div className={`
                            px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words
                            ${isMe
                              ? 'bg-[#C9956B] text-white rounded-br-md'
                              : 'bg-white text-[#1a1a2e] rounded-bl-md shadow-sm border border-gray-100'}
                          `}>
                            {msg.is_deleted ? (
                              <span className="italic opacity-60">Message deleted</span>
                            ) : (
                              msg.content
                            )}
                          </div>
                          <p className={`text-[10px] mt-0.5 mx-1 ${isMe ? 'text-right text-gray-400' : 'text-gray-400'}`}>
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Input */}
            <div className="px-4 py-3 bg-white border-t border-gray-200 shrink-0">
              <form
                onSubmit={e => { e.preventDefault(); handleSend(); }}
                className="flex items-center gap-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={e => setNewMessage(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!newMessage.trim() || sending}
                  className="w-10 h-10 bg-[#C9956B] text-white rounded-xl flex items-center justify-center hover:bg-[#B8845A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* ── New Chat Modal ─────────────────────────────────────────────────── */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewChat(false)}>
          <div
            className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-[#1a1a2e]">New Conversation</h2>

              {/* Tabs */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => setSelectedUsers([])}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${selectedUsers.length === 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <User size={14} className="inline mr-1" /> Direct
                </button>
                <button
                  onClick={() => setSelectedUsers(selectedUsers.length ? selectedUsers : ['__group__'])}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                    ${selectedUsers.length > 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  <Users size={14} className="inline mr-1" /> Group
                </button>
              </div>

              {/* Group name */}
              {selectedUsers.length > 0 && (
                <input
                  type="text"
                  placeholder="Group name..."
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  className="w-full mt-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30"
                />
              )}

              {/* Search */}
              <div className="relative mt-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchUsers}
                  onChange={e => setSearchUsers(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30"
                />
              </div>
            </div>

            {/* User List */}
            <div className="flex-1 overflow-y-auto p-2">
              {filteredUsers.map(user => {
                const isSelected = selectedUsers.includes(user.id);
                return (
                  <button
                    key={user.id}
                    onClick={() => {
                      if (selectedUsers.length === 0 || selectedUsers[0] === '__group__') {
                        // Direct message mode — just start the chat
                        if (selectedUsers.length === 0) {
                          startDirectChat(user.id);
                          return;
                        }
                      }
                      // Group mode — toggle selection
                      setSelectedUsers(prev => {
                        const filtered = prev.filter(id => id !== '__group__');
                        return isSelected
                          ? filtered.filter(id => id !== user.id)
                          : [...filtered, user.id];
                      });
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors
                      ${isSelected ? 'bg-[#C9956B]/10' : 'hover:bg-gray-50'}`}
                  >
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
                      style={{ backgroundColor: ROLE_COLORS[user.role] || '#94A3B8' }}
                    >
                      {getInitials(user.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[#1a1a2e] truncate">{user.full_name}</p>
                      <p className="text-xs text-gray-400 capitalize">{user.role.replace('_', ' ')}</p>
                    </div>
                    {isSelected && (
                      <Check size={18} className="text-[#C9956B] shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Group create button */}
            {selectedUsers.length > 0 && selectedUsers[0] !== '__group__' && (
              <div className="p-4 border-t border-gray-100">
                <button
                  onClick={createGroupChat}
                  disabled={!groupName.trim() || selectedUsers.length < 1}
                  className="w-full py-2.5 bg-[#C9956B] text-white rounded-xl font-medium text-sm hover:bg-[#B8845A] transition-colors disabled:opacity-40"
                >
                  Create Group ({selectedUsers.length} members)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
