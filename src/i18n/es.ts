import type { en } from './en';

type Translations = typeof en;

export const es: Translations = {
  tabs: {
    home: 'Inicio',
    accounts: 'Cuentas',
    movements: 'Movimientos',
    settings: 'Ajustes',
  },
  fab: {
    open: 'Agregar',
    addTransaction: 'Agregar transacción',
    addRecurring: 'Agregar pago recurrente',
    addAccount: 'Agregar cuenta',
  },
  home: {
    emptyTitle: 'Tu dinero de un vistazo',
    emptyDescription: 'Aquí verás saldos, pagos próximos y actividad reciente.',
    emptyAction: 'Agregar cuenta',
  },
  accounts: {
    emptyTitle: 'Aún no hay cuentas',
    emptyDescription: 'Agrega un banco, cartera o cuenta de efectivo para empezar.',
    emptyAction: 'Agregar cuenta',
    newTitle: 'Nueva cuenta',
    editTitle: 'Editar cuenta',
    detailTitle: 'Cuenta',
    cardLabel: '{{name}}, saldo {{balance}}, moneda {{currency}}',
    notFound: 'Esta cuenta ya no existe.',
    nameLabel: 'Nombre',
    iconLabel: 'Ícono',
    currencyLabel: 'Moneda',
    charCount: '{{count}}/{{max}} caracteres',
    currencyPicker: 'Elegir moneda',
    save: 'Guardar cuenta',
    saveError: 'No se pudo guardar la cuenta. Inténtalo de nuevo.',
    edit: 'Editar',
    delete: 'Eliminar',
    deleteTitle: '¿Eliminar cuenta?',
    deleteMessage: 'Esto elimina la cuenta de forma permanente. No se puede deshacer.',
    deleteError: 'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
    errors: {
      nameRequired: 'Escribe un nombre para la cuenta.',
      nameTooLong: 'El nombre puede tener como máximo 40 caracteres.',
      invalidIcon: 'Elige un ícono.',
      invalidCurrency: 'Elige una moneda.',
    },
    icons: {
      bank: 'Banco',
      wallet: 'Cartera',
      safe: 'Caja fuerte',
      cash: 'Efectivo',
      'credit-card': 'Tarjeta de crédito',
      'piggy-bank': 'Alcancía',
      home: 'Casa',
      briefcase: 'Maletín',
      cart: 'Carrito de compras',
      gift: 'Regalo',
    },
  },
  movements: {
    emptyTitle: 'Aún no hay movimientos',
    emptyDescription: 'Aquí se listarán tus transacciones y pagos recurrentes.',
    emptyAction: 'Agregar transacción',
  },
  settings: {
    language: 'Idioma',
    english: 'English',
    spanish: 'Español',
    saveError: 'No se pudo guardar tu idioma. Inténtalo de nuevo.',
  },
  common: {
    retry: 'Reintentar',
    cancel: 'Cancelar',
    loadError: 'No se pudieron abrir los datos de la app. Reinicia la app e inténtalo de nuevo.',
  },
};
