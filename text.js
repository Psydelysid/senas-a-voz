// Utilidades de texto compartidas.

/** minúsculas, sin acentos (pero conservando la ñ) ni puntuación */
export function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/(?!\u0303)[\u0300-\u036f]/g, "")
    .normalize("NFC")
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
