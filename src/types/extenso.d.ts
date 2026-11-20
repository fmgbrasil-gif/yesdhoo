declare module 'extenso' {
  export default function extenso(value: string | number, options?: { mode?: 'currency' | 'number'; currency?: { type?: 'BRL' | 'EUR' | 'USD' | 'CVE' } }): string;
}
