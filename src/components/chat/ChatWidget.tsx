'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  Reply, Edit3, Trash2, Pin, PinOff, Forward, FileText,
} from 'lucide-react';
import * as chatService from '@/lib/services/chat.service';
import type { Profile, Conversation, Message, Reaction } from '@/lib/services/chat.service';
import ChatButton from './ChatButton';
import ConversationList from './ConversationList';
import MessageView from './MessageView';
import CallManager from './CallManager';
import type { CallManagerHandle } from './CallManager';

// ── Constants ────────────────────────────────────────────────────────────────
const MSG_LIMIT = 50;

// ══════════════════════════════════════════════════════════════════════════════
export default function ChatWidget() {
  const supabase = createClient();
  const { profile } = useAuth();
  const userId = profile?.id;

  // ── Widget state ───────────────────────────────────────────────────────
  const [open, setOpen] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [listTab, setListTab] = useState<'chats' | 'contacts'>('chats');

  // ── Core state ─────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [searchConv, setSearchConv] = useState('');
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [pinnedMsgIds, setPinnedMsgIds] = useState<Set<string>>(new Set());

  // ── New chat ───────────────────────────────────────────────────────────
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // ── Features ───────────────────────────────────────────────────────────
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMsg, setEditingMsg] = useState<Message | null>(null);
  const [editText, setEditText] = useState('');
  const [showEmojiFor, setShowEmojiFor] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ msg: Message; x: number; y: number } | null>(null);
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null);
  const [searchMessages, setSearchMessages] = useState('');
  const [showSearchMessages, setShowSearchMessages] = useState(false);
  const [showPinnedMessages, setShowPinnedMessages] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [msgPage, setMsgPage] = useState(0);

  // ── Voice recording ────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── File / Camera ──────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // ── Location ───────────────────────────────────────────────────────────
  const [sendingLocation, setSendingLocation] = useState(false);

  // ── Mention ────────────────────────────────────────────────────────────
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  // ── Calls (state managed here, logic in CallManager) ───────────────────
  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'active'>('idle');
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [callPeer, setCallPeer] = useState<Profile | null>(null);
  const [callConvId, setCallConvId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [incomingCall, setIncomingCall] = useState<{ from: string; type: 'voice' | 'video'; convId: string } | null>(null);
  const callManagerRef = useRef<CallManagerHandle>(null);

  // ── Contacts / Archive ─────────────────────────────────────────────────
  const [searchContacts, setSearchContacts] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [convMenu, setConvMenu] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── Derived ────────────────────────────────────────────────────────────
  const view = activeConvId ? 'chat' : 'list';
  const activeConv = conversations.find(c => c.id === activeConvId);

  // ══════════════════════════════════════════════════════════════════════
  // HEARTBEAT
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!userId) return;
    chatService.updateHeartbeat(userId);
    const iv = setInterval(() => chatService.updateHeartbeat(userId), 60000);
    return () => clearInterval(iv);
  }, [userId]);

  // ══════════════════════════════════════════════════════════════════════
  // LOAD PROFILES
  // ══════════════════════════════════════════════════════════════════════
  const loadProfilesData = useCallback(async () => {
    const result = await chatService.loadProfiles();
    if (result.success && result.data) {
      setProfilesMap(result.data.profilesMap);
      setAllUsers(result.data.profiles);
    }
  }, []);

  useEffect(() => {
    loadProfilesData();
    const iv = setInterval(loadProfilesData, 30000);
    return () => clearInterval(iv);
  }, [loadProfilesData]);

  // ══════════════════════════════════════════════════════════════════════
  // LOAD CONVERSATIONS
  // ══════════════════════════════════════════════════════════════════════
  const loadConversationsData = useCallback(async () => {
    if (!userId) return;
    const result = await chatService.loadConversations(userId, profilesMap);
    if (result.success && result.data) {
      setConversations(result.data.conversations);
      setTotalUnread(result.data.totalUnread);
    }
    setLoading(false);
  }, [userId, profilesMap]);

  // ══════════════════════════════════════════════════════════════════════
  // LOAD MESSAGES
  // ══════════════════════════════════════════════════════════════════════
  const loadMessagesData = useCallback(async (append = false) => {
    if (!activeConvId || !userId) return;
    if (!append) { setLoadingMessages(true); setMsgPage(0); }
    const offset = append ? (msgPage + 1) * MSG_LIMIT : 0;

    const result = await chatService.loadMessages(activeConvId, userId, offset);
    if (result.success && result.data) {
      if (append) {
        setMessages(prev => [...result.data!.messages, ...prev]);
        setMsgPage(p => p + 1);
        // Merge reactions
        setReactions(prev => {
          const merged = { ...prev };
          Object.entries(result.data!.reactions).forEach(([k, v]) => { merged[k] = v; });
          return merged;
        });
      } else {
        setMessages(result.data.messages);
        setReactions(result.data.reactions);
      }
      setPinnedMsgIds(result.data.pinnedMsgIds);
      setHasMore(result.data.hasMore);
    }
    setLoadingMessages(false);
    setLoadingMore(false);

    if (!append && userId) {
      await chatService.markAsRead(activeConvId, userId);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [activeConvId, userId, msgPage]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 60) { setLoadingMore(true); loadMessagesData(true); }
  }, [loadingMore, hasMore, loadMessagesData]);

  // ══════════════════════════════════════════════════════════════════════
  // SEND / EDIT / DELETE
  // ══════════════════════════════════════════════════════════════════════
  async function handleSend() {
    if (!newMessage.trim() || !activeConvId || !userId || sending) return;
    setSending(true);
    const result = await chatService.sendMessage({
      conversationId: activeConvId,
      senderId: userId,
      content: newMessage.trim(),
      replyToId: replyTo?.id,
    });
    if (result.success) {
      setNewMessage(''); setReplyTo(null); inputRef.current?.focus();
    }
    setSending(false);
  }

  async function handleEditSave() {
    if (!editingMsg || !editText.trim()) return;
    const result = await chatService.editMessage(editingMsg.id, editText.trim());
    if (result.success) {
      setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } : m));
    }
    setEditingMsg(null); setEditText('');
  }

  async function handleDeleteMsg(msgId: string) {
    await chatService.deleteMessage(msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: '' } : m));
    setContextMenu(null);
  }

  async function handleReaction(msgId: string, emoji: string) {
    if (!userId) return;
    const result = await chatService.toggleReaction(msgId, userId, emoji, reactions[msgId] || []);
    if (result.success && result.data) {
      if (result.data.added && result.data.reaction) {
        setReactions(prev => ({ ...prev, [msgId]: [...(prev[msgId] || []), result.data!.reaction!] }));
      } else if (!result.data.added && result.data.removedId) {
        setReactions(prev => ({ ...prev, [msgId]: (prev[msgId] || []).filter(r => r.id !== result.data!.removedId) }));
      }
    }
    setShowEmojiFor(null);
  }

  async function handleTogglePin(msgId: string) {
    if (!activeConvId || !userId) return;
    if (pinnedMsgIds.has(msgId)) {
      await chatService.unpinMessage(activeConvId, msgId);
      setPinnedMsgIds(prev => { const s = new Set(prev); s.delete(msgId); return s; });
    } else {
      await chatService.pinMessage(activeConvId, msgId, userId);
      setPinnedMsgIds(prev => new Set(prev).add(msgId));
    }
    setContextMenu(null);
  }

  async function handleForward(targetConvId: string) {
    if (!forwardMsg || !userId) return;
    await chatService.forwardMessage(forwardMsg, targetConvId, userId);
    setForwardMsg(null);
  }

  // ══════════════════════════════════════════════════════════════════════
  // FILE UPLOAD
  // ══════════════════════════════════════════════════════════════════════
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConvId || !userId) return;
    setUploading(true);
    await chatService.handleFileUpload(file, activeConvId, userId, replyTo?.id);
    setReplyTo(null); setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  // ══════════════════════════════════════════════════════════════════════
  // CAMERA
  // ══════════════════════════════════════════════════════════════════════
  async function openDesktopCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      cameraStreamRef.current = stream;
      setShowCameraPreview(true);
      setTimeout(() => {
        if (videoPreviewRef.current) {
          videoPreviewRef.current.srcObject = stream;
          videoPreviewRef.current.play();
        }
      }, 100);
    } catch { console.error('Camera access denied'); }
  }

  async function capturePhoto() {
    if (!videoPreviewRef.current || !activeConvId || !userId) return;
    const video = videoPreviewRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      closeCameraPreview();
      setUploading(true);
      await chatService.uploadCapturedPhoto(blob, activeConvId, userId);
      setUploading(false);
    }, 'image/jpeg', 0.85);
  }

  function closeCameraPreview() {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setShowCameraPreview(false);
  }

  function handleCameraClick() {
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      cameraInputRef.current?.click();
    } else {
      openDesktopCamera();
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // LOCATION
  // ══════════════════════════════════════════════════════════════════════
  async function sendLocation() {
    if (!activeConvId || !userId || sendingLocation) return;
    setSendingLocation(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const { latitude, longitude } = pos.coords;
      let locationName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=16`);
        const geo = await res.json();
        if (geo.display_name) locationName = geo.display_name.split(',').slice(0, 3).join(',');
      } catch { /* keep coords as name */ }
      await chatService.sendLocationMessage(activeConvId, userId, latitude, longitude, locationName);
    } catch (err) {
      console.error('Location error:', err);
      alert('Could not access your location. Please enable location services.');
    }
    setSendingLocation(false);
  }

  // ══════════════════════════════════════════════════════════════════════
  // VOICE RECORDING
  // ══════════════════════════════════════════════════════════════════════
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (!activeConvId || !userId) return;
        await chatService.uploadVoiceMessage(blob, activeConvId, userId, recordingTime);
        setRecordingTime(0);
      };
      recorder.start(); mediaRecorderRef.current = recorder; setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { console.error('Mic denied'); }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop(); setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false); setRecordingTime(0);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }

  function playVoice(url: string, msgId: string) {
    if (audioRef.current) audioRef.current.pause();
    if (playingVoice === msgId) { setPlayingVoice(null); return; }
    const a = new Audio(url); a.onended = () => setPlayingVoice(null); a.play(); audioRef.current = a; setPlayingVoice(msgId);
  }

  // ══════════════════════════════════════════════════════════════════════
  // TYPING
  // ══════════════════════════════════════════════════════════════════════
  const broadcastTyping = useCallback(() => {
    if (!activeConvId || !userId) return;
    supabase.channel(`typing:${activeConvId}`).send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } });
  }, [activeConvId, userId, supabase]);

  function handleInputChange(val: string) {
    setNewMessage(val);
    broadcastTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {}, 3000);
    const lastAt = val.lastIndexOf('@');
    if (lastAt >= 0 && !val.substring(lastAt).includes(' ')) { setShowMentions(true); setMentionQuery(val.substring(lastAt + 1)); }
    else setShowMentions(false);
  }

  function insertMention(user: Profile) {
    setNewMessage(prev => { const i = prev.lastIndexOf('@'); return prev.slice(0, i) + `@${user.full_name} `; });
    setShowMentions(false); inputRef.current?.focus();
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (editingMsg) handleEditSave(); else handleSend(); }
    if (e.key === 'Escape') { setReplyTo(null); setEditingMsg(null); setShowMentions(false); }
  }

  // ══════════════════════════════════════════════════════════════════════
  // CONVERSATION MANAGEMENT
  // ══════════════════════════════════════════════════════════════════════
  async function handleStartDirectChat(otherUserId: string) {
    if (!userId) return;
    const result = await chatService.startDirectChat(userId, otherUserId);
    if (result.success && result.data) {
      setActiveConvId(result.data);
      setShowNewChat(false);
      setListTab('chats');
      await loadConversationsData();
    }
  }

  async function handleCreateGroupChat() {
    if (!userId || !groupName.trim() || selectedUsers.length < 1) return;
    const validUsers = selectedUsers.filter(id => id !== '__group__');
    const result = await chatService.createGroupChat(userId, groupName.trim(), validUsers);
    if (result.success && result.data) {
      setActiveConvId(result.data);
      setShowNewChat(false);
      setGroupName('');
      setSelectedUsers([]);
      await loadConversationsData();
    }
  }

  async function handleAddGroupMember(convId: string, memberId: string) {
    await chatService.addGroupMember(convId, memberId);
    await loadConversationsData();
  }

  async function handleRemoveGroupMember(convId: string, memberId: string) {
    await chatService.removeGroupMember(convId, memberId);
    await loadConversationsData();
  }

  async function handleRenameGroup(convId: string, name: string) {
    await chatService.renameGroup(convId, name);
    await loadConversationsData();
  }

  async function handleArchiveConversation(convId: string) {
    if (!userId) return;
    await chatService.archiveConversation(convId, userId);
    setConvMenu(null);
    if (activeConvId === convId) setActiveConvId(null);
    await loadConversationsData();
  }

  async function handleUnarchiveConversation(convId: string) {
    if (!userId) return;
    await chatService.unarchiveConversation(convId, userId);
    setConvMenu(null);
    await loadConversationsData();
  }

  async function handleDeleteConversation(convId: string) {
    if (!userId) return;
    if (!confirm('Leave this conversation? You will no longer see it.')) return;
    await chatService.deleteConversation(convId, userId);
    setConvMenu(null);
    if (activeConvId === convId) setActiveConvId(null);
    await loadConversationsData();
  }

  // ══════════════════════════════════════════════════════════════════════
  // REALTIME
  // ══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel('chat-widget-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === activeConvId) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          if (msg.sender_id !== userId) chatService.markAsRead(activeConvId, userId);
        }
        if (msg.sender_id !== userId) { try { new Audio('/notification.mp3').play().catch(() => {}); } catch {} }
        loadConversationsData();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === activeConvId) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, activeConvId, supabase, loadConversationsData]);

  // Typing channel
  useEffect(() => {
    if (!activeConvId || !userId) return;
    const ch = supabase.channel(`typing:${activeConvId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === userId) return;
        setTypingUsers(prev => prev.includes(payload.user_id) ? prev : [...prev, payload.user_id]);
        setTimeout(() => setTypingUsers(prev => prev.filter(id => id !== payload.user_id)), 3000);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeConvId, userId, supabase]);

  // Initial load
  useEffect(() => { if (Object.keys(profilesMap).length > 0) loadConversationsData(); }, [profilesMap, loadConversationsData]);
  useEffect(() => { if (activeConvId) loadMessagesData(); }, [activeConvId]);

  // Close menus on click
  useEffect(() => {
    const h = () => { setContextMenu(null); setShowEmojiFor(null); setConvMenu(null); };
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, []);

  if (!userId) return null;

  // ══════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* Call Manager (incoming/active call overlays + WebRTC logic) */}
      <CallManager
        ref={callManagerRef}
        userId={userId}
        profilesMap={profilesMap}
        conversations={conversations}
        activeConvId={activeConvId}
        callState={callState}
        callType={callType}
        callPeer={callPeer}
        callConvId={callConvId}
        callDuration={callDuration}
        isMuted={isMuted}
        isSpeaker={isSpeaker}
        isVideoOn={isVideoOn}
        incomingCall={incomingCall}
        onSetCallState={setCallState}
        onSetCallType={setCallType}
        onSetCallPeer={setCallPeer}
        onSetCallConvId={setCallConvId}
        onSetCallDuration={setCallDuration}
        onSetIsMuted={setIsMuted}
        onSetIsSpeaker={setIsSpeaker}
        onSetIsVideoOn={setIsVideoOn}
        onSetIncomingCall={setIncomingCall}
      />

      {/* Floating Button */}
      <ChatButton
        unreadCount={totalUnread}
        isOpen={open}
        onClick={() => setOpen(true)}
      />

      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-0 right-0 lg:bottom-6 lg:right-6 z-[60] w-full h-full lg:w-[400px] lg:h-[600px] lg:rounded-2xl bg-white shadow-2xl shadow-black/20 flex flex-col overflow-hidden lg:border lg:border-gray-200">

          {/* CONVERSATION LIST VIEW */}
          {view === 'list' && !showNewChat && !forwardMsg && !showGroupSettings ? (
            <ConversationList
              userId={userId}
              conversations={conversations}
              allUsers={allUsers}
              profilesMap={profilesMap}
              totalUnread={totalUnread}
              loading={loading}
              listTab={listTab}
              searchConv={searchConv}
              searchContacts={searchContacts}
              searchUsers={searchUsers}
              showNewChat={false}
              showArchived={showArchived}
              selectedUsers={selectedUsers}
              groupName={groupName}
              convMenu={convMenu}
              forwardMsg={null}
              showGroupSettings={false}
              activeConv={activeConv}
              onClose={() => setOpen(false)}
              onSetListTab={setListTab}
              onSetSearchConv={setSearchConv}
              onSetSearchContacts={setSearchContacts}
              onSetSearchUsers={setSearchUsers}
              onSelectConversation={id => { setActiveConvId(id); setConvMenu(null); }}
              onShowNewChat={setShowNewChat}
              onSetShowArchived={setShowArchived}
              onSetSelectedUsers={setSelectedUsers}
              onSetGroupName={setGroupName}
              onSetConvMenu={setConvMenu}
              onStartDirectChat={handleStartDirectChat}
              onCreateGroupChat={handleCreateGroupChat}
              onArchiveConversation={handleArchiveConversation}
              onUnarchiveConversation={handleUnarchiveConversation}
              onDeleteConversation={handleDeleteConversation}
              onForward={handleForward}
              onSetForwardMsg={setForwardMsg}
              onSetShowGroupSettings={setShowGroupSettings}
              onAddGroupMember={handleAddGroupMember}
              onRemoveGroupMember={handleRemoveGroupMember}
              onRenameGroup={handleRenameGroup}
            />
          ) : (showNewChat || forwardMsg || showGroupSettings) ? (
            <ConversationList
              userId={userId}
              conversations={conversations}
              allUsers={allUsers}
              profilesMap={profilesMap}
              totalUnread={totalUnread}
              loading={loading}
              listTab={listTab}
              searchConv={searchConv}
              searchContacts={searchContacts}
              searchUsers={searchUsers}
              showNewChat={showNewChat}
              showArchived={showArchived}
              selectedUsers={selectedUsers}
              groupName={groupName}
              convMenu={convMenu}
              forwardMsg={forwardMsg}
              showGroupSettings={showGroupSettings}
              activeConv={activeConv}
              onClose={() => setOpen(false)}
              onSetListTab={setListTab}
              onSetSearchConv={setSearchConv}
              onSetSearchContacts={setSearchContacts}
              onSetSearchUsers={setSearchUsers}
              onSelectConversation={id => { setActiveConvId(id); setConvMenu(null); }}
              onShowNewChat={setShowNewChat}
              onSetShowArchived={setShowArchived}
              onSetSelectedUsers={setSelectedUsers}
              onSetGroupName={setGroupName}
              onSetConvMenu={setConvMenu}
              onStartDirectChat={handleStartDirectChat}
              onCreateGroupChat={handleCreateGroupChat}
              onArchiveConversation={handleArchiveConversation}
              onUnarchiveConversation={handleUnarchiveConversation}
              onDeleteConversation={handleDeleteConversation}
              onForward={handleForward}
              onSetForwardMsg={setForwardMsg}
              onSetShowGroupSettings={setShowGroupSettings}
              onAddGroupMember={handleAddGroupMember}
              onRemoveGroupMember={handleRemoveGroupMember}
              onRenameGroup={handleRenameGroup}
            />
          ) : view === 'chat' && activeConv ? (
            <MessageView
              userId={userId}
              profileFullName={profile?.full_name || ''}
              activeConv={activeConv}
              messages={messages}
              profilesMap={profilesMap}
              allUsers={allUsers}
              reactions={reactions}
              pinnedMsgIds={pinnedMsgIds}
              newMessage={newMessage}
              sending={sending}
              loadingMessages={loadingMessages}
              loadingMore={loadingMore}
              hasMore={hasMore}
              replyTo={replyTo}
              editingMsg={editingMsg}
              editText={editText}
              showEmojiFor={showEmojiFor}
              contextMenu={contextMenu}
              showSearchMessages={showSearchMessages}
              searchMessages={searchMessages}
              showPinnedMessages={showPinnedMessages}
              typingUsers={typingUsers}
              uploading={uploading}
              isRecording={isRecording}
              recordingTime={recordingTime}
              playingVoice={playingVoice}
              sendingLocation={sendingLocation}
              showMentions={showMentions}
              mentionQuery={mentionQuery}
              showCameraPreview={showCameraPreview}
              callState={callState}
              messagesEndRef={messagesEndRef}
              messagesContainerRef={messagesContainerRef}
              inputRef={inputRef}
              fileInputRef={fileInputRef}
              cameraInputRef={cameraInputRef}
              videoPreviewRef={videoPreviewRef}
              onClose={() => setOpen(false)}
              onBack={() => { setActiveConvId(null); setShowSearchMessages(false); setShowPinnedMessages(false); }}
              onSetNewMessage={setNewMessage}
              onSend={handleSend}
              onEditSave={handleEditSave}
              onSetReplyTo={setReplyTo}
              onSetEditingMsg={setEditingMsg}
              onSetEditText={setEditText}
              onSetShowEmojiFor={setShowEmojiFor}
              onSetContextMenu={setContextMenu}
              onDeleteMsg={handleDeleteMsg}
              onReaction={handleReaction}
              onTogglePin={handleTogglePin}
              onForwardMsg={msg => setForwardMsg(msg)}
              onSetShowSearchMessages={setShowSearchMessages}
              onSetSearchMessages={setSearchMessages}
              onSetShowPinnedMessages={setShowPinnedMessages}
              onSetShowGroupSettings={setShowGroupSettings}
              onHandleMessagesScroll={handleMessagesScroll}
              onHandleInputChange={handleInputChange}
              onHandleInputKeyDown={handleInputKeyDown}
              onInsertMention={insertMention}
              onFileUpload={handleFileUpload}
              onCameraClick={handleCameraClick}
              onSendLocation={sendLocation}
              onStartRecording={startRecording}
              onStopRecording={stopRecording}
              onCancelRecording={cancelRecording}
              onPlayVoice={playVoice}
              onStartCall={(type) => callManagerRef.current?.startCall(type)}
              onCloseCameraPreview={closeCameraPreview}
              onCapturePhoto={capturePhoto}
            />
          ) : null}
        </div>
      )}

      {/* Context Menu (global, fixed position) */}
      {contextMenu && (
        <div className="fixed bg-white shadow-xl rounded-xl border py-1 z-[70] min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2"><Reply size={12} /> Reply</button>
          <button onClick={() => { setForwardMsg(contextMenu.msg); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2"><Forward size={12} /> Forward</button>
          <button onClick={() => handleTogglePin(contextMenu.msg.id)} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2">{pinnedMsgIds.has(contextMenu.msg.id) ? <><PinOff size={12} /> Unpin</> : <><Pin size={12} /> Pin</>}</button>
          {contextMenu.msg.sender_id === userId && !contextMenu.msg.is_deleted && (
            <>
              <button onClick={() => { setEditingMsg(contextMenu.msg); setEditText(contextMenu.msg.content); setContextMenu(null); inputRef.current?.focus(); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2"><Edit3 size={12} /> Edit</button>
              <button onClick={() => handleDeleteMsg(contextMenu.msg.id)} className="w-full px-3 py-1.5 text-left text-xs hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 size={12} /> Delete</button>
            </>
          )}
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.msg.content); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2"><FileText size={12} /> Copy</button>
        </div>
      )}
    </>
  );
}
