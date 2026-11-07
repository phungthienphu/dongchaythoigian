/** Production rules stay closed even if an action contains preview metadata. */
export const RELEASED_ERA = 3;
export const LOCAL_ERA = 4;
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
export const eraNames = ['', ...ERAS.map(e=>e.name)];
