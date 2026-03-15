'use client';

import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Phone, PhoneOff, Video, VideoOff,
  Mic, MicOff, Volume2, VolumeX,
} from 'lucide-react';
import type { Profile } from '@/lib/services/chat.service';
import { insertCallRecord, insertCallMessage } from '@/lib/services/chat.service';

// ── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(n: string) { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function fmtDur(s: number) { return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`; }

const RC: Record<string, string> = {
  ceo: '#C9956B', commercial_manager: '#3B82F6', designer: '#8B5CF6',
  workshop_manager: '#F59E0B', workshop_worker: '#10B981', installer: '#EF4444',
  hr_manager: '#EC4899', community_manager: '#06B6D4', owner_admin: '#C9956B',
  operations_manager: '#6366F1', logistics: '#84CC16', worker: '#10B981',
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// ── Props ────────────────────────────────────────────────────────────────────
interface CallManagerProps {
  userId: string;
  profilesMap: Record<string, Profile>;
  conversations: { id: string; type: string; participants: { user_id: string }[] }[];
  activeConvId: string | null;

  // Call state (managed by parent)
  callState: 'idle' | 'calling' | 'ringing' | 'active';
  callType: 'voice' | 'video';
  callPeer: Profile | null;
  callConvId: string | null;
  callDuration: number;
  isMuted: boolean;
  isSpeaker: boolean;
  isVideoOn: boolean;
  incomingCall: { from: string; type: 'voice' | 'video'; convId: string } | null;

  // State setters
  onSetCallState: (v: 'idle' | 'calling' | 'ringing' | 'active') => void;
  onSetCallType: (v: 'voice' | 'video') => void;
  onSetCallPeer: (v: Profile | null) => void;
  onSetCallConvId: (v: string | null) => void;
  onSetCallDuration: (v: number | ((prev: number) => number)) => void;
  onSetIsMuted: (v: boolean) => void;
  onSetIsSpeaker: (v: boolean) => void;
  onSetIsVideoOn: (v: boolean) => void;
  onSetIncomingCall: (v: { from: string; type: 'voice' | 'video'; convId: string } | null) => void;
}

export interface CallManagerHandle {
  startCall: (type: 'voice' | 'video') => void;
}

const CallManager = forwardRef<CallManagerHandle, CallManagerProps>(function CallManager(props, ref) {
  const {
    userId, profilesMap, conversations, activeConvId,
    callState, callType, callPeer, callConvId, callDuration,
    isMuted, isSpeaker, isVideoOn, incomingCall,
    onSetCallState, onSetCallType, onSetCallPeer, onSetCallConvId, onSetCallDuration,
    onSetIsMuted, onSetIsSpeaker, onSetIsVideoOn, onSetIncomingCall,
  } = props;

  const supabase = createClient();

  // ── WebRTC Refs ───────────────────────────────────────────────────────
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const callChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const ringtoneRef = useRef<HTMLAudioElement | null>(null);

  // ── Cleanup ───────────────────────────────────────────────────────────
  const cleanupCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = null;
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current = null; }
    onSetCallState('idle');
    onSetCallDuration(0);
    onSetIsMuted(false);
    onSetIsVideoOn(true);
    onSetCallPeer(null);
    onSetCallConvId(null);
    onSetIncomingCall(null);
  }, [onSetCallState, onSetCallDuration, onSetIsMuted, onSetIsVideoOn, onSetCallPeer, onSetCallConvId, onSetIncomingCall]);

  // ── Start Call ────────────────────────────────────────────────────────
  const startCall = useCallback(async (type: 'voice' | 'video') => {
    if (!activeConvId || callState !== 'idle') return;
    const conv = conversations.find(c => c.id === activeConvId);
    if (!conv || conv.type !== 'direct') return;
    const peerId = conv.participants.find(p => p.user_id !== userId)?.user_id;
    if (!peerId) return;
    const peer = profilesMap[peerId];
    if (!peer) return;

    onSetCallType(type);
    onSetCallPeer(peer);
    onSetCallConvId(activeConvId);
    onSetCallState('calling');
    onSetIsVideoOn(type === 'video');

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
        onSetCallState('active');
        if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current = null; }
        callTimerRef.current = setInterval(() => onSetCallDuration(d => d + 1), 1000);
      });

      ch.on('broadcast', { event: 'ice-candidate' }, async ({ payload }) => {
        if (payload.from === userId) return;
        try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch {}
      });

      ch.on('broadcast', { event: 'call-reject' }, ({ payload }) => {
        if (payload.from === userId) return;
        insertCallMessage(activeConvId, userId, `Missed ${type} call`);
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

      await insertCallRecord(activeConvId, userId, peerId, type, 'ringing');

      // Timeout after 30s
      setTimeout(() => {
        if (peerConnectionRef.current && !callTimerRef.current) {
          insertCallMessage(activeConvId, userId, `Missed ${type} call`);
          cleanupCall();
        }
      }, 30000);

    } catch (err) {
      console.error('Call error:', err);
      cleanupCall();
    }
  }, [activeConvId, callState, conversations, userId, profilesMap, supabase, cleanupCall, onSetCallType, onSetCallPeer, onSetCallConvId, onSetCallState, onSetIsVideoOn, onSetCallDuration]);

  // ── Answer Call ───────────────────────────────────────────────────────
  const answerCall = useCallback(async () => {
    if (!incomingCall) return;
    const { from, type, convId } = incomingCall;
    onSetCallType(type);
    onSetCallPeer(profilesMap[from] || null);
    onSetCallConvId(convId);
    onSetCallState('active');
    onSetIsVideoOn(type === 'video');
    onSetIncomingCall(null);
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

      const storedOffer = (ch as unknown as { _offer?: RTCSessionDescriptionInit })._offer;
      if (storedOffer) {
        await pc.setRemoteDescription(new RTCSessionDescription(storedOffer));
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      ch.send({ type: 'broadcast', event: 'call-answer', payload: { sdp: answer, from: userId } });

      callTimerRef.current = setInterval(() => onSetCallDuration(d => d + 1), 1000);
    } catch (err) {
      console.error('Answer error:', err);
      cleanupCall();
    }
  }, [incomingCall, userId, profilesMap, supabase, cleanupCall, onSetCallType, onSetCallPeer, onSetCallConvId, onSetCallState, onSetIsVideoOn, onSetIncomingCall, onSetCallDuration]);

  // ── Reject Call ───────────────────────────────────────────────────────
  const rejectCall = useCallback(() => {
    if (!incomingCall) return;
    const ch = callChannelRef.current;
    if (ch) {
      ch.send({ type: 'broadcast', event: 'call-reject', payload: { from: userId } });
    }
    if (ringtoneRef.current) { ringtoneRef.current.pause(); ringtoneRef.current = null; }
    onSetIncomingCall(null);
  }, [incomingCall, userId, onSetIncomingCall]);

  // ── End Call ──────────────────────────────────────────────────────────
  const endCall = useCallback(() => {
    const ch = callChannelRef.current;
    if (ch) {
      ch.send({ type: 'broadcast', event: 'call-end', payload: { from: userId, duration: callDuration } });
    }
    if (callConvId && callDuration > 0) {
      insertCallMessage(callConvId, userId, `${callType === 'video' ? 'Video' : 'Voice'} call - ${fmtDur(callDuration)}`);
    }
    cleanupCall();
  }, [userId, callDuration, callConvId, callType, cleanupCall]);

  // ── Toggle Mute ──────────────────────────────────────────────────────
  const toggleMute = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) { audioTrack.enabled = !audioTrack.enabled; onSetIsMuted(!audioTrack.enabled); }
  }, [onSetIsMuted]);

  // ── Toggle Video ─────────────────────────────────────────────────────
  const toggleVideo = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks()[0];
    if (videoTrack) { videoTrack.enabled = !videoTrack.enabled; onSetIsVideoOn(videoTrack.enabled); }
  }, [onSetIsVideoOn]);

  // ── Listen for incoming calls ────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`calls:${userId}`, { config: { broadcast: { self: false } } });

    ch.on('broadcast', { event: 'call-offer' }, ({ payload }) => {
      if (payload.from === userId) return;
      if (callState !== 'idle') return;

      const callCh = supabase.channel(`call:${payload.convId}`, { config: { broadcast: { self: false } } });
      (callCh as unknown as { _offer?: RTCSessionDescriptionInit })._offer = payload.sdp;
      callChannelRef.current = callCh;

      callCh.on('broadcast', { event: 'call-end' }, () => { cleanupCall(); });
      callCh.on('broadcast', { event: 'ice-candidate' }, () => { /* handled after answer */ });
      callCh.subscribe();

      onSetIncomingCall({ from: payload.from, type: payload.type, convId: payload.convId });

      try {
        const ring = new Audio('/notification.mp3');
        ring.loop = true;
        ring.play().catch(() => {});
        ringtoneRef.current = ring;
      } catch {}
    });

    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, supabase, callState, cleanupCall, onSetIncomingCall]);

  // ── Broadcast call-offer to the peer's personal channel ──────────────
  useEffect(() => {
    if (callState !== 'calling' || !callPeer || !callConvId) return;
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

  // Expose startCall to parent via imperative handle
  useImperativeHandle(ref, () => ({
    startCall: (type: 'voice' | 'video') => startCall(type),
  }), [startCall]);

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Incoming Call Overlay */}
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

      {/* Active Call Overlay */}
      {(callState === 'calling' || callState === 'active') && (
        <div className="fixed inset-0 z-[75] bg-gradient-to-b from-[#1a1a2e] to-[#0f0f23] flex flex-col items-center justify-between py-12">
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
            <button onClick={() => onSetIsSpeaker(!isSpeaker)}
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
    </>
  );
});

export default CallManager;
