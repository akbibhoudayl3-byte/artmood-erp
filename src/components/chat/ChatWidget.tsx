'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  MessageCircle, Send, Plus, Search, ArrowLeft, Users, User, Check, CheckCheck,
  X, Paperclip, Mic, Image as ImageIcon, FileText, Smile, Reply,
  Edit3, Trash2, Pin, PinOff, Forward, MoreVertical,
  UserPlus, UserMinus, Settings, Play, Pause, Download, Minimize2,
  Phone, Video, PhoneOff, MicOff, Camera, MapPin, PhoneIncoming,
  Volume2, VolumeX, VideoOff, Clock, Archive, LogOut, MoreHorizontal
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Profile { id: string; full_name: string; role: string; avatar_url?: string; is_active: boolean; last_seen_at?: string; }
interface Conversation { id: string; type: 'direct' | 'group'; name: string | null; created_at: string; updated_at: string; participants: { user_id: string; last_read_at: string; role?: string }[]; last_message?: Message; unread_count: number; other_user?: Profile; is_archived?: boolean; }
interface Message { id: string; conversation_id: string; sender_id: string; content: string; created_at: string; edited_at?: string; is_deleted?: boolean; reply_to_id?: string; file_url?: string; file_name?: string; file_type?: string; file_size?: number; is_voice?: boolean; voice_duration?: number; forwarded_from?: string; latitude?: number; longitude?: number; location_name?: string; }
interface Reaction { id: string; message_id: string; user_id: string; emoji: string; }

