import type { Locale } from './index';

export function getStockTranslations(): Record<Locale, Record<string, string>> {
  return {
    en: {
      // Stock
      'stock.title': 'Stock',
      'stock.add_item': 'Add Item',
      'stock.low_stock': 'Low Stock',
      'stock.current_stock': 'Current Stock',
      'stock.minimum': 'Minimum',
      'stock.stock_in': 'Stock In',
      'stock.stock_out': 'Stock Out',
      'stock.movement_history': 'Movement History',
      'stock.reservations': 'Stock Reservations',
      'stock.active_reservations': 'active reservations',
      'stock.status_reserved': 'Reserved',
      'stock.status_consumed': 'Consumed',
      'stock.status_released': 'Released',
      'stock.release': 'Release',
      'stock.alerts': 'Stock Alerts',
      'stock.items_need_attention': 'items need attention',
      'stock.out_of_stock': 'Out of Stock',
      'stock.available': 'available',
      'stock.reserved': 'reserved',
      'stock.all_good': 'All stock levels are healthy',

      // Suppliers
      'suppliers.title': 'Suppliers',
      'suppliers.add_supplier': 'Add Supplier',
      'suppliers.balance': 'Balance',

      // Purchase Orders
      'po.title': 'Purchase Orders',
      'po.new_order': 'New Purchase Order',
      'po.supplier': 'Supplier',
      'po.order_date': 'Order Date',
      'po.delivery_date': 'Delivery Date',
      'po.items': 'Items',
      'po.quantity': 'Quantity',
      'po.unit_price': 'Unit Price',
      'po.subtotal': 'Subtotal',
      'po.approved': 'Approved',
      'po.received': 'Received',
      'po.partial': 'Partial',

      // Materials
      'materials.title': 'Material Prices',
      'materials.add_material': 'Add Material',
      'materials.price_per_m2': 'Price/m\u00B2',
      'materials.supplier': 'Supplier',
      'materials.last_updated': 'Last Updated',
    },

    fr: {
      // Stock
      'stock.title': 'Stock',
      'stock.add_item': 'Ajouter article',
      'stock.low_stock': 'Stock bas',
      'stock.current_stock': 'Stock actuel',
      'stock.minimum': 'Minimum',
      'stock.stock_in': 'Entree stock',
      'stock.stock_out': 'Sortie stock',
      'stock.movement_history': 'Historique mouvements',
      'stock.reservations': 'Reservations Stock',
      'stock.active_reservations': 'reservations actives',
      'stock.status_reserved': 'Reserve',
      'stock.status_consumed': 'Consomme',
      'stock.status_released': 'Libere',
      'stock.release': 'Liberer',
      'stock.alerts': 'Alertes Stock',
      'stock.items_need_attention': 'articles necessitent attention',
      'stock.out_of_stock': 'Rupture de Stock',
      'stock.available': 'disponible',
      'stock.reserved': 'reserve',
      'stock.all_good': 'Tous les niveaux de stock sont bons',

      // Suppliers
      'suppliers.title': 'Fournisseurs',
      'suppliers.add_supplier': 'Ajouter fournisseur',
      'suppliers.balance': 'Solde',

      // Purchase Orders
      'po.title': 'Bons de commande',
      'po.new_order': 'Nouveau bon de commande',
      'po.supplier': 'Fournisseur',
      'po.order_date': 'Date commande',
      'po.delivery_date': 'Date livraison',
      'po.items': 'Articles',
      'po.quantity': 'Quantite',
      'po.unit_price': 'Prix unitaire',
      'po.subtotal': 'Sous-total',
      'po.approved': 'Approuve',
      'po.received': 'Recu',
      'po.partial': 'Partiel',

      // Materials
      'materials.title': 'Prix des materiaux',
      'materials.add_material': 'Ajouter materiau',
      'materials.price_per_m2': 'Prix/m\u00B2',
      'materials.supplier': 'Fournisseur',
      'materials.last_updated': 'Derniere mise a jour',
    },

    ar: {
      // Stock
      'stock.title': 'المخزون',
      'stock.add_item': 'إضافة عنصر',
      'stock.low_stock': 'مخزون منخفض',
      'stock.current_stock': 'المخزون الحالي',
      'stock.minimum': 'الحد الأدنى',
      'stock.stock_in': 'إدخال مخزون',
      'stock.stock_out': 'إخراج مخزون',
      'stock.movement_history': 'سجل الحركات',
      'stock.reservations': 'حجوزات المخزون',
      'stock.active_reservations': 'حجوزات نشطة',
      'stock.status_reserved': 'محجوز',
      'stock.status_consumed': 'مستهلك',
      'stock.status_released': 'محرر',
      'stock.release': 'تحرير',
      'stock.alerts': 'تنبيهات المخزون',
      'stock.items_need_attention': 'عناصر تحتاج اهتمام',
      'stock.out_of_stock': 'نفد من المخزون',
      'stock.available': 'متاح',
      'stock.reserved': 'محجوز',
      'stock.all_good': 'جميع مستويات المخزون جيدة',

      // Suppliers
      'suppliers.title': 'الموردون',
      'suppliers.add_supplier': 'إضافة مورد',
      'suppliers.balance': 'الرصيد',

      // Purchase Orders
      'po.title': 'أوامر الشراء',
      'po.new_order': 'أمر شراء جديد',
      'po.supplier': 'المورد',
      'po.order_date': 'تاريخ الطلب',
      'po.delivery_date': 'تاريخ التسليم',
      'po.items': 'العناصر',
      'po.quantity': 'الكمية',
      'po.unit_price': 'سعر الوحدة',
      'po.subtotal': 'المجموع الفرعي',
      'po.approved': 'معتمد',
      'po.received': 'مستلم',
      'po.partial': 'جزئي',

      // Materials
      'materials.title': 'أسعار المواد',
      'materials.add_material': 'إضافة مادة',
      'materials.price_per_m2': 'السعر/م\u00B2',
      'materials.supplier': 'المورد',
      'materials.last_updated': 'آخر تحديث',
    },

    darija: {
      // Stock
      'stock.title': 'المخزون',
      'stock.add_item': 'زيد حاجة',
      'stock.low_stock': 'المخزون ناقص',
      'stock.current_stock': 'المخزون دابا',
      'stock.minimum': 'الحد الأدنى',
      'stock.stock_in': 'دخول مخزون',
      'stock.stock_out': 'خروج مخزون',
      'stock.movement_history': 'تاريخ الحركات',
      'stock.reservations': 'الحجوزات ديال المخزون',
      'stock.active_reservations': 'حجوزات نشطة',
      'stock.status_reserved': 'محجوز',
      'stock.status_consumed': 'مستهلك',
      'stock.status_released': 'محرر',
      'stock.release': 'حرر',
      'stock.alerts': 'تنبيهات المخزون',
      'stock.items_need_attention': 'حوايج خاصهم الاهتمام',
      'stock.out_of_stock': 'سالي من المخزون',
      'stock.available': 'متوفر',
      'stock.reserved': 'محجوز',
      'stock.all_good': 'كلشي مزيان فالمخزون',

      // Suppliers
      'suppliers.title': 'المول',
      'suppliers.add_supplier': 'زيد مول',
      'suppliers.balance': 'الحساب',

      // Purchase Orders
      'po.title': 'طلبات الشرا',
      'po.new_order': 'طلب شرا جديد',
      'po.supplier': 'المول',
      'po.order_date': 'تاريخ الطلب',
      'po.delivery_date': 'تاريخ التسليم',
      'po.items': 'الحوايج',
      'po.quantity': 'الكمية',
      'po.unit_price': 'الثمن ديال الوحدة',
      'po.subtotal': 'المجموع الفرعي',
      'po.approved': 'مقبول',
      'po.received': 'وصل',
      'po.partial': 'شوية',

      // Materials
      'materials.title': 'أثمنة الماتيريال',
      'materials.add_material': 'زيد ماتيريال',
      'materials.price_per_m2': 'الثمن/م\u00B2',
      'materials.supplier': 'المول',
      'materials.last_updated': 'آخر تحديث',
    },
  };
}
