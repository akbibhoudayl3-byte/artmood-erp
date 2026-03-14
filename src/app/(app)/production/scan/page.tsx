'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/lib/hooks/useAuth';
import Card, { CardContent } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import StatusBadge from '@/components/ui/StatusBadge';
import Input from '@/components/ui/Input';
import { PRODUCTION_STATIONS } from '@/lib/constants';
import { ArrowLeft, ScanLine, CheckCircle, AlertCircle, Camera, X } from 'lucide-react';
import { useLocale } from '@/lib/hooks/useLocale';
import { RoleGuard } from '@/components/auth/RoleGuard';

export default function ProductionScanPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const { t } = useLocale();
  const supabase = createClient();

  const [partCode, setPartCode] = useState('');
  const [part, setPart] = useState<{
    id: string; part_name: string; part_code: string;
    current_station: string; production_order_id: string;
  } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Camera scanning
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => { stopCamera(); };
  }, [stopCamera]);

  async function startCamera() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      // Use BarcodeDetector API if available
      if ('BarcodeDetector' in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39'] });
        scanIntervalRef.current = setInterval(async () => {
          if (!videoRef.current) return;
          try {
            const barcodes = await detector.detect(videoRef.current);
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue;
              if (code) {
                setPartCode(code);
                stopCamera();
                lookupPartByCode(code);
              }
            }
          } catch {
            // Scan frame failed, continue
          }
        }, 500);
      }
    } catch {
      setError('Camera access denied. Please allow camera permissions or enter code manually.');
    }
  }

  async function lookupPartByCode(code: string) {
    if (!code.trim()) return;
    setError('');
    setPart(null);
    setSuccess(false);

    const { data, error: err } = await supabase
      .from('production_parts')
      .select('id, part_name, part_code, current_station, production_order_id')
      .eq('part_code', code.trim().toUpperCase())
      .single();

    if (err || !data) {
      setError(t('production.part_not_found'));
      return;
    }
    setPart(data);
  }

  async function lookupPart() {
    await lookupPartByCode(partCode);
  }

  async function moveToStation(station: string) {
    if (!part) return;
    setScanning(true);

    await supabase.from('production_scans').insert({
      part_id: part.id,
      station,
      scanned_by: profile?.id,
    });

    setPart({ ...part, current_station: station });
    setSuccess(true);
    setScanning(false);

    setTimeout(() => {
      setSuccess(false);
      setPart(null);
      setPartCode('');
    }, 2000);
  }

  const currentIndex = PRODUCTION_STATIONS.findIndex(s => s.key === part?.current_station);
  const nextStations = PRODUCTION_STATIONS.filter((_, i) => i > currentIndex);

  return (
    <RoleGuard allowedRoles={['ceo', 'workshop_manager', 'workshop_worker'] as any[]}>
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => router.push('/production')} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl font-bold text-gray-900">{t('production.scan_part')}</h1>
      </div>

      {/* Camera Scanner */}
      {cameraActive ? (
        <Card>
          <CardContent>
            <div className="relative">
              <video
                ref={videoRef}
                className="w-full rounded-xl bg-black"
                playsInline
                muted
              />
              {/* Scan overlay */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-48 h-48 border-2 border-white/80 rounded-2xl" />
              </div>
              <button
                onClick={stopCamera}
                className="absolute top-3 right-3 p-2 bg-black/50 text-white rounded-full hover:bg-black/70"
              >
                <X size={20} />
              </button>
            </div>
            <p className="text-center text-sm text-gray-500 mt-3">Point camera at QR code</p>
            {!('BarcodeDetector' in (typeof window !== 'undefined' ? window : {})) && (
              <p className="text-center text-xs text-orange-500 mt-1">
                Auto-scan not supported in this browser. Enter code manually below.
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <div className="text-center mb-4">
              <button
                onClick={startCamera}
                className="w-24 h-24 mx-auto bg-gradient-to-b from-[#1E2F52] to-[#1B2A4A] rounded-2xl flex items-center justify-center mb-3 active:scale-95 transition-transform"
              >
                <Camera size={40} className="text-white" />
              </button>
              <p className="text-sm font-medium text-[#1a1a2e]">{t('production.tap_scan')}</p>
              <p className="text-xs text-gray-400 mt-1">{t('production.enter_manually')}</p>
            </div>
            <div className="flex gap-2">
              <Input
                value={partCode}
                onChange={(e) => setPartCode(e.target.value)}
                placeholder="PRT-XXXXXXXX"
                onKeyDown={(e) => e.key === 'Enter' && lookupPart()}
                className="font-mono"
              />
              <Button onClick={lookupPart}>Lookup</Button>
            </div>
            {error && (
              <div className="flex items-center gap-2 mt-3 text-red-600 text-sm">
                <AlertCircle size={16} /> {error}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <CheckCircle size={48} className="mx-auto text-green-500 mb-2" />
          <p className="text-lg font-semibold text-green-700">{t('production.scan_recorded')}</p>
          <p className="text-sm text-green-600">Part moved to {part?.current_station?.toUpperCase()}</p>
        </div>
      )}

      {/* Part Found */}
      {part && !success && (
        <>
          <Card>
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{part.part_name}</p>
                  <p className="text-xs text-gray-400 font-mono">{part.part_code}</p>
                </div>
                <StatusBadge status={part.current_station} />
              </div>
              <p className="text-xs text-gray-500">Currently at: <span className="font-medium">{part.current_station.toUpperCase()}</span></p>
            </CardContent>
          </Card>

          <h2 className="text-sm font-semibold text-gray-700">{t('production.move_to_station')}:</h2>
          <div className="grid grid-cols-2 gap-3">
            {nextStations.map(station => (
              <button
                key={station.key}
                onClick={() => moveToStation(station.key)}
                disabled={scanning}
                className={`${station.color} text-white rounded-xl p-4 text-center font-semibold text-lg active:scale-95 transition-transform disabled:opacity-50`}
              >
                {station.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
      </RoleGuard>
  );
}
