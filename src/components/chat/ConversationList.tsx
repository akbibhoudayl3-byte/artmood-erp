'use client';

import {
  MessageCircle, Plus, Search, Users, User, Check, X, Minimize2,
  Archive, LogOut, MoreHorizontal, UserPlus, UserMinus,
} from 'lucide-react';
import type { Profile, Conversation, Message } from '@/lib/services/chat.service';

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

// ── Props ────────────────────────────────────────────────────────────────────
interface ConversationListProps {
  userId: string;
  conversations: Conversation[];
  allUsers: Profile[];
  profilesMap: Record<string, Profile>;
  totalUnread: number;
  loading: boolean;
  listTab: 'chats' | 'contacts';
  searchConv: string;
  searchContacts: string;
  searchUsers: string;
  showNewChat: boolean;
  showArchived: boolean;
  selectedUsers: string[];
  groupName: string;
  convMenu: string | null;
  forwardMsg: Message | null;
  showGroupSettings: boolean;
  activeConv: Conversation | undefined;

  // Handlers
  onClose: () => void;
  onSetListTab: (tab: 'chats' | 'contacts') => void;
  onSetSearchConv: (v: string) => void;
  onSetSearchContacts: (v: string) => void;
  onSetSearchUsers: (v: string) => void;
  onSelectConversation: (id: string) => void;
  onShowNewChat: (v: boolean) => void;
  onSetShowArchived: (v: boolean) => void;
  onSetSelectedUsers: (v: string[] | ((prev: string[]) => string[])) => void;
  onSetGroupName: (v: string) => void;
  onSetConvMenu: (v: string | null) => void;
  onStartDirectChat: (userId: string) => void;
  onCreateGroupChat: () => void;
  onArchiveConversation: (convId: string) => void;
  onUnarchiveConversation: (convId: string) => void;
  onDeleteConversation: (convId: string) => void;
  onForward: (targetConvId: string) => void;
  onSetForwardMsg: (msg: Message | null) => void;
  onSetShowGroupSettings: (v: boolean) => void;
  onAddGroupMember: (convId: string, memberId: string) => void;
  onRemoveGroupMember: (convId: string, memberId: string) => void;
  onRenameGroup: (convId: string, name: string) => void;
}

