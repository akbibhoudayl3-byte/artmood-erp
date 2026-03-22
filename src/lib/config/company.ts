// ═══════════════════════════════════════════════════════════════════════════
// COMPANY IDENTITY MASTER — Single source of truth for all documents
// ═══════════════════════════════════════════════════════════════════════════

/** Inline SVG logo — replace with <img src="/logo-artmood.png"> when file is available */
export const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="100" height="100">
  <circle cx="100" cy="100" r="96" fill="none" stroke="#222" stroke-width="2"/>
  <circle cx="100" cy="100" r="88" fill="#1a1a1a"/>
  <text x="100" y="95" text-anchor="middle" fill="#fff" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="38" font-weight="300" letter-spacing="3">Art Mood</text>
  <text x="100" y="120" text-anchor="middle" fill="#ccc" font-family="'Helvetica Neue',Helvetica,Arial,sans-serif" font-size="9" letter-spacing="1.2" text-transform="uppercase">INSPIRING SPACES, CREATING SMILES.</text>
</svg>`;

export const COMPANY = {
  // ── Legal Identity ─────────────────────────────────────────────────────
  name: 'ARTMOOD SARL AU',
  tagline: 'Usine de fabrication de cuisines et mobilier sur mesure',
  address: 'Zone Industrielle Gzenaya, N°436',
  city: 'Tanger',
  postalCode: '90000',
  country: 'Maroc',
  fullAddress: 'Zone Industrielle Gzenaya, N°436, Tanger 90000, Maroc',

  // ── Legal Numbers ──────────────────────────────────────────────────────
  capital: '100 000 DHS',
  rc: '146221',
  identifiantFiscal: '60211801',
  taxeProfessionnelle: '52903466',
  ice: '003415336000045',
  cnss: '5292203',

  // ── Signatory ──────────────────────────────────────────────────────────
  signatory: {
    name: 'Akbib Houdayl',
    title: 'Gérant – ArtMood SARL AU',
  },

  // ── Contact ────────────────────────────────────────────────────────────
  contact: {
    fixe: '+212 539 400 607',
    portableDirection: '+212 661 764 069',
    serviceCommercial: '+212 666 999 353',
    email: 'Contact@artmood.ma',
    website: 'www.artmood.ma',
  },

  // ── Bank ────────────────────────────────────────────────────────────────
  bank: {
    name: 'Attijariwafa bank',
    agency: 'Tanger Beethoven',
    rib: '007640000250800000266927',
    swift: 'BCMAMAMC',
  },

  // ── Payment Terms ──────────────────────────────────────────────────────
  paymentTerms: [
    'Acompte de 50% à la commande',
    'Pré-installation 40% avant installation',
    'Solde de 10% à la réception',
  ],

  // ── Validity ───────────────────────────────────────────────────────────
  quoteValidityDays: 30,
} as const;

// ═══════════════════════════════════════════════════════════════════════════
// DOCUMENT-SPECIFIC CONTACT DISPLAY RULES
// ═══════════════════════════════════════════════════════════════════════════

export type DocumentType = 'devis' | 'facture' | 'bon_commande' | 'bon_livraison' | 'recu' | 'avoir' | 'pv_reception';

/** Which phone numbers to show per document type */
export function getDocumentContacts(docType: DocumentType) {
  const c = COMPANY.contact;
  switch (docType) {
    case 'devis':
      return { fixe: c.fixe, portable: c.portableDirection, commercial: c.serviceCommercial };
    case 'facture':
      return { fixe: c.fixe, portable: c.portableDirection };
    case 'bon_commande':
      return { fixe: c.fixe, portable: c.portableDirection };
    case 'bon_livraison':
      return { fixe: c.fixe, portable: c.portableDirection };
    case 'recu':
      return { fixe: c.fixe };
    case 'avoir':
      return { fixe: c.fixe, portable: c.portableDirection };
    case 'pv_reception':
      return { fixe: c.fixe, portable: c.portableDirection };
    default:
      return { fixe: c.fixe, portable: c.portableDirection };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LEGAL FOOTER — Rendered on all official documents
// ═══════════════════════════════════════════════════════════════════════════

export function getLegalFooterHtml(): string {
  const c = COMPANY;
  return `
    <div style="font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:10px;margin-top:30px;line-height:1.6;">
      <strong>${c.name}</strong> — Capital: ${c.capital}<br/>
      ${c.fullAddress}<br/>
      RC: ${c.rc} — IF: ${c.identifiantFiscal} — TP: ${c.taxeProfessionnelle} — ICE: ${c.ice} — CNSS: ${c.cnss}<br/>
      ${c.contact.email} — ${c.contact.website}
    </div>
  `;
}

/** Company header block for HTML documents */
export function getCompanyHeaderHtml(docType: DocumentType): string {
  const c = COMPANY;
  const contacts = getDocumentContacts(docType);
  const phoneLines = [
    contacts.fixe ? `<span>Tél: ${contacts.fixe}</span>` : '',
    contacts.portable ? `<span>Mob: ${contacts.portable}</span>` : '',
    (contacts as any).commercial ? `<span>Com: ${(contacts as any).commercial}</span>` : '',
  ].filter(Boolean).join('<br/>');

  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;padding-bottom:16px;border-bottom:3px solid #1B2A4A;">
      <div>
        <h1 style="font-size:28px;color:#1B2A4A;margin:0;letter-spacing:-0.5px;font-family:'Helvetica Neue',Arial,sans-serif;">ArtMood</h1>
        <p style="color:#C9956B;font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;margin:4px 0 8px;">${c.tagline}</p>
        <div style="font-size:11px;color:#64648B;line-height:1.5;">
          <span>${c.fullAddress}</span><br/>
          ${phoneLines}<br/>
          <span>${c.contact.email}</span>
        </div>
      </div>
      <div style="text-align:right;font-size:11px;color:#64648B;line-height:1.5;">
        <span>RC: ${c.rc}</span><br/>
        <span>IF: ${c.identifiantFiscal}</span><br/>
        <span>ICE: ${c.ice}</span><br/>
        <span>TP: ${c.taxeProfessionnelle}</span>
      </div>
    </div>
  `;
}

