export const enum ConstantSymbol {
  Pi = 'pi',
  E = 'e',
  Tau = 'tau',
  Phi = 'phi',
}

export interface ConstantInfo {
  readonly symbol: ConstantSymbol;
  readonly unicode: string;
  readonly latex: string;
  readonly decimal: string;
}

export const CONSTANTS = {
  [ConstantSymbol.Pi]: {
    symbol: ConstantSymbol.Pi,
    unicode: '\u03C0',
    latex: '\\pi',
    decimal: '3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679',
  },
  [ConstantSymbol.E]: {
    symbol: ConstantSymbol.E,
    unicode: '\u2107',
    latex: '\\mathtrm{e}',
    decimal: '2.7182818284590452353602874713526624977572470936999595749669676277240766303535475945713821785251664274',
  },
  [ConstantSymbol.Tau]: {
    symbol: ConstantSymbol.Tau,
    unicode: '\u03C4',
    latex: '\\tau',
    decimal: '6.2831853071795864769252867665590057683943387987502116419498891846156328125724179972560696506842341359',
  },
  [ConstantSymbol.Phi]: {
    symbol: ConstantSymbol.Phi,
    unicode: '\u03C6',
    latex: '\\varphi',
    decimal: '1.6180339887498948482045868343656381177203091798057628621354486227052604628189024497072072041893911374',
  },
} as const satisfies Record<ConstantSymbol, ConstantInfo>;
