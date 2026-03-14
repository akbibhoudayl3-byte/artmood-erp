'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import { useLocale } from '@/lib/hooks/useLocale';
import {
  MessageCircle, Send, Plus, Search, ArrowLeft, Users, User, Check, CheckCheck,
  X, Paperclip, Mic, MicOff, Image as ImageIcon, FileText, Smile, Reply,
  Edit3, Trash2, Pin, PinOff, Forward, MoreVertical, Volume2, VolumeX,
  UserPlus, UserMinus, Settings, ChevronDown, Play, Pause, Download
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Profile {
  id: string;
  full_name: string;
  role: string;
  avatar_url?: string;
  is_active: boolean;
  last_seen_at?: string;
}

interface Conversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  created_at: string;
  updated_at: string;
  participants: { user_id: string; last_read_at: string; role?: string }[];
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
  edited_at?: string;
  is_deleted?: boolean;
  reply_to_id?: string;
  file_url?: string;
  file_name?: string;
  file_type?: string;
  file_size?: number;
  is_voice?: boolean;
  voice_duration?: number;
  forwarded_from?: string;
  sender?: Profile;
  reactions?: Reaction[];
  reply_to?: Message;
  is_pinned?: boolean;
}

interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
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

function isOnline(lastSeen?: string): boolean {
  if (!lastSeen) return false;
  return Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000; // 5 min
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const ROLE_COLORS: Record<string, string> = {
  ceo: '#C9956B', commercial_manager: '#3B82F6', designer: '#8B5CF6',
  workshop_manager: '#F59E0B', workshop_worker: '#10B981', installer: '#EF4444',
  hr_manager: '#EC4899', community_manager: '#06B6D4', owner_admin: '#C9956B',
  operations_manager: '#6366F1', logistics: '#84CC16', worker: '#10B981',
};

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];