// ── Helpers ──────────────────────────────────────────────────────────────────
function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24); if (dd < 7) return `${dd}d`;
  return new Date(d).toLocaleDateString();
}
function getInitials(n: string) { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function isOnline(ls?: string) { return ls ? Date.now() - new Date(ls).getTime() < 300000 : false; }
function fmtSize(b: number) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
function fmtDur(s: number) { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
function lastSeenText(ls?: string) {
  if (!ls) return 'Offline';
  if (isOnline(ls)) return 'Online';
  const m = Math.floor((Date.now() - new Date(ls).getTime()) / 60000);
  if (m < 60) return `Last seen ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `Last seen ${h}h ago`;
  return `Last seen ${Math.floor(h / 24)}d ago`;
}

const RC: Record<string, string> = {
  ceo: '#C9956B', commercial_manager: '#3B82F6', designer: '#8B5CF6',
  workshop_manager: '#F59E0B', workshop_worker: '#10B981', installer: '#EF4444',
  hr_manager: '#EC4899', community_manager: '#06B6D4', owner_admin: '#C9956B',
  operations_manager: '#6366F1', logistics: '#84CC16', worker: '#10B981',
};
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];
const MSG_LIMIT = 50;
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];

// ══════════════════════════════════════════════════════════════════════════════
export default function ChatWidget() {
  const supabase = createClient();
  const { profile } = useAuth();
  const userId = profile?.id;

  // ── Widget state
  const [open, setOpen] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [listTab, setListTab] = useState<'chats' | 'contacts'>('chats');

  // ── Core state
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

  // ── New chat
  const [showNewChat, setShowNewChat] = useState(false);
  const [searchUsers, setSearchUsers] = useState('');
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);

  // ── Features
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

  // ── Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ── File / Camera
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [showCameraPreview, setShowCameraPreview] = useState(false);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);

  // ── Location
  const [sendingLocation, setSendingLocation] = useState(false);

  // ── Mention
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');

  // ── Calls (WebRTC)
  const [callState, setCallState] = useState<'idle' | 'calling' | 'ringing' | 'active'>('idle');
  const [callType, setCallType] = useState<'voice' | 'video'>('voice');
  const [callPeer, setCallPeer] = useState<Profile | null>(null);
  const [callConvId, setCallConvId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [incomingCall, setIncomingCall] = useState<{ from: string; type: 'voice' | 'video'; convId: string } | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // ── Contacts search
  const [searchContacts, setSearchContacts] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [convMenu, setConvMenu] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── View: 'list' or 'chat'
  const view = activeConvId ? 'chat' : 'list';

  // ══════════════════════════════════════════════════════════════════════════
  // HEARTBEAT
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!userId) return;
    const up = () => supabase.from('profiles').update({ last_seen_at: new Date().toISOString() }).eq('id', userId);
    up(); const iv = setInterval(up, 60000);
    return () => clearInterval(iv);
  }, [userId, supabase]);

  // ══════════════════════════════════════════════════════════════════════════
  // LOAD PROFILES
  // ══════════════════════════════════════════════════════════════════════════
  const loadProfiles = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('id, full_name, role, avatar_url, is_active, last_seen_at');
    if (data) {
      const map: Record<string, Profile> = {};
      data.forEach(p => { map[p.id] = p as Profile; });
      setProfilesMap(map);
      setAllUsers(data.filter(p => p.is_active) as Profile[]);
    }
  }, [supabase]);

  // Refresh profiles every 30s for online status
  useEffect(() => {
    loadProfiles();
    const iv = setInterval(loadProfiles, 30000);
    return () => clearInterval(iv);
  }, [loadProfiles]);

  // ══════════════════════════════════════════════════════════════════════════
  // LOAD CONVERSATIONS
  // ══════════════════════════════════════════════════════════════════════════
  const loadConversations = useCallback(async () => {
    if (!userId) return;
    const { data: myParts } = await supabase.from('chat_participants').select('conversation_id, last_read_at, archived_at').eq('user_id', userId);
    if (!myParts?.length) { setConversations([]); setLoading(false); return; }
    const convIds = myParts.map(p => p.conversation_id);
    const { data: convs } = await supabase.from('chat_conversations').select('id, type, name, created_at, updated_at').in('id', convIds).order('updated_at', { ascending: false });
    if (!convs) { setLoading(false); return; }
    const { data: allParts } = await supabase.from('chat_participants').select('conversation_id, user_id, last_read_at, role').in('conversation_id', convIds);

    let total = 0;
    const convList: Conversation[] = [];
    for (const conv of convs) {
      const participants = (allParts || []).filter(p => p.conversation_id === conv.id);
      const myP = myParts.find(p => p.conversation_id === conv.id);
      const { data: lastMsgs } = await supabase.from('chat_messages').select('id, sender_id, content, created_at, is_deleted, file_name, is_voice, latitude').eq('conversation_id', conv.id).order('created_at', { ascending: false }).limit(1);
      const lastReadAt = myP?.last_read_at || conv.created_at;
      const { count: unread } = await supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('conversation_id', conv.id).neq('sender_id', userId).gt('created_at', lastReadAt);
      let otherUser: Profile | undefined;
      if (conv.type === 'direct') { const oid = participants.find(p => p.user_id !== userId)?.user_id; if (oid) otherUser = profilesMap[oid]; }
      const u = unread || 0;
      total += u;
      const isArchived = !!myP?.archived_at;
      convList.push({ ...conv, participants, last_message: lastMsgs?.[0] as Message | undefined, unread_count: u, other_user: otherUser, is_archived: isArchived });
    }
    setConversations(convList);
    setTotalUnread(total);
    setLoading(false);
  }, [userId, supabase, profilesMap]);

  // ══════════════════════════════════════════════════════════════════════════
  // LOAD MESSAGES
  // ══════════════════════════════════════════════════════════════════════════
  const loadMessages = useCallback(async (append = false) => {
    if (!activeConvId) return;
    if (!append) { setLoadingMessages(true); setMsgPage(0); }
    const offset = append ? (msgPage + 1) * MSG_LIMIT : 0;
    const { data } = await supabase.from('chat_messages')
      .select('id, conversation_id, sender_id, content, created_at, edited_at, is_deleted, reply_to_id, file_url, file_name, file_type, file_size, is_voice, voice_duration, forwarded_from, latitude, longitude, location_name')
      .eq('conversation_id', activeConvId).order('created_at', { ascending: false }).range(offset, offset + MSG_LIMIT - 1);
    const msgs = ((data as Message[]) || []).reverse();
    if (append) { setMessages(prev => [...msgs, ...prev]); setMsgPage(p => p + 1); }
    else setMessages(msgs);
    setHasMore(msgs.length === MSG_LIMIT);
    setLoadingMessages(false); setLoadingMore(false);

    if (msgs.length) {
      const mids = msgs.map(m => m.id);
      const { data: reacts } = await supabase.from('chat_reactions').select('id, message_id, user_id, emoji').in('message_id', mids);
      if (reacts) { const rm: Record<string, Reaction[]> = append ? { ...reactions } : {}; reacts.forEach(r => { if (!rm[r.message_id]) rm[r.message_id] = []; rm[r.message_id].push(r as Reaction); }); setReactions(rm); }
    }
    const { data: pinned } = await supabase.from('chat_pinned_messages').select('message_id').eq('conversation_id', activeConvId);
    if (pinned) setPinnedMsgIds(new Set(pinned.map(p => p.message_id)));
    if (userId && !append) await supabase.from('chat_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', activeConvId).eq('user_id', userId);
    if (!append) setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [activeConvId, userId, supabase, msgPage, reactions]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el || loadingMore || !hasMore) return;
    if (el.scrollTop < 60) { setLoadingMore(true); loadMessages(true); }
  }, [loadingMore, hasMore, loadMessages]);

  // ══════════════════════════════════════════════════════════════════════════
  // SEND MESSAGE
  // ══════════════════════════════════════════════════════════════════════════
  async function handleSend() {
    if (!newMessage.trim() || !activeConvId || !userId || sending) return;
    setSending(true);
    const payload: Record<string, unknown> = { conversation_id: activeConvId, sender_id: userId, content: newMessage.trim() };
    if (replyTo) payload.reply_to_id = replyTo.id;
    const { error } = await supabase.from('chat_messages').insert(payload);
    if (!error) {
      await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
      setNewMessage(''); setReplyTo(null); inputRef.current?.focus();
    }
    setSending(false);
  }

  async function handleEditSave() {
    if (!editingMsg || !editText.trim()) return;
    await supabase.from('chat_messages').update({ content: editText.trim(), edited_at: new Date().toISOString() }).eq('id', editingMsg.id);
    setMessages(prev => prev.map(m => m.id === editingMsg.id ? { ...m, content: editText.trim(), edited_at: new Date().toISOString() } : m));
    setEditingMsg(null); setEditText('');
  }

  async function handleDeleteMsg(msgId: string) {
    await supabase.from('chat_messages').update({ is_deleted: true, content: '' }).eq('id', msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, is_deleted: true, content: '' } : m));
    setContextMenu(null);
  }

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

  async function handleForward(targetConvId: string) {
    if (!forwardMsg || !userId) return;
    await supabase.from('chat_messages').insert({ conversation_id: targetConvId, sender_id: userId, content: forwardMsg.content, forwarded_from: forwardMsg.id, file_url: forwardMsg.file_url, file_name: forwardMsg.file_name, file_type: forwardMsg.file_type, file_size: forwardMsg.file_size });
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', targetConvId);
    setForwardMsg(null);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // FILE UPLOAD
  // ══════════════════════════════════════════════════════════════════════════
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !activeConvId || !userId) return;
    setUploading(true);
    const path = `${userId}/${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('chat-files').upload(path, file);
    if (upErr) { console.error('Upload error:', upErr); setUploading(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);
    await supabase.from('chat_messages').insert({ conversation_id: activeConvId, sender_id: userId, content: file.name, file_url: publicUrl, file_name: file.name, file_type: file.type, file_size: file.size, reply_to_id: replyTo?.id || null });
    await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
    setReplyTo(null); setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMERA CAPTURE
  // ══════════════════════════════════════════════════════════════════════════
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
      const fname = `photo_${Date.now()}.jpg`;
      const path = `${userId}/${fname}`;
      const { error: upErr } = await supabase.storage.from('chat-files').upload(path, blob, { contentType: 'image/jpeg' });
      if (upErr) { setUploading(false); return; }
      const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);
      await supabase.from('chat_messages').insert({ conversation_id: activeConvId, sender_id: userId, content: fname, file_url: publicUrl, file_name: fname, file_type: 'image/jpeg', file_size: blob.size });
      await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
      setUploading(false);
    }, 'image/jpeg', 0.85);
  }

  function closeCameraPreview() {
    cameraStreamRef.current?.getTracks().forEach(t => t.stop());
    cameraStreamRef.current = null;
    setShowCameraPreview(false);
  }

  function handleCameraClick() {
    // On mobile, use the capture input (opens native camera)
    if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      cameraInputRef.current?.click();
    } else {
      openDesktopCamera();
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOCATION SHARING
  // ══════════════════════════════════════════════════════════════════════════
  async function sendLocation() {
    if (!activeConvId || !userId || sendingLocation) return;
    setSendingLocation(true);
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      const { latitude, longitude } = pos.coords;
      // Try reverse geocode via Nominatim (free, no API key)
      let locationName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&zoom=16`);
        const geo = await res.json();
        if (geo.display_name) locationName = geo.display_name.split(',').slice(0, 3).join(',');
      } catch { /* keep coords as name */ }
      await supabase.from('chat_messages').insert({
        conversation_id: activeConvId, sender_id: userId,
        content: `Location: ${locationName}`,
        latitude, longitude, location_name: locationName,
      });
      await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
    } catch (err) {
      console.error('Location error:', err);
      alert('Could not access your location. Please enable location services.');
    }
    setSendingLocation(false);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // VOICE RECORDING
  // ══════════════════════════════════════════════════════════════════════════
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
        if (upErr) return;
        const { data: { publicUrl } } = supabase.storage.from('chat-files').getPublicUrl(path);
        await supabase.from('chat_messages').insert({ conversation_id: activeConvId, sender_id: userId, content: 'Voice message', file_url: publicUrl, file_name: 'voice.webm', file_type: 'audio/webm', file_size: blob.size, is_voice: true, voice_duration: recordingTime });
        await supabase.from('chat_conversations').update({ updated_at: new Date().toISOString() }).eq('id', activeConvId);
        setRecordingTime(0);
      };
      recorder.start(); mediaRecorderRef.current = recorder; setIsRecording(true);
      recordingTimerRef.current = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } catch { console.error('Mic denied'); }
  }
  function stopRecording() { mediaRecorderRef.current?.stop(); setIsRecording(false); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current); }
  function cancelRecording() {
    if (mediaRecorderRef.current) { mediaRecorderRef.current.ondataavailable = null; mediaRecorderRef.current.onstop = null; mediaRecorderRef.current.stop(); mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop()); }
    setIsRecording(false); setRecordingTime(0); if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }
  function playVoice(url: string, msgId: string) {
    if (audioRef.current) audioRef.current.pause();
    if (playingVoice === msgId) { setPlayingVoice(null); return; }
    const a = new Audio(url); a.onended = () => setPlayingVoice(null); a.play(); audioRef.current = a; setPlayingVoice(msgId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WEBRTC CALLS
  // ══════════════════════════════════════════════════════════════════════════
  function cleanupCall() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current = null; }
    setCallState('idle');
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOn(true);
    setCallPeer(null);
    setCallConvId(null);
    setIncomingCall(null);
  }

  async function startCall(type: 'voice' | 'video') {
    if (!activeConvId || !userId || callState !== 'idle') return;
    const conv = conversations.find(c => c.id === activeConvId);
    if (!conv || conv.type !== 'direct') return;
    const peerId = conv.participants.find(p => p.user_id !== userId)?.user_id;
    if (!peerId) return;
    const peer = profilesMap[peerId];
    if (!peer) return;

    setCallType(type);
    setCallPeer(peer);
    setCallConvId(activeConvId);
    setCallState('calling');
    setIsVideoOn(type === 'video');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { facingMode: 'user', width: 640, height: 480 } : false,
      });
      localStreamRef.current = stream;
      if (type === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0];
        if (type === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      };

      // Signaling channel
      const ch = supabase.channel(`call:${activeConvId}`, { config: { broadcast: { self: false } } });
      callChannelRef.current = ch;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          ch.send({ type: 'broadcast', event: 'ice-candidate', payload: { candidate: e.candidate.toJSON(), from: userId } });
        }
      };

      ch.on('broadcast', { event: 'call-answer' }, async ({ payload }) => {
        if (payload.from === userId) return;
        const answer = new RTCSessionDescription(payload.sdp);
        await pc.setRemoteDescription(answer);
        setCallState('active');
        if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current = null; }
        callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
      });

      ch.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.from === userId) return;
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
      });

      ch.on('broadcast', { event: 'call-reject' }, ({ payload }) => {
        if (payload.from === userId) return;
        // Send missed call message
        supabase.from('chat_messages').insert({
          conversation_id: activeConvId, sender_id: userId,
          content: `Missed ${type} call`,
        });
        cleanupCall();
      });

      ch.on('broadcast', { event: 'call-end' }, ({ payload }) => {
        if (payload.from === userId) return;
        cleanupCall();
      });

      await ch.subscribe();

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      ch.send({
        type: 'broadcast', event: 'call-offer',
        payload: { sdp: offer, type, from: userId, convId: activeConvId },
      });

      // Insert call record
      await supabase.from('call_records').insert({
        conversation_id: activeConvId, caller_id: userId, callee_id: peerId, type, status: 'ringing',
      });

      // Timeout after 30s
      setTimeout(() => {
        if (callState === 'calling') {
          supabase.from('chat_messages').insert({
            conversation_id: activeConvId, sender_id: userId,
            content: `Missed ${type} call`,
          });
          endCall();
        }
      }, 30000);

    } catch (err) {
      console.error('Call error:', err);
      cleanupCall();
    }
  }

  async function answerCall() {
    if (!incomingCall || !userId) return;
    const { from, type, convId } = incomingCall;
    setCallType(type);
    setCallPeer(profilesMap[from] || null);
    setCallConvId(convId);
    setCallState('active');
    setIsVideoOn(type === 'video');
    setIncomingCall(null);
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current = null; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video' ? { facingMode: 'user', width: 640, height: 480 } : false,
      });
      localStreamRef.current = stream;
      if (type === 'video' && localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      pc.ontrack = (e) => {
        remoteStreamRef.current = e.streams[0];
        if (type === 'video' && remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = e.streams[0];
        } else if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = e.streams[0];
        }
      };

      const ch = callChannelRef.current || supabase.channel(`call:${convId}`, { config: { broadcast: { self: false } } });
      callChannelRef.current = ch;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          ch.send({ type: 'broadcast', event: 'ice-candidate', payload: { candidate: e.candidate.toJSON(), from: userId } });
        }
      };

      ch.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.from === userId) return;
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
      });

      ch.on('broadcast', { event: 'call-end' }, ({ payload }) => {
        if (payload.from === userId) return;
        cleanupCall();
      });

      if (!callChannelRef.current) await ch.subscribe();

      // Set remote description from the stored offer
      const storedOffer = (ch as unknown as { _offer?: RTCSessionDescriptionInit })._offer;
      if (storedOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(storedOffer));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ch.send({ type: 'broadcast', event: 'call-answer', payload: { sdp: answer, from: userId } });

      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } catch (err) {
      console.error('Answer error:', err);
      cleanupCall();
    }
  }

  function rejectCall() {
    if (!incomingCall) return;
    const ch = callChannelRef.current;
    if (ch) {
      ch.send({ type: 'broadcast', event: 'call-reject', payload: { from: userId } });
    }
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current = null; }
    setIncomingCall(null);
  }

  function endCall() {
    const ch = callChannelRef.current;
    if (ch) {
      ch.send({ type: 'broadcast', event: 'call-end', payload: { from: userId, duration: callDuration } });
    }
    // Send call duration message
    if (callConvId && userId && callDuration > 0) {
      supabase.from('chat_messages').insert({
        conversation_id: callConvId, sender_id: userId,
        content: `${callType === 'video' ? 'Video' : 'Voice'} call - ${fmtDur(callDuration)}`,
      });
    }
    cleanupCall();
  }

  function toggleMute() {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; setIsMuted(!audioTrack.enabled); }
  }

  function toggleVideo() {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; setIsVideoOn(videoTrack.enabled); }
  }

  // ── Listen for incoming calls (global channel per user)
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`calls:${userId}`, { config: { broadcast: { self: false } } });

    ch.on('broadcast', { event: 'call-offer' }, ({ payload }) => {
      if (payload.from === userId) return;
      if (callState !== 'idle') return; // Already in a call

      // Store the offer SDP on the channel for the answer flow
      const callCh = supabase.channel(`call:${payload.convId}`, { config: { broadcast: { self: false } } });
      (callCh as unknown as { _offer?: RTCSessionDescriptionInit })._offer = payload.sdp;
      callChannelRef.current = callCh;

      // Set up call-end listener on this channel too
      callCh.on('broadcast', { event: 'call-end' }, () => { cleanupCall(); });
      callCh.on('broadcast', { event: 'ice-candidate' }, () => { /* handled after answer */ });
      callCh.subscribe();

      setIncomingCall({ from: payload.from, type: payload.type, convId: payload.convId });

      // Play ringtone
      try {
        const ring = new Audio('/notification.mp3');
        ring.loop = true;
        ring.play().catch(() => {});
        ringtoneRef.current = ring;
      } catch {}
    });

    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, supabase, callState]);

  // Also broadcast call-offer to the peer's personal channel
  useEffect(() => {
    if (callState !== 'calling' || !callPeer || !userId || !callConvId) return;
    const peerCh = supabase.channel(`calls:${callPeer.id}`, { config: { broadcast: { self: false } } });
    peerCh.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        const pc = peerConnectionRef.current;
        if (pc?.localDescription) {
          peerCh.send({
            type: 'broadcast', event: 'call-offer',
            payload: { sdp: pc.localDescription, type: callType, from: userId, convId: callConvId },
          });
        }
      }
    });
    return () => { supabase.removeChannel(peerCh); };
  }, [callState, callPeer, userId, callConvId, callType, supabase]);

  // ══════════════════════════════════════════════════════════════════════════
  // TYPING
  // ══════════════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════════════
  // START / CREATE CONVERSATIONS
  // ══════════════════════════════════════════════════════════════════════════
  async function startDirectChat(otherUserId: string) {
    if (!userId) return;
    const { data: myConvs } = await supabase.from('chat_participants').select('conversation_id').eq('user_id', userId);
    if (myConvs) {
      for (const mc of myConvs) {
        const { data: otherP } = await supabase.from('chat_participants').select('user_id').eq('conversation_id', mc.conversation_id).eq('user_id', otherUserId);
        if (otherP?.length) {
          const { data: conv } = await supabase.from('chat_conversations').select('id, type').eq('id', mc.conversation_id).eq('type', 'direct').single();
          if (conv) { setActiveConvId(conv.id); setShowNewChat(false); setListTab('chats'); return; }
        }
      }
    }
    const convId = crypto.randomUUID();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const r1 = await fetch('/supabase-proxy/rest/v1/chat_conversations', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' }, body: JSON.stringify({ id: convId, type: 'direct' }) });
    if (!r1.ok) { console.error('Create conv error:', r1.status, await r1.text()); return; }
    await fetch('/supabase-proxy/rest/v1/chat_participants', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' }, body: JSON.stringify([{ conversation_id: convId, user_id: userId, role: 'admin' }, { conversation_id: convId, user_id: otherUserId, role: 'member' }]) });
    setActiveConvId(convId); setShowNewChat(false); setListTab('chats'); await loadConversations();
  }

  async function createGroupChat() {
    if (!userId || !groupName.trim() || selectedUsers.length < 1) return;
    const gid = crypto.randomUUID();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const r1 = await fetch('/supabase-proxy/rest/v1/chat_conversations', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' }, body: JSON.stringify({ id: gid, type: 'group', name: groupName.trim() }) });
    if (!r1.ok) return;
    const parts = [userId, ...selectedUsers].map((uid, i) => ({ conversation_id: gid, user_id: uid, role: i === 0 ? 'admin' : 'member' }));
    await fetch('/supabase-proxy/rest/v1/chat_participants', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: anonKey, Authorization: `Bearer ${token}`, Prefer: 'return=minimal' }, body: JSON.stringify(parts) });
    setActiveConvId(gid); setShowNewChat(false); setGroupName(''); setSelectedUsers([]); await loadConversations();
  }

  async function addGroupMember(convId: string, memberId: string) {
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/supabase-proxy/rest/v1/chat_participants', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', Authorization: `Bearer ${session?.access_token}`, Prefer: 'return=minimal' }, body: JSON.stringify({ conversation_id: convId, user_id: memberId, role: 'member' }) });
    await loadConversations();
  }
  async function removeGroupMember(convId: string, memberId: string) { await supabase.from('chat_participants').delete().eq('conversation_id', convId).eq('user_id', memberId); await loadConversations(); }
  async function renameGroup(convId: string, name: string) { await supabase.from('chat_conversations').update({ name }).eq('id', convId); await loadConversations(); }

  async function archiveConversation(convId: string) {
    if (!userId) return;
    await supabase.from('chat_participants').update({ archived_at: new Date().toISOString() }).eq('conversation_id', convId).eq('user_id', userId);
    setConvMenu(null);
    if (activeConvId === convId) setActiveConvId(null);
    await loadConversations();
  }

  async function unarchiveConversation(convId: string) {
    if (!userId) return;
    await supabase.from('chat_participants').update({ archived_at: null }).eq('conversation_id', convId).eq('user_id', userId);
    setConvMenu(null);
    await loadConversations();
  }

  async function deleteConversation(convId: string) {
    if (!userId) return;
    if (!confirm('Leave this conversation? You will no longer see it.')) return;
    await supabase.from('chat_participants').delete().eq('conversation_id', convId).eq('user_id', userId);
    setConvMenu(null);
    if (activeConvId === convId) setActiveConvId(null);
    await loadConversations();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REALTIME
  // ══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel('chat-widget-rt')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === activeConvId) {
          setMessages(prev => [...prev, msg]);
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          if (msg.sender_id !== userId) supabase.from('chat_participants').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', activeConvId).eq('user_id', userId);
        }
        if (msg.sender_id !== userId) { try { new Audio('/notification.mp3').play().catch(() => {}); } catch {} }
        loadConversations();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages' }, (payload) => {
        const msg = payload.new as Message;
        if (msg.conversation_id === activeConvId) setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...msg } : m));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, activeConvId, supabase, loadConversations]);

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
  useEffect(() => { if (Object.keys(profilesMap).length > 0) loadConversations(); }, [profilesMap, loadConversations]);
  useEffect(() => { if (activeConvId) loadMessages(); }, [activeConvId]);

  // Close menus on click
  useEffect(() => { const h = () => { setContextMenu(null); setShowEmojiFor(null); setConvMenu(null); }; window.addEventListener('click', h); return () => window.removeEventListener('click', h); }, []);

  // ── Filtered data
  const filteredConvs = conversations.filter(c => {
    // Archive filter
    if (showArchived ? !c.is_archived : c.is_archived) return false;
    if (!searchConv) return true;
    const n = (c.type === 'direct' ? c.other_user?.full_name || '' : c.name || '').toLowerCase();
    return n.includes(searchConv.toLowerCase());
  });
  const archivedCount = conversations.filter(c => c.is_archived).length;
  const filteredUsers = allUsers.filter(u => u.id !== userId && u.is_active && (!searchUsers || u.full_name.toLowerCase().includes(searchUsers.toLowerCase())));
  const activeConv = conversations.find(c => c.id === activeConvId);
  const myRole = activeConv?.participants.find(p => p.user_id === userId)?.role;
  const filteredMessages = showSearchMessages && searchMessages ? messages.filter(m => m.content.toLowerCase().includes(searchMessages.toLowerCase())) : messages;
  const pinnedMessages = messages.filter(m => pinnedMsgIds.has(m.id));

  // Contacts grouped by role
  const contactsByRole = allUsers.filter(u => u.id !== userId && u.is_active && (!searchContacts || u.full_name.toLowerCase().includes(searchContacts.toLowerCase())))
    .reduce<Record<string, Profile[]>>((acc, u) => {
      const role = u.role.replace(/_/g, ' ');
      if (!acc[role]) acc[role] = [];
      acc[role].push(u);
      return acc;
    }, {});
  // Sort roles, online users first within each role
  Object.values(contactsByRole).forEach(users => users.sort((a, b) => (isOnline(b.last_seen_at) ? 1 : 0) - (isOnline(a.last_seen_at) ? 1 : 0)));
  const onlineCount = allUsers.filter(u => u.id !== userId && u.is_active && isOnline(u.last_seen_at)).length;

  if (!userId) return null;

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <>
      {/* ── Incoming Call Overlay ──────────────────────────────────────── */}
      {incomingCall && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center">
          <div className="bg-white rounded-3xl p-8 shadow-2xl flex flex-col items-center gap-4 w-[300px] animate-in">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-2xl font-bold animate-pulse"
              style={{ backgroundColor: RC[profilesMap[incomingCall.from]?.role || ''] || '#94A3B8' }}>
              {getInitials(profilesMap[incomingCall.from]?.full_name || '?')}
            </div>
            <div className="text-center">
              <p className="font-bold text-lg text-[#1a1a2e]">{profilesMap[incomingCall.from]?.full_name || 'Unknown'}</p>
              <p className="text-sm text-gray-500 flex items-center justify-center gap-1">
                {incomingCall.type === 'video' ? <Video size={14} /> : <Phone size={14} />}
                Incoming {incomingCall.type} call...
              </p>
            </div>
            <div className="flex items-center gap-6 mt-2">
              <button onClick={rejectCall}
                className="w-14 h-14 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 shadow-lg shadow-red-500/30">
                <PhoneOff size={24} />
              </button>
              <button onClick={answerCall}
                className="w-14 h-14 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 shadow-lg shadow-green-500/30 animate-bounce">
                <Phone size={24} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Call Overlay ────────────────────────────────────────── */}
      {(callState === 'calling' || callState === 'active') && (
        <div className="fixed inset-0 z-[75] bg-gradient-to-b from-[#1a1a2e] to-[#0f0f23] flex flex-col items-center justify-between py-12">
          {/* Video streams */}
          {callType === 'video' ? (
            <>
              <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
              <video ref={localVideoRef} autoPlay playsInline muted
                className="absolute bottom-24 right-4 w-28 h-40 object-cover rounded-2xl border-2 border-white/30 z-10" />
              <audio ref={remoteAudioRef} autoPlay className="hidden" />
            </>
          ) : (
            <audio ref={remoteAudioRef} autoPlay className="hidden" />
          )}

          {/* Call info overlay */}
          <div className="relative z-20 flex flex-col items-center gap-3">
            {callType !== 'video' && (
              <div className="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold"
                style={{ backgroundColor: RC[callPeer?.role || ''] || '#94A3B8' }}>
                {getInitials(callPeer?.full_name || '?')}
              </div>
            )}
            <p className="font-bold text-xl text-white">{callPeer?.full_name || 'Unknown'}</p>
            <p className="text-sm text-white/60">
              {callState === 'calling' ? 'Calling...' : fmtDur(callDuration)}
            </p>
          </div>

          {/* Call controls */}
          <div className="relative z-20 flex items-center gap-5">
            <button onClick={toggleMute}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${isMuted ? 'bg-white text-[#1a1a2e]' : 'bg-white/20 text-white'}`}>
              {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            {callType === 'video' && (
              <button onClick={toggleVideo}
                className={`w-12 h-12 rounded-full flex items-center justify-center ${!isVideoOn ? 'bg-white text-[#1a1a2e]' : 'bg-white/20 text-white'}`}>
                {isVideoOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            )}
            <button onClick={() => setIsSpeaker(!isSpeaker)}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${isSpeaker ? 'bg-white text-[#1a1a2e]' : 'bg-white/20 text-white'}`}>
              {isSpeaker ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </button>
            <button onClick={endCall}
              className="w-14 h-14 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-red-500/40">
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}

      {/* ── Camera Preview Overlay ────────────────────────────────────── */}
      {showCameraPreview && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center">
          <video ref={videoPreviewRef} autoPlay playsInline className="max-w-full max-h-[80vh] rounded-xl" />
          <div className="flex items-center gap-6 mt-6">
            <button onClick={closeCameraPreview} className="w-14 h-14 bg-white/20 text-white rounded-full flex items-center justify-center"><X size={28} /></button>
            <button onClick={capturePhoto} className="w-16 h-16 bg-white rounded-full flex items-center justify-center border-4 border-white/50 hover:scale-105 transition-transform">
              <div className="w-12 h-12 bg-[#C9956B] rounded-full" />
            </button>
          </div>
        </div>
      )}

      {/* ── Floating Button ─────────────────────────────────────────────── */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-20 right-4 lg:bottom-6 lg:right-6 z-[60] w-14 h-14 bg-gradient-to-br from-[#C9956B] to-[#B8845A] text-white rounded-full shadow-lg shadow-[#C9956B]/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform">
          <MessageCircle size={24} />
          {totalUnread > 0 && (
            <span className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center border-2 border-white">
              {totalUnread > 9 ? '9+' : totalUnread}
            </span>
          )}
        </button>
      )}

      {/* ── Chat Panel ─────────────────────────────────────────────────── */}
      {open && (
        <div className="fixed bottom-0 right-0 lg:bottom-6 lg:right-6 z-[60] w-full h-full lg:w-[400px] lg:h-[600px] lg:rounded-2xl bg-white shadow-2xl shadow-black/20 flex flex-col overflow-hidden lg:border lg:border-gray-200">

          {/* ── CONVERSATION LIST VIEW ─────────────────────────────── */}
          {view === 'list' && !showNewChat && !forwardMsg && !showGroupSettings && (
            <>
              {/* Header */}
              <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-[#C9956B] to-[#B8845A]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageCircle size={20} className="text-white" />
                    <h2 className="text-base font-bold text-white">Chat</h2>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setShowNewChat(true)} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><Plus size={18} /></button>
                    <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><Minimize2 size={18} /></button>
                  </div>
                </div>
                {/* Tabs */}
                <div className="flex gap-1 mt-2">
                  <button onClick={() => setListTab('chats')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${listTab === 'chats' ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/10'}`}>
                    Chats {totalUnread > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full">{totalUnread}</span>}
                  </button>
                  <button onClick={() => setListTab('contacts')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${listTab === 'contacts' ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/10'}`}>
                    Contacts <span className="ml-1 text-[10px] text-white/50">{onlineCount} online</span>
                  </button>
                </div>
                {/* Search */}
                <div className="relative mt-2">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/60" />
                  <input type="text" placeholder="Search..."
                    value={listTab === 'chats' ? searchConv : searchContacts}
                    onChange={e => listTab === 'chats' ? setSearchConv(e.target.value) : setSearchContacts(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-white/20 text-white placeholder-white/60 rounded-lg text-sm focus:outline-none focus:bg-white/30" />
                </div>
              </div>

              {/* CHATS TAB */}
              {listTab === 'chats' && (
                <div className="flex-1 overflow-y-auto">
                  {/* Archive toggle */}
                  {archivedCount > 0 && (
                    <button onClick={() => setShowArchived(!showArchived)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-100 text-gray-500">
                      <Archive size={14} />
                      <span className="text-xs font-medium">{showArchived ? 'Back to chats' : `Archived (${archivedCount})`}</span>
                    </button>
                  )}
                  {loading ? <div className="flex items-center justify-center h-24 text-gray-400 text-sm">Loading...</div> :
                    filteredConvs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                        {showArchived ? <Archive size={32} className="mb-2 opacity-30" /> : <MessageCircle size={32} className="mb-2 opacity-30" />}
                        <p className="text-sm">{showArchived ? 'No archived conversations' : 'No conversations'}</p>
                        {!showArchived && <button onClick={() => setShowNewChat(true)} className="mt-1 text-[#C9956B] text-sm font-medium">Start a chat</button>}
                      </div>
                    ) : filteredConvs.map(conv => {
                      const dn = conv.type === 'direct' ? conv.other_user?.full_name || 'Unknown' : conv.name || 'Group';
                      const lm = conv.last_message;
                      const sn = lm?.sender_id === userId ? 'You' : profilesMap[lm?.sender_id || '']?.full_name?.split(' ')[0] || '';
                      const online = conv.type === 'direct' && isOnline(conv.other_user?.last_seen_at);
                      let preview = 'No messages yet';
                      if (lm) {
                        preview = lm.is_deleted ? 'Deleted' : lm.is_voice ? 'Voice message' : lm.latitude ? 'Location' : lm.file_name ? lm.file_name : lm.content;
                        if (sn) preview = `${sn}: ${preview}`;
                      }
                      return (
                        <div key={conv.id} className="relative group/conv flex items-center border-b border-gray-50 hover:bg-gray-50">
                          <button onClick={() => { setActiveConvId(conv.id); setConvMenu(null); }}
                            className="flex-1 flex items-center gap-2.5 px-3 py-2.5 text-left">
                            <div className="relative shrink-0">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ${conv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`}
                                style={conv.type === 'direct' ? { backgroundColor: RC[conv.other_user?.role || ''] || '#94A3B8' } : {}}>
                                {conv.type === 'group' ? <Users size={16} /> : getInitials(conv.other_user?.full_name || '?')}
                              </div>
                              {online && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[13px] text-[#1a1a2e] truncate">{dn}</span>
                                {lm && <span className="text-[10px] text-gray-400 ml-1 shrink-0">{timeAgo(lm.created_at)}</span>}
                              </div>
                              <div className="flex items-center justify-between">
                                <p className="text-[11px] text-gray-500 truncate">{preview}</p>
                                {conv.unread_count > 0 && <span className="ml-1 shrink-0 w-4.5 h-4.5 bg-[#C9956B] text-white text-[9px] font-bold rounded-full flex items-center justify-center min-w-[18px] px-1">{conv.unread_count > 9 ? '9+' : conv.unread_count}</span>}
                              </div>
                            </div>
                          </button>
                          {/* Conversation menu button */}
                          <button onClick={(e) => { e.stopPropagation(); setConvMenu(convMenu === conv.id ? null : conv.id); }}
                            className="p-1.5 mr-2 hover:bg-gray-200 rounded-lg text-gray-400 opacity-0 group-hover/conv:opacity-100 transition-opacity shrink-0">
                            <MoreHorizontal size={16} />
                          </button>
                          {/* Dropdown menu */}
                          {convMenu === conv.id && (
                            <div className="absolute right-2 top-10 bg-white shadow-xl rounded-xl border py-1 z-30 min-w-[140px]" onClick={e => e.stopPropagation()}>
                              {conv.is_archived ? (
                                <button onClick={() => unarchiveConversation(conv.id)}
                                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                                  <Archive size={12} /> Unarchive
                                </button>
                              ) : (
                                <button onClick={() => archiveConversation(conv.id)}
                                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                                  <Archive size={12} /> Archive
                                </button>
                              )}
                              <button onClick={() => deleteConversation(conv.id)}
                                className="w-full px-3 py-1.5 text-left text-xs hover:bg-red-50 flex items-center gap-2 text-red-600">
                                <LogOut size={12} /> Leave & Delete
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  }
                </div>
              )}

              {/* CONTACTS TAB */}
              {listTab === 'contacts' && (
                <div className="flex-1 overflow-y-auto">
                  {Object.entries(contactsByRole).map(([role, users]) => (
                    <div key={role}>
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{role}</span>
                      </div>
                      {users.map(user => {
                        const online = isOnline(user.last_seen_at);
                        return (
                          <button key={user.id} onClick={() => { startDirectChat(user.id); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 border-b border-gray-50">
                            <div className="relative shrink-0">
                              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                style={{ backgroundColor: RC[user.role] || '#94A3B8' }}>
                                {getInitials(user.full_name)}
                              </div>
                              <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? 'bg-green-500' : 'bg-gray-300'}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-[#1a1a2e] truncate">{user.full_name}</p>
                              <p className={`text-[10px] ${online ? 'text-green-600 font-medium' : 'text-gray-400'}`}>
                                {lastSeenText(user.last_seen_at)}
                              </p>
                            </div>
                            <MessageCircle size={16} className="text-gray-300" />
                          </button>
                        );
                      })}
                    </div>
                  ))}
                  {Object.keys(contactsByRole).length === 0 && (
                    <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No contacts found</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── CHAT VIEW ──────────────────────────────────────────── */}
          {view === 'chat' && !showNewChat && !forwardMsg && !showGroupSettings && (
            <>
              {/* Header */}
              <div className="h-14 px-3 flex items-center gap-2.5 bg-white border-b border-gray-200 shrink-0">
                <button onClick={() => { setActiveConvId(null); setShowSearchMessages(false); setShowPinnedMessages(false); }} className="p-1.5 hover:bg-gray-100 rounded-lg"><ArrowLeft size={18} /></button>
                {activeConv && (
                  <>
                    <div className="relative">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold ${activeConv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`}
                        style={activeConv.type === 'direct' ? { backgroundColor: RC[activeConv.other_user?.role || ''] || '#94A3B8' } : {}}>
                        {activeConv.type === 'group' ? <Users size={14} /> : getInitials(activeConv.other_user?.full_name || '?')}
                      </div>
                      {activeConv.type === 'direct' && isOnline(activeConv.other_user?.last_seen_at) && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[13px] text-[#1a1a2e] truncate">{activeConv.type === 'direct' ? activeConv.other_user?.full_name || 'Unknown' : activeConv.name || 'Group'}</p>
                      <p className="text-[10px] text-gray-400">{activeConv.type === 'direct' ? (isOnline(activeConv.other_user?.last_seen_at) ? 'Online' : activeConv.other_user?.last_seen_at ? `Last seen ${timeAgo(activeConv.other_user.last_seen_at)}` : '') : `${activeConv.participants.length} members`}</p>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {/* Call buttons - only for direct chats */}
                      {activeConv.type === 'direct' && callState === 'idle' && (
                        <>
                          <button onClick={() => startCall('voice')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400" title="Voice call"><Phone size={16} /></button>
                          <button onClick={() => startCall('video')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400" title="Video call"><Video size={16} /></button>
                        </>
                      )}
                      <button onClick={() => setShowSearchMessages(!showSearchMessages)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Search size={16} /></button>
                      {pinnedMessages.length > 0 && <button onClick={() => setShowPinnedMessages(!showPinnedMessages)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 relative"><Pin size={16} /><span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#C9956B] text-white text-[8px] font-bold rounded-full flex items-center justify-center">{pinnedMessages.length}</span></button>}
                      {activeConv.type === 'group' && <button onClick={() => setShowGroupSettings(true)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Settings size={16} /></button>}
                      <button onClick={() => setOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Minimize2 size={16} /></button>
                    </div>
                  </>
                )}
              </div>

              {showSearchMessages && (
                <div className="px-3 py-1.5 bg-white border-b flex items-center gap-2">
                  <Search size={14} className="text-gray-400" />
                  <input type="text" placeholder="Search..." value={searchMessages} onChange={e => setSearchMessages(e.target.value)} autoFocus className="flex-1 text-xs bg-transparent focus:outline-none" />
                  <button onClick={() => { setShowSearchMessages(false); setSearchMessages(''); }}><X size={14} className="text-gray-400" /></button>
                </div>
              )}
              {showPinnedMessages && pinnedMessages.length > 0 && (
                <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 max-h-24 overflow-y-auto">
                  <div className="flex items-center gap-1 mb-0.5"><Pin size={12} className="text-amber-600" /><span className="text-[10px] font-semibold text-amber-700">Pinned</span><button onClick={() => setShowPinnedMessages(false)} className="ml-auto"><X size={12} className="text-amber-600" /></button></div>
                  {pinnedMessages.map(pm => <div key={pm.id} className="text-[10px] text-amber-800 truncate"><b>{profilesMap[pm.sender_id]?.full_name?.split(' ')[0]}:</b> {pm.content}</div>)}
                </div>
              )}
              {typingUsers.length > 0 && <div className="px-3 py-1 bg-white border-b"><p className="text-[10px] text-gray-400 italic">{typingUsers.map(id => profilesMap[id]?.full_name?.split(' ')[0]).filter(Boolean).join(', ')} typing...</p></div>}

              {/* Messages */}
              <div ref={messagesContainerRef} onScroll={handleMessagesScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 bg-[#F8F9FC]">
                {loadingMessages ? <div className="flex items-center justify-center h-full text-gray-400 text-xs">Loading...</div> : (
                  <>
                    {loadingMore && <div className="text-center text-[10px] text-gray-400 py-1">Loading older...</div>}
                    {filteredMessages.length === 0 ? <div className="flex items-center justify-center h-full text-gray-400 text-xs">No messages yet</div> :
                      filteredMessages.map((msg, i) => {
                        const isMe = msg.sender_id === userId;
                        const sender = profilesMap[msg.sender_id];
                        const showAvatar = !isMe && (i === 0 || filteredMessages[i - 1]?.sender_id !== msg.sender_id);
                        const showName = !isMe && activeConv?.type === 'group' && showAvatar;
                        const msgReactions = reactions[msg.id] || [];
                        const isPinned = pinnedMsgIds.has(msg.id);
                        const replyMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
                        const isMentioned = msg.content.includes(`@${profile?.full_name}`);
                        const readBy = activeConv?.participants.filter(p => p.user_id !== userId && p.last_read_at && new Date(p.last_read_at) >= new Date(msg.created_at)) || [];
                        const isCallMsg = msg.content.startsWith('Missed ') && (msg.content.includes('call') || msg.content.includes('Call')) || msg.content.startsWith('Voice call -') || msg.content.startsWith('Video call -');

                        // System-style call messages
                        if (isCallMsg) {
                          return (
                            <div key={msg.id} className="flex justify-center my-2">
                              <div className="bg-gray-100 text-gray-500 text-[10px] px-3 py-1 rounded-full flex items-center gap-1.5">
                                {msg.content.includes('Missed') ? <PhoneOff size={10} className="text-red-400" /> : <Phone size={10} className="text-green-500" />}
                                {msg.content}
                                <span className="text-gray-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={msg.id}
                            className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${showAvatar ? 'mt-2' : 'mt-0.5'} ${isMentioned ? 'bg-[#C9956B]/5 -mx-1 px-1 rounded' : ''} group/msg relative`}
                            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setContextMenu({ msg, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 300) }); }}>
                            {!isMe && <div className="w-7 mr-1.5 shrink-0">{showAvatar && <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: RC[sender?.role || ''] || '#94A3B8' }}>{getInitials(sender?.full_name || '?')}</div>}</div>}
                            <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                              {showName && <p className="text-[9px] font-medium text-gray-400 mb-0.5 ml-1">{sender?.full_name?.split(' ')[0]}</p>}
                              {msg.forwarded_from && <p className="text-[9px] text-gray-400 mb-0.5 ml-1 flex items-center gap-0.5"><Forward size={9} /> Forwarded</p>}
                              {replyMsg && <div className={`text-[10px] px-2 py-1 mb-0.5 rounded-t border-l-2 border-[#C9956B] ${isMe ? 'bg-[#B8845A]/30 text-white/80' : 'bg-gray-100 text-gray-500'}`}><b>{profilesMap[replyMsg.sender_id]?.full_name?.split(' ')[0]}</b><p className="truncate">{replyMsg.is_deleted ? 'Deleted' : replyMsg.content}</p></div>}

                              <div className={`relative px-3 py-1.5 rounded-2xl text-[13px] leading-relaxed break-words ${isMe ? 'bg-[#C9956B] text-white rounded-br-md' : 'bg-white text-[#1a1a2e] rounded-bl-md shadow-sm border border-gray-100'} ${isPinned ? 'ring-1 ring-amber-400' : ''}`}>
                                {isPinned && <Pin size={8} className={`absolute top-0.5 right-0.5 ${isMe ? 'text-white/50' : 'text-amber-500'}`} />}
                                {msg.is_deleted ? <span className="italic opacity-60 text-xs">Deleted</span> :
                                  msg.latitude && msg.longitude ? (
                                    /* ── Location message ── */
                                    <a href={`https://www.google.com/maps?q=${msg.latitude},${msg.longitude}`} target="_blank" rel="noopener noreferrer" className="block">
                                      <div className="relative w-[200px] h-[120px] rounded-lg overflow-hidden mb-1">
                                        <img src={`https://maps.geoapify.com/v1/staticmap?style=osm-bright&width=400&height=240&center=lonlat:${msg.longitude},${msg.latitude}&zoom=15&marker=lonlat:${msg.longitude},${msg.latitude};color:%23C9956B;size:large&apiKey=demo`}
                                          alt="Map" className="w-full h-full object-cover"
                                          onError={(e) => { (e.target as HTMLImageElement).src = `https://via.placeholder.com/400x240/F3F4F6/9CA3AF?text=${msg.latitude?.toFixed(3)}%2C${msg.longitude?.toFixed(3)}`; }} />
                                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/50 p-1.5">
                                          <p className="text-white text-[10px] flex items-center gap-1"><MapPin size={10} /> Open in Maps</p>
                                        </div>
                                      </div>
                                      <p className={`text-[10px] ${isMe ? 'text-white/80' : 'text-gray-500'}`}>{msg.location_name}</p>
                                    </a>
                                  ) :
                                  msg.is_voice ? (
                                    <div className="flex items-center gap-2 min-w-[140px]">
                                      <button onClick={() => playVoice(msg.file_url!, msg.id)} className={`w-7 h-7 rounded-full flex items-center justify-center ${isMe ? 'bg-white/20' : 'bg-gray-100'}`}>{playingVoice === msg.id ? <Pause size={12} /> : <Play size={12} />}</button>
                                      <div className="flex-1"><div className="h-1 bg-white/30 rounded-full"><div className="h-1 bg-white/70 rounded-full w-1/2" /></div><p className="text-[9px] mt-0.5 opacity-70">{fmtDur(msg.voice_duration || 0)}</p></div>
                                    </div>
                                  ) : msg.file_url ? (
                                    msg.file_type?.startsWith('image/') ? <div><img src={msg.file_url} alt="" className="max-w-[200px] rounded-lg mb-0.5 cursor-pointer" onClick={() => window.open(msg.file_url, '_blank')} />{msg.content && msg.content !== msg.file_name && <p>{msg.content}</p>}</div>
                                    : <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 ${isMe ? 'text-white' : 'text-[#1a1a2e]'}`}><FileText size={16} /><div className="min-w-0"><p className="text-xs font-medium truncate">{msg.file_name}</p><p className="text-[9px] opacity-70">{fmtSize(msg.file_size || 0)}</p></div><Download size={14} className="opacity-70" /></a>
                                  ) : <span dangerouslySetInnerHTML={{ __html: msg.content.replace(/@(\S+\s?\S*)/g, '<span class="font-bold text-amber-300">@$1</span>') }} />}
                                {msg.edited_at && !msg.is_deleted && <span className="text-[8px] opacity-50 ml-0.5">(edited)</span>}

                                <div className={`absolute ${isMe ? '-left-16' : '-right-16'} top-0 hidden group-hover/msg:flex items-center gap-0 bg-white shadow rounded-lg p-0.5 border z-10`}>
                                  <button onClick={e => { e.stopPropagation(); setShowEmojiFor(showEmojiFor === msg.id ? null : msg.id); }} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Smile size={12} /></button>
                                  <button onClick={() => { setReplyTo(msg); inputRef.current?.focus(); }} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Reply size={12} /></button>
                                  <button onClick={e => { e.stopPropagation(); setContextMenu({ msg, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 300) }); }} className="p-1 hover:bg-gray-100 rounded text-gray-500"><MoreVertical size={12} /></button>
                                </div>
                              </div>

                              {showEmojiFor === msg.id && <div className={`flex gap-0.5 mt-0.5 p-1 bg-white shadow-lg rounded-xl border z-20 ${isMe ? 'justify-end' : ''}`} onClick={e => e.stopPropagation()}>{EMOJIS.map(em => <button key={em} onClick={() => handleReaction(msg.id, em)} className="w-6 h-6 hover:bg-gray-100 rounded-lg flex items-center justify-center text-xs hover:scale-125 transition-transform">{em}</button>)}</div>}
                              {msgReactions.length > 0 && <div className={`flex flex-wrap gap-0.5 mt-0.5 ${isMe ? 'justify-end' : ''}`}>{Object.entries(msgReactions.reduce<Record<string, string[]>>((a, r) => { if (!a[r.emoji]) a[r.emoji] = []; a[r.emoji].push(r.user_id); return a; }, {})).map(([emoji, users]) => <button key={emoji} onClick={() => handleReaction(msg.id, emoji)} className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] border ${users.includes(userId || '') ? 'bg-[#C9956B]/10 border-[#C9956B]/30' : 'bg-gray-50 border-gray-200'}`}><span>{emoji}</span><span className="text-gray-500">{users.length}</span></button>)}</div>}
                              <div className={`flex items-center gap-0.5 mt-0.5 mx-0.5 ${isMe ? 'justify-end' : ''}`}>
                                <p className="text-[9px] text-gray-400">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                {isMe && (readBy.length > 0 ? <CheckCheck size={10} className="text-blue-500" /> : <Check size={10} className="text-gray-400" />)}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    }
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Reply/Edit bar */}
              {(replyTo || editingMsg) && (
                <div className="px-3 py-1.5 bg-white border-t flex items-center gap-2">
                  <div className="flex-1 border-l-2 border-[#C9956B] pl-2">
                    <p className="text-[9px] font-semibold text-[#C9956B]">{editingMsg ? 'Editing' : `Reply to ${profilesMap[replyTo!.sender_id]?.full_name?.split(' ')[0]}`}</p>
                    <p className="text-[10px] text-gray-500 truncate">{editingMsg ? editingMsg.content : replyTo!.content}</p>
                  </div>
                  <button onClick={() => { setReplyTo(null); setEditingMsg(null); setEditText(''); }}><X size={14} className="text-gray-400" /></button>
                </div>
              )}

              {/* Input */}
              <div className="px-3 py-2 bg-white border-t shrink-0">
                {showMentions && activeConv?.type === 'group' && (
                  <div className="mb-1.5 bg-white shadow-lg rounded-xl border max-h-28 overflow-y-auto">
                    {allUsers.filter(u => u.id !== userId && u.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 4).map(u => (
                      <button key={u.id} onClick={() => insertMention(u)} className="w-full px-2.5 py-1.5 text-left hover:bg-gray-50 flex items-center gap-1.5 text-xs">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ backgroundColor: RC[u.role] || '#94A3B8' }}>{getInitials(u.full_name)}</div>
                        {u.full_name}
                      </button>
                    ))}
                  </div>
                )}
                {isRecording ? (
                  <div className="flex items-center gap-2">
                    <button onClick={cancelRecording} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><X size={18} /></button>
                    <div className="flex-1 flex items-center gap-2"><div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" /><span className="text-xs font-medium text-red-600">{fmtDur(recordingTime)}</span><div className="flex-1 h-1 bg-red-100 rounded-full" /></div>
                    <button onClick={stopRecording} className="w-9 h-9 bg-[#C9956B] text-white rounded-xl flex items-center justify-center"><Send size={16} /></button>
                  </div>
                ) : (
                  <form onSubmit={e => { e.preventDefault(); if (editingMsg) handleEditSave(); else handleSend(); }} className="flex items-center gap-1">
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
                    <input type="file" ref={cameraInputRef} onChange={handleFileUpload} className="hidden" accept="image/*" capture="environment" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-40" title="Attach file">
                      {uploading ? <div className="w-4 h-4 border-2 border-gray-300 border-t-[#C9956B] rounded-full animate-spin" /> : <Paperclip size={17} />}
                    </button>
                    <button type="button" onClick={handleCameraClick} disabled={uploading} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-40" title="Take photo">
                      <Camera size={17} />
                    </button>
                    <button type="button" onClick={sendLocation} disabled={sendingLocation} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-40" title="Share location">
                      {sendingLocation ? <div className="w-4 h-4 border-2 border-gray-300 border-t-[#C9956B] rounded-full animate-spin" /> : <MapPin size={17} />}
                    </button>
                    <input ref={inputRef} type="text" placeholder={editingMsg ? 'Edit...' : 'Message...'} value={editingMsg ? editText : newMessage}
                      onChange={e => editingMsg ? setEditText(e.target.value) : handleInputChange(e.target.value)} onKeyDown={handleInputKeyDown}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" autoFocus />
                    {(editingMsg ? editText.trim() : newMessage.trim()) ? (
                      <button type="submit" disabled={sending} className="w-9 h-9 bg-[#C9956B] text-white rounded-xl flex items-center justify-center hover:bg-[#B8845A] disabled:opacity-40"><Send size={16} /></button>
                    ) : (
                      <button type="button" onClick={startRecording} className="w-9 h-9 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200"><Mic size={16} /></button>
                    )}
                  </form>
                )}
              </div>
            </>
          )}

          {/* ── NEW CHAT MODAL (inline) ────────────────────────────── */}
          {showNewChat && (
            <>
              <div className="p-3 border-b bg-white">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-[#1a1a2e]">New Conversation</h2>
                  <button onClick={() => { setShowNewChat(false); setSelectedUsers([]); setGroupName(''); }}><X size={20} className="text-gray-400" /></button>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setSelectedUsers([])} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${selectedUsers.length === 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}><User size={12} className="inline mr-0.5" /> Direct</button>
                  <button onClick={() => setSelectedUsers(selectedUsers.length ? selectedUsers : ['__group__'])} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${selectedUsers.length > 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}><Users size={12} className="inline mr-0.5" /> Group</button>
                </div>
                {selectedUsers.length > 0 && <input type="text" placeholder="Group name..." value={groupName} onChange={e => setGroupName(e.target.value)} className="w-full mt-2 px-2.5 py-1.5 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" />}
                <div className="relative mt-2">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="text" placeholder="Search users..." value={searchUsers} onChange={e => setSearchUsers(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-1.5">
                {filteredUsers.map(user => {
                  const isSel = selectedUsers.includes(user.id);
                  const online = isOnline(user.last_seen_at);
                  return (
                    <button key={user.id} onClick={() => {
                      if (selectedUsers.length === 0) { startDirectChat(user.id); return; }
                      setSelectedUsers(prev => { const f = prev.filter(id => id !== '__group__'); return isSel ? f.filter(id => id !== user.id) : [...f, user.id]; });
                    }} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left ${isSel ? 'bg-[#C9956B]/10' : 'hover:bg-gray-50'}`}>
                      <div className="relative"><div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: RC[user.role] || '#94A3B8' }}>{getInitials(user.full_name)}</div>{online && <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-white" />}</div>
                      <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{user.full_name}</p><p className="text-[10px] text-gray-400 capitalize">{user.role.replace('_', ' ')}{online ? ' - Online' : ''}</p></div>
                      {isSel && <Check size={16} className="text-[#C9956B]" />}
                    </button>
                  );
                })}
              </div>
              {selectedUsers.length > 0 && selectedUsers[0] !== '__group__' && (
                <div className="p-3 border-t">
                  <button onClick={createGroupChat} disabled={!groupName.trim()} className="w-full py-2 bg-[#C9956B] text-white rounded-xl text-sm font-medium hover:bg-[#B8845A] disabled:opacity-40">Create Group ({selectedUsers.length})</button>
                </div>
              )}
            </>
          )}

          {/* ── FORWARD (inline) ────────────────────────────────────── */}
          {forwardMsg && (
            <>
              <div className="p-3 border-b flex items-center justify-between bg-white">
                <h2 className="text-base font-bold">Forward</h2>
                <button onClick={() => setForwardMsg(null)}><X size={20} className="text-gray-400" /></button>
              </div>
              <div className="px-3 py-1.5 border-b"><div className="bg-gray-50 rounded p-1.5 text-[11px] text-gray-600 truncate">{forwardMsg.content}</div></div>
              <div className="flex-1 overflow-y-auto p-1.5">
                {conversations.filter(c => c.id !== activeConvId).map(conv => (
                  <button key={conv.id} onClick={() => handleForward(conv.id)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-50">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${conv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`} style={conv.type === 'direct' ? { backgroundColor: RC[conv.other_user?.role || ''] || '#94A3B8' } : {}}>{conv.type === 'group' ? <Users size={12} /> : getInitials(conv.other_user?.full_name || '?')}</div>
                    <span className="text-sm">{conv.type === 'direct' ? conv.other_user?.full_name : conv.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ── GROUP SETTINGS (inline) ─────────────────────────────── */}
          {showGroupSettings && activeConv?.type === 'group' && (
            <>
              <div className="p-3 border-b flex items-center justify-between bg-white">
                <h2 className="text-base font-bold">Group Settings</h2>
                <button onClick={() => setShowGroupSettings(false)}><X size={20} className="text-gray-400" /></button>
              </div>
              {myRole === 'admin' && (
                <div className="p-3 border-b">
                  <label className="text-[10px] font-medium text-gray-500">Group Name</label>
                  <div className="flex gap-1.5 mt-1">
                    <input type="text" defaultValue={activeConv.name || ''} id="wGroupName" className="flex-1 px-2.5 py-1.5 bg-gray-50 border rounded-lg text-sm focus:outline-none" />
                    <button onClick={() => { const v = (document.getElementById('wGroupName') as HTMLInputElement)?.value.trim(); if (v) renameGroup(activeConv.id, v); }} className="px-2.5 py-1.5 bg-[#C9956B] text-white rounded-lg text-xs font-medium">Save</button>
                  </div>
                </div>
              )}
              <div className="flex-1 overflow-y-auto p-3">
                <h3 className="text-xs font-semibold text-gray-700 mb-1.5">Members ({activeConv.participants.length})</h3>
                {activeConv.participants.map(p => {
                  const m = profilesMap[p.user_id]; if (!m) return null;
                  return (
                    <div key={p.user_id} className="flex items-center gap-2.5 py-1.5">
                      <div className="relative"><div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: RC[m.role] || '#94A3B8' }}>{getInitials(m.full_name)}</div>{isOnline(m.last_seen_at) && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border-2 border-white" />}</div>
                      <div className="flex-1"><p className="text-xs font-medium">{m.full_name}{p.user_id === userId && <span className="text-[10px] text-gray-400"> (you)</span>}</p><p className="text-[10px] text-gray-400 capitalize">{p.role === 'admin' ? 'Admin' : m.role.replace('_', ' ')}</p></div>
                      {myRole === 'admin' && p.user_id !== userId && <button onClick={() => removeGroupMember(activeConv.id, p.user_id)} className="p-1 hover:bg-red-50 rounded text-red-400"><UserMinus size={14} /></button>}
                    </div>
                  );
                })}
                {myRole === 'admin' && (
                  <>
                    <h3 className="text-xs font-semibold text-gray-700 mt-3 mb-1.5">Add Members</h3>
                    {allUsers.filter(u => u.id !== userId && !activeConv.participants.some(p => p.user_id === u.id)).map(u => (
                      <button key={u.id} onClick={() => addGroupMember(activeConv.id, u.id)} className="w-full flex items-center gap-2.5 py-1.5 hover:bg-gray-50 rounded px-1">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: RC[u.role] || '#94A3B8' }}>{getInitials(u.full_name)}</div>
                        <span className="text-xs">{u.full_name}</span><UserPlus size={14} className="ml-auto text-[#C9956B]" />
                      </button>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Context Menu (global) ────────────────────────────────────── */}
      {contextMenu && (
        <div className="fixed bg-white shadow-xl rounded-xl border py-1 z-[70] min-w-[160px]" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setReplyTo(contextMenu.msg); setContextMenu(null); inputRef.current?.focus(); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2"><Reply size={12} /> Reply</button>
          <button onClick={() => { setForwardMsg(contextMenu.msg); setContextMenu(null); }} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2"><Forward size={12} /> Forward</button>
          <button onClick={() => togglePin(contextMenu.msg.id)} className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2">{pinnedMsgIds.has(contextMenu.msg.id) ? <><PinOff size={12} /> Unpin</> : <><Pin size={12} /> Pin</>}</button>
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
