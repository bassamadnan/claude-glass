import type { TokenUsage } from '../types';

interface ModelRates {
  input: number;
  output: number;
  cacheCreation: number;
  cacheRead: number;
}

// Prices in USD per million tokens — source: platform.claude.com/docs/en/about-claude/pricing
function getModelRates(model: string): ModelRates {
  const m = model.toLowerCase();

  if (m.includes('opus')) {
    // Opus 4.5 and 4.6: $5/$25
    if (m.includes('4-5') || m.includes('4-6') || m.includes('4.5') || m.includes('4.6')) {
      return { input: 5, output: 25, cacheCreation: 6.25, cacheRead: 0.5 };
    }
    // Opus 4, 4.1, 3: $15/$75
    return { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 };
  }

  if (m.includes('haiku')) {
    // Haiku 4.5: $1/$5
    if (m.includes('4-5') || m.includes('4.5')) {
      return { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 };
    }
    // Haiku 3.5: $0.80/$4
    if (m.includes('3-5') || m.includes('3.5')) {
      return { input: 0.8, output: 4, cacheCreation: 1.0, cacheRead: 0.08 };
    }
    // Haiku 3: $0.25/$1.25
    return { input: 0.25, output: 1.25, cacheCreation: 0.3, cacheRead: 0.03 };
  }

  // Sonnet (all versions 4.x, 3.7): $3/$15
  return { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 };
}

export function calculateTurnCost(model: string, usage: TokenUsage): number {
  const r = getModelRates(model);
  return (
    (usage.input_tokens / 1_000_000) * r.input +
    (usage.output_tokens / 1_000_000) * r.output +
    ((usage.cache_creation_input_tokens ?? 0) / 1_000_000) * r.cacheCreation +
    ((usage.cache_read_input_tokens ?? 0) / 1_000_000) * r.cacheRead
  );
}

export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.0001) return '<$0.0001';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}