// ══════════════════════════════════════════════════════════════════════════════
// Main Chat Page
// ══════════════════════════════════════════════════════════════════════════════
export default function ChatPage() {
  const supabase = createClient();
  const { profile } = useAuth();
  const { t } = useLocale();

  // ── Core State ───────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [showMobileConv, setShowMobileConv] = useState(true);
  const [allUsers, setAllUsers] = useState<Profile[]>([]);
  const [searchConv, setSearchConv] = useState('');
  const [profilesMap, setProfilesMap] = useState<Record<string, Profile>>({});
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [pinnedMsgIds, setPinnedMsgIds] = useState<Set<string>>(new Set());

  // ── New Chat Modal ─────────────────────────────────────────────────────
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // ── Feature State ──────────────────────────────────────────────────────
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

  // ── Voice Message ────────────────────────────────────────────────────
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── File Upload ────────────────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const userId = profile?.id;
  const MSG_LIMIT = 50;

  // ── Heartbeat: update last_seen_at ───────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const update = () => supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
    update();
    const iv = setInterval(update, 60000);
    return () => clearInterval(iv);
  }, [userId, supabase]);

  // ── Load all profiles ─────────────────────────────────────────────────
  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, role, avatar_url, is_active, last_seen_at');
    if (data) {
      const map: Record<string, Profile> = {};
      data.forEach(p => { map[p.id] = p as Profile; });
      setProfilesMap(map);
      setAllUsers(data.filter(p => p.is_active) as Profile[]);
    }
  }, [supabase]);

  // ── Load conversations ────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const { data: myParts } = await supabase.from('chat_participants').select('conversation_id, last_read_at').eq('user_id', userId);
    if (!myParts?.length) { setConversations([]); setLoading(false); return; }

    const convIds = myParts.map(p => p.conversation_id);
    const { data: convs } = await supabase.from('chat_conversations').select('id, type, name, created_at, updated_at').in('id', convIds).order('updated_at', { ascending: false });
    if (!convs) { setLoading(false); return; }

    const { data: allParts } = await supabase.from('chat_participants').select('conversation_id, user_id, last_read_at, role').in('conversation_id', convIds);

    const convList: Conversation[] = [];
    for (const conv of convs) {
      const participants = (allParts || []).filter(p => p.conversation_id === conv.id);
      const myP = myParts.find(p => p.conversation_id === conv.id);

      const { data: lastMsgs } = await supabase.from('chat_messages').select('id, sender_id, content, created_at, is_deleted, file_name, is_voice').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1);

      const lastReadAt = myP?.last_read_at || conv.created_at;
      const { count: unread } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('conversation_id', conv.id).neq('sender_id', userId).gt('created_at', lastReadAt);

      let otherUser: Profile | undefined;
      if (conv.type === 'direct') {
        const otherId = participants.find(p => p.user_id !== userId)?.user_id;
        if (otherId) otherUser = profilesMap[otherId];
      }

      convList.push({ ...conv, participants, last_message: lastMsgs?.[0] as Message | undefined, unread_count: unread || 0, other_user: otherUser });
    }
    setConversations(convList);
    setLoading(false);
  }, [userId, supabase, profilesMap]);

  // ── Load messages ───────────────────────────────────────────────────────
  const loadMessages = useCallback(async (append = false) => {
    if (!activeConvId) return;
    if (!append) { setLoadingMessages(true); setMsgPage(0); }

    const offset = append ? (msgPage + 1) * MSG_LIMIT : 0;
    const { data } = await supabase.from('chat_messages')
      .select('id, conversation_id, sender_id, content, created_at, edited_at, is_deleted, reply_to_id, file_url, file_name, file_type, file_size, is_voice, voice_duration, forwarded_from')
      .eq('conversation_id', activeConvId)
      .order('created_at', { ascending: false })
      .range(offset, offset + MSG_LIMIT - 1);

    const msgs = ((data as Message[]) || []).reverse();

    if (append) {
      setMessages(prev => [...msgs, ...prev]);
      setMsgPage(p => p + 1);
    } else {
      setMessages(msgs);
    }
    setHasMore(msgs.length === MSG_LIMIT);
    setLoadingMessages(false);
    setLoadingMore(false);

    // Load reactions
    if (msgs.length) {
      const msgIds = msgs.map(m => m.id);
      const { data: reacts } = await supabase.from('chat_reactions').select('id, message_id, user_id, emoji').in('message_id', msgIds);
      if (reacts) {
        const rMap: Record<string, Reaction[]> = append ? { ...reactions } : {};
        reacts.forEach(r => { if (!rMap[r.message_id]) rMap[r.message_id] = []; rMap[r.message_id].push(r as Reaction); });
        setReactions(rMap);
      }
    }

    // Load pinned messages
    const { data: pinned } = await supabase.from('chat_pinned_messages').select('message_id').eq('conversation_id', activeConvId);
    if (pinned) setPinnedMsgIds(new Set(pinned.map(p => p.message_id)));

    // Mark as read
    if (userId && !append) {
      await supabase.from('chat_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', activeConvId).eq('user_id', userId);
    }

    if (!append) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeConvId, userId, supabase, msgPage, reactions]);

  // ── Infinite scroll ──────────────────────────────────────────────────
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 60) {
      setLoadingMore(true);
      loadMessages(true);
    }
  }, [loadingMore, hasMore, loadMessages]);

  // ── Send message ────────────────────────────────────────────────────────
  async function handleSend() {
    if (!newMessage.trim() || !activeConvId || !userId || sending) return;
    setSending(true);

    const payload: Record<string, unknown> = {
      conversation_id: activeConvId,
      sender_id: userId,
      content: newMessage.trim(),
    };
    if (replyTo) payload.reply_to_id = replyTo.id;

    const { error } = await supabase.from('chat_messages').insert(payload);
    if (!error) {
      await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
      setNewMessage('');
      setReplyTo(null);
      inputRef.current?.focus();
    }
    setSending(false);
  }

  // ── Edit message ────────────────────────────────────────────────────────
  async function handleEditSave() {
    if (!editingMsg || !editText.trim()) return;
    await supabase.from('chat_messages').update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq('id', editingMsg.id);
    setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } : m));
    setEditingMsg(null);
    setEditText('');
  }

  // ── Delete message ──────────────────────────────────────────────────────
  async function handleDeleteMsg(msgId: string) {
    await supabase.from('chat_messages').update({ is_deleted: true, content: '' }).eq('id', msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: '' } : m));
    setContextMenu(null);
  }

  // ── React to message ───────────────────────────────────────────────────
  async function handleReaction(msgId: string, emoji: string) {
    if (!userId) return;
    const existing = reactions[msgId]?.find(r => r.user_id === userId && r.emoji === emoji);
    if (existing) {
      await supabase.from('chat_reactions').delete().eq('id', existing.id);
      setReactions(prev => ({ ...prev, [msgId]: (prev[msgId] || []).filter(r => r.id !== existing.id) }));
    } else {
      const { data } = await supabase.from('chat_reactions').insert({ message_id: msgId, user_id: userId, emoji }).select().single();
      if (data) setReactions(prev => ({ ...prev, [msgId]: [...(prev[msgId] || []), data as Reaction] }));
    }
    setShowEmojiFor(null);
  }

  // ── Pin / Unpin ─────────────────────────────────────────────────────────
  async function togglePin(msgId: string) {
    if (!activeConvId || !userId) return;
    if (pinnedMsgIds.has(msgId)) {
      await supabase.from('chat_pinned_messages').delete().eq('message_id', msgId).eq('conversation_id', activeConvId);
      setPinnedMsgIds(prev => { const s = new Set(prev); s.delete(msgId); return s; });
    } else {
      await supabase.from('chat_pinned_messages').insert({ conversation_id: activeConvId, message_id: msgId, pinned_by: userId });
      setPinnedMsgIds(prev => new Set(prev).add(msgId));
    }
    setContextMenu(null);
  }

  // ── Forward message ─────────────────────────────────────────────────────
  async function handleForward(targetConvId: string) {
    if (!forwardMsg || !userId) return;
    await supabase.from('chat_messages').insert({
      conversation_id: targetConvId,
      sender_id: userId,
      content: forwardMsg.content,
      forwarded_from: forwardMsg.id,
      file_url: forwardMsg.file_url,
      file_name: forwardMsg.file_name,
      file_type: forwardMsg.file_type,
      file_size: forwardMsg.file_size,
    });
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', targetConvId);
    setForwardMsg(null);
  }

  // ── File upload ─────────────────────────────────────────────────────────
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConvId || !userId) return;
    setUploading(true);

    const path = `${userId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('chat-files').upload(path, file);
    if (upErr) { console.error('Upload error:', upErr); setUploading(false); return; }

    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);

    await supabase.from('chat_messages').insert({
      conversation_id: activeConvId,
      sender_id: userId,
      content: file.name,
      file_url: publicUrl,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      reply_to_id: replyTo?.id || null,
    });
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
    setReplyTo(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  // ── Voice recording ─────────────────────────────────────────────────────
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

        const path = `${userId}/${Date.now()}_voice.webm`;
        const { error: upErr } = await supabase.storage.from('chat-files').upload(path, blob);
        if (upErr) { console.error('Voice upload error:', upErr); return; }

        const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);
        await supabase.from('chat_messages').insert({
          conversation_id: activeConvId, sender_id: userId, content: 'Voice message',
          file_url: publicUrl, file_name: 'voice.webm', file_type: 'audio/webm',
          file_size: blob.size, is_voice: true, voice_duration: recordingTime,
        });
        await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
        setRecordingTime(0);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { console.error('Mic access denied'); }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.ondataavailable = null;
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }

  // ── Play voice ──────────────────────────────────────────────────────────
  function playVoice(url: string, msgId: string) {
    if (audioRef.current) { audioRef.current.pause(); }
    if (playingVoice === msgId) { setPlayingVoice(null); return; }
    const audio = new Audio(url);
    audio.onended = () => setPlayingVoice(null);
    audio.play();
    audioRef.current = audio;
    setPlayingVoice(msgId);
  }

  // ── Typing indicator (Supabase Presence) ─────────────────────────────
  const broadcastTyping = useCallback(() => {
    if (!activeConvId || !userId) return;
    const ch = supabase.channel(`typing:${activeConvId}`);
    ch.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId } });
  }, [activeConvId, userId, supabase]);

  function handleInputChange(val: string) {
    setNewMessage(val);
    broadcastTyping();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {}, 3000);
  }

  // ── Mention detection ──────────────────────────────────────────────────
  const [mentionQuery, setMentionQuery] = useState('');
  const [showMentions, setShowMentions] = useState(false);

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === '@') {
      setShowMentions(true);
      setMentionQuery('');
    } else if (showMentions) {
      if (e.key === ' ' || e.key === 'Escape') { setShowMentions(false); }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMsg) handleEditSave();
      else handleSend();
    }
    if (e.key === 'Escape') {
      setReplyTo(null);
      setEditingMsg(null);
    }
  }

  function insertMention(user: Profile) {
    setNewMessage(prev => {
      const atIdx = prev.lastIndexOf('@');
      return prev.slice(0, atIdx) + `@${user.full_name} `;
    });
    setShowMentions(false);
    inputRef.current?.focus();
  }

  // ── Start direct chat ─────────────────────────────────────────────────
  async function startDirectChat(otherUserId: string) {
    if (!userId) return;

    const { data: myConvs } = await supabase.from('chat_participants').select('conversation_id').eq('user_id', userId);
    if (myConvs) {
      for (const mc of myConvs) {
        const { data: otherP } = await supabase.from('chat_participants').select('user_id').eq('conversation_id', mc.conversation_id).eq('user_id', otherUserId);
        if (otherP?.length) {
          const { data: conv } = await supabase.from('chat_conversations').select('id, type').eq('id', mc.conversation_id).eq('type', 'direct').single();
          if (conv) { setActiveConvId(conv.id); setShowNewChat(false); setShowMobileConv(false); return; }
        }
      }
    }

    const convId = crypto.randomUUID();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const proxyBase = '/supabase-proxy';

    const r1 = await fetch(`${proxyBase}/rest/v1/chat_conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ id: convId, type: 'direct' }),
    });
    if (!r1.ok) { console.error('Create conv error:', r1.status, await r1.text()); return; }

    const r2 = await fetch(`${proxyBase}/rest/v1/chat_participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify([
        { conversation_id: convId, user_id: userId, role: 'admin' },
        { conversation_id: convId, user_id: otherUserId, role: 'member' },
      ]),
    });
    if (!r2.ok) { console.error('Add participants error:', r2.status, await r2.text()); return; }

    setActiveConvId(convId);
    setShowNewChat(false);
    setShowMobileConv(false);
    await loadConversations();
  }

  // ── Create group chat ─────────────────────────────────────────────────
  async function createGroupChat() {
    if (!userId || !groupName.trim() || selectedUsers.length < 1) return;
    const groupConvId = crypto.randomUUID();
    const { data: { session: gSession } } = await supabase.auth.getSession();
    const gToken = gSession?.access_token;
    const gAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const gProxyBase = '/supabase-proxy';

    const gr1 = await fetch(`${gProxyBase}/rest/v1/chat_conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': gAnonKey, 'Authorization': `Bearer ${gToken}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ id: groupConvId, type: 'group', name: groupName.trim() }),
    });
    if (!gr1.ok) { console.error('Create group error:', await gr1.text()); return; }

    const participants = [userId, ...selectedUsers].map((uid, i) => ({
      conversation_id: groupConvId, user_id: uid, role: i === 0 ? 'admin' : 'member',
    }));

    const gr2 = await fetch(`${gProxyBase}/rest/v1/chat_participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': gAnonKey, 'Authorization': `Bearer ${gToken}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify(participants),
    });
    if (!gr2.ok) { console.error('Add group participants error:', await gr2.text()); return; }

    setActiveConvId(groupConvId);
    setShowNewChat(false);
    setShowMobileConv(false);
    setGroupName('');
    setSelectedUsers([]);
    await loadConversations();
  }

  // ── Group admin: add/remove member ──────────────────────────────────
  async function addGroupMember(convId: string, memberId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    await fetch(`/supabase-proxy/rest/v1/chat_participants`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': anonKey, 'Authorization': `Bearer ${token}`, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ conversation_id: convId, user_id: memberId, role: 'member' }),
    });
    await loadConversations();
  }

  async function removeGroupMember(convId: string, memberId: string) {
    await supabase.from('chat_participants').delete().eq('conversation_id', convId).eq('user_id', memberId);
    await loadConversations();
  }

  async function renameGroup(convId: string, name: string) {
    await supabase.from('chat_conversations').update({ name }).eq('id', convId);
    await loadConversations();
  }

  // ── Realtime ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel('chat-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === activeConvId) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          if (msg.sender_id !== userId) {
            supabase.from('chat_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', activeConvId).eq('user_id', userId);
            // Play notification sound
            try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
          }
        } else if (msg.sender_id !== userId) {
          // Notification for messages in other conversations
          try { new Audio('/notification.mp3').play().catch(() => {}); } catch {}
        }
        loadConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === activeConvId) {
          setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, activeConvId, supabase, loadConversations]);

  // ── Typing presence channel ──────────────────────────────────────────
  useEffect(() => {
    if (!activeConvId || !userId) return;
    const ch = supabase.channel(`typing:${activeConvId}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.user_id === userId) return;
        setTypingUsers(prev => {
          if (prev.includes(payload.user_id)) return prev;
          return [...prev, payload.user_id];
        });
        setTimeout(() => {
          setTypingUsers(prev => prev.filter(id => id !== payload.user_id));
        }, 3000);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeConvId, userId, supabase]);

  // ── Initial load ────────────────────────────────────────────────────────
  useEffect(() => { loadProfiles(); }, [loadProfiles]);
  useEffect(() => { if (Object.keys(profilesMap).length > 0) loadConversations(); }, [profilesMap, loadConversations]);
  useEffect(() => { if (activeConvId) loadMessages(); }, [activeConvId]);

  // ── Filtered data ───────────────────────────────────────────────────────
  const filteredConvs = conversations.filter(c => {
    if (!searchConv) return true;
    const q = searchConv.toLowerCase();
    const name = c.type === 'direct' ? c.other_user?.full_name || '' : c.name || '';
    return name.toLowerCase().includes(q);
  });

  const filteredUsers = allUsers.filter(u =>
    u.id !== userId && u.is_active &&
    (searchUsers ? u.full_name.toLowerCase().includes(searchUsers.toLowerCase()) : true)
  );

  const activeConv = conversations.find(c => c.id === activeConvId);
  const myRole = activeConv?.participants.find(p => p.user_id === userId)?.role;

  const filteredMessages = showSearchMessages && searchMessages
    ? messages.filter(m => m.content.toLowerCase().includes(searchMessages.toLowerCase()))
    : messages;

  const pinnedMessages = messages.filter(m => pinnedMsgIds.has(m.id));

  // Close context menu on click outside
  useEffect(() => {
    const h = () => { setContextMenu(null); setShowEmojiFor(null); };
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, []);

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-[calc(100vh-68px)] flex bg-[#F8F9FC]">
      {/* ── Left Panel: Conversations ──────────────────────────────────── */}
      <div className={`w-full lg:w-[360px] lg:min-w-[360px] border-r border-gray-200 bg-white flex flex-col ${!showMobileConv ? 'hidden lg:flex' : 'flex'}`}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold text-[#1a1a2e]">
              <MessageCircle className="inline mr-2 text-[#C9956B]" size={22} />Chat
            </h1>
            <button onClick={() => setShowNewChat(true)} className="w-9 h-9 bg-[#C9956B] text-white rounded-xl flex items-center justify-center hover:bg-[#B8845A] transition-colors">
              <Plus size={18} />
            </button>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search conversations..." value={searchConv} onChange={e => setSearchConv(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-400 text-sm">Loading...</div>
          ) : filteredConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <MessageCircle size={40} className="mb-2 opacity-30" />
              <p className="text-sm">No conversations yet</p>
              <button onClick={() => setShowNewChat(true)} className="mt-2 text-[#C9956B] text-sm font-medium hover:underline">Start a new chat</button>
            </div>
          ) : (
            filteredConvs.map(conv => {
              const isActive = conv.id === activeConvId;
              const displayName = conv.type === 'direct' ? conv.other_user?.full_name || 'Unknown' : conv.name || 'Group';
              const lastMsg = conv.last_message;
              const senderName = lastMsg?.sender_id === userId ? 'You' : profilesMap[lastMsg?.sender_id || '']?.full_name?.split(' ')[0] || '';
              const online = conv.type === 'direct' && isOnline(conv.other_user?.last_seen_at);

              let preview = 'No messages yet';
              if (lastMsg) {
                if (lastMsg.is_deleted) preview = 'Message deleted';
                else if (lastMsg.is_voice) preview = 'Voice message';
                else if (lastMsg.file_name) preview = lastMsg.file_name;
                else preview = lastMsg.content;
                if (senderName) preview = `${senderName}: ${preview}`;
              }

              return (
                <button key={conv.id} onClick={() => { setActiveConvId(conv.id); setShowMobileConv(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-gray-50
                    ${isActive ? 'bg-[#C9956B]/5 border-l-2 border-l-[#C9956B]' : 'hover:bg-gray-50'}`}>
                  <div className="relative">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 text-white font-semibold text-sm
                      ${conv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`}
                      style={conv.type === 'direct' ? { backgroundColor: ROLE_COLORS[conv.other_user?.role || ''] || '#94A3B8' } : {}}>
                      {conv.type === 'group' ? <Users size={18} /> : getInitials(conv.other_user?.full_name || '?')}
                    </div>
                    {online && <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-[#1a1a2e] truncate">{displayName}</span>
                      {lastMsg && <span className="text-[11px] text-gray-400 shrink-0 ml-2">{timeAgo(lastMsg.created_at)}</span>}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <p className="text-xs text-gray-500 truncate">{preview}</p>
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

      {/* ── Right Panel: Messages ──────────────────────────────────────── */}
      <div className={`flex-1 flex flex-col bg-[#F8F9FC] ${showMobileConv ? 'hidden lg:flex' : 'flex'}`}>
        {!activeConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <MessageCircle size={36} className="text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-500">Select a conversation</p>
            <p className="text-sm mt-1">or start a new one</p>
          </div>
        ) : (
          <>
            {/* ── Chat Header ──────────────────────────────────────── */}
            <div className="h-16 px-4 flex items-center gap-3 bg-white border-b border-gray-200 shrink-0">
              <button onClick={() => { setShowMobileConv(true); setActiveConvId(null); }} className="lg:hidden p-2 hover:bg-gray-100 rounded-lg">
                <ArrowLeft size={20} />
              </button>
              {activeConv && (
                <>
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm
                      ${activeConv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`}
                      style={activeConv.type === 'direct' ? { backgroundColor: ROLE_COLORS[activeConv.other_user?.role || ''] || '#94A3B8' } : {}}>
                      {activeConv.type === 'group' ? <Users size={16} /> : getInitials(activeConv.other_user?.full_name || '?')}
                    </div>
                    {activeConv.type === 'direct' && isOnline(activeConv.other_user?.last_seen_at) && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#1a1a2e] text-sm truncate">
                      {activeConv.type === 'direct' ? activeConv.other_user?.full_name || 'Unknown' : activeConv.name || 'Group'}
                    </p>
                    <p className="text-xs text-gray-400">
                      {activeConv.type === 'direct'
                        ? (isOnline(activeConv.other_user?.last_seen_at) ? 'Online' : activeConv.other_user?.last_seen_at ? `Last seen ${timeAgo(activeConv.other_user.last_seen_at)}` : activeConv.other_user?.role?.replace('_', ' '))
                        : `${activeConv.participants.length} members`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowSearchMessages(!showSearchMessages)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                      <Search size={18} />
                    </button>
                    {pinnedMessages.length > 0 && (
                      <button onClick={() => setShowPinnedMessages(!showPinnedMessages)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 relative">
                        <Pin size={18} />
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-[#C9956B] text-white text-[9px] font-bold rounded-full flex items-center justify-center">{pinnedMessages.length}</span>
                      </button>
                    )}
                    {activeConv.type === 'group' && (
                      <button onClick={() => setShowGroupSettings(true)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
                        <Settings size={18} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* ── Search Messages Bar ────────────────────────────── */}
            {showSearchMessages && (
              <div className="px-4 py-2 bg-white border-b border-gray-200 flex items-center gap-2">
                <Search size={16} className="text-gray-400" />
                <input type="text" placeholder="Search in conversation..." value={searchMessages} onChange={e => setSearchMessages(e.target.value)} autoFocus
                  className="flex-1 text-sm bg-transparent focus:outline-none" />
                <button onClick={() => { setShowSearchMessages(false); setSearchMessages(''); }} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X size={16} /></button>
              </div>
            )}

            {/* ── Pinned Messages Bar ────────────────────────────── */}
            {showPinnedMessages && pinnedMessages.length > 0 && (
              <div className="px-4 py-2 bg-amber-50 border-b border-amber-200 max-h-32 overflow-y-auto">
                <div className="flex items-center gap-2 mb-1">
                  <Pin size={14} className="text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700">Pinned Messages</span>
                  <button onClick={() => setShowPinnedMessages(false)} className="ml-auto"><X size={14} className="text-amber-600" /></button>
                </div>
                {pinnedMessages.map(pm => (
                  <div key={pm.id} className="text-xs text-amber-800 truncate py-0.5">
                    <span className="font-medium">{profilesMap[pm.sender_id]?.full_name?.split(' ')[0]}:</span> {pm.content}
                  </div>
                ))}
              </div>
            )}

            {/* ── Typing Indicator ───────────────────────────────── */}
            {typingUsers.length > 0 && (
              <div className="px-4 py-1 bg-white border-b border-gray-100">
                <p className="text-xs text-gray-400 italic">
                  {typingUsers.map(id => profilesMap[id]?.full_name?.split(' ')[0]).filter(Boolean).join(', ')} is typing...
                </p>
              </div>
            )}

            {/* ── Messages ─────────────────────────────────────────── */}
            <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {loadingMessages ? (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">Loading messages...</div>
              ) : (
                <>
                  {loadingMore && <div className="text-center text-xs text-gray-400 py-2">Loading older messages...</div>}
                  {!hasMore && messages.length > MSG_LIMIT && <div className="text-center text-xs text-gray-400 py-2">Beginning of conversation</div>}

                  {filteredMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm">No messages yet. Say hello!</div>
                  ) : (
                    filteredMessages.map((msg, i) => {
                      const isMe = msg.sender_id === userId;
                      const sender = profilesMap[msg.sender_id];
                      const showAvatar = !isMe && (i === 0 || filteredMessages[i - 1]?.sender_id !== msg.sender_id);
                      const showName = !isMe && activeConv?.type === 'group' && showAvatar;
                      const msgReactions = reactions[msg.id] || [];
                      const isPinned = pinnedMsgIds.has(msg.id);
                      const replyMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
                      const isMentioned = msg.content.includes(`@${profile?.full_name}`);

                      // Read receipts
                      const readBy = activeConv?.participants.filter(p =>
                        p.user_id !== userId && p.last_read_at && new Date(p.last_read_at) >= new Date(msg.created_at)
                      ) || [];

                      return (
                        <div key={msg.id}
                          className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-3' : 'mt-0.5'} ${isMentioned ? 'bg-[#C9956B]/5 -mx-2 px-2 rounded-lg' : ''} group/msg relative`}
                          onContextMenu={e => { e.preventDefault(); setContextMenu({ msg, x: e.clientX, y: e.clientY }); }}>
                          {!isMe && (
                            <div className="w-8 mr-2 shrink-0">
                              {showAvatar && (
                                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                                  style={{ backgroundColor: ROLE_COLORS[sender?.role || ''] || '#94A3B8' }}>
                                  {getInitials(sender?.full_name || '?')}
                                </div>
                              )}
                            </div>
                          )}

                          <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'}`}>
                            {showName && <p className="text-[10px] font-medium text-gray-400 mb-0.5 ml-1">{sender?.full_name?.split(' ')[0]}</p>}

                            {/* Forwarded label */}
                            {msg.forwarded_from && (
                              <p className="text-[10px] text-gray-400 mb-0.5 ml-1 flex items-center gap-1"><Forward size={10} /> Forwarded</p>
                            )}

                            {/* Reply preview */}
                            {replyMsg && (
                              <div className={`text-[11px] px-2.5 py-1.5 mb-0.5 rounded-t-lg border-l-2 border-[#C9956B] ${isMe ? 'bg-[#B8845A]/30 text-white/80' : 'bg-gray-100 text-gray-500'}`}>
                                <span className="font-medium">{profilesMap[replyMsg.sender_id]?.full_name?.split(' ')[0]}</span>
                                <p className="truncate">{replyMsg.is_deleted ? 'Deleted' : replyMsg.content}</p>
                              </div>
                            )}

                            {/* Message bubble */}
                            <div className={`relative px-3.5 py-2 rounded-2xl text-sm leading-relaxed break-words
                              ${isMe ? 'bg-[#C9956B] text-white rounded-br-md' : 'bg-white text-[#1a1a2e] rounded-bl-md shadow-sm border border-gray-100'}
                              ${isPinned ? 'ring-1 ring-amber-400' : ''}`}>

                              {isPinned && <Pin size={10} className={`absolute top-1 right-1 ${isMe ? 'text-white/50' : 'text-amber-500'}`} />}

                              {msg.is_deleted ? (
                                <span className="italic opacity-60">Message deleted</span>
                              ) : msg.is_voice ? (
                                <div className="flex items-center gap-2 min-w-[160px]">
                                  <button onClick={() => playVoice(msg.file_url!, msg.id)} className={`w-8 h-8 rounded-full flex items-center justify-center ${isMe ? 'bg-white/20' : 'bg-gray-100'}`}>
                                    {playingVoice === msg.id ? <Pause size={14} /> : <Play size={14} />}
                                  </button>
                                  <div className="flex-1">
                                    <div className="h-1 bg-white/30 rounded-full"><div className="h-1 bg-white/70 rounded-full w-1/2" /></div>
                                    <p className="text-[10px] mt-0.5 opacity-70">{formatDuration(msg.voice_duration || 0)}</p>
                                  </div>
                                </div>
                              ) : msg.file_url ? (
                                <div>
                                  {msg.file_type?.startsWith('image/') ? (
                                    <div>
                                      <img src={msg.file_url} alt={msg.file_name} className="max-w-[240px] rounded-lg mb-1 cursor-pointer" onClick={() => window.open(msg.file_url, '_blank')} />
                                      {msg.content && msg.content !== msg.file_name && <p>{msg.content}</p>}
                                    </div>
                                  ) : (
                                    <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-2 ${isMe ? 'text-white' : 'text-[#1a1a2e]'}`}>
                                      <FileText size={20} className="shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{msg.file_name}</p>
                                        <p className="text-[10px] opacity-70">{formatFileSize(msg.file_size || 0)}</p>
                                      </div>
                                      <Download size={16} className="shrink-0 opacity-70" />
                                    </a>
                                  )}
                                </div>
                              ) : (
                                <span dangerouslySetInnerHTML={{
                                  __html: msg.content.replace(/@(\S+\s?\S*)/g, '<span class="font-bold text-amber-300">@$1</span>')
                                }} />
                              )}

                              {msg.edited_at && !msg.is_deleted && <span className="text-[9px] opacity-50 ml-1">(edited)</span>}

                              {/* Action buttons on hover */}
                              <div className={`absolute ${isMe ? '-left-20' : '-right-20'} top-0 hidden group-hover/msg:flex items-center gap-0.5 bg-white shadow-md rounded-lg p-0.5 border border-gray-100 z-10`}>
                                <button onClick={(e) => { e.stopPropagation(); setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><Smile size={14} /></button>
                                <button onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><Reply size={14} /></button>
                                <button onClick={(e) => { e.stopPropagation(); setContextMenu({ msg, x: e.clientX, y: e.clientY }); }} className="p-1.5 hover:bg-gray-100 rounded text-gray-500"><MoreVertical size={14} /></button>
                              </div>
                            </div>

                            {/* Emoji picker */}
                            {showEmojiFor === msg.id && (
                              <div className={`flex gap-1 mt-1 p-1.5 bg-white shadow-lg rounded-xl border border-gray-100 z-20 ${isMe ? 'justify-end' : ''}`} onClick={e => e.stopPropagation()}>
                                {EMOJI_LIST.map(em => (
                                  <button key={em} onClick={() => handleReaction(msg.id, em)} className="w-7 h-7 hover:bg-gray-100 rounded-lg flex items-center justify-center text-sm hover:scale-125 transition-transform">{em}</button>
                                ))}
                              </div>
                            )}

                            {/* Reactions display */}
                            {msgReactions.length > 0 && (
                              <div className={`flex flex-wrap gap-1 mt-0.5 ${isMe ? 'justify-end' : ''}`}>
                                {Object.entries(msgReactions.reduce<Record<string, string[]>>((acc, r) => {
                                  if (!acc[r.emoji]) acc[r.emoji] = [];
                                  acc[r.emoji].push(r.user_id);
                                  return acc;
                                }, {})).map(([emoji, users]) => (
                                  <button key={emoji} onClick={() => handleReaction(msg.id, emoji)}
                                    className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] border transition-colors
                                      ${users.includes(userId || '') ? 'bg-[#C9956B]/10 border-[#C9956B]/30' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}>
                                    <span>{emoji}</span><span className="text-gray-500">{users.length}</span>
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* Timestamp + read receipts */}
                            <div className={`flex items-center gap-1 mt-0.5 mx-1 ${isMe ? 'justify-end' : ''}`}>
                              <p className="text-[10px] text-gray-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              {isMe && (
                                readBy.length > 0
                                  ? <CheckCheck size={12} className="text-blue-500" />
                                  : <Check size={12} className="text-gray-400" />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* ── Reply / Edit Bar ──────────────────────────────────── */}
            {(replyTo || editingMsg) && (
              <div className="px-4 py-2 bg-white border-t border-gray-200 flex items-center gap-2">
                <div className="flex-1 border-l-2 border-[#C9956B] pl-2">
                  <p className="text-[10px] font-semibold text-[#C9956B]">{editingMsg ? 'Editing message' : `Replying to ${profilesMap[replyTo!.sender_id]?.full_name?.split(' ')[0]}`}</p>
                  <p className="text-xs text-gray-500 truncate">{editingMsg ? editingMsg.content : replyTo!.content}</p>
                </div>
                <button onClick={() => { setReplyTo(null); setEditingMsg(null); setEditText(''); }} className="p-1 hover:bg-gray-100 rounded"><X size={16} className="text-gray-400" /></button>
              </div>
            )}

            {/* ── Input Area ──────────────────────────────────────── */}
            <div className="px-4 py-3 bg-white border-t border-gray-200 shrink-0">
              {/* Mention suggestions */}
              {showMentions && activeConv?.type === 'group' && (
                <div className="mb-2 bg-white shadow-lg rounded-xl border border-gray-200 max-h-40 overflow-y-auto">
                  {allUsers.filter(u => u.id !== userId && u.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 5).map(u => (
                    <button key={u.id} onClick={() => insertMention(u)} className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center gap-2 text-sm">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ backgroundColor: ROLE_COLORS[u.role] || '#94A3B8' }}>{getInitials(u.full_name)}</div>
                      {u.full_name}
                    </button>
                  ))}
                </div>
              )}

              {isRecording ? (
                <div className="flex items-center gap-3">
                  <button onClick={cancelRecording} className="p-2 hover:bg-red-50 rounded-xl text-red-500"><X size={20} /></button>
                  <div className="flex-1 flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-sm font-medium text-red-600">{formatDuration(recordingTime)}</span>
                    <div className="flex-1 h-1 bg-red-100 rounded-full"><div className="h-1 bg-red-400 rounded-full animate-pulse" style={{ width: '60%' }} /></div>
                  </div>
                  <button onClick={stopRecording} className="w-10 h-10 bg-[#C9956B] text-white rounded-xl flex items-center justify-center hover:bg-[#B8845A]">
                    <Send size={18} />
                  </button>
                </div>
              ) : (
                <form onSubmit={e => { e.preventDefault(); if (editingMsg) handleEditSave(); else handleSend(); }} className="flex items-center gap-2">
                  <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
                  <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 disabled:opacity-40">
                    {uploading ? <div className="w-5 h-5 border-2 border-gray-300 border-t-[#C9956B] rounded-full animate-spin" /> : <Paperclip size={20} />}
                  </button>
                  <input ref={inputRef} type="text" placeholder={editingMsg ? 'Edit message...' : 'Type a message...'}
                    value={editingMsg ? editText : newMessage}
                    onChange={e => editingMsg ? setEditText(e.target.value) : handleInputChange(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30 focus:border-[#C9956B]" autoFocus />
                  {(editingMsg ? editText.trim() : newMessage.trim()) ? (
                    <button type="submit" disabled={sending} className="w-10 h-10 bg-[#C9956B] text-white rounded-xl flex items-center justify-center hover:bg-[#B8845A] transition-colors disabled:opacity-40">
                      <Send size={18} />
                    </button>
                  ) : (
                    <button type="button" onClick={startRecording} className="w-10 h-10 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200 transition-colors">
                      <Mic size={18} />
                    </button>
                  )}
                </form>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Context Menu ─────────────────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed bg-white shadow-xl rounded-xl border border-gray-200 py-1 z-50 min-w-[180px]"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 300), left: Math.min(contextMenu.x, window.innerWidth - 200) }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"><Reply size={14} /> Reply</button>
          <button onClick={() => { setForwardMsg(contextMenu.msg); setContextMenu(null); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"><Forward size={14} /> Forward</button>
          <button onClick={() => togglePin(contextMenu.msg.id)}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2">
            {pinnedMsgIds.has(contextMenu.msg.id) ? <><PinOff size={14} /> Unpin</> : <><Pin size={14} /> Pin</>}
          </button>
          {contextMenu.msg.sender_id === userId && !contextMenu.msg.is_deleted && (
            <>
              <button onClick={() => { setEditingMsg(contextMenu.msg); setEditText(contextMenu.msg.content); setContextMenu(null); inputRef.current?.focus(); }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"><Edit3 size={14} /> Edit</button>
              <button onClick={() => handleDeleteMsg(contextMenu.msg.id)}
                className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"><Trash2 size={14} /> Delete</button>
            </>
          )}
          <button onClick={() => { navigator.clipboard.writeText(contextMenu.msg.content); setContextMenu(null); }}
            className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2"><FileText size={14} /> Copy</button>
        </div>
      )}

      {/* ── Forward Modal ─────────────────────────────────────────────── */}
      {forwardMsg && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setForwardMsg(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[70vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1a1a2e]">Forward Message</h2>
              <button onClick={() => setForwardMsg(null)}><X size={20} className="text-gray-400" /></button>
            </div>
            <div className="p-2 border-b border-gray-100 mx-2">
              <div className="bg-gray-50 rounded-lg p-2 text-xs text-gray-600 truncate">{forwardMsg.content}</div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.filter(c => c.id !== activeConvId).map(conv => (
                <button key={conv.id} onClick={() => handleForward(conv.id)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-gray-50">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${conv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`}
                    style={conv.type === 'direct' ? { backgroundColor: ROLE_COLORS[conv.other_user?.role || ''] || '#94A3B8' } : {}}>
                    {conv.type === 'group' ? <Users size={14} /> : getInitials(conv.other_user?.full_name || '?')}
                  </div>
                  <span className="text-sm font-medium">{conv.type === 'direct' ? conv.other_user?.full_name : conv.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── New Chat Modal ─────────────────────────────────────────────── */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewChat(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <h2 className="text-lg font-bold text-[#1a1a2e]">New Conversation</h2>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setSelectedUsers([])}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedUsers.length === 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <User size={14} className="inline mr-1" /> Direct
                </button>
                <button onClick={() => setSelectedUsers(selectedUsers.length ? selectedUsers : ['__group__'])}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${selectedUsers.length > 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}>
                  <Users size={14} className="inline mr-1" /> Group
                </button>
              </div>
              {selectedUsers.length > 0 && (
                <input type="text" placeholder="Group name..." value={groupName} onChange={e => setGroupName(e.target.value)}
                  className="w-full mt-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" />
              )}
              <div className="relative mt-3">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input type="text" placeholder="Search users..." value={searchUsers} onChange={e => setSearchUsers(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredUsers.map(user => {
                const isSelected = selectedUsers.includes(user.id);
                const online = isOnline(user.last_seen_at);
                return (
                  <button key={user.id} onClick={() => {
                    if (selectedUsers.length === 0) { startDirectChat(user.id); return; }
                    setSelectedUsers(prev => {
                      const filtered = prev.filter(id => id !== '__group__');
                      return isSelected ? filtered.filter(id => id !== user.id) : [...filtered, user.id];
                    });
                  }} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${isSelected ? 'bg-[#C9956B]/10' : 'hover:bg-gray-50'}`}>
                    <div className="relative">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-sm shrink-0"
                        style={{ backgroundColor: ROLE_COLORS[user.role] || '#94A3B8' }}>{getInitials(user.full_name)}</div>
                      {online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-[#1a1a2e] truncate">{user.full_name}</p>
                      <p className="text-xs text-gray-400 capitalize">{user.role.replace('_', ' ')} {online ? '- Online' : ''}</p>
                    </div>
                    {isSelected && <Check size={18} className="text-[#C9956B] shrink-0" />}
                  </button>
                );
              })}
            </div>
            {selectedUsers.length > 0 && selectedUsers[0] !== '__group__' && (
              <div className="p-4 border-t border-gray-100">
                <button onClick={createGroupChat} disabled={!groupName.trim() || selectedUsers.length < 1}
                  className="w-full py-2.5 bg-[#C9956B] text-white rounded-xl font-medium text-sm hover:bg-[#B8845A] transition-colors disabled:opacity-40">
                  Create Group ({selectedUsers.length} members)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Group Settings Modal ───────────────────────────────────────── */}
      {showGroupSettings && activeConv?.type === 'group' && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowGroupSettings(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-[#1a1a2e]">Group Settings</h2>
                <button onClick={() => setShowGroupSettings(false)}><X size={20} className="text-gray-400" /></button>
              </div>
              {myRole === 'admin' && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-gray-500">Group Name</label>
                  <div className="flex gap-2 mt-1">
                    <input type="text" defaultValue={activeConv.name || ''} id="groupNameInput"
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" />
                    <button onClick={() => {
                      const inp = document.getElementById('groupNameInput') as HTMLInputElement;
                      if (inp?.value.trim()) renameGroup(activeConv.id, inp.value.trim());
                    }} className="px-3 py-2 bg-[#C9956B] text-white rounded-xl text-sm font-medium">Save</button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Members ({activeConv.participants.length})</h3>
                {activeConv.participants.map(p => {
                  const member = profilesMap[p.user_id];
                  if (!member) return null;
                  const online = isOnline(member.last_seen_at);
                  return (
                    <div key={p.user_id} className="flex items-center gap-3 py-2">
                      <div className="relative">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: ROLE_COLORS[member.role] || '#94A3B8' }}>{getInitials(member.full_name)}</div>
                        {online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{member.full_name} {p.user_id === userId && <span className="text-xs text-gray-400">(you)</span>}</p>
                        <p className="text-xs text-gray-400 capitalize">{p.role === 'admin' ? 'Admin' : member.role.replace('_', ' ')}</p>
                      </div>
                      {myRole === 'admin' && p.user_id !== userId && (
                        <button onClick={() => removeGroupMember(activeConv.id, p.user_id)} className="p-1.5 hover:bg-red-50 rounded-lg text-red-400">
                          <UserMinus size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {myRole === 'admin' && (
                <div className="p-4 border-t border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">Add Members</h3>
                  {allUsers.filter(u => u.id !== userId && !activeConv.participants.some(p => p.user_id === u.id)).map(u => (
                    <button key={u.id} onClick={() => addGroupMember(activeConv.id, u.id)}
                      className="w-full flex items-center gap-3 py-2 hover:bg-gray-50 rounded-lg px-2">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ backgroundColor: ROLE_COLORS[u.role] || '#94A3B8' }}>{getInitials(u.full_name)}</div>
                      <span className="text-sm">{u.full_name}</span>
                      <UserPlus size={16} className="ml-auto text-[#C9956B]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
