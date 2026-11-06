export type WarLoadStatus = 'idle' | 'loading' | 'ready' | 'error';
/** Configuration, HTTP loading and a player's presence are separate concerns. */
export function worldWarMessage(signedIn:boolean,status:WarLoadStatus,enabled:boolean,error?:string|null) {
 if(!signedIn)return 'Đăng nhập Google để xuất quân sang nước khác.';
 if(status==='error')return error || 'Không tải được trạng thái trận đánh. Hãy thử kết nối lại.';
 if(status!=='ready')return 'Đang kiểm tra máy chủ trận đánh…';
 if(!enabled)return 'Tính năng đánh nước khác chưa được cấu hình trên máy chủ.';
 return null;
}