/** Bank details block for payment documents */
export function getBankDetailsHtml(): string {
  const b = COMPANY.bank;
  return `
    <div style="background:#F5F3F0;border-radius:8px;padding:14px;margin-top:16px;">
      <h4 style="font-size:11px;text-transform:uppercase;color:#64648B;letter-spacing:1px;margin:0 0 8px;">Coordonnées Bancaires</h4>
      <p style="font-size:12px;margin:3px 0;color:#1a1a2e;"><strong>${b.name}</strong> — Agence: ${b.agency}</p>
      <p style="font-size:12px;margin:3px 0;color:#1a1a2e;">RIB: <strong>${b.rib}</strong></p>
      <p style="font-size:12px;margin:3px 0;color:#64648B;">SWIFT: ${b.swift}</p>
    </div>
  `;
}

/** Payment terms block */
export function getPaymentTermsHtml(): string {
  return `
    <div>
      <h4 style="font-size:11px;text-transform:uppercase;color:#64648B;letter-spacing:1px;margin:0 0 8px;">Conditions de Paiement</h4>
      ${COMPANY.paymentTerms.map(t => `<p style="font-size:12px;color:#64648B;margin:3px 0;">${t}</p>`).join('')}
    </div>
  `;
}

/** Signature block */
export function getSignatureBlockHtml(): string {
  const s = COMPANY.signatory;
  return `
    <div style="text-align:right;margin-top:30px;">
      <p style="font-size:12px;color:#64648B;margin:0 0 40px;">Bon pour accord</p>
      <p style="font-size:13px;font-weight:600;color:#1a1a2e;margin:0;">${s.name}</p>
      <p style="font-size:11px;color:#64648B;margin:2px 0 0;">${s.title}</p>
    </div>
  `;
}
