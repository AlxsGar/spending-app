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
    loadError: 'No se pudieron abrir los datos de la app. Reinicia la app e inténtalo de nuevo.',
  },
};
