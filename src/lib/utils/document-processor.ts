
import { createClient } from '@/lib/supabase/client';

export interface OCRResult {
  text: string;
  confidence: number;
  language: string;
}

export interface ExtractedInvoiceData {
  vendor_name?: string;
  invoice_number?: string;
  date?: string;
  total_amount?: number;
  currency?: string;
  line_items?: Array<{ description: string; quantity?: number; unit_price?: number; total?: number }>;
}

export interface ExtractedDeliveryData {
  supplier?: string;
  delivery_number?: string;
  date?: string;
  items?: Array<{ description: string; quantity: number; unit?: string }>;
}

/**
 * Upload a file to Supabase storage
 */
export async function uploadDocument(
  file: File,
  folder: string = 'general'
): Promise<{ storagePath: string; thumbnailPath: string | null }> {
  const supabase = createClient();
  const ext = file.name.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  const fileName = `${folder}/${timestamp}_${Math.random().toString(36).slice(2)}.${ext}`;

  const { error } = await supabase.storage
    .from('scanned-documents')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) throw new Error('Upload failed: ' + error.message);

  // Generate thumbnail for images
  let thumbnailPath: string | null = null;
  if (file.type.startsWith('image/')) {
    try {
      const thumbBlob = await createThumbnail(file, 200);
      const thumbName = `thumbnails/${timestamp}_thumb.jpg`;
      await supabase.storage
        .from('scanned-documents')
        .upload(thumbName, thumbBlob, { cacheControl: '3600', upsert: false });
      thumbnailPath = thumbName;
    } catch {
      // Thumbnail creation is optional
    }
  }

  return { storagePath: fileName, thumbnailPath };
}

/**
 * Create a thumbnail from an image file
 */
async function createThumbnail(file: File, maxSize: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > h) { h = (h / w) * maxSize; w = maxSize; }
      else { w = (w / h) * maxSize; h = maxSize; }
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas not supported')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(blob => {
        if (blob) resolve(blob);
        else reject(new Error('Blob creation failed'));
      }, 'image/jpeg', 0.7);
    };
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Simple client-side text extraction from image using canvas
 * For real OCR, this would integrate with Tesseract.js or a server-side API
 */
export async function performClientOCR(file: File): Promise<OCRResult> {
  // Since we cannot bundle Tesseract.js easily, we provide a simple
  // metadata extraction and mark for server-side processing
  return {
    text: '',
    confidence: 0,
    language: 'fr',
  };
}

/**
 * Extract structured data from OCR text (invoice)
 */
export function extractInvoiceData(ocrText: string): ExtractedInvoiceData {
  const data: ExtractedInvoiceData = {};

  // Invoice number patterns
  const invMatch = ocrText.match(/(?:facture|invoice|fact)[\s#:n°]*([A-Z0-9-]+)/i);
  if (invMatch) data.invoice_number = invMatch[1];

  // Date patterns
  const dateMatch = ocrText.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (dateMatch) data.date = dateMatch[0];

  // Amount patterns
  const amountMatch = ocrText.match(/(?:total|montant|amount)[\s:]*([\d\s.,]+)\s*(?:MAD|DH|EUR|USD|€|\$)?/i);
  if (amountMatch) {
    data.total_amount = parseFloat(amountMatch[1].replace(/\s/g, '').replace(',', '.'));
  }

  // Currency
  if (ocrText.match(/MAD|DH|dirham/i)) data.currency = 'MAD';
  else if (ocrText.match(/EUR|€|euro/i)) data.currency = 'EUR';
  else if (ocrText.match(/USD|\$/i)) data.currency = 'USD';

  return data;
}

/**
 * Extract structured data from OCR text (delivery note)
 */
export function extractDeliveryData(ocrText: string): ExtractedDeliveryData {
  const data: ExtractedDeliveryData = {};

  const blMatch = ocrText.match(/(?:bon de livraison|delivery note|BL)[\s#:n°]*([A-Z0-9-]+)/i);
  if (blMatch) data.delivery_number = blMatch[1];

  const dateMatch = ocrText.match(/(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})/);
  if (dateMatch) data.date = dateMatch[0];

  return data;
}

/**
 * Get public URL for a stored document
 */
export function getDocumentUrl(storagePath: string): string {
  const supabase = createClient();
  const { data } = supabase.storage
    .from('scanned-documents')
    .getPublicUrl(storagePath);
  return data.publicUrl;
}

/**
 * Auto-detect document type from filename
 */
export function detectDocumentType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.match(/facture|invoice|fact/)) return 'invoice';
  if (lower.match(/bon.*livraison|delivery|bl/)) return 'delivery_note';
  if (lower.match(/commande|purchase|po/)) return 'purchase_order';
  if (lower.match(/plan|drawing|dessin|dwg/)) return 'technical_drawing';
  if (lower.match(/contrat|contract/)) return 'contract';
  if (lower.match(/photo|img|pic|dsc|cam/)) return 'photo';
  return 'other';
}