export default function ConversationList(props: ConversationListProps) {
  const {
    userId, conversations, allUsers, profilesMap, totalUnread, loading,
    listTab, searchConv, searchContacts, searchUsers,
    showNewChat, showArchived, selectedUsers, groupName, convMenu,
    forwardMsg, showGroupSettings, activeConv,
    onClose, onSetListTab, onSetSearchConv, onSetSearchContacts, onSetSearchUsers,
    onSelectConversation, onShowNewChat, onSetShowArchived,
    onSetSelectedUsers, onSetGroupName, onSetConvMenu,
    onStartDirectChat, onCreateGroupChat,
    onArchiveConversation, onUnarchiveConversation, onDeleteConversation,
    onForward, onSetForwardMsg,
    onSetShowGroupSettings, onAddGroupMember, onRemoveGroupMember, onRenameGroup,
  } = props;

  // ── Filtered data ─────────────────────────────────────────────────────
  const filteredConvs = conversations.filter(c => {
    if (showArchived ? !c.is_archived : c.is_archived) return false;
    if (!searchConv) return true;
    const n = (c.type === 'direct' ? c.other_user?.full_name || '' : c.name || '').toLowerCase();
    return n.includes(searchConv.toLowerCase());
  });
  const archivedCount = conversations.filter(c => c.is_archived).length;
  const filteredUsers = allUsers.filter(u => u.id !== userId && u.is_active && (!searchUsers || u.full_name.toLowerCase().includes(searchUsers.toLowerCase())));
  const myRole = activeConv?.participants.find(p => p.user_id === userId)?.role;

  // Contacts grouped by role
  const contactsByRole = allUsers
    .filter(u => u.id !== userId && u.is_active && (!searchContacts || u.full_name.toLowerCase().includes(searchContacts.toLowerCase())))
    .reduce<Record<string, Profile[]>>((acc, u) => {
      const role = u.role.replace(/_/g, ' ');
      if (!acc[role]) acc[role] = [];
      acc[role].push(u);
      return acc;
    }, {});
  Object.values(contactsByRole).forEach(users => users.sort((a, b) => (isOnline(b.last_seen_at) ? 1 : 0) - (isOnline(a.last_seen_at) ? 1 : 0)));
  const onlineCount = allUsers.filter(u => u.id !== userId && u.is_active && isOnline(u.last_seen_at)).length;

  // ── NEW CHAT MODAL ────────────────────────────────────────────────────
  if (showNewChat) {
    return (
      <>
        <div className="p-3 border-b bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#1a1a2e]">New Conversation</h2>
            <button onClick={() => { onShowNewChat(false); onSetSelectedUsers([]); onSetGroupName(''); }}><X size={20} className="text-gray-400" /></button>
          </div>
          <div className="flex gap-2 mt-2">
            <button onClick={() => onSetSelectedUsers([])} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${selectedUsers.length === 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}><User size={12} className="inline mr-0.5" /> Direct</button>
            <button onClick={() => onSetSelectedUsers(selectedUsers.length ? selectedUsers : ['__group__'])} className={`px-2.5 py-1 rounded-lg text-xs font-medium ${selectedUsers.length > 0 ? 'bg-[#C9956B]/10 text-[#C9956B]' : 'text-gray-500 hover:bg-gray-100'}`}><Users size={12} className="inline mr-0.5" /> Group</button>
          </div>
          {selectedUsers.length > 0 && <input type="text" placeholder="Group name..." value={groupName} onChange={e => onSetGroupName(e.target.value)} className="w-full mt-2 px-2.5 py-1.5 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" />}
          <div className="relative mt-2">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search users..." value={searchUsers} onChange={e => onSetSearchUsers(e.target.value)} className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C9956B]/30" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {filteredUsers.map(user => {
            const isSel = selectedUsers.includes(user.id);
            const online = isOnline(user.last_seen_at);
            return (
              <button key={user.id} onClick={() => {
                if (selectedUsers.length === 0) { onStartDirectChat(user.id); return; }
                onSetSelectedUsers((prev: string[]) => { const f = prev.filter(id => id !== '__group__'); return isSel ? f.filter(id => id !== user.id) : [...f, user.id]; });
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
            <button onClick={onCreateGroupChat} disabled={!groupName.trim()} className="w-full py-2 bg-[#C9956B] text-white rounded-xl text-sm font-medium hover:bg-[#B8845A] disabled:opacity-40">Create Group ({selectedUsers.length})</button>
          </div>
        )}
      </>
    );
  }

  // ── FORWARD VIEW ──────────────────────────────────────────────────────
  if (forwardMsg) {
    return (
      <>
        <div className="p-3 border-b flex items-center justify-between bg-white">
          <h2 className="text-base font-bold">Forward</h2>
          <button onClick={() => onSetForwardMsg(null)}><X size={20} className="text-gray-400" /></button>
        </div>
        <div className="px-3 py-1.5 border-b"><div className="bg-gray-50 rounded p-1.5 text-[11px] text-gray-600 truncate">{forwardMsg.content}</div></div>
        <div className="flex-1 overflow-y-auto p-1.5">
          {conversations.filter(c => c.id !== activeConv?.id).map(conv => (
            <button key={conv.id} onClick={() => onForward(conv.id)} className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl hover:bg-gray-50">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${conv.type === 'group' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : ''}`} style={conv.type === 'direct' ? { backgroundColor: RC[conv.other_user?.role || ''] || '#94A3B8' } : {}}>{conv.type === 'group' ? <Users size={12} /> : getInitials(conv.other_user?.full_name || '?')}</div>
              <span className="text-sm">{conv.type === 'direct' ? conv.other_user?.full_name : conv.name}</span>
            </button>
          ))}
        </div>
      </>
    );
  }

  // ── GROUP SETTINGS VIEW ───────────────────────────────────────────────
  if (showGroupSettings && activeConv?.type === 'group') {
    return (
      <>
        <div className="p-3 border-b flex items-center justify-between bg-white">
          <h2 className="text-base font-bold">Group Settings</h2>
          <button onClick={() => onSetShowGroupSettings(false)}><X size={20} className="text-gray-400" /></button>
        </div>
        {myRole === 'admin' && (
          <div className="p-3 border-b">
            <label className="text-[10px] font-medium text-gray-500">Group Name</label>
            <div className="flex gap-1.5 mt-1">
              <input type="text" defaultValue={activeConv.name || ''} id="wGroupName" className="flex-1 px-2.5 py-1.5 bg-gray-50 border rounded-lg text-sm focus:outline-none" />
              <button onClick={() => { const v = (document.getElementById('wGroupName') as HTMLInputElement)?.value.trim(); if (v) onRenameGroup(activeConv.id, v); }} className="px-2.5 py-1.5 bg-[#C9956B] text-white rounded-lg text-xs font-medium">Save</button>
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
                {myRole === 'admin' && p.user_id !== userId && <button onClick={() => onRemoveGroupMember(activeConv.id, p.user_id)} className="p-1 hover:bg-red-50 rounded text-red-400"><UserMinus size={14} /></button>}
              </div>
            );
          })}
          {myRole === 'admin' && (
            <>
              <h3 className="text-xs font-semibold text-gray-700 mt-3 mb-1.5">Add Members</h3>
              {allUsers.filter(u => u.id !== userId && !activeConv.participants.some(p => p.user_id === u.id)).map(u => (
                <button key={u.id} onClick={() => onAddGroupMember(activeConv.id, u.id)} className="w-full flex items-center gap-2.5 py-1.5 hover:bg-gray-50 rounded px-1">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ backgroundColor: RC[u.role] || '#94A3B8' }}>{getInitials(u.full_name)}</div>
                  <span className="text-xs">{u.full_name}</span><UserPlus size={14} className="ml-auto text-[#C9956B]" />
                </button>
              ))}
            </>
          )}
        </div>
      </>
    );
  }

  // ── MAIN LIST VIEW ────────────────────────────────────────────────────
  return (
    <>
      {/* Header */}
      <div className="p-3 border-b border-gray-100 bg-gradient-to-r from-[#C9956B] to-[#B8845A]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageCircle size={20} className="text-white" />
            <h2 className="text-base font-bold text-white">Chat</h2>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => onShowNewChat(true)} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><Plus size={18} /></button>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg text-white"><Minimize2 size={18} /></button>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-2">
          <button onClick={() => onSetListTab('chats')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${listTab === 'chats' ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/10'}`}>
            Chats {totalUnread > 0 && <span className="ml-1 px-1.5 py-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full">{totalUnread}</span>}
          </button>
          <button onClick={() => onSetListTab('contacts')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${listTab === 'contacts' ? 'bg-white/25 text-white' : 'text-white/60 hover:bg-white/10'}`}>
            Contacts <span className="ml-1 text-[10px] text-white/50">{onlineCount} online</span>
          </button>
        </div>
        {/* Search */}
        <div className="relative mt-2">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/60" />
          <input type="text" placeholder="Search..."
            value={listTab === 'chats' ? searchConv : searchContacts}
            onChange={e => listTab === 'chats' ? onSetSearchConv(e.target.value) : onSetSearchContacts(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-white/20 text-white placeholder-white/60 rounded-lg text-sm focus:outline-none focus:bg-white/30" />
        </div>
      </div>

      {/* CHATS TAB */}
      {listTab === 'chats' && (
        <div className="flex-1 overflow-y-auto">
          {archivedCount > 0 && (
            <button onClick={() => onSetShowArchived(!showArchived)}
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
                {!showArchived && <button onClick={() => onShowNewChat(true)} className="mt-1 text-[#C9956B] text-sm font-medium">Start a chat</button>}
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
                  <button onClick={() => { onSelectConversation(conv.id); onSetConvMenu(null); }}
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
                  <button onClick={(e) => { e.stopPropagation(); onSetConvMenu(convMenu === conv.id ? null : conv.id); }}
                    className="p-1.5 mr-2 hover:bg-gray-200 rounded-lg text-gray-400 opacity-0 group-hover/conv:opacity-100 transition-opacity shrink-0">
                    <MoreHorizontal size={16} />
                  </button>
                  {convMenu === conv.id && (
                    <div className="absolute right-2 top-10 bg-white shadow-xl rounded-xl border py-1 z-30 min-w-[140px]" onClick={e => e.stopPropagation()}>
                      {conv.is_archived ? (
                        <button onClick={() => onUnarchiveConversation(conv.id)}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                          <Archive size={12} /> Unarchive
                        </button>
                      ) : (
                        <button onClick={() => onArchiveConversation(conv.id)}
                          className="w-full px-3 py-1.5 text-left text-xs hover:bg-gray-50 flex items-center gap-2 text-gray-700">
                          <Archive size={12} /> Archive
                        </button>
                      )}
                      <button onClick={() => onDeleteConversation(conv.id)}
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
                  <button key={user.id} onClick={() => { onStartDirectChat(user.id); }}
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
  );
}
