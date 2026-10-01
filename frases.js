// Expresiones de uso diario, para decirlas con un toque o para enseñar su seña en LSM.

export const FRASES = [
  {
    cat: "Saludos",
    items: ["Hola", "Buenos días", "Buenas tardes", "Buenas noches", "Adiós", "Hasta luego", "Mucho gusto", "¿Cómo estás?", "Bien, gracias"],
  },
  {
    cat: "Cortesía",
    items: ["Gracias", "Por favor", "De nada", "Perdón", "Con permiso", "Lo siento"],
  },
  {
    cat: "Respuestas",
    items: ["Sí", "No", "No sé", "Está bien", "Tal vez", "Claro", "Ya entendí"],
  },
  {
    cat: "Comunicarme",
    items: [
      "Soy sorda",
      "Soy sordo",
      "Uso Lengua de Señas Mexicana",
      "No entiendo",
      "¿Puedes repetirlo, por favor?",
      "Más despacio, por favor",
      "Escríbelo, por favor",
      "Háblame de frente para leer tus labios",
      "Espera un momento",
    ],
  },
  {
    cat: "Necesito",
    items: [
      "Necesito ayuda",
      "¿Dónde está el baño?",
      "Tengo hambre",
      "Tengo sed",
      "Quiero agua",
      "Estoy cansado",
      "Estoy cansada",
      "¿Cuánto cuesta?",
      "La cuenta, por favor",
    ],
  },
  {
    cat: "Salud y emergencias",
    items: [
      "Me siento mal",
      "Me duele aquí",
      "Llama a un médico",
      "Es una emergencia",
      "Llama a mi familia",
      "Soy alérgico",
      "Soy alérgica",
    ],
  },
  {
    cat: "Preguntas",
    items: ["¿Qué?", "¿Dónde?", "¿Cuándo?", "¿Quién?", "¿Por qué?", "¿Cómo te llamas?", "¿Qué hora es?", "¿Me ayudas?"],
  },
];

/** Expresiones sugeridas para enseñar su seña (sin repetir). */
export const SUGERIDAS = [...new Set(FRASES.flatMap((c) => c.items))];
