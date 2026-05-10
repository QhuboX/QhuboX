// La lógica principal de resolución SNS ya está en `src/services/solana.js`.
// Sin embargo, este archivo está reservado para futuras utilidades relacionadas con
// los nombres de dominio de Solana (SNS), como la validación de nombres, etc.
// Por el momento, puede quedar vacío o servir como un simple placeholder.

export const validateSNSName = (name) => {
  return name.endsWith('.sol');
};