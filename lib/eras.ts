/** Only server-owned rules determine releases; action metadata cannot unlock eras. */
export const RELEASED_ERA = 6;
export const LOCAL_ERA = 6;
export type EngineRules = Readonly<{ maxEra: number }>;
export const RELEASE_RULES: EngineRules = Object.freeze({ maxEra: RELEASED_ERA });
export const LOCAL_RULES: EngineRules = Object.freeze({ maxEra: LOCAL_ERA });
export const ERAS = [
  { id:1, name:'Thời đồ đá', theme:'Lập làng bên sông' },
  { id:2, name:'Thời đồ đồng', theme:'Thủy lợi và luyện kim' },
  { id:3, name:'Thời đồ sắt', theme:'Thành trì và kỳ quan' },
  { id:4, name:'Trung đại', theme:'Trữ nước, học thuật và thị trấn mái ngói' },
  { id:5, name:'Công nghiệp', theme:'Than, vận tải và ô nhiễm' },
  { id:6, name:'Hiện đại', theme:'Điện, dịch vụ và thành phố ven sông' },
] as const;
/** Eras 7–9 stay out of ERAS so released lists (welcome, catalog, roadmap) do not
 * change; UI shows them only when `EngineRules.maxEra` reaches them. */
export const MAGIC_ERAS = [
  { id:7, name:'Thức tỉnh Ma pháp', theme:'Mana, phù văn và pháp sư' },
  { id:8, name:'Vương triều Nguyên tố', theme:'Bốn ấn Hỏa, Thủy, Mộc, Thổ và golem' },
  { id:9, name:'Kỷ nguyên Thần thoại', theme:'Thần thú, đại phép và Thiên Cung' },
] as const;
export const erasUpTo = (maxEra:number) => [...ERAS, ...MAGIC_ERAS].filter(e => e.id <= maxEra);
export const eraNames: string[] = ['', ...ERAS.map(e=>e.name), ...MAGIC_ERAS.map(e=>e.name)];
