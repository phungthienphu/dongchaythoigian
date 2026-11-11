import {MAGIC_EXPANSION} from './building-expansion';
const expansionGuides=Object.fromEntries(Object.entries(MAGIC_EXPANSION).map(([k,d])=>[k,{purpose:d.purpose,place:d.place}])) as {[K in keyof typeof MAGIC_EXPANSION]:{purpose:string;place:string;defense?:string}};
import type {MagicBuilding} from './magic-data';

/** Player explanations shared by the build menu and the selected-building card. */
export const MAGIC_BUILDING_GUIDE = {
 ...expansionGuides,
 aetherwell:{purpose:'Tạo mana, tức năng lượng để nhà phép và phép phòng thủ hoạt động.',place:'Đặt gần các nhà phép cần năng lượng; giao đủ thợ để giếng tạo mana.',defense:'Tự đánh và làm chậm zombie tới gần giếng.'},
 manarelay:{purpose:'Trạm tiếp mana, giống cột tiếp điện: nối giếng hoặc tháp tới nhà phép ở xa.',place:'Đặt giữa nguồn mana và nhà cần dùng; mỗi đoạn tối đa 6 ô, nối tiếp tối đa 3 cột và phải có đường đi. Qua sông cần cầu.',defense:'Không bắn địch. Cột giúp các nhà phòng thủ ở xa nhận được mana; không tự tạo mana hay tăng số nhà mà nguồn cấp được.'},
 crystalworks:{purpose:'Luyện đồng và vàng thành tinh thạch, nguyên liệu cơ bản của thời ma pháp.',place:'Đặt gần Xưởng dụng cụ đang hoạt động; giao thợ mang nguyên liệu tới và chở tinh thạch về kho.'},
 runeworks:{purpose:'Làm phù văn từ gỗ và tinh thạch. Phù văn dùng để xây nhà phép, nghiên cứu và tuyển pháp sư.',place:'Đặt gần Xưởng thủ công hoặc Xưởng cơ khí đang hoạt động; giao đủ thợ.'},
 mageacademy:{purpose:'Trường học tạo điểm nghiên cứu ma pháp và tuyển pháp sư chiến đấu, chữa thương.',place:'Nối với nguồn mana, giao thợ và cung cấp phù văn. Dùng điểm tri thức để mở nghiên cứu mới.',defense:'Huấn luyện pháp sư; bản thân học viện không bắn địch.'},
 manaspire:{purpose:'Nguồn mana mạnh hơn giếng, nhưng phải tiêu tinh thạch để tạo năng lượng.',place:'Nghiên cứu Dẫn linh trước, rồi giao thợ và cung cấp tinh thạch. Đặt gần nhóm nhà phép cần nhiều mana.'},
 rivershrine:{purpose:'Đền hỗ trợ chữa bệnh zombie cho dân và hồi máu cho quân ở gần.',place:'Đặt sát sông hoặc gần hồ còn nước, nối mana và mở nghiên cứu Hộ sinh.',defense:'Hỗ trợ chữa trị để dân và quân sống sót; không thay thế công trình tấn công.'},
 wardcircle:{purpose:'Công trình phòng thủ tự đốt zombie đi vào tầm đánh.',place:'Nối mana, đặt gần cửa ngõ hoặc khu cần bảo vệ. Nghiên cứu Chiến pháp để thêm phép làm chậm.',defense:'Tự đánh zombie và có thể làm chậm chúng; cần còn mana để thi triển.'},
 spiritgarden:{purpose:'Giúp lều cứu thương và bệnh viện gần đó chữa dân nhanh hơn.',place:'Mở nghiên cứu Hộ sinh, nối mana và giao thợ; đặt gần các cơ sở chữa bệnh.',defense:'Hỗ trợ hậu phương, không trực tiếp đánh địch.'},
 awakeningtower:{purpose:'Kỳ quan giúp mỗi nguồn mana đang chạy cấp thêm năng lượng cho một nhà phép.',place:'Xây sau khi đủ dân, Đình và nghiên cứu yêu cầu. Vẫn cần giếng hoặc tháp tạo mana.'},
 essenceforge:{purpose:'Luyện tinh thạch và than thành tinh chất để dùng phép nguyên tố.',place:'Đặt gần Xưởng cơ khí có đường nối; cấp mana, nguyên liệu và giao thợ.'},
 firealtar:{purpose:'Trạm nguyên tố Hỏa: cấp sức mạnh lửa cho nhà phép gần đó và mở Bão lửa.',place:'Mở Tứ nguyên, cấp mana, tinh chất và giao thợ. “Ấn Hỏa” là hiệu lực mà trạm cấp cho các nhà trong vùng.',defense:'Bão lửa tự kích hoạt khi đủ điều kiện, gây sát thương lên nhóm zombie.'},
 watertemple:{purpose:'Trạm nguyên tố Thủy: cấp sức mạnh nước, mở phép Tịnh hóa và hỗ trợ chữa bệnh.',place:'Mở Tứ nguyên, cấp mana, tinh chất và giao thợ. Đặt gần Điện thờ Sông Mẹ để hỗ trợ Thanh tẩy.',defense:'Bảo vệ dân bằng phép chữa trị; kết hợp với nhà phép khác để mở thêm khả năng.'},
 woodgrove:{purpose:'Trạm nguyên tố Mộc: hỗ trợ sinh trưởng và tạo người cây chở hàng cho nhà phép.',place:'Mở Tứ nguyên, cấp mana, tinh chất và giao thợ. Tạo Linh mộc trong bảng công trình khi cần vận chuyển.'},
 earthtemple:{purpose:'Trạm nguyên tố Thổ: mở phép dựng tường đá tạm thời và cho phép tuyển golem.',place:'Mở Tứ nguyên, cấp mana, tinh chất và giao thợ. Đặt gần Xưởng tượng linh để cấp ấn Thổ.',defense:'Thạch bích tạo vật cản; golem được tuyển riêng để chặn và đánh địch.'},
 golemworks:{purpose:'Xưởng tuyển golem đá: quân cận chiến nhiều máu, phù hợp đứng tuyến trước.',place:'Cần mana, ấn Thổ từ Thổ điện và nghiên cứu Khế ước. Tuyển golem trong bảng Quân đội.',defense:'Golem chặn đường và đánh địch trên mặt đất; không đánh được quân bay.'},
 spiritstable:{purpose:'Nơi tuyển linh lộc, quân hộ tống giúp đồng đội gần nó chịu ít sát thương hơn.',place:'Cần mana, cả ấn Mộc lẫn Thủy và nghiên cứu Khế ước. Tuyển trong bảng Quân đội.',defense:'Linh lộc hỗ trợ bảo vệ đội quân; bản thân công trình không bắn địch.'},
 harmonizer:{purpose:'Giảm ô nhiễm và giúp nguồn mana gần đó cấp được thêm một nhà phép.',place:'Chọn hai ấn khác nhau trong bảng công trình; duy trì thợ, mana và tinh chất.'},
 fourspirits:{purpose:'Kỳ quan tăng lượng mana mà các nguồn chứa được và mở đường lên thời Thần thoại.',place:'Đặt trong vùng nhận đủ bốn ấn Hỏa, Thủy, Mộc, Thổ. Tăng chỗ chứa không đồng nghĩa tự tạo thêm mana.'},
 celestialforge:{purpose:'Luyện nguyên liệu thành thiên thạch để xây công trình và nuôi sức mạnh thời Thần thoại.',place:'Đặt gần Tổ hợp sản xuất có đường nối; cấp đồng, tinh chất, phù văn, mana và giao thợ.'},
 observatory:{purpose:'Cảnh báo sớm nơi zombie sắp xuất hiện để kịp điều quân bảo vệ.',place:'Mở nghiên cứu Khai giới, nối mana và giao thợ.',defense:'Báo trước 3 phút thay vì 1 phút; không tự bắn địch.'},
 spiritgate:{purpose:'Nơi huấn luyện thần thú theo khế ước mà làng đã chọn.',place:'Cần Đài khế ước, nghiên cứu Khai giới, mana và cả ấn Thủy lẫn Thổ. Tuyển thần thú trong bảng Quân đội.',defense:'Tạo quân mạnh để bảo vệ hoặc tham chiến; xây cổng chưa tự sinh ra thần thú.'},
 covenantaltar:{purpose:'Chọn liên minh với Long, Quy hoặc Phượng để mở loại thần thú tương ứng.',place:'Mở nghiên cứu Khai giới và nối mana. Chọn, nghiên cứu khế ước trong bảng Ma pháp.',defense:'Long thiên về tấn công, Quy che chắn đồng đội, Phượng hồi máu cho quân còn sống.'},
 worldmatrix:{purpose:'Chuẩn bị các gói phép mạnh để mang vào trận đánh.',place:'Cần mana và hai ấn khác nhau. Hỏa + Thủy mở Thiên lôi; Mộc + Thổ mở Hộ giới.',defense:'Thiên lôi gây sát thương, Hộ giới giảm sát thương cho quân; phải chuẩn bị gói phép trước khi dùng trong trận.'},
 teleportdock:{purpose:'Đưa hàng nhanh giữa hai bến trong cùng làng, giúp tiếp tế nhà phép ở xa.',place:'Xây và ghép hai bến với nhau, cấp mana và phù văn. Hàng tới bến đích rồi vào các nhà phép gần đó.'},
 riverpalace:{purpose:'Kỳ quan cho chọn một hướng phát triển: hỗ trợ sông nước, bảo vệ thành hoặc sản xuất.',place:'Đủ điều kiện xây rồi chọn lãnh địa trong bảng Ma pháp; duy trì mana để hưởng lợi ích.',defense:'Lãnh địa Thành Trì Linh Giới giúp quân tuần tra phản ứng tốt hơn trước báo động; làng vẫn cần quân và công trình phòng thủ.'},
} satisfies Record<MagicBuilding,{purpose:string;place:string;defense?:string}>;

export const MAGIC_GLOSSARY = [
 ['Mana','Năng lượng phép thuật. Giếng và tháp tạo, chứa mana; cột dẫn đưa mana tới nhà phép ở xa.'],
 ['Ấn nguyên tố','Điều kiện sức mạnh do trạm Hỏa, Thủy, Mộc hoặc Thổ gần đó cấp. Có đủ ấn thì nhà nhận mới dùng được khả năng tương ứng.'],
 ['Tri thức ma pháp','Điểm nghiên cứu do Học viện pháp thuật tạo ra. Dùng để mở công nghệ và phép mới.'],
 ['Nguyên liệu chờ trong nhà','Thợ mang hàng từ kho tới nhà phép. Nhà chỉ chạy khi nguyên liệu đã tới, không phải cứ còn hàng trong kho là chạy ngay.'],
 ['Khế ước','Lựa chọn Long, Quy hoặc Phượng để được tuyển thần thú tương ứng. Cần nghiên cứu và tuyển riêng.'],
] as const;
