'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Button from '@/components/ui/Button';
import { Camera, X, RotateCcw, Check, FlipHorizontal } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

export default function CameraCapture({ onCapture, onClose }: CameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraReady, setCameraReady] = useState(false);

  const startCamera = useCallback(async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => setCameraReady(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
    }
  }, [facingMode]);

  useEffect(() => {
    startCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [startCamera]);

  const capture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setCaptured(canvas.toDataURL('image/jpeg', 0.9));
  };

  const retake = () => {
    setCaptured(null);
  };

  const confirm = () => {
    if (!canvasRef.current) return;
    canvasRef.current.toBlob(blob => {
      if (blob) {
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
      }
    }, 'image/jpeg', 0.9);
  };

  const toggleCamera = () => {
    setCameraReady(false);
    setFacingMode(f => f === 'environment' ? 'user' : 'environment');
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 bg-black/50 absolute top-0 left-0 right-0 z-10">
        <button onClick={onClose} className="text-white p-2">
          <X size={24} />
        </button>
        <span className="text-white font-medium">Document Scanner</span>
        <button onClick={toggleCamera} className="text-white p-2">
          <FlipHorizontal size={24} />
        </button>
      </div>

      {/* Camera / Preview */}
      <div className="flex-1 flex items-center justify-center bg-black">
        {captured ? (
          <img src={captured} alt="Captured" className="max-w-full max-h-full object-contain" />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-w-full max-h-full object-contain"
          />
        )}
      </div>

      {/* Guide overlay when camera is active */}
      {!captured && cameraReady && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="border-2 border-white/40 rounded-lg" style={{ width: '85%', height: '60%' }}>
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      {/* Controls */}
      <div className="flex items-center justify-center gap-6 p-6 bg-black/50 absolute bottom-0 left-0 right-0">
        {captured ? (
          <>
            <button
              onClick={retake}
              className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white"
            >
              <RotateCcw size={28} />
            </button>
            <button
              onClick={confirm}
              className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center text-white"
            >
              <Check size={36} />
            </button>
          </>
        ) : (
          <button
            onClick={capture}
            className="w-20 h-20 rounded-full border-4 border-white flex items-center justify-center"
            disabled={!cameraReady}
          >
            <div className="w-16 h-16 rounded-full bg-white" />
          </button>
        )}
      </div>
    </div>
  );
}
