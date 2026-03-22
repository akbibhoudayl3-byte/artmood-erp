'use client';

import { type RefObject } from 'react';
import {
  Send, Search, ArrowLeft, Users, Check, CheckCheck,
  X, Paperclip, Mic, FileText, Smile, Reply,
  Pin, Forward, MoreVertical,
  Play, Pause, Download, Minimize2, Settings,
  Phone, Video, Camera, MapPin, PhoneOff,
} from 'lucide-react';
import type { Profile, Conversation, Message, Reaction } from '@/lib/services/chat.service';

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Escape HTML entities to prevent XSS when rendering user-generated content. */
function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function getInitials(n: string) { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function isOnline(ls?: string) { return ls ? Date.now() - new Date(ls).getTime() < 300000 : false; }
function fmtSize(b: number) { return b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }
function fmtDur(s: number) { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }
function timeAgo(d: string): string {
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'now'; if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const dd = Math.floor(h / 24); if (dd < 7) return `${dd}d`;
  return new Date(d).toLocaleDateString();
}

const RC: Record<string, string> = {
  ceo: '#C9956B', commercial_manager: '#3B82F6', designer: '#8B5CF6',
  workshop_manager: '#F59E0B', workshop_worker: '#10B981', installer: '#EF4444',
  hr_manager: '#EC4899', community_manager: '#06B6D4', owner_admin: '#C9956B',
  operations_manager: '#6366F1', logistics: '#84CC16', worker: '#10B981',
};

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🎉', '👏'];

// ── Props ────────────────────────────────────────────────────────────────────
interface MessageViewProps {
  userId: string;
  profileFullName: string;
  activeConv: Conversation;
  messages: Message[];
  profilesMap: Record<string, Profile>;
  allUsers: Profile[];
  reactions: Record<string, Reaction[]>;
  pinnedMsgIds: Set<string>;
  newMessage: string;
  sending: boolean;
  loadingMessages: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  replyTo: Message | null;
  editingMsg: Message | null;
  editText: string;
  showEmojiFor: string | null;
  contextMenu: { msg: Message; x: number; y: number } | null;
  showSearchMessages: boolean;
  searchMessages: string;
  showPinnedMessages: boolean;
  typingUsers: string[];
  uploading: boolean;
  isRecording: boolean;
  recordingTime: number;
  playingVoice: string | null;
  sendingLocation: boolean;
  showMentions: boolean;
  mentionQuery: string;
  showCameraPreview: boolean;
  callState: 'idle' | 'calling' | 'ringing' | 'active';

  // Refs passed from parent
  messagesEndRef: RefObject<HTMLDivElement | null>;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  inputRef: RefObject<HTMLInputElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  cameraInputRef: RefObject<HTMLInputElement | null>;
  videoPreviewRef: RefObject<HTMLVideoElement | null>;

  // Handlers
  onClose: () => void;
  onBack: () => void;
  onSetNewMessage: (v: string) => void;
  onSend: () => void;
  onEditSave: () => void;
  onSetReplyTo: (msg: Message | null) => void;
  onSetEditingMsg: (msg: Message | null) => void;
  onSetEditText: (v: string) => void;
  onSetShowEmojiFor: (id: string | null) => void;
  onSetContextMenu: (v: { msg: Message; x: number; y: number } | null) => void;
  onDeleteMsg: (id: string) => void;
  onReaction: (msgId: string, emoji: string) => void;
  onTogglePin: (msgId: string) => void;
  onForwardMsg: (msg: Message) => void;
  onSetShowSearchMessages: (v: boolean) => void;
  onSetSearchMessages: (v: string) => void;
  onSetShowPinnedMessages: (v: boolean) => void;
  onSetShowGroupSettings: (v: boolean) => void;
  onHandleMessagesScroll: () => void;
  onHandleInputChange: (val: string) => void;
  onHandleInputKeyDown: (e: React.KeyboardEvent) => void;
  onInsertMention: (user: Profile) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCameraClick: () => void;
  onSendLocation: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  onPlayVoice: (url: string, msgId: string) => void;
  onStartCall: (type: 'voice' | 'video') => void;
  onCloseCameraPreview: () => void;
  onCapturePhoto: () => void;
}

export default function MessageView(props: MessageViewProps) {
  const {
    userId, profileFullName, activeConv, messages, profilesMap, allUsers, reactions, pinnedMsgIds,
    newMessage, sending, loadingMessages, loadingMore, hasMore,
    replyTo, editingMsg, editText,
    showEmojiFor, contextMenu,
    showSearchMessages, searchMessages, showPinnedMessages,
    typingUsers, uploading, isRecording, recordingTime, playingVoice,
    sendingLocation, showMentions, mentionQuery,
    showCameraPreview, callState,
    messagesEndRef, messagesContainerRef, inputRef, fileInputRef, cameraInputRef, videoPreviewRef,
    onClose, onBack, onSetNewMessage, onSend, onEditSave,
    onSetReplyTo, onSetEditingMsg, onSetEditText,
    onSetShowEmojiFor, onSetContextMenu,
    onDeleteMsg, onReaction, onTogglePin, onForwardMsg,
    onSetShowSearchMessages, onSetSearchMessages,
    onSetShowPinnedMessages, onSetShowGroupSettings,
    onHandleMessagesScroll, onHandleInputChange, onHandleInputKeyDown,
    onInsertMention, onFileUpload, onCameraClick, onSendLocation,
    onStartRecording, onStopRecording, onCancelRecording, onPlayVoice,
    onStartCall, onCloseCameraPreview, onCapturePhoto,
  } = props;

  const filteredMessages = showSearchMessages && searchMessages
    ? messages.filter(m => m.content.toLowerCase().includes(searchMessages.toLowerCase()))
    : messages;
  const pinnedMessages = messages.filter(m => pinnedMsgIds.has(m.id));

  return (
    <>
      {/* Camera Preview Overlay */}
      {showCameraPreview && (
        <div className="fixed inset-0 z-[80] bg-black flex flex-col items-center justify-center">
          <video ref={videoPreviewRef} autoPlay playsInline className="max-w-full max-h-[80vh] rounded-xl" />
          <div className="flex items-center gap-6 mt-6">
            <button onClick={onCloseCameraPreview} className="w-14 h-14 bg-white/20 text-white rounded-full flex items-center justify-center"><X size={28} /></button>
            <button onClick={onCapturePhoto} className="w-16 h-16 bg-white rounded-full flex items-center justify-center border-4 border-white/50 hover:scale-105 transition-transform">
              <div className="w-12 h-12 bg-[#C9956B] rounded-full" />
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="h-14 px-3 flex items-center gap-2.5 bg-white border-b border-gray-200 shrink-0">
        <button onClick={onBack} className="p-1.5 hover:bg-gray-100 rounded-lg"><ArrowLeft size={18} /></button>
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
          {activeConv.type === 'direct' && callState === 'idle' && (
            <>
              <button onClick={() => onStartCall('voice')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400" title="Voice call"><Phone size={16} /></button>
              <button onClick={() => onStartCall('video')} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400" title="Video call"><Video size={16} /></button>
            </>
          )}
          <button onClick={() => onSetShowSearchMessages(!showSearchMessages)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Search size={16} /></button>
          {pinnedMessages.length > 0 && <button onClick={() => onSetShowPinnedMessages(!showPinnedMessages)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 relative"><Pin size={16} /><span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-[#C9956B] text-white text-[8px] font-bold rounded-full flex items-center justify-center">{pinnedMessages.length}</span></button>}
          {activeConv.type === 'group' && <button onClick={() => onSetShowGroupSettings(true)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Settings size={16} /></button>}
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400"><Minimize2 size={16} /></button>
        </div>
      </div>

      {showSearchMessages && (
        <div className="px-3 py-1.5 bg-white border-b flex items-center gap-2">
          <Search size={14} className="text-gray-400" />
          <input type="text" placeholder="Search..." value={searchMessages} onChange={e => onSetSearchMessages(e.target.value)} autoFocus className="flex-1 text-xs bg-transparent focus:outline-none" />
          <button onClick={() => { onSetShowSearchMessages(false); onSetSearchMessages(''); }}><X size={14} className="text-gray-400" /></button>
        </div>
      )}
      {showPinnedMessages && pinnedMessages.length > 0 && (
        <div className="px-3 py-1.5 bg-amber-50 border-b border-amber-200 max-h-24 overflow-y-auto">
          <div className="flex items-center gap-1 mb-0.5"><Pin size={12} className="text-amber-600" /><span className="text-[10px] font-semibold text-amber-700">Pinned</span><button onClick={() => onSetShowPinnedMessages(false)} className="ml-auto"><X size={12} className="text-amber-600" /></button></div>
          {pinnedMessages.map(pm => <div key={pm.id} className="text-[10px] text-amber-800 truncate"><b>{profilesMap[pm.sender_id]?.full_name?.split(' ')[0]}:</b> {pm.content}</div>)}
        </div>
      )}
      {typingUsers.length > 0 && <div className="px-3 py-1 bg-white border-b"><p className="text-[10px] text-gray-400 italic">{typingUsers.map(id => profilesMap[id]?.full_name?.split(' ')[0]).filter(Boolean).join(', ')} typing...</p></div>}

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={onHandleMessagesScroll} className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5 bg-[#F8F9FC]">
        {loadingMessages ? <div className="flex items-center justify-center h-full text-gray-400 text-xs">Loading...</div> : (
          <>
            {loadingMore && <div className="text-center text-[10px] text-gray-400 py-1">Loading older...</div>}
            {filteredMessages.length === 0 ? <div className="flex items-center justify-center h-full text-gray-400 text-xs">No messages yet</div> :
              filteredMessages.map((msg, i) => {
                const isMe = msg.sender_id === userId;
                const sender = profilesMap[msg.sender_id];
                const showAvatar = !isMe && (i === 0 || filteredMessages[i - 1]?.sender_id !== msg.sender_id);
                const showName = !isMe && activeConv.type === 'group' && showAvatar;
                const msgReactions = reactions[msg.id] || [];
                const isPinned = pinnedMsgIds.has(msg.id);
                const replyMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
                const isMentioned = msg.content.includes(`@${profileFullName}`);
                const readBy = activeConv.participants.filter(p => p.user_id !== userId && p.last_read_at && new Date(p.last_read_at) >= new Date(msg.created_at)) || [];
                const isCallMsg = (msg.content.startsWith('Missed ') && (msg.content.includes('call') || msg.content.includes('Call'))) || msg.content.startsWith('Voice call -') || msg.content.startsWith('Video call -');

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
                    onContextMenu={e => { e.preventDefault(); e.stopPropagation(); onSetContextMenu({ msg, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 300) }); }}>
                    {!isMe && <div className="w-7 mr-1.5 shrink-0">{showAvatar && <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: RC[sender?.role || ''] || '#94A3B8' }}>{getInitials(sender?.full_name || '?')}</div>}</div>}
                    <div className={`max-w-[80%] ${isMe ? 'items-end' : 'items-start'}`}>
                      {showName && <p className="text-[9px] font-medium text-gray-400 mb-0.5 ml-1">{sender?.full_name?.split(' ')[0]}</p>}
                      {msg.forwarded_from && <p className="text-[9px] text-gray-400 mb-0.5 ml-1 flex items-center gap-0.5"><Forward size={9} /> Forwarded</p>}
                      {replyMsg && <div className={`text-[10px] px-2 py-1 mb-0.5 rounded-t border-l-2 border-[#C9956B] ${isMe ? 'bg-[#B8845A]/30 text-white/80' : 'bg-gray-100 text-gray-500'}`}><b>{profilesMap[replyMsg.sender_id]?.full_name?.split(' ')[0]}</b><p className="truncate">{replyMsg.is_deleted ? 'Deleted' : replyMsg.content}</p></div>}

                      <div className={`relative px-3 py-1.5 rounded-2xl text-[13px] leading-relaxed break-words ${isMe ? 'bg-[#C9956B] text-white rounded-br-md' : 'bg-white text-[#1a1a2e] rounded-bl-md shadow-sm border border-gray-100'} ${isPinned ? 'ring-1 ring-amber-400' : ''}`}>
                        {isPinned && <Pin size={8} className={`absolute top-0.5 right-0.5 ${isMe ? 'text-white/50' : 'text-amber-500'}`} />}
                        {msg.is_deleted ? <span className="italic opacity-60 text-xs">Deleted</span> :
                          msg.latitude && msg.longitude ? (
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
                              <button onClick={() => onPlayVoice(msg.file_url!, msg.id)} className={`w-7 h-7 rounded-full flex items-center justify-center ${isMe ? 'bg-white/20' : 'bg-gray-100'}`}>{playingVoice === msg.id ? <Pause size={12} /> : <Play size={12} />}</button>
                              <div className="flex-1"><div className="h-1 bg-white/30 rounded-full"><div className="h-1 bg-white/70 rounded-full w-1/2" /></div><p className="text-[9px] mt-0.5 opacity-70">{fmtDur(msg.voice_duration || 0)}</p></div>
                            </div>
                          ) : msg.file_url ? (
                            msg.file_type?.startsWith('image/') ? <div><img src={msg.file_url} alt="" className="max-w-[200px] rounded-lg mb-0.5 cursor-pointer" onClick={() => window.open(msg.file_url, '_blank')} />{msg.content && msg.content !== msg.file_name && <p>{msg.content}</p>}</div>
                            : <a href={msg.file_url} target="_blank" rel="noopener noreferrer" className={`flex items-center gap-1.5 ${isMe ? 'text-white' : 'text-[#1a1a2e]'}`}><FileText size={16} /><div className="min-w-0"><p className="text-xs font-medium truncate">{msg.file_name}</p><p className="text-[9px] opacity-70">{fmtSize(msg.file_size || 0)}</p></div><Download size={14} className="opacity-70" /></a>
                          ) : <span dangerouslySetInnerHTML={{ __html: escapeHtml(msg.content).replace(/@(\S+\s?\S*)/g, '<span class="font-bold text-amber-300">@$1</span>') }} />}
                        {msg.edited_at && !msg.is_deleted && <span className="text-[8px] opacity-50 ml-0.5">(edited)</span>}

                        <div className={`absolute ${isMe ? '-left-16' : '-right-16'} top-0 hidden group-hover/msg:flex items-center gap-0 bg-white shadow rounded-lg p-0.5 border z-10`}>
                          <button onClick={e => { e.stopPropagation(); onSetShowEmojiFor(showEmojiFor === msg.id ? null : msg.id); }} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Smile size={12} /></button>
                          <button onClick={() => { onSetReplyTo(msg); inputRef.current?.focus(); }} className="p-1 hover:bg-gray-100 rounded text-gray-500"><Reply size={12} /></button>
                          <button onClick={e => { e.stopPropagation(); onSetContextMenu({ msg, x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 300) }); }} className="p-1 hover:bg-gray-100 rounded text-gray-500"><MoreVertical size={12} /></button>
                        </div>
                      </div>

                      {showEmojiFor === msg.id && <div className={`flex gap-0.5 mt-0.5 p-1 bg-white shadow-lg rounded-xl border z-20 ${isMe ? 'justify-end' : ''}`} onClick={e => e.stopPropagation()}>{EMOJIS.map(em => <button key={em} onClick={() => onReaction(msg.id, em)} className="w-6 h-6 hover:bg-gray-100 rounded-lg flex items-center justify-center text-xs hover:scale-125 transition-transform">{em}</button>)}</div>}
                      {msgReactions.length > 0 && <div className={`flex flex-wrap gap-0.5 mt-0.5 ${isMe ? 'justify-end' : ''}`}>{Object.entries(msgReactions.reduce<Record<string, string[]>>((a, r) => { if (!a[r.emoji]) a[r.emoji] = []; a[r.emoji].push(r.user_id); return a; }, {})).map(([emoji, users]) => <button key={emoji} onClick={() => onReaction(msg.id, emoji)} className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full text-[10px] border ${users.includes(userId || '') ? 'bg-[#C9956B]/10 border-[#C9956B]/30' : 'bg-gray-50 border-gray-200'}`}><span>{emoji}</span><span className="text-gray-500">{users.length}</span></button>)}</div>}
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
          <button onClick={() => { onSetReplyTo(null); onSetEditingMsg(null); onSetEditText(''); }}><X size={14} className="text-gray-400" /></button>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-2 bg-white border-t shrink-0">
        {showMentions && activeConv.type === 'group' && (
          <div className="mb-1.5 bg-white shadow-lg rounded-xl border max-h-28 overflow-y-auto">
            {allUsers.filter(u => u.id !== userId && u.full_name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 4).map(u => (
              <button key={u.id} onClick={() => onInsertMention(u)} className="w-full px-2.5 py-1.5 text-left hover:bg-gray-50 flex items-center gap-1.5 text-xs">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[7px] font-bold" style={{ backgroundColor: RC[u.role] || '#94A3B8' }}>{getInitials(u.full_name)}</div>
                {u.full_name}
              </button>
            ))}
          </div>
        )}
        {isRecording ? (
          <div className="flex items-center gap-2">
            <button onClick={onCancelRecording} className="p-1.5 hover:bg-red-50 rounded-lg text-red-500"><X size={18} /></button>
            <div className="flex-1 flex items-center gap-2"><div className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" /><span className="text-xs font-medium text-red-600">{fmtDur(recordingTime)}</span><div className="flex-1 h-1 bg-red-100 rounded-full" /></div>
            <button onClick={onStopRecording} className="w-9 h-9 bg-[#C9956B] text-white rounded-xl flex items-center justify-center"><Send size={16} /></button>
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (editingMsg) onEditSave(); else onSend(); }} className="flex items-center gap-1">
            <input type="file" ref={fileInputRef} onChange={onFileUpload} className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" />
            <input type="file" ref={cameraInputRef} onChange={onFileUpload} className="hidden" accept="image/*" capture="environment" />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-40" title="Attach file">
              {uploading ? <div className="w-4 h-4 border-2 border-gray-300 border-t-[#C9956B] rounded-full animate-spin" /> : <Paperclip size={17} />}
            </button>
            <button type="button" onClick={onCameraClick} disabled={uploading} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-40" title="Take photo">
              <Camera size={17} />
            </button>
            <button type="button" onClick={onSendLocation} disabled={sendingLocation} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 disabled:opacity-40" title="Share location">
              {sendingLocation ? <div className="w-4 h-4 border-2 border-gray-300 border-t-[#C9956B] rounded-full animate-spin" /> : <MapPin size={17} />}
            </button>
            <input ref={inputRef} type="text" placeholder={editingMsg ? 'Edit...' : 'Message...'} value={editingMsg ? editText : newMessage}
              onChange={e => editingMsg ? onSetEditText(e.target.value) : onHandleInputChange(e.target.value)} onKeyDown={onHandleInputKeyDown}
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" autoFocus />
            {(editingMsg ? editText.trim() : newMessage.trim()) ? (
              <button type="submit" disabled={sending} className="w-9 h-9 bg-[#C9956B] text-white rounded-xl flex items-center justify-center hover:bg-[#B8845A] disabled:opacity-40"><Send size={16} /></button>
            ) : (
              <button type="button" onClick={onStartRecording} className="w-9 h-9 bg-gray-100 text-gray-600 rounded-xl flex items-center justify-center hover:bg-gray-200"><Mic size={16} /></button>
            )}
          </form>
        )}
      </div>
    </>
  );
}

