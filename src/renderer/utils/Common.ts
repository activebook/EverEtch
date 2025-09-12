// Utility function for consistent generation ID creation
export function generateGenerationId(): string {
  return `gen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
