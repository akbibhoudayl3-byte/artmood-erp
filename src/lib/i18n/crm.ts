import type { Locale } from './index';

export function getCrmTranslations(): Record<Locale, Record<string, string>> {
  return {
    en: {
      // Leads
      'leads.title': 'Leads',
      'leads.new_lead': 'New Lead',
      'leads.source': 'Source',
      'leads.follow_up': 'Follow Up',
      'leads.convert_to_project': 'Convert to Project',

      // Quotes
      'quotes.title': 'Quotes',
      'quotes.new_quote': 'New Quote',
      'quotes.quote_number': 'Quote Number',
      'quotes.valid_until': 'Valid Until',
      'quotes.items': 'Items',
      'quotes.subtotal': 'Subtotal',
      'quotes.tax': 'Tax',
      'quotes.discount': 'Discount',
      'quotes.grand_total': 'Grand Total',
      'quotes.send_to_client': 'Send to Client',
      'quotes.convert_to_project': 'Convert to Project',
      'quotes.draft': 'Draft',
      'quotes.sent': 'Sent',
      'quotes.accepted': 'Accepted',
      'quotes.rejected': 'Rejected',
    },

    fr: {
      // Leads
      'leads.title': 'Prospects',
      'leads.new_lead': 'Nouveau prospect',
      'leads.source': 'Source',
      'leads.follow_up': 'Relance',
      'leads.convert_to_project': 'Convertir en projet',

      // Quotes
      'quotes.title': 'Devis',
      'quotes.new_quote': 'Nouveau devis',
      'quotes.quote_number': 'Numero de devis',
      'quotes.valid_until': 'Valable jusqu\'a',
      'quotes.items': 'Articles',
      'quotes.subtotal': 'Sous-total',
      'quotes.tax': 'TVA',
      'quotes.discount': 'Remise',
      'quotes.grand_total': 'Total TTC',
      'quotes.send_to_client': 'Envoyer au client',
      'quotes.convert_to_project': 'Convertir en projet',
      'quotes.draft': 'Brouillon',
      'quotes.sent': 'Envoye',
      'quotes.accepted': 'Accepte',
      'quotes.rejected': 'Refuse',
    },

    ar: {
      // Leads
      'leads.title': 'العملاء المحتملون',
      'leads.new_lead': 'عميل جديد',
      'leads.source': 'المصدر',
      'leads.follow_up': 'المتابعة',
      'leads.convert_to_project': 'تحويل لمشروع',

      // Quotes
      'quotes.title': 'عروض الأسعار',
      'quotes.new_quote': 'عرض سعر جديد',
      'quotes.quote_number': 'رقم العرض',
      'quotes.valid_until': 'صالح حتى',
      'quotes.items': 'العناصر',
      'quotes.subtotal': 'المجموع الفرعي',
      'quotes.tax': 'الضريبة',
      'quotes.discount': 'الخصم',
      'quotes.grand_total': 'المجموع الكلي',
      'quotes.send_to_client': 'إرسال للعميل',
      'quotes.convert_to_project': 'تحويل لمشروع',
      'quotes.draft': 'مسودة',
      'quotes.sent': 'مرسل',
      'quotes.accepted': 'مقبول',
      'quotes.rejected': 'مرفوض',
    },

    darija: {
      // Leads
      'leads.title': 'الكليان الجداد',
      'leads.new_lead': 'كليان جديد',
      'leads.source': 'المصدر',
      'leads.follow_up': 'المتابعة',
      'leads.convert_to_project': 'حول لمشروع',

      // Quotes
      'quotes.title': 'الديفي',
      'quotes.new_quote': 'ديفي جديد',
      'quotes.quote_number': 'رقم الديفي',
      'quotes.valid_until': 'صالح حتى',
      'quotes.items': 'الحوايج',
      'quotes.subtotal': 'المجموع الفرعي',
      'quotes.tax': 'الضريبة',
      'quotes.discount': 'التخفيض',
      'quotes.grand_total': 'المجموع الكلي',
      'quotes.send_to_client': 'صيفط للكليان',
      'quotes.convert_to_project': 'حول لمشروع',
      'quotes.draft': 'مسودة',
      'quotes.sent': 'تصيفط',
      'quotes.accepted': 'مقبول',
      'quotes.rejected': 'مرفوض',
    },
  };
}
